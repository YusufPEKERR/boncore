package api_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api"
	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/fiber/v2"
)

func setupTestApp(t *testing.T) (*fiber.App, *service.Services) {
	cfg := config.Load()
	cfg.DefaultTenantCode = "fatihciftligi"

	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}

	wsHub := ws.NewHub("")
	services := service.NewServices(cfg, dbManager, wsHub)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(models.FastAPIErrorResponse{Detail: err.Error()})
		},
	})
	api.RegisterRoutes(app, services)

	return app, services
}

func execTest(t *testing.T, app *fiber.App, req *http.Request) *http.Response {
	resp, err := app.Test(req, 15000)
	if err != nil {
		t.Fatalf("app.Test error on %s %s: %v", req.Method, req.URL.Path, err)
	}
	return resp
}

// -----------------------------------------------------------------------------
// R1: Feature Flags & Plan Management
// -----------------------------------------------------------------------------
func TestR1_FeatureFlagsAndPlans(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. GET /api/master/plans
	req := httptest.NewRequest("GET", "/api/master/plans", nil)
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/plans failed: status %d", resp.StatusCode)
	}
	var plans []models.SaaSPlan
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &plans); err != nil || len(plans) < 3 {
		t.Fatalf("Expected at least 3 plans, got %d, body: %s", len(plans), string(body))
	}

	// 2. GET /api/master/tenants/fatihciftligi/features
	req = httptest.NewRequest("GET", "/api/master/tenants/fatihciftligi/features", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/tenants/fatihciftligi/features failed: status %d", resp.StatusCode)
	}
	var featResp map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &featResp)
	if featResp["tenant_code"] != "fatihciftligi" || featResp["feature_qr_menu"] != true {
		t.Fatalf("Unexpected feature response: %v", featResp)
	}

	// 3. PUT /api/master/tenants/fatihciftligi/features (update feature toggle)
	updatePayload := map[string]interface{}{
		"feature_delivery": true,
		"plan_code":        "enterprise",
	}
	payloadBytes, _ := json.Marshal(updatePayload)
	req = httptest.NewRequest("PUT", "/api/master/tenants/fatihciftligi/features", bytes.NewReader(payloadBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/master/tenants/fatihciftligi/features failed: status %d", resp.StatusCode)
	}

	// 4. GET /api/modules/status (tenant caller endpoint)
	req = httptest.NewRequest("GET", "/api/modules/status", nil)
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/modules/status failed: status %d", resp.StatusCode)
	}
	var modStatus map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &modStatus)
	if modStatus["tenant_code"] != "fatihciftligi" {
		t.Fatalf("Expected tenant fatihciftligi, got %v", modStatus)
	}

	// 5. RequireFeature middleware guard enforcement:
	// Create a test tenant with feature_qr_menu = false
	mdb := svc.DBManager.MasterGorm
	testTenantCode := "test-no-qr"
	var existing models.RestaurantTenant
	if err := mdb.Where("code = ?", testTenantCode).First(&existing).Error; err != nil {
		noQRTenant := models.RestaurantTenant{
			Code:          testTenantCode,
			Name:          "No QR Test Cafe",
			Plan:          "starter",
			PlanCode:      "starter",
			FeatureQRMenu: false,
			Status:        "active",
		}
		mdb.Create(&noQRTenant)
	} else {
		existing.FeatureQRMenu = false
		mdb.Save(&existing)
	}

	// Request protected QR endpoint as test-no-qr tenant -> expect 403 Forbidden
	req = httptest.NewRequest("GET", "/api/qr/table/1/menu", nil)
	req.Header.Set("X-Restaurant-Code", testTenantCode)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("Expected 403 Forbidden for disabled feature, got: %d, body: %s", resp.StatusCode, string(body))
	}
}

