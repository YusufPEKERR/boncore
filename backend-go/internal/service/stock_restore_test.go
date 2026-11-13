package service

import (
	"math"
	"testing"

	"github.com/boncore/pos-backend/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect database: %v", err)
	}

	err = db.AutoMigrate(
		&models.Product{},
		&models.Ingredient{},
		&models.Recipe{},
		&models.StockMovement{},
		&models.Warehouse{},
	)
	if err != nil {
		t.Fatalf("failed to migrate tables: %v", err)
	}
	return db
}

func TestDeductAndRestoreStockDirect(t *testing.T) {
	db := setupTestDB(t)

	// Direct ingredient (e.g., KASAP KÖFTE, 5.0 Kg)
	ing := models.Ingredient{
		Name:         "KASAP KÖFTE",
		Unit:         "Kg",
		CurrentStock: 5.0,
		WarehouseID:  2,
	}
	db.Create(&ing)

	prod := models.Product{
		Name:          "KASAP KÖFTE",
		BasePrice:     250,
		AllowNegStock: true,
	}
	db.Create(&prod)

	// Deduct 0.750 Kg
	err := DeductOrderIngredients(db, prod.ID, 0.75, "TEST-ORD-01", 2)
	if err != nil {
		t.Fatalf("DeductOrderIngredients failed: %v", err)
	}

	var afterDeduct models.Ingredient
	db.First(&afterDeduct, ing.ID)
	if math.Abs(afterDeduct.CurrentStock-4.25) > 0.001 {
		t.Fatalf("Expected stock 4.25, got %v", afterDeduct.CurrentStock)
	}

	// Restore 0.750 Kg
	err = RestoreOrderIngredients(db, prod.ID, 0.75, "TEST-ORD-01", 2)
	if err != nil {
		t.Fatalf("RestoreOrderIngredients failed: %v", err)
	}

	var afterRestore models.Ingredient
	db.First(&afterRestore, ing.ID)
	if math.Abs(afterRestore.CurrentStock-5.0) > 0.001 {
		t.Fatalf("Expected restored stock 5.0, got %v", afterRestore.CurrentStock)
	}

	// Verify StockMovements
	var movements []models.StockMovement
	db.Where("ingredient_id = ?", ing.ID).Find(&movements)
	if len(movements) != 2 {
		t.Fatalf("Expected 2 movements (deduction + restoration), got %d", len(movements))
	}
	if movements[0].MovementType != "sale_deduction" || movements[1].MovementType != "order_cancel_restoration" {
		t.Fatalf("Unexpected movement types: %v, %v", movements[0].MovementType, movements[1].MovementType)
	}
}

func TestDeductAndRestoreStockNegative(t *testing.T) {
	db := setupTestDB(t)

	ing := models.Ingredient{
		Name:         "DANA KIYMA",
		Unit:         "Kg",
		CurrentStock: 0.200,
		WarehouseID:  2,
	}
	db.Create(&ing)

	prod := models.Product{
		Name:          "DANA KIYMA",
		BasePrice:     300,
		AllowNegStock: true,
	}
	db.Create(&prod)

	// Deduct 0.800 Kg -> stock goes negative (-0.600 Kg)
	err := DeductOrderIngredients(db, prod.ID, 0.80, "TEST-ORD-02", 2)
	if err != nil {
		t.Fatalf("DeductOrderIngredients failed: %v", err)
	}

	var afterDeduct models.Ingredient
	db.First(&afterDeduct, ing.ID)
	if math.Abs(afterDeduct.CurrentStock-(-0.60)) > 0.001 {
		t.Fatalf("Expected negative stock -0.60, got %v", afterDeduct.CurrentStock)
	}

	// Cancel/Restore order -> stock goes back to +0.200 Kg
	err = RestoreOrderIngredients(db, prod.ID, 0.80, "TEST-ORD-02", 2)
	if err != nil {
		t.Fatalf("RestoreOrderIngredients failed: %v", err)
	}

	var afterRestore models.Ingredient
	db.First(&afterRestore, ing.ID)
	if math.Abs(afterRestore.CurrentStock-0.20) > 0.001 {
		t.Fatalf("Expected restored stock 0.20, got %v", afterRestore.CurrentStock)
	}
}

func TestDeductAndRestoreStockRecipeBOM(t *testing.T) {
	db := setupTestDB(t)

	bread := models.Ingredient{
		Name:         "Hamburger Ekmeği",
		Unit:         "Adet",
		CurrentStock: 10,
		WarehouseID:  2,
	}
	db.Create(&bread)

	patty := models.Ingredient{
		Name:         "Köfte",
		Unit:         "Adet",
		CurrentStock: 20,
		WarehouseID:  2,
	}
	db.Create(&patty)

	prod := models.Product{
		Name:      "Klasik Burger",
		BasePrice: 120,
	}
	db.Create(&prod)

	db.Create(&models.Recipe{
		ProductID:    prod.ID,
		IngredientID: bread.ID,
		Amount:       1,
	})
	db.Create(&models.Recipe{
		ProductID:    prod.ID,
		IngredientID: patty.ID,
		Amount:       1,
	})

	// Deduct 3 burgers
	err := DeductOrderIngredients(db, prod.ID, 3, "TEST-ORD-03", 2)
	if err != nil {
		t.Fatalf("Deduct failed: %v", err)
	}

	var b1, p1 models.Ingredient
	db.First(&b1, bread.ID)
	db.First(&p1, patty.ID)
	if b1.CurrentStock != 7 || p1.CurrentStock != 17 {
		t.Fatalf("Expected stock 7 and 17, got %v and %v", b1.CurrentStock, p1.CurrentStock)
	}

	// Restore 3 burgers
	err = RestoreOrderIngredients(db, prod.ID, 3, "TEST-ORD-03", 2)
	if err != nil {
		t.Fatalf("Restore failed: %v", err)
	}

	var b2, p2 models.Ingredient
	db.First(&b2, bread.ID)
	db.First(&p2, patty.ID)
	if b2.CurrentStock != 10 || p2.CurrentStock != 20 {
		t.Fatalf("Expected stock restored to 10 and 20, got %v and %v", b2.CurrentStock, p2.CurrentStock)
	}
}
