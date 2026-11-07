package repository

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/glebarez/sqlite"
	"github.com/jackc/pgx/v5/pgxpool"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

var nonAlnumRegex = regexp.MustCompile(`[^a-z0-9\-_]`)

// DatabaseManager manages PostgreSQL connection pools (pgxpool + GORM) with PgBouncer
// transaction-pooling compatibility, row-level locking (`SELECT ... FOR UPDATE`),
// JSONB GIN indexing, and automatic local SQLite fallback when a local PostgreSQL
// service is not running.
type DatabaseManager struct {
	cfg           *config.Config
	MasterGorm    *gorm.DB
	MasterPool    *pgxpool.Pool
	isPostgres    bool
	sqliteBaseDir string
	tenantGorms   map[string]*gorm.DB
	tenantPools   map[string]*pgxpool.Pool
	mu            sync.RWMutex
}

// NewDatabaseManager initializes the PostgreSQL connection pools or falls back to the local SQLite data store.
func NewDatabaseManager(cfg *config.Config) (*DatabaseManager, error) {
	dm := &DatabaseManager{
		cfg:           cfg,
		sqliteBaseDir: resolveBackendDataDir(),
		tenantGorms:   make(map[string]*gorm.DB),
		tenantPools:   make(map[string]*pgxpool.Pool),
	}

	// 1. Try connecting to PostgreSQL Master DB Pool
	masterGorm, masterPool, err := dm.connectPostgres(cfg.MasterDatabaseURL)
	if err == nil {
		dm.MasterGorm = masterGorm
		dm.MasterPool = masterPool
		dm.isPostgres = true
		_ = dm.AutoMigrateMaster()
		_ = SeedMasterSaaSData(dm)
		log.Printf("[BonCore DB] PostgreSQL Master & PgBouncer Pool aktif.")
		return dm, nil
	}

	// 2. Fallback to existing BonCore SQLite database directory (`backend/data/master.db` with graceful fallback to `backend/master.db`)
	masterSQLitePath := filepath.Join(dm.sqliteBaseDir, "data", "master.db")
	if _, err := os.Stat(masterSQLitePath); os.IsNotExist(err) {
		masterSQLitePath = filepath.Join(dm.sqliteBaseDir, "master.db")
	}
	sqliteMaster, sErr := dm.connectSQLite(masterSQLitePath)
	if sErr == nil {
		dm.MasterGorm = sqliteMaster
		_ = dm.AutoMigrateMaster()
		_ = SeedMasterSaaSData(dm)
		log.Printf("[BonCore DB] PostgreSQL sunucusuna ulasilamadi (%v) -> Mevcut veritabani (%s) uzerinden ACID modunda baslatildi.", err, masterSQLitePath)
	}

	return dm, nil
}

func resolveBackendDataDir() string {
	candidates := []string{
		"../backend",
		"backend",
		".",
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "data", "master.db")); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
		if _, err := os.Stat(filepath.Join(c, "master.db")); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	abs, _ := filepath.Abs("../backend")
	return abs
}

func (dm *DatabaseManager) IsPostgres() bool {
	return dm.isPostgres
}

func (dm *DatabaseManager) connectPostgres(dsn string) (*gorm.DB, *pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, nil, err
	}
	poolCfg.MaxConns = dm.cfg.DBMaxConns
	poolCfg.MinConns = dm.cfg.DBMinConns
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, err
	}

	// GORM with PreferSimpleProtocol=true ensures 100% PgBouncer transaction pooling compatibility
	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: dm.cfg.PgBouncerMode,
	}), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
		PrepareStmt:            !dm.cfg.PgBouncerMode,
	})
	if err != nil {
		pool.Close()
		return nil, nil, err
	}

	sqlDB, err := gormDB.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(int(dm.cfg.DBMaxConns))
		sqlDB.SetMaxIdleConns(int(dm.cfg.DBMinConns))
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
	}

	return gormDB, pool, nil
}