// -----------------------------------------------------------------------------
// R2: Live Fleet Monitoring & Heartbeats
// -----------------------------------------------------------------------------
func TestR2_FleetMonitoringAndHeartbeat(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. POST /api/heartbeat
	hbPayload := map[string]interface{}{
		"device_id":   "pos-test-kasa-1",
		"device_type": "pos",
		"device_name": "Ana Kasa Terminali",
		"app_version": "2.1.0",
		"ip_address":  "192.168.1.105",
		"tenant_code": "fatihciftligi",
	}
	pBytes, _ := json.Marshal(hbPayload)
	req := httptest.NewRequest("POST", "/api/heartbeat", bytes.NewReader(pBytes))
	req.Header.Set("Content-Type", "application/json")
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/heartbeat failed: status %d", resp.StatusCode)
	}

	// Send tablet heartbeat too
	hbPayload2 := map[string]interface{}{
		"device_id":   "tablet-garson-1",
		"device_type": "tablet",
		"device_name": "Garson Tableti",
		"app_version": "2.1.0",
		"ip_address":  "192.168.1.106",
		"tenant_code": "fatihciftligi",
	}
	pBytes2, _ := json.Marshal(hbPayload2)
	req2 := httptest.NewRequest("POST", "/api/heartbeat", bytes.NewReader(pBytes2))
	req2.Header.Set("Content-Type", "application/json")
	resp2 := execTest(t, app, req2)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/heartbeat tablet failed: status %d", resp2.StatusCode)
	}

	// 2. GET /api/master/fleet
	req = httptest.NewRequest("GET", "/api/master/fleet", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/fleet failed: status %d", resp.StatusCode)
	}
	var fleet []map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &fleet); err != nil || len(fleet) == 0 {
		t.Fatalf("Expected fleet list, got body: %s", string(body))
	}

	foundFatih := false
	for _, f := range fleet {
		if f["code"] == "fatihciftligi" {
			foundFatih = true
			if f["is_online"] != true {
				t.Fatalf("Expected fatihciftligi to be online, got %v", f["is_online"])
			}
			devs, ok := f["devices"].(map[string]interface{})
			if !ok || devs["total"].(float64) < 1 {
				t.Fatalf("Expected connected devices >= 1, got %v", devs)
			}
			break
		}
	}
	if !foundFatih {
		t.Fatalf("fatihciftligi not found in fleet response")
	}
}

