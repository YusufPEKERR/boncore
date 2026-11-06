package repository_test

import (
	"testing"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupInMemoryTenantDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}
	err = db.AutoMigrate(
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
		t.Fatalf("AutoMigrate failed: %v", err)
	}
	return db
}

func TestACIDOrderBOMDeductionAndJSONBModifiers(t *testing.T) {
	db := setupInMemoryTenantDB(t)

	// 1. Seed Warehouse, Ingredient, Category, Product, and Recipe
	wh := models.Warehouse{Name: "Ana Depo", Code: "MAIN", IsMain: true}
	db.Create(&wh)

	ingMeat := models.Ingredient{
		Name:          "Dana Burger Köftesi",
		Unit:          "kg",
		CurrentStock:  10.0, // 10 kg initial stock
		MinStockAlert: 2.0,
		CostPerUnit:   450.0,
		WarehouseID:   wh.ID,
	}
	ingBun := models.Ingredient{
		Name:          "Brioche Burger Ekmeği",
		Unit:          "adet",
		CurrentStock:  50.0,
		MinStockAlert: 10.0,
		CostPerUnit:   15.0,
		WarehouseID:   wh.ID,
	}
	db.Create(&ingMeat)
	db.Create(&ingBun)

	cat := models.Category{Name: "Burgerler", Icon: "Beef", Color: "#ef4444", TargetStation: "kitchen", ShowInPos: true}
	db.Create(&cat)

	prod := models.Product{
		CategoryID:  cat.ID,
		Name:        "BonCore Truffle Smash",
		BasePrice:   380.0,
		VatRate:     10.0,
		Station:     "kitchen",
		Allergens:   models.StringSlice{"gluten", "sut", "yumurta"},
		IsAvailable: true,
		ShowInPos:   true,
	}
	db.Create(&prod)

	// 0.180 kg meat + 1 bun per burger
	db.Create(&models.Recipe{ProductID: prod.ID, IngredientID: ingMeat.ID, Amount: 0.18})
	db.Create(&models.Recipe{ProductID: prod.ID, IngredientID: ingBun.ID, Amount: 1.0})

	var recipes []models.Recipe
	db.Preload("Ingredient").Where("product_id = ?", prod.ID).Find(&recipes)

	// 2. Verify BOM calculation before order
	calcStock, recipeItems, _ := service.CalculateBOMStock(prod.Name, recipes)
	if len(recipeItems) != 2 {
		t.Fatalf("expected 2 BOM recipe items, got %d", len(recipeItems))
	}
	// 10.0 / 0.18 = 55.55 -> min(55, 50) = 50 producible burgers
	if calcStock != 50 {
		t.Fatalf("expected calcStock=50, got %v", calcStock)
	}

	// 3. Execute ACID Order Creation + Row-Level Locking + JSONB Modifiers + Stock Deduction
	err := db.Transaction(func(tx *gorm.DB) error {
		checkItems := []models.OrderItemInput{
			{ProductID: prod.ID, Quantity: 2},
		}
		if err := service.ValidateBOMStockForItems(tx, checkItems); err != nil {
			return err
		}

		order := models.Order{
			OrderNo:        "ADS-20261103-0001",
			OrderType:      "dine_in",
			Status:         "open",
			WaiterName:     "Ahmet Garson",
			Subtotal:       820.0,
			GrandTotal:     820.0,
			RemainingTotal: 820.0,
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}

		item := models.OrderItem{
			OrderID:     order.ID,
			ProductID:   prod.ID,
			ProductName: prod.Name,
			Quantity:    2,
			UnitPrice:   410.0,
			TotalPrice:  820.0,
			SelectedModifiers: models.ModifierSlice{
				{Group: "Pişme Derecesi", Name: "Orta (Medium)", Price: 0.0},
				{Group: "Ekstra Seçimler", Name: "Ekstra Trüf Sos", Price: 30.0},
			},
			NegativeModifiers: models.StringSlice{"Soğansız", "Turşusuz"},
			Status:            "preparing",
			Station:           "kitchen",
			AddedBy:           "Ahmet Garson",
		}
		if err := tx.Create(&item).Error; err != nil {
			return err
		}

		return service.DeductOrderIngredients(tx, prod.ID, 2, order.OrderNo, wh.ID)
	})
	if err != nil {
		t.Fatalf("Order ACID transaction failed: %v", err)
	}

	// 4. Verify Ingredient Stock Deduction & Row-Level Lock
	var updatedMeat, updatedBun models.Ingredient
	repository.WithRowLock(db).First(&updatedMeat, ingMeat.ID)
	repository.WithRowLock(db).First(&updatedBun, ingBun.ID)

	// 10.0 - (2 * 0.18) = 9.64 kg
	if updatedMeat.CurrentStock != 9.64 {
		t.Fatalf("expected meat stock 9.64, got %v", updatedMeat.CurrentStock)
	}
	// 50 - 2 = 48 adet
	if updatedBun.CurrentStock != 48.0 {
		t.Fatalf("expected bun stock 48.0, got %v", updatedBun.CurrentStock)
	}

	// 5. Verify JSONB Modifiers Round-Trip Deserialization
	var savedItem models.OrderItem
	if err := db.First(&savedItem).Error; err != nil {
		t.Fatalf("failed to load OrderItem: %v", err)
	}
	if len(savedItem.SelectedModifiers) != 2 {
		t.Fatalf("expected 2 selected_modifiers, got %d", len(savedItem.SelectedModifiers))
	}
	if savedItem.SelectedModifiers[1].Name != "Ekstra Trüf Sos" {
		t.Fatalf("expected modifier name 'Ekstra Trüf Sos', got %v", savedItem.SelectedModifiers[1].Name)
	}
	if len(savedItem.NegativeModifiers) != 2 || savedItem.NegativeModifiers[0] != "Soğansız" {
		t.Fatalf("unexpected negative_modifiers: %+v", savedItem.NegativeModifiers)
	}
}