func (dm *DatabaseManager) connectSQLite(dbFilePath string) (*gorm.DB, error) {
	_ = os.MkdirAll(filepath.Dir(dbFilePath), 0755)
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)", dbFilePath)
	gormDB, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := gormDB.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
	}
	_ = gormDB.Exec("PRAGMA journal_mode=WAL;").Error
	_ = gormDB.Exec("PRAGMA busy_timeout=5000;").Error
	_ = gormDB.Exec("PRAGMA foreign_keys=ON;").Error
	return gormDB, nil
}

// CleanTenantCode normalizes Turkish characters and special symbols into a clean slug,
// identical to Python's `clean_tenant_code` in backend/app/database.py.
func CleanTenantCode(code string, fallback string) string {
	if strings.TrimSpace(code) == "" {
		return fallback
	}
	replacer := strings.NewReplacer(
		"ç", "c", "ğ", "g", "ı", "i", "ö", "o", "ş", "s", "ü", "u",
		"Ç", "c", "Ğ", "g", "İ", "i", "Ö", "o", "Ş", "s", "Ü", "u",
		" ", "-",
	)
	cleaned := strings.ToLower(replacer.Replace(strings.TrimSpace(code)))
	cleaned = nonAlnumRegex.ReplaceAllString(cleaned, "")
	if cleaned == "" {
		return fallback
	}
	return cleaned
}

// GetTenantDB returns the isolated GORM instance for a given restaurant tenant code.
func (dm *DatabaseManager) GetTenantDB(tenantCode string) (*gorm.DB, error) {
	cleanCode := CleanTenantCode(tenantCode, dm.cfg.DefaultTenantCode)

	dm.mu.RLock()
	if db, ok := dm.tenantGorms[cleanCode]; ok && db != nil {
		dm.mu.RUnlock()
		return db, nil
	}
	dm.mu.RUnlock()

	dm.mu.Lock()
	defer dm.mu.Unlock()

	if db, ok := dm.tenantGorms[cleanCode]; ok && db != nil {
		return db, nil
	}

	if dm.isPostgres {
		schemaName := strings.ReplaceAll(cleanCode, "-", "_")
		if dm.MasterGorm != nil {
			dm.MasterGorm.Exec(fmt.Sprintf(`CREATE SCHEMA IF NOT EXISTS "%s";`, schemaName))
		}
		dsn := fmt.Sprintf("%s&search_path=%s,public", dm.cfg.DatabaseURL, schemaName)
		if !strings.Contains(dm.cfg.DatabaseURL, "?") {
			dsn = fmt.Sprintf("%s?search_path=%s,public", dm.cfg.DatabaseURL, schemaName)
		}

		gormDB, pool, err := dm.connectPostgres(dsn)
		if err == nil {
			_ = dm.AutoMigrateTenant(gormDB)
			dm.EnsureTenantManager(gormDB, cleanCode)
			dm.tenantGorms[cleanCode] = gormDB
			dm.tenantPools[cleanCode] = pool
			return gormDB, nil
		}
	}

	// Resolve SQLite file path matching Python `get_tenant_db_path(tenant_code)`
	var dbPath string
	tenantsDir := filepath.Join(dm.sqliteBaseDir, "data", "tenants")
	_ = os.MkdirAll(tenantsDir, 0755)
	tenantCandidate := filepath.Join(tenantsDir, fmt.Sprintf("%s.db", cleanCode))
	if _, err := os.Stat(tenantCandidate); err == nil {
		dbPath = tenantCandidate
	} else {
		primaryPath := filepath.Join(dm.sqliteBaseDir, fmt.Sprintf("%s.db", cleanCode))
		if _, err := os.Stat(primaryPath); err == nil {
			dbPath = primaryPath
		} else {
			dbPath = tenantCandidate
		}
	}

	gormDB, err := dm.connectSQLite(dbPath)
	if err != nil {
		return nil, err
	}
	_ = dm.AutoMigrateTenant(gormDB)
	dm.EnsureTenantManager(gormDB, cleanCode)
	dm.tenantGorms[cleanCode] = gormDB
	return gormDB, nil
}