// -----------------------------------------------------------------------------
// R3: SaaS Billing, VPOS & Delinquency
// -----------------------------------------------------------------------------
func TestR3_BillingAndDelinquency(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. GET /api/master/billing/gateway-settings (check masked secrets)
	req := httptest.NewRequest("GET", "/api/master/billing/gateway-settings", nil)
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/billing/gateway-settings failed: status %d", resp.StatusCode)
	}
	var settings []map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &settings)
	if len(settings) < 2 {
		t.Fatalf("Expected PayTR and iyzico configs, got %d", len(settings))
	}

	// 2. PUT /api/master/billing/gateway-settings (update PayTR test config)
	putPayload := map[string]interface{}{
		"gateway_provider": "paytr",
		"merchant_id":      "PAYTR_TEST_12345",
		"api_key":          "API_KEY_TEST_PAYTR",
		"is_production":    false,
	}
	pBytes, _ := json.Marshal(putPayload)
	req = httptest.NewRequest("PUT", "/api/master/billing/gateway-settings", bytes.NewReader(pBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/master/billing/gateway-settings failed: status %d", resp.StatusCode)
	}

	// 3. POST /api/master/billing/test-connection
	testConnPayload := map[string]interface{}{"gateway_provider": "paytr"}
	tcBytes, _ := json.Marshal(testConnPayload)
	req = httptest.NewRequest("POST", "/api/master/billing/test-connection", bytes.NewReader(tcBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/master/billing/test-connection failed: status %d", resp.StatusCode)
	}

	// 4. POST /api/master/invoices (create invoice)
	invPayload := map[string]interface{}{
		"tenant_code":   "fatihciftligi",
		"amount":        2490.0,
		"period":        "2026-12",
		"due_date_days": 10,
	}
	invBytes, _ := json.Marshal(invPayload)
	req = httptest.NewRequest("POST", "/api/master/invoices", bytes.NewReader(invBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/master/invoices failed: status %d", resp.StatusCode)
	}
	var createdInv map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &createdInv)
	invData := createdInv["invoice"].(map[string]interface{})
	invID := int(invData["id"].(float64))

	// 5. GET /api/master/invoices
	req = httptest.NewRequest("GET", "/api/master/invoices", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/invoices failed: status %d", resp.StatusCode)
	}

	// 6. PUT /api/master/invoices/:id/pay
	req = httptest.NewRequest("PUT", fmt.Sprintf("/api/master/invoices/%d/pay", invID), nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/master/invoices/:id/pay failed: status %d", resp.StatusCode)
	}

	// 7. POST /api/master/invoices/run-due-check
	req = httptest.NewRequest("POST", "/api/master/invoices/run-due-check", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/master/invoices/run-due-check failed: status %d", resp.StatusCode)
	}

	// 8. Test Delinquency Middleware:
	// A) Suspended tenant -> 403 Forbidden
	mdb := svc.DBManager.MasterGorm
	suspTenantCode := "test-suspended-cafe"
	var suspTenant models.RestaurantTenant
	if err := mdb.Where("code = ?", suspTenantCode).First(&suspTenant).Error; err != nil {
		suspTenant = models.RestaurantTenant{
			Code:   suspTenantCode,
			Name:   "Suspended Cafe",
			Status: "suspended",
		}
		mdb.Create(&suspTenant)
	} else {
		suspTenant.Status = "suspended"
		mdb.Save(&suspTenant)
	}

	req = httptest.NewRequest("GET", "/api/tables", nil)
	req.Header.Set("X-Restaurant-Code", suspTenantCode)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for suspended tenant, got: %d", resp.StatusCode)
	}

	// B) Read-Only tenant -> GET allowed (200), POST blocked (403 Forbidden)
	roTenantCode := "test-readonly-cafe"
	var roTenant models.RestaurantTenant
	if err := mdb.Where("code = ?", roTenantCode).First(&roTenant).Error; err != nil {
		roTenant = models.RestaurantTenant{
			Code:         roTenantCode,
			Name:         "ReadOnly Cafe",
			Status:       "active",
			ReadOnlyMode: true,
		}
		mdb.Create(&roTenant)
	} else {
		roTenant.ReadOnlyMode = true
		mdb.Save(&roTenant)
	}

	// GET request -> allowed
	req = httptest.NewRequest("GET", "/api/tables", nil)
	req.Header.Set("X-Restaurant-Code", roTenantCode)
	resp = execTest(t, app, req)
	if resp.StatusCode == http.StatusForbidden {
		t.Fatalf("Expected read requests to be allowed in read-only mode, got 403")
	}

	// POST request (write operation) -> blocked with 403 Forbidden
	req = httptest.NewRequest("POST", "/api/orders", bytes.NewReader([]byte(`{"table_id": 1}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Restaurant-Code", roTenantCode)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for write request in read-only mode, got: %d", resp.StatusCode)
	}
}

// -----------------------------------------------------------------------------
// R4: Multi-Branch & Franchise Management
// -----------------------------------------------------------------------------
func TestR4_FranchiseAndMenuClone(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. POST /api/master/brands
	brandPayload := map[string]interface{}{
		"code":                fmt.Sprintf("chain-%d", time.Now().UnixNano()%100000),
		"name":                "Nusret Steakhouse Grubu",
		"primary_tenant_code": "fatihciftligi",
	}
	bBytes, _ := json.Marshal(brandPayload)
	req := httptest.NewRequest("POST", "/api/master/brands", bytes.NewReader(bBytes))
	req.Header.Set("Content-Type", "application/json")
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/master/brands failed: status %d", resp.StatusCode)
	}
	var bRes map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &bRes)
	brandID := int(bRes["brand"].(map[string]interface{})["id"].(float64))

	// 2. GET /api/master/brands
	req = httptest.NewRequest("GET", "/api/master/brands", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/brands failed: status %d", resp.StatusCode)
	}

	// 3. GET /api/master/brands/:id/analytics
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/master/brands/%d/analytics", brandID), nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/brands/:id/analytics failed: status %d", resp.StatusCode)
	}

	// 4. POST /api/master/menu/clone
	clonePayload := map[string]interface{}{
		"source_tenant_code":       "fatihciftligi",
		"target_tenant_codes":      []string{"test-branch-target"},
		"clone_categories":         true,
		"clone_products":           true,
		"price_adjustment_percent": 10.0,
	}
	cBytes, _ := json.Marshal(clonePayload)
	req = httptest.NewRequest("POST", "/api/master/menu/clone", bytes.NewReader(cBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/master/menu/clone failed: status %d", resp.StatusCode)
	}
	var cloneRes map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &cloneRes)
	if cloneRes["success"] != true {
		t.Fatalf("Expected clone success: %v", cloneRes)
	}
}

// -----------------------------------------------------------------------------
// R5: Broadcast Announcements
// -----------------------------------------------------------------------------
func TestR5_BroadcastAnnouncements(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. POST /api/master/broadcast
	bcPayload := map[string]interface{}{
		"title":         "GİB e-Adisyon Sunucu Güncellemesi",
		"content":       "Bu gece 02:00-03:00 saatleri arasında Gelir İdaresi bakım yapacaktır.",
		"banner_type":   "warning",
		"target_type":   "all",
		"show_as_popup": true,
		"dismissible":   true,
	}
	bcBytes, _ := json.Marshal(bcPayload)
	req := httptest.NewRequest("POST", "/api/master/broadcast", bytes.NewReader(bcBytes))
	req.Header.Set("Content-Type", "application/json")
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/master/broadcast failed: status %d", resp.StatusCode)
	}

	// 2. GET /api/announcements/active (POS client query)
	req = httptest.NewRequest("GET", "/api/announcements/active", nil)
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/announcements/active failed: status %d", resp.StatusCode)
	}
	var activeAnnouncements []models.BroadcastAnnouncement
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &activeAnnouncements); err != nil || len(activeAnnouncements) == 0 {
		t.Fatalf("Expected active announcements, got: %s", string(body))
	}
}

// -----------------------------------------------------------------------------
// R6: Support Ticketing
// -----------------------------------------------------------------------------
func TestR6_SupportTicketing(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. POST /api/support/tickets (submit ticket)
	ticketPayload := map[string]interface{}{
		"category":          "bug",
		"subject":           "Kasa Termal Yazıcı Hatası",
		"description":       "Adisyon yazdırılırken yazıcı kağıt sıkıştı uyarısı veriyor.",
		"priority":          "high",
		"submitted_by_name": "Ahmet Kasiyer",
		"submitted_by_role": "cashier",
		"device_info":       "Epson TM-T88VI Terminal-1",
	}
	tBytes, _ := json.Marshal(ticketPayload)
	req := httptest.NewRequest("POST", "/api/support/tickets", bytes.NewReader(tBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/support/tickets failed: status %d", resp.StatusCode)
	}
	var createdRes map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &createdRes)
	ticketData := createdRes["ticket"].(map[string]interface{})
	ticketID := int(ticketData["id"].(float64))

	// 2. GET /api/support/tickets (POS list)
	req = httptest.NewRequest("GET", "/api/support/tickets", nil)
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/support/tickets failed: status %d", resp.StatusCode)
	}

	// 3. GET /api/master/tickets (Master Admin list)
	req = httptest.NewRequest("GET", "/api/master/tickets", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/tickets failed: status %d", resp.StatusCode)
	}

	// 4. PUT /api/master/tickets/:id/status (lifecycle transition: new -> in_review -> resolved)
	statusPayload := map[string]interface{}{
		"status":           "resolved",
		"resolution_notes": "Yazıcı sürücüsü güncellendi ve test fişi kesildi.",
		"performed_by":     "Master Admin",
	}
	sBytes, _ := json.Marshal(statusPayload)
	req = httptest.NewRequest("PUT", fmt.Sprintf("/api/master/tickets/%d/status", ticketID), bytes.NewReader(sBytes))
	req.Header.Set("Content-Type", "application/json")
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/master/tickets/:id/status failed: status %d", resp.StatusCode)
	}
}

// -----------------------------------------------------------------------------
// R7: Database Backup & Quotas
// -----------------------------------------------------------------------------
func TestR7_BackupAndStorageQuota(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	// 1. POST /api/master/tenants/fatihciftligi/backup (generate backup)
	req := httptest.NewRequest("POST", "/api/master/tenants/fatihciftligi/backup", nil)
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/master/tenants/fatihciftligi/backup failed: status %d", resp.StatusCode)
	}
	var backupRes map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &backupRes)
	bData := backupRes["backup"].(map[string]interface{})
	backupID := int(bData["id"].(float64))

	// 2. GET /api/master/tenants/fatihciftligi/backups (list backups)
	req = httptest.NewRequest("GET", "/api/master/tenants/fatihciftligi/backups", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/tenants/fatihciftligi/backups failed: status %d", resp.StatusCode)
	}

	// 3. GET /api/master/backups/:id/download (download backup archive)
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/master/backups/%d/download", backupID), nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/backups/:id/download failed: status %d", resp.StatusCode)
	}

	// 4. GET /api/master/tenants/fatihciftligi/quota (storage quota calculation)
	req = httptest.NewRequest("GET", "/api/master/tenants/fatihciftligi/quota", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/tenants/fatihciftligi/quota failed: status %d", resp.StatusCode)
	}
	var quotaRes map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &quotaRes)
	if quotaRes["tenant_code"] != "fatihciftligi" || quotaRes["allocated_quota_mb"] == nil {
		t.Fatalf("Unexpected quota response: %v", quotaRes)
	}

	// 5. GET /api/master/storage/summary (platform-wide storage overview)
	req = httptest.NewRequest("GET", "/api/master/storage/summary", nil)
	resp = execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/master/storage/summary failed: status %d", resp.StatusCode)
	}
	var summaryRes map[string]interface{}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &summaryRes)
	if summaryRes["total_tenants"] == nil || summaryRes["total_backups_count"] == nil {
		t.Fatalf("Unexpected summary response: %v", summaryRes)
	}
}
