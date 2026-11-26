package repository

import (
	"context"
	"errors"
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

var (
	nonAlnumRegex   = regexp.MustCompile(`[^a-z0-9\-_]`)
	validPGSchemaRe = regexp.MustCompile(`^[a-z0-9_]{2,48}$`)
	// ErrTenantNotFound is returned when an unknown or deleted tenant code is requested.
	ErrTenantNotFound = errors.New("işletme bulunamadı veya aktif değil")
)

// DatabaseManager manages PostgreSQL connection pools (GORM) or SQLite tenant databases.
type DatabaseManager struct {
	cfg           *config.Config
	MasterGorm    *gorm.DB
	MasterPool    *pgxpool.Pool
	isPostgres    bool
	sqliteBaseDir string
	tenantGorms   map[string]*gorm.DB
	tenantPools   map[string]*pgxpool.Pool
	mu            sync.RWMutex

	aliasMu       sync.RWMutex
	tenantAliases map[string]string
	knownTenants  map[string]bool
	aliasLoadedAt time.Time
}

// NewDatabaseManager initializes PostgreSQL or local SQLite data store.
func NewDatabaseManager(cfg *config.Config) (*DatabaseManager, error) {
	baseDir := resolveBackendDataDir(cfg)
	dm := &DatabaseManager{
		cfg:           cfg,
		sqliteBaseDir: baseDir,
		tenantGorms:   make(map[string]*gorm.DB),
		tenantPools:   make(map[string]*pgxpool.Pool),
		tenantAliases: make(map[string]string),
		knownTenants:  make(map[string]bool),
	}

	// 1. Try connecting to PostgreSQL Master DB Pool only when configured
	if strings.TrimSpace(cfg.MasterDatabaseURL) != "" {
		masterGorm, err := dm.connectPostgres(cfg.MasterDatabaseURL)
		if err == nil {
			dm.MasterGorm = masterGorm
			dm.isPostgres = true
			_ = dm.AutoMigrateMaster()
			_ = SeedMasterSaaSData(dm)
			log.Printf("[BonCore DB] PostgreSQL Master Pool aktif.")
			return dm, nil
		}
		log.Printf("[BonCore DB] PostgreSQL bağlantısı başarısız (%v) — SQLite yedek moduna geçiliyor.", err)
	}

	// 2. Local SQLite data store
	masterSQLitePath := filepath.Join(dm.sqliteBaseDir, "data", "master.db")
	if _, err := os.Stat(masterSQLitePath); os.IsNotExist(err) {
		legacyMaster := filepath.Join(dm.sqliteBaseDir, "master.db")
		if _, legErr := os.Stat(legacyMaster); legErr == nil {
			masterSQLitePath = legacyMaster
		}
	}
	sqliteMaster, sErr := dm.connectSQLite(masterSQLitePath)
	if sErr != nil {
		return nil, fmt.Errorf("master sqlite open failed: %w", sErr)
	}
	dm.MasterGorm = sqliteMaster
	_ = dm.AutoMigrateMaster()
	_ = SeedMasterSaaSData(dm)
	log.Printf("[BonCore DB] SQLite ACID modunda baslatildi (%s).", masterSQLitePath)

	return dm, nil
}

func resolveBackendDataDir(cfg *config.Config) string {
	if cfg != nil && strings.TrimSpace(cfg.SQLiteDataDir) != "" {
		envExplicit := strings.TrimSpace(os.Getenv("SQLITE_DATA_DIR")) != ""
		// If test or caller explicitly overrode SQLiteDataDir away from default ../backend/data
		absCfg, _ := filepath.Abs(cfg.SQLiteDataDir)
		base := filepath.Base(absCfg)
		if base == "data" {
			parent := filepath.Dir(absCfg)
			if envExplicit || !strings.HasSuffix(filepath.Clean(parent), string(filepath.Separator)+"backend") {
				return parent
			}
		} else if envExplicit || !strings.Contains(absCfg, string(filepath.Separator)+"backend") {
			return absCfg
		}
	}
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
	if cfg != nil && strings.TrimSpace(cfg.SQLiteDataDir) != "" {
		abs, _ := filepath.Abs(cfg.SQLiteDataDir)
		return abs
	}
	abs, _ := filepath.Abs("../backend")
	return abs
}

func (dm *DatabaseManager) IsPostgres() bool {
	return dm.isPostgres
}

func (dm *DatabaseManager) connectPostgres(dsn string) (*gorm.DB, error) {
	// GORM with PreferSimpleProtocol=true ensures PgBouncer transaction pooling compatibility.
	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: dm.cfg.PgBouncerMode,
	}), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
		PrepareStmt:            !dm.cfg.PgBouncerMode,
		NowFunc:                func() time.Time { return time.Now().UTC() },
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(int(dm.cfg.DBMaxConns))
	sqlDB.SetMaxIdleConns(int(dm.cfg.DBMinConns))
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if pingErr := sqlDB.PingContext(ctx); pingErr != nil {
		_ = sqlDB.Close()
		return nil, pingErr
	}

	return gormDB, nil
}