// AutoMigrateMaster migrates all Master SaaS tables (existing 3 + 11 expansion models).
func (dm *DatabaseManager) AutoMigrateMaster() error {
	if dm.MasterGorm == nil {
		return nil
	}
	return dm.AutoMigrateMasterDB(dm.MasterGorm)
}

// AutoMigrateMasterDB applies GORM AutoMigrate for all Master SaaS models on the given DB.
func (dm *DatabaseManager) AutoMigrateMasterDB(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	return db.AutoMigrate(
		&models.RestaurantTenant{},
		&models.TenantLead{},
		&models.TenantInvoice{},
		&models.SaaSPlan{},
		&models.FleetHeartbeat{},
		&models.TenantLiveMetric{},
		&models.VPOSConfig{},
		&models.FranchiseBrand{},
		&models.MenuTemplate{},
		&models.MenuCloneHistory{},
		&models.BroadcastAnnouncement{},
		&models.AnnouncementReceipt{},
		&models.SupportTicket{},
		&models.SupportTicketMessage{},
		&models.SupportTicketAuditLog{},
		&models.TenantBackup{},
		&models.TenantStorageQuota{},
	)
}

// SeedMasterSaaSData initializes required SaaS plans, VPOS test configs, sample franchise brands,
// ensures fatihciftligi has full enterprise feature flags enabled, and synchronizes schemas and records
// between backend/data/master.db and fallback backend/master.db.
func SeedMasterSaaSData(dm *DatabaseManager) error {
	if dm.MasterGorm == nil {
		return nil
	}

	if err := dm.AutoMigrateMaster(); err != nil {
		return fmt.Errorf("master automigrate failed: %w", err)
	}

	if err := dm.seedMasterRecords(dm.MasterGorm); err != nil {
		return fmt.Errorf("master record seeding failed: %w", err)
	}

	dm.syncSecondaryMasterDB()
	return nil
}

