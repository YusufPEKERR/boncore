package repository_test

import (
	"testing"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestMasterSaaSSchemaAndSeeding(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}

	cfg := &config.Config{
		MasterDatabaseURL: "postgres://mock",
	}
	dm, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	defer dm.Close()

	// 1. Test AutoMigrateMasterDB
	if err := dm.AutoMigrateMasterDB(db); err != nil {
		t.Fatalf("AutoMigrateMasterDB failed: %v", err)
	}

	// 2. Verify all 17 tables exist
	expectedTables := []string{
		"restaurant_tenants",
		"tenant_leads",
		"tenant_invoices",
		"saas_plans",
		"fleet_heartbeats",
		"tenant_live_metrics",
		"vpos_configs",
		"franchise_brands",
		"menu_templates",
		"menu_clone_history",
		"broadcast_announcements",
		"announcement_receipts",
		"support_tickets",
		"support_ticket_messages",
		"support_ticket_audit_logs",
		"tenant_backups",
		"tenant_storage_quotas",
	}

	for _, tbl := range expectedTables {
		if !db.Migrator().HasTable(tbl) {
			t.Errorf("expected table %s to exist in master schema", tbl)
		}
	}

	// 3. Verify extended columns on restaurant_tenants
	expectedTenantCols := []string{
		"feature_qr_menu",
		"feature_kds",
		"feature_delivery",
		"feature_integrations",
		"feature_e_invoice",
		"feature_stock_recipe",
		"feature_loyalty",
		"plan_code",
		"read_only_mode",
		"suspension_reason",
		"brand_id",
		"is_brand_master",
		"branch_code",
		"branch_name",
	}
	for _, col := range expectedTenantCols {
		if !db.Migrator().HasColumn(&models.RestaurantTenant{}, col) {
			t.Errorf("expected restaurant_tenants column %s to exist", col)
		}
	}

	// 4. Verify extended columns on tenant_invoices
	expectedInvoiceCols := []string{
		"tenant_code",
		"subtotal",
		"tax_amount",
		"gateway_provider",
		"gateway_payment_id",
		"due_date",
		"overdue_notice_sent",
		"overdue_notice_sent_at",
	}
	for _, col := range expectedInvoiceCols {
		if !db.Migrator().HasColumn(&models.TenantInvoice{}, col) {
			t.Errorf("expected tenant_invoices column %s to exist", col)
		}
	}

	// 5. Run SeedMasterSaaSData on in-memory db
	dm.MasterGorm = db
	if err := repository.SeedMasterSaaSData(dm); err != nil {
		t.Fatalf("SeedMasterSaaSData failed: %v", err)
	}

	// 6. Verify 3 SaaS Plans
	var plans []models.SaaSPlan
	db.Find(&plans)
	if len(plans) != 3 {
		t.Fatalf("expected 3 plans, got %d", len(plans))
	}
	planMap := make(map[string]models.SaaSPlan)
	for _, p := range plans {
		planMap[p.Code] = p
	}
	if p, ok := planMap["starter"]; !ok || p.PriceMonthly != 990.0 {
		t.Errorf("starter plan invalid: %+v", p)
	}
	if p, ok := planMap["pro"]; !ok || p.PriceMonthly != 1990.0 {
		t.Errorf("pro plan invalid: %+v", p)
	}
	if p, ok := planMap["enterprise"]; !ok || p.PriceMonthly != 3990.0 {
		t.Errorf("enterprise plan invalid: %+v", p)
	}

	// 7. Verify fatihciftligi
	var fatih models.RestaurantTenant
	if err := db.Where("code = ?", "fatihciftligi").First(&fatih).Error; err != nil {
		t.Fatalf("fatihciftligi not found: %v", err)
	}
	if !fatih.FeatureQRMenu || !fatih.FeatureKDS || !fatih.FeatureDelivery ||
		!fatih.FeatureIntegrations || !fatih.FeatureEInvoice || !fatih.FeatureStockRecipe || !fatih.FeatureLoyalty {
		t.Errorf("expected all 7 feature flags to be true for fatihciftligi, got %+v", fatih)
	}
	if fatih.Plan != "enterprise" || fatih.PlanCode != "enterprise" || fatih.Status != "active" {
		t.Errorf("expected fatihciftligi enterprise active, got plan=%s, plan_code=%s, status=%s", fatih.Plan, fatih.PlanCode, fatih.Status)
	}
	if !fatih.IsBrandMaster {
		t.Errorf("expected fatihciftligi is_brand_master to be true")
	}

	// 8. Verify VPOS Configs
	var vpos []models.VPOSConfig
	db.Find(&vpos)
	if len(vpos) != 2 {
		t.Fatalf("expected 2 VPOS configs, got %d", len(vpos))
	}

	// 9. Verify Franchise Brand
	var brand models.FranchiseBrand
	if err := db.Where("code = ?", "fatih-group").First(&brand).Error; err != nil {
		t.Fatalf("fatih-group brand not found: %v", err)
	}

	// 10. Verify Storage Quota
	var quota models.TenantStorageQuota
	if err := db.Where("tenant_code = ?", "fatihciftligi").First(&quota).Error; err != nil {
		t.Fatalf("storage quota not found: %v", err)
	}
	if quota.AllocatedQuotaMB != 10240 {
		t.Errorf("expected 10240 MB quota, got %d", quota.AllocatedQuotaMB)
	}

	// 11. Verify Idempotency: Run seed again
	if err := repository.SeedMasterSaaSData(dm); err != nil {
		t.Fatalf("subsequent SeedMasterSaaSData failed: %v", err)
	}
	var count int64
	db.Model(&models.SaaSPlan{}).Count(&count)
	if count != 3 {
		t.Errorf("expected 3 plans after second seed, got %d", count)
	}
	db.Model(&models.VPOSConfig{}).Count(&count)
	if count != 2 {
		t.Errorf("expected 2 VPOS configs after second seed, got %d", count)
	}
}