func (dm *DatabaseManager) connectSQLite(dbFilePath string) (*gorm.DB, error) {
	_ = os.MkdirAll(filepath.Dir(dbFilePath), 0755)
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)", dbFilePath)
	gormDB, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
		NowFunc:                func() time.Time { return time.Now().UTC() },
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

// InvalidateTenantCache forces the next tenant lookup to refresh aliases from Master DB.
func (dm *DatabaseManager) InvalidateTenantCache() {
	dm.aliasMu.Lock()
	dm.aliasLoadedAt = time.Time{}
	dm.aliasMu.Unlock()
}

func (dm *DatabaseManager) resolveRegisteredTenant(cleanCode string) (string, bool) {
	if dm.MasterGorm == nil {
		return cleanCode, true
	}

	now := time.Now()
	dm.aliasMu.RLock()
	fresh := !dm.aliasLoadedAt.IsZero() && now.Sub(dm.aliasLoadedAt) < 30*time.Second
	if fresh {
		if dm.knownTenants[cleanCode] {
			dm.aliasMu.RUnlock()
			return cleanCode, true
		}
		noDash := strings.ReplaceAll(cleanCode, "-", "")
		if resolved, ok := dm.tenantAliases[cleanCode]; ok {
			dm.aliasMu.RUnlock()
			return resolved, true
		}
		if resolved, ok := dm.tenantAliases[noDash]; ok {
			dm.aliasMu.RUnlock()
			return resolved, true
		}
		dm.aliasMu.RUnlock()
		return "", false
	}
	dm.aliasMu.RUnlock()

	var allTenants []models.RestaurantTenant
	if err := dm.MasterGorm.Where("status != ?", "deleted").Find(&allTenants).Error; err != nil {
		return cleanCode, true
	}

	aliases := make(map[string]string, len(allTenants)*3)
	known := make(map[string]bool, len(allTenants))
	for _, t := range allTenants {
		tCodeClean := CleanTenantCode(t.Code, t.Code)
		if tCodeClean == "" {
			continue
		}
		known[tCodeClean] = true
		aliases[tCodeClean] = tCodeClean
		aliases[strings.ReplaceAll(tCodeClean, "-", "")] = tCodeClean
		if tNameClean := CleanTenantCode(t.Name, ""); tNameClean != "" {
			aliases[tNameClean] = tCodeClean
			aliases[strings.ReplaceAll(tNameClean, "-", "")] = tCodeClean
		}
	}

	dm.aliasMu.Lock()
	dm.tenantAliases = aliases
	dm.knownTenants = known
	dm.aliasLoadedAt = now
	dm.aliasMu.Unlock()

	if known[cleanCode] {
		return cleanCode, true
	}
	if resolved, ok := aliases[cleanCode]; ok {
		return resolved, true
	}
	if resolved, ok := aliases[strings.ReplaceAll(cleanCode, "-", "")]; ok {
		return resolved, true
	}
	return "", false
}

// ProvisionTenantDB refreshes the tenant cache and initializes the database for a newly registered tenant.
func (dm *DatabaseManager) ProvisionTenantDB(tenantCode string) (*gorm.DB, error) {
	dm.InvalidateTenantCache()
	return dm.GetTenantDB(tenantCode)
}