func (dm *DatabaseManager) seedMasterRecords(db *gorm.DB) error {
	// 1. Seed 3 Standard SaaS Plans ('starter', 'pro', 'enterprise')
	plans := []models.SaaSPlan{
		{
			Code:           "starter",
			Name:           "Starter Başlangıç",
			Description:    "Küçük ölçekli kafeler ve butik restoranlar için temel POS ve sipariş yönetimi",
			PriceMonthly:   990.0,
			PriceYearly:    9900.0,
			MaxDevices:     3,
			MaxBranches:    1,
			StorageQuotaMB: 500,
			IncludedModules: models.StringSlice{"qr_menu", "stock_recipe"},
			IsActive:       true,
		},
		{
			Code:           "pro",
			Name:           "Pro Profesyonel",
			Description:    "Büyüyen restoranlar ve çok istasyonlu mutfaklar için tam kapsamlı POS",
			PriceMonthly:   1990.0,
			PriceYearly:    19900.0,
			MaxDevices:     10,
			MaxBranches:    3,
			StorageQuotaMB: 2048,
			IncludedModules: models.StringSlice{"qr_menu", "kds", "stock_recipe", "delivery", "loyalty"},
			IsActive:       true,
		},
		{
			Code:           "enterprise",
			Name:           "Enterprise Kurumsal",
			Description:    "Zincir restoranlar, franchise ve kurumsal markalar için sınırsız güç",
			PriceMonthly:   3990.0,
			PriceYearly:    39900.0,
			MaxDevices:     100,
			MaxBranches:    50,
			StorageQuotaMB: 10240,
			IncludedModules: models.StringSlice{"qr_menu", "kds", "delivery", "integrations", "e_invoice", "stock_recipe", "loyalty"},
			IsActive:       true,
		},
	}
	for _, p := range plans {
		var existing models.SaaSPlan
		if err := db.Where("code = ?", p.Code).First(&existing).Error; err != nil {
			if err := db.Create(&p).Error; err != nil {
				return fmt.Errorf("failed to create plan %s: %w", p.Code, err)
			}
		} else {
			existing.Name = p.Name
			existing.Description = p.Description
			existing.PriceMonthly = p.PriceMonthly
			existing.PriceYearly = p.PriceYearly
			existing.MaxDevices = p.MaxDevices
			existing.MaxBranches = p.MaxBranches
			existing.StorageQuotaMB = p.StorageQuotaMB
			existing.IncludedModules = p.IncludedModules
			existing.IsActive = p.IsActive
			db.Save(&existing)
		}
	}

	// 2. Seed Sample Franchise Brand ('fatih-group')
	var brand models.FranchiseBrand
	if err := db.Where("code = ?", "fatih-group").First(&brand).Error; err != nil {
		taxNo := "1234567890"
		taxOff := "Kadıköy"
		hqAddr := "Bağdat Caddesi No:100 Kadıköy, İstanbul"
		cPerson := "Fatih Yılmaz"
		cPhone := "0532 555 0101"
		cEmail := "fatih@fatihciftligi.com"
		brand = models.FranchiseBrand{
			Code:                "fatih-group",
			Name:                "Fatih Çiftliği Grubu",
			TaxNumber:           &taxNo,
			TaxOffice:           &taxOff,
			HeadquartersAddress: &hqAddr,
			ContactPerson:       &cPerson,
			ContactPhone:        &cPhone,
			ContactEmail:        &cEmail,
			PrimaryTenantCode:   "fatihciftligi",
			Status:              "active",
		}
		if err := db.Create(&brand).Error; err != nil {
			return fmt.Errorf("failed to create brand: %w", err)
		}
	}

	// 3. Ensure tenant 'fatihciftligi' has all 7 feature flags enabled (true), plan = "enterprise", and status = "active", linked as flagship
	var fatih models.RestaurantTenant
	branchCode := "IST-HQ-01"
	branchName := "Fatih Çiftliği Merkez"
	if err := db.Where("code = ?", "fatihciftligi").First(&fatih).Error; err != nil {
		ownerName := "Fatih Bey"
		phone := "0532 555 0101"
		email := "info@fatihciftligi.com"
		taxNo := "1234567890"
		taxOff := "Kadıköy"
		addr := "Kadıköy, İstanbul"
		fatih = models.RestaurantTenant{
			Code:                "fatihciftligi",
			Name:                "Fatih Çiftliği",
			OwnerName:           &ownerName,
			Phone:               &phone,
			Email:               &email,
			City:                "İstanbul",
			TaxNumber:           &taxNo,
			TaxOffice:           &taxOff,
			Address:             &addr,
			Plan:                "enterprise",
			PlanCode:            "enterprise",
			MonthlyPrice:        3990.0,
			BillingCycle:        "monthly",
			Status:              "active",
			FeatureQRMenu:       true,
			FeatureKDS:          true,
			FeatureDelivery:     true,
			FeatureIntegrations: true,
			FeatureEInvoice:     true,
			FeatureStockRecipe:  true,
			FeatureLoyalty:      true,
			FeatureHotel:        true,
			FeatureKiosk:        true,
			FeatureReservations: true,
			FeatureCostProfit:   true,
			ReadOnlyMode:        false,
			BrandID:             &brand.ID,
			IsBrandMaster:       true,
			BranchCode:          &branchCode,
			BranchName:          &branchName,
		}
		if err := db.Create(&fatih).Error; err != nil {
			return fmt.Errorf("failed to create fatihciftligi tenant: %w", err)
		}
	} else {
		fatih.Plan = "enterprise"
		fatih.PlanCode = "enterprise"
		fatih.Status = "active"
		fatih.FeatureQRMenu = true
		fatih.FeatureKDS = true
		fatih.FeatureDelivery = true
		fatih.FeatureIntegrations = true
		fatih.FeatureEInvoice = true
		fatih.FeatureStockRecipe = true
		fatih.FeatureLoyalty = true
		fatih.FeatureHotel = true
		fatih.FeatureKiosk = true
		fatih.FeatureReservations = true
		fatih.FeatureCostProfit = true
		fatih.ReadOnlyMode = false
		fatih.BrandID = &brand.ID
		fatih.IsBrandMaster = true
		if fatih.BranchCode == nil {
			fatih.BranchCode = &branchCode
		}
		if fatih.BranchName == nil {
			fatih.BranchName = &branchName
		}
		db.Save(&fatih)
	}

	// 4. Default test VPOS config for PayTR and iyzico in sandbox mode (is_production = false)
	paytrNotes := "PayTR Sandbox Test Ortamı"
	iyzicoNotes := "iyzico Sandbox Test Ortamı"
	vposConfigs := []models.VPOSConfig{
		{
			GatewayProvider: "paytr",
			IsProduction:    false,
			MerchantID:      "TEST_PAYTR_MERCHANT_12345",
			APIKey:          "test_paytr_api_key_sample",
			APISecret:       "test_paytr_api_secret_sample",
			MerchantSalt:    "test_paytr_salt_sample",
			CallbackURL:     "http://localhost:8000/api/billing/webhook/paytr",
			IsActive:        true,
			Notes:           &paytrNotes,
		},
		{
			GatewayProvider: "iyzico",
			IsProduction:    false,
			MerchantID:      "TEST_IYZICO_MERCHANT_67890",
			APIKey:          "sandbox-iyzico-api-key-sample",
			APISecret:       "sandbox-iyzico-secret-sample",
			MerchantSalt:    "",
			CallbackURL:     "http://localhost:8000/api/billing/webhook/iyzico",
			IsActive:        true,
			Notes:           &iyzicoNotes,
		},
	}
	for _, cfg := range vposConfigs {
		var existing models.VPOSConfig
		if err := db.Where("gateway_provider = ? AND is_production = ?", cfg.GatewayProvider, cfg.IsProduction).First(&existing).Error; err != nil {
			db.Create(&cfg)
		}
	}

	// 5. Initial Storage Quota & Live Metrics for 'fatihciftligi'
	var quota models.TenantStorageQuota
	if err := db.Where("tenant_code = ?", "fatihciftligi").First(&quota).Error; err != nil {
		quota = models.TenantStorageQuota{
			TenantCode:       "fatihciftligi",
			AllocatedQuotaMB: 10240,
			UsedDBBytes:      856064,
			UsedMediaBytes:   0,
			TotalUsedMB:      0.82,
			UsagePercentage:  0.01,
			IsQuotaExceeded:  false,
		}
		db.Create(&quota)
	} else if quota.AllocatedQuotaMB < 10240 {
		quota.AllocatedQuotaMB = 10240
		db.Save(&quota)
	}

	var liveMetric models.TenantLiveMetric
	if err := db.Where("tenant_code = ?", "fatihciftligi").First(&liveMetric).Error; err != nil {
		liveMetric = models.TenantLiveMetric{
			TenantCode:         "fatihciftligi",
			TenantName:         fatih.Name,
			IsOnline:           true,
			LastSeenAt:         time.Now(),
			ConnectedTablets:   2,
			ConnectedHandhelds: 1,
			ConnectedKDS:       1,
			ActiveTablesCount:  5,
			ActiveOrdersCount:  4,
			TodayRevenue:       18450.0,
			TodayOrdersCount:   42,
		}
		db.Create(&liveMetric)
	}

	// 6. Backfill invoice tenant codes, subtotal, and tax if empty
	var invoices []models.TenantInvoice
	if err := db.Where("tenant_code = '' OR tenant_code IS NULL").Find(&invoices).Error; err == nil {
		for _, inv := range invoices {
			var t models.RestaurantTenant
			if err := db.Select("code").Where("id = ?", inv.TenantID).First(&t).Error; err == nil && t.Code != "" {
				inv.TenantCode = t.Code
			} else if strings.Contains(strings.ToLower(inv.TenantName), "fatih") {
				inv.TenantCode = "fatihciftligi"
			}
			if inv.Subtotal == 0 && inv.Amount > 0 {
				inv.Subtotal = inv.Amount / 1.20
				inv.TaxAmount = inv.Amount - inv.Subtotal
			}
			db.Save(&inv)
		}
	}

	return nil
}

func (dm *DatabaseManager) syncSecondaryMasterDB() {
	if dm.sqliteBaseDir == "" {
		return
	}
	dataMaster := filepath.Join(dm.sqliteBaseDir, "data", "master.db")
	rootMaster := filepath.Join(dm.sqliteBaseDir, "master.db")

	var targetPath string
	if _, err := os.Stat(dataMaster); err == nil {
		targetPath = rootMaster
	} else if _, err := os.Stat(rootMaster); err == nil {
		targetPath = dataMaster
	}

	if targetPath == "" {
		return
	}

	secGorm, err := dm.connectSQLite(targetPath)
	if err != nil {
		log.Printf("[BonCore DB] syncSecondaryMasterDB connect warning: %v", err)
		return
	}
	defer func() {
		if sDB, err := secGorm.DB(); err == nil {
			_ = sDB.Close()
		}
	}()

	_ = dm.AutoMigrateMasterDB(secGorm)
	_ = dm.seedMasterRecords(secGorm)

	// Sync any missing tenants, leads, and invoices from primary to secondary
	if dm.MasterGorm != nil {
		var primTenants []models.RestaurantTenant
		if err := dm.MasterGorm.Find(&primTenants).Error; err == nil {
			for _, pt := range primTenants {
				var count int64
				secGorm.Model(&models.RestaurantTenant{}).Where("code = ?", pt.Code).Count(&count)
				if count == 0 {
					secGorm.Create(&pt)
				}
			}
		}

		var primLeads []models.TenantLead
		if err := dm.MasterGorm.Find(&primLeads).Error; err == nil {
			for _, pl := range primLeads {
				var count int64
				secGorm.Model(&models.TenantLead{}).Where("id = ?", pl.ID).Count(&count)
				if count == 0 {
					secGorm.Create(&pl)
				}
			}
		}

		var primInvoices []models.TenantInvoice
		if err := dm.MasterGorm.Find(&primInvoices).Error; err == nil {
			for _, pi := range primInvoices {
				var count int64
				secGorm.Model(&models.TenantInvoice{}).Where("invoice_no = ?", pi.InvoiceNo).Count(&count)
				if count == 0 {
					secGorm.Create(&pi)
				}
			}
		}
	}

	log.Printf("[BonCore DB] Master DB sync completed successfully for %s", targetPath)
}