// GetTenantDB returns the isolated GORM instance for a registered restaurant tenant code.
func (dm *DatabaseManager) GetTenantDB(tenantCode string) (*gorm.DB, error) {
	if strings.TrimSpace(tenantCode) == "" && dm.cfg != nil {
		tenantCode = dm.cfg.DefaultTenantCode
	}
	cleanCode := CleanTenantCode(tenantCode, "")
	if cleanCode == "" {
		return nil, ErrTenantNotFound
	}

	resolvedCode, ok := dm.resolveRegisteredTenant(cleanCode)
	if !ok {
		return nil, ErrTenantNotFound
	}
	cleanCode = resolvedCode

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
		if !validPGSchemaRe.MatchString(schemaName) {
			return nil, fmt.Errorf("geçersiz şema adı: %s", schemaName)
		}
		if dm.MasterGorm != nil {
			if err := dm.MasterGorm.Exec(fmt.Sprintf(`CREATE SCHEMA IF NOT EXISTS "%s";`, schemaName)).Error; err != nil {
				return nil, fmt.Errorf("postgresql şema oluşturulamadı: %w", err)
			}
		}
		baseURL := dm.cfg.DatabaseURL
		if strings.TrimSpace(baseURL) == "" {
			baseURL = dm.cfg.MasterDatabaseURL
		}
		dsn := baseURL
		if !dm.cfg.PgBouncerMode {
			sep := "?"
			if strings.Contains(baseURL, "?") {
				sep = "&"
			}
			dsn = fmt.Sprintf("%s%ssearch_path=%s,public", baseURL, sep, schemaName)
		}

		gormDB, err := dm.connectPostgres(dsn)
		if err != nil {
			// NEVER silently fall back to ephemeral SQLite when PostgreSQL mode is active
			return nil, fmt.Errorf("postgresql tenant bağlantısı kurulamadı (%s): %w", cleanCode, err)
		}
		if dm.cfg.PgBouncerMode {
			_ = gormDB.Callback().Query().Before("gorm:query").Register("boncore:set_schema", func(tx *gorm.DB) {
				_ = tx.Exec(fmt.Sprintf(`SET search_path TO "%s", public;`, schemaName)).Error
			})
			_ = gormDB.Callback().Create().Before("gorm:create").Register("boncore:set_schema", func(tx *gorm.DB) {
				_ = tx.Exec(fmt.Sprintf(`SET search_path TO "%s", public;`, schemaName)).Error
			})
			_ = gormDB.Callback().Update().Before("gorm:update").Register("boncore:set_schema", func(tx *gorm.DB) {
				_ = tx.Exec(fmt.Sprintf(`SET search_path TO "%s", public;`, schemaName)).Error
			})
			_ = gormDB.Callback().Delete().Before("gorm:delete").Register("boncore:set_schema", func(tx *gorm.DB) {
				_ = tx.Exec(fmt.Sprintf(`SET search_path TO "%s", public;`, schemaName)).Error
			})
			_ = gormDB.Exec(fmt.Sprintf(`SET search_path TO "%s", public;`, schemaName)).Error
		}
		_ = dm.AutoMigrateTenant(gormDB)
		dm.EnsureTenantManager(gormDB, cleanCode)
		dm.tenantGorms[cleanCode] = gormDB
		return gormDB, nil
	}

	// Resolve SQLite file path
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
		}
	}

	// 2. Seed primary default tenant ONLY when tenants table is completely empty (no startup overwrite!)
	var tenantCount int64
	db.Model(&models.RestaurantTenant{}).Count(&tenantCount)
	defaultCode := "fatihciftligi"
	if dm.cfg != nil && strings.TrimSpace(dm.cfg.DefaultTenantCode) != "" {
		defaultCode = CleanTenantCode(dm.cfg.DefaultTenantCode, "fatihciftligi")
	}
	if tenantCount == 0 {
		defaultTenant := models.RestaurantTenant{
			Code:                defaultCode,
			Name:                "BonCore Demo İşletme",
			City:                "İstanbul",
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
		}
		if err := db.Create(&defaultTenant).Error; err != nil {
			return fmt.Errorf("failed to create default tenant: %w", err)
		}
	}

	// 3. Seed empty-secret VPOS template rows only if table is empty
	var vposCount int64
	db.Model(&models.VPOSConfig{}).Count(&vposCount)
	if vposCount == 0 {
		paytrNotes := "PayTR Sandbox Test Ortamı"
		iyzicoNotes := "iyzico Sandbox Test Ortamı"
		vposConfigs := []models.VPOSConfig{
			{
				GatewayProvider: "paytr",
				IsProduction:    false,
				IsActive:        false,
				Notes:           &paytrNotes,
			},
			{
				GatewayProvider: "iyzico",
				IsProduction:    false,
				IsActive:        false,
				Notes:           &iyzicoNotes,
			},
		}
		for _, cfg := range vposConfigs {
			db.Create(&cfg)
		}
	}

	// 4. Backfill invoice tenant codes, subtotal, and tax if empty
	var invoices []models.TenantInvoice
	if err := db.Where("tenant_code = '' OR tenant_code IS NULL").Find(&invoices).Error; err == nil {
		for _, inv := range invoices {
			var t models.RestaurantTenant
			if err := db.Select("code").Where("id = ?", inv.TenantID).First(&t).Error; err == nil && t.Code != "" {
				inv.TenantCode = t.Code
			}
			if inv.Subtotal == 0 && inv.Amount > 0 {
				inv.Subtotal = inv.Amount / 1.20
				inv.TaxAmount = inv.Amount - inv.Subtotal
			}
			db.Save(&inv)
		}
	}

	dm.InvalidateTenantCache()
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
				var existing models.RestaurantTenant
				if err := secGorm.Where("id = ? OR code = ?", pt.ID, pt.Code).First(&existing).Error; err == nil {
					secGorm.Save(&pt)
				} else {
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
	tenantModels := []interface{}{
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
	}
	var err error
	for _, model := range tenantModels {
		if mErr := db.AutoMigrate(model); mErr != nil && err == nil {
			err = mErr
		}
	}
	if db.Dialector.Name() == "postgres" {
		db.Exec(`ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_neg_stock BOOLEAN DEFAULT false;`)
	} else {
		db.Exec(`ALTER TABLE products ADD COLUMN allow_neg_stock BOOLEAN DEFAULT 0;`)
	}
	if err != nil {
		// Individual model migration errors are tolerated on legacy SQLite schemas after defensive ALTER TABLE
		_ = err
	}

	// Performance Indexes for high-frequency queries
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders (table_id, status);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_order_items_order_status ON order_items (order_id, status);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_tables_area_id ON tables (area_id);`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);`)

	if db.Dialector.Name() == "postgres" {
		// JSONB GIN Indexes for sub-millisecond dynamic order variation & allergen queries
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_order_items_selected_modifiers_gin ON order_items USING GIN (selected_modifiers);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_order_items_negative_modifiers_gin ON order_items USING GIN (negative_modifiers);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_products_allergens_gin ON products USING GIN (allergens);`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING GIN (details);`)
	}

	BackfillHashedStaffPINs(dm.cfg, db)
	return nil
}