// AutoMigrateTenant migrates all 22 Tenant tables and creates JSONB GIN indexes on PostgreSQL.
func (dm *DatabaseManager) AutoMigrateTenant(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	err := db.AutoMigrate(
		&models.StaffUser{},
		&models.Area{},
		&models.Table{},
		&models.Category{},
		&models.Product{},
		&models.ProductVariant{},
		&models.ModifierGroup{},
		&models.ModifierOption{},
		&models.Ingredient{},
		&models.Recipe{},
		&models.Warehouse{},
		&models.WarehouseStock{},
		&models.StockMovement{},
		&models.Order{},
		&models.OrderItem{},
		&models.Payment{},
		&models.CashRegister{},
		&models.CashExpense{},
		&models.Courier{},
		&models.DeliveryOrder{},
		&models.AuditLog{},
		&models.RestaurantSetting{},
	)
	if err != nil {
		return err
	}

	if db.Dialector.Name() == "postgres" {
		// JSONB GIN Indexes for sub-millisecond dynamic order variation & allergen queries
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_order_items_selected_modifiers_gin ON order_items USING GIN (selected_modifiers);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_order_items_negative_modifiers_gin ON order_items USING GIN (negative_modifiers);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_products_allergens_gin ON products USING GIN (allergens);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING GIN (details);`)
	}

	return nil
}

// EnsureTenantManager guarantees that every restaurant tenant database always has at least
// one active manager/admin user, preventing permanent lockout.
func (dm *DatabaseManager) EnsureTenantManager(db *gorm.DB, tenantCode string) {
	if db == nil {
		return
	}
	var count int64
	db.Model(&models.StaffUser{}).Where("LOWER(role) IN ? AND is_active = ?", []string{"manager", "admin", "superadmin", "müdür", "mudur", "yönetici", "yonetici"}, true).Count(&count)
	if count == 0 {
		uname := fmt.Sprintf("%s_admin", tenantCode)
		if strings.TrimSpace(tenantCode) == "" {
			uname = "admin"
		}
		pin := "9999"
		defaultMgr := models.StaffUser{
			Name:     "Kemal Müdür",
			Role:     "manager",
			PinCode:  pin,
			Username: &uname,
			IsActive: true,
		}
		_ = db.Create(&defaultMgr)
	}
}

// WithRowLock applies PostgreSQL `SELECT ... FOR UPDATE` row-level locking inside transactions
// to prevent race conditions during bill settlement, split payments, table merges, and stock deductions.
func WithRowLock(tx *gorm.DB) *gorm.DB {
	if tx != nil && tx.Dialector != nil && tx.Dialector.Name() == "postgres" {
		return tx.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return tx
}

// Close gracefully closes all active connection pools.
func (dm *DatabaseManager) Close() {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.MasterPool != nil {
		dm.MasterPool.Close()
	}
	for _, pool := range dm.tenantPools {
		if pool != nil {
			pool.Close()
		}
	}
	for _, gdb := range dm.tenantGorms {
		if gdb != nil {
			if sqlDB, err := gdb.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
	}
}

// GetTenantDBPath resolves the filesystem path to a tenant SQLite database.
func (dm *DatabaseManager) GetTenantDBPath(tenantCode string) string {
	cleanCode := CleanTenantCode(tenantCode, dm.cfg.DefaultTenantCode)
	tenantsDir := filepath.Join(dm.sqliteBaseDir, "data", "tenants")
	tenantCandidate := filepath.Join(tenantsDir, fmt.Sprintf("%s.db", cleanCode))
	if _, err := os.Stat(tenantCandidate); err == nil {
		return tenantCandidate
	}
	primaryPath := filepath.Join(dm.sqliteBaseDir, fmt.Sprintf("%s.db", cleanCode))
	if _, err := os.Stat(primaryPath); err == nil {
		return primaryPath
	}
	return tenantCandidate
}

// CloseTenantDB safely closes and unregisters the database connection for a specific tenant.
func (dm *DatabaseManager) CloseTenantDB(tenantCode string) error {
	cleanCode := CleanTenantCode(tenantCode, dm.cfg.DefaultTenantCode)
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if pool, ok := dm.tenantPools[cleanCode]; ok && pool != nil {
		pool.Close()
		delete(dm.tenantPools, cleanCode)
	}
	if gdb, ok := dm.tenantGorms[cleanCode]; ok && gdb != nil {
		if sqlDB, err := gdb.DB(); err == nil {
			_ = sqlDB.Close()
		}
		delete(dm.tenantGorms, cleanCode)
	}
	return nil
}

// GetSqliteBaseDir returns the base directory where SQLite database files and backups reside.
func (dm *DatabaseManager) GetSqliteBaseDir() string {
	return dm.sqliteBaseDir
}