// EnsureTenantManager seeds a demo manager ONLY when BONCORE_ALLOW_DEMO_SEED is explicitly enabled.
// Production SaaS tenant provisioning creates its own manager credentials explicitly without hidden PIN backdoors.
func (dm *DatabaseManager) EnsureTenantManager(db *gorm.DB, tenantCode string) {
	if db == nil || dm.cfg == nil || !dm.cfg.AllowDemoSeed {
		return
	}
	var count int64
	db.Model(&models.StaffUser{}).Where("LOWER(role) IN ? AND is_active = ?", []string{"manager", "admin", "superadmin", "müdür", "mudur", "yönetici", "yonetici"}, true).Count(&count)
	if count == 0 {
		uname := fmt.Sprintf("%s_admin", tenantCode)
		if strings.TrimSpace(tenantCode) == "" {
			uname = "admin"
		}
		pin := dm.cfg.ManagerOverridePIN
		if strings.TrimSpace(pin) == "" {
			return
		}
		defaultMgr := models.StaffUser{
			Name:     "Demo Yönetici",
			Role:     "manager",
			Username: &uname,
			IsActive: true,
		}
		ApplyHashedStaffPin(dm.cfg, &defaultMgr, pin)
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
		dm.MasterPool = nil
	}
	if dm.MasterGorm != nil {
		if sqlDB, err := dm.MasterGorm.DB(); err == nil {
			_ = sqlDB.Close()
		}
		dm.MasterGorm = nil
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

// RenameTenantCode migrates and aliases an existing tenant database when its login code is changed.
func (dm *DatabaseManager) RenameTenantCode(oldCode string, newCode string) error {
	oldClean := CleanTenantCode(oldCode, "")
	newClean := CleanTenantCode(newCode, "")
	if oldClean == "" || newClean == "" || oldClean == newClean {
		return nil
	}

	oldDB, _ := dm.GetTenantDB(oldClean)

	if dm.isPostgres {
		_ = dm.CloseTenantDB(oldClean)
		_ = dm.CloseTenantDB(newClean)
		oldSchema := strings.ReplaceAll(oldClean, "-", "_")
		newSchema := strings.ReplaceAll(newClean, "-", "_")
		if !validPGSchemaRe.MatchString(oldSchema) || !validPGSchemaRe.MatchString(newSchema) {
			return fmt.Errorf("geçersiz şema adı")
		}
		if dm.MasterGorm != nil && oldSchema != newSchema {
			_ = dm.MasterGorm.Exec(fmt.Sprintf(`ALTER SCHEMA IF EXISTS "%s" RENAME TO "%s";`, oldSchema, newSchema)).Error
		}
		return dm.InvalidateAndWarmTenant(newClean)
	}

	if oldDB != nil {
		_ = oldDB.Exec("PRAGMA wal_checkpoint(TRUNCATE);").Error
	}
	oldPath := dm.GetTenantDBPath(oldClean)
	newPath := filepath.Join(dm.sqliteBaseDir, "data", "tenants", fmt.Sprintf("%s.db", newClean))
	_ = dm.CloseTenantDB(oldClean)
	_ = dm.CloseTenantDB(newClean)

	if oldPath != newPath {
		if _, err := os.Stat(oldPath); err == nil {
			if _, nErr := os.Stat(newPath); os.IsNotExist(nErr) {
				_ = os.MkdirAll(filepath.Dir(newPath), 0755)
				if data, rErr := os.ReadFile(oldPath); rErr == nil {
					_ = os.WriteFile(newPath, data, 0644)
				}
			}
		}
	}

	newDB, err := dm.ProvisionTenantDB(newClean)
	if err == nil && newDB != nil {
		dm.mu.Lock()
		dm.tenantGorms[oldClean] = newDB
		dm.tenantGorms[newClean] = newDB
		dm.mu.Unlock()
	}
	return err
}

func (dm *DatabaseManager) InvalidateAndWarmTenant(code string) error {
	_, err := dm.ProvisionTenantDB(code)
	return err
}

// GetSqliteBaseDir returns the base directory where SQLite database files and backups reside.
func (dm *DatabaseManager) GetSqliteBaseDir() string {
	return dm.sqliteBaseDir
}

// GetAllTenantCodes discovers all active and known tenant database codes from config, Master DB, and filesystem.
func (dm *DatabaseManager) GetAllTenantCodes() []string {
	seen := make(map[string]bool)
	var result []string

	addCode := func(code string) {
		clean := CleanTenantCode(code, "")
		if clean != "" && !seen[clean] {
			seen[clean] = true
			result = append(result, clean)
		}
	}

	// 1. Default tenant code
	if dm.cfg != nil && dm.cfg.DefaultTenantCode != "" {
		addCode(dm.cfg.DefaultTenantCode)
	}

	// 2. Tenants from Master DB if available
	if dm.MasterGorm != nil {
		var tenants []models.RestaurantTenant
		if err := dm.MasterGorm.Find(&tenants).Error; err == nil {
			for _, t := range tenants {
				addCode(t.Code)
			}
		}
	}

	// 3. Scan filesystem in data/tenants/
	tenantsDir := filepath.Join(dm.sqliteBaseDir, "data", "tenants")
	if entries, err := os.ReadDir(tenantsDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".db") {
				code := strings.TrimSuffix(e.Name(), ".db")
				addCode(code)
			}
		}
	}

	// Also check directly in dm.sqliteBaseDir for single-tenant / legacy files
	if entries, err := os.ReadDir(dm.sqliteBaseDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".db") && e.Name() != "master.db" {
				code := strings.TrimSuffix(e.Name(), ".db")
				addCode(code)
			}
		}
	}

	return result
}


