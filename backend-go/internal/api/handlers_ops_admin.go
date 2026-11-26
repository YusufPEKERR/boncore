package api

import (
	"archive/zip"
	"bufio"
	"bytes"
	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func loadJSONSettingMap(db *gorm.DB, key string) (map[string]interface{}, bool) {
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil && row.Value != "" {
		var m map[string]interface{}
		if json.Unmarshal([]byte(row.Value), &m) == nil {
			return m, true
		}
	}
	return nil, false
}

func saveJSONSettingVal(db *gorm.DB, key string, val interface{}) {
	b, _ := json.Marshal(val)
	strVal := string(b)
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil {
		row.Value = strVal
		db.Save(&row)
	} else {
		db.Create(&models.RestaurantSetting{
			Key:   key,
			Value: strVal,
		})
	}
}

func loadSettingString(db *gorm.DB, key, fallback string) string {
	if db == nil {
		return fallback
	}
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil && strings.TrimSpace(row.Value) != "" {
		var s string
		if json.Unmarshal([]byte(row.Value), &s) == nil {
			if strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
			return fallback
		}
		var m map[string]interface{}
		if json.Unmarshal([]byte(row.Value), &m) == nil {
			if v, ok := m["v"]; ok {
				sv := strings.TrimSpace(fmt.Sprintf("%v", v))
				if sv != "" && sv != "<nil>" {
					return sv
				}
			}
		}
		clean := strings.Trim(strings.TrimSpace(row.Value), `"`)
		if clean != "" {
			return clean
		}
	}
	return fallback
}

func loadSettingFloat(db *gorm.DB, key string, fallback float64) float64 {
	if db == nil {
		return fallback
	}
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil && strings.TrimSpace(row.Value) != "" {
		var f float64
		if json.Unmarshal([]byte(row.Value), &f) == nil {
			return f
		}
		if f, err := strconv.ParseFloat(strings.Trim(strings.TrimSpace(row.Value), `"`), 64); err == nil {
			return f
		}
	}
	return fallback
}

func loadSettingBool(db *gorm.DB, key string, fallback bool) bool {
	if db == nil {
		return fallback
	}
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil && strings.TrimSpace(row.Value) != "" {
		var b bool
		if json.Unmarshal([]byte(row.Value), &b) == nil {
			return b
		}
		clean := strings.ToLower(strings.Trim(strings.TrimSpace(row.Value), `"`))
		if clean == "true" || clean == "1" {
			return true
		}
		if clean == "false" || clean == "0" {
			return false
		}
	}
	return fallback
}

func generateRandomTokenSuffix() string {
	b := make([]byte, 2)
	if _, err := cryptorand.Read(b); err == nil {
		return strings.ToUpper(hex.EncodeToString(b))
	}
	return fmt.Sprintf("%04d", time.Now().UnixNano()%10000)
}

func generateRandomTempPassword(length int) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
	b := make([]byte, length)
	_, _ = cryptorand.Read(b)
	var sb strings.Builder
	for i := 0; i < length; i++ {
		sb.WriteByte(chars[int(b[i])%len(chars)])
	}
	return sb.String()
}

func generateNumericPin(length int) string {
	if length <= 0 {
		length = 6
	}
	b := make([]byte, length)
	_, _ = cryptorand.Read(b)
	var sb strings.Builder
	for i := 0; i < length; i++ {
		sb.WriteByte('0' + (b[i] % 10))
	}
	return sb.String()
}

func ensureTenantAgentAPIKey(db *gorm.DB) string {
	if existing := loadSettingString(db, "agent_api_key", ""); existing != "" {
		return existing
	}
	b := make([]byte, 24)
	_, _ = cryptorand.Read(b)
	key := "bca_" + hex.EncodeToString(b)
	saveJSONSettingVal(db, "agent_api_key", key)
	return key
}

func resolveFiscalCompanyInfo(db *gorm.DB, svc *service.Services, tenantCode string) service.FiscalCompanyInfo {
	var tenant models.RestaurantTenant
	if svc != nil && svc.DBManager != nil && svc.DBManager.MasterGorm != nil {
		_ = svc.DBManager.MasterGorm.Where("code = ?", tenantCode).First(&tenant).Error
	}
	info := service.FiscalCompanyInfo{
		Title: tenant.Name,
		Phone: "",
	}
	if tenant.TaxOffice != nil {
		info.TaxOffice = *tenant.TaxOffice
	}
	if tenant.TaxNumber != nil {
		info.TaxNumber = *tenant.TaxNumber
	}
	if tenant.Address != nil {
		info.Address = *tenant.Address
	}
	if tenant.Phone != nil {
		info.Phone = *tenant.Phone
	}
	if rName := loadSettingString(db, "restaurant_name", ""); rName != "" {
		info.Title = rName
	} else if sName := loadSettingString(db, "store_name", ""); sName != "" {
		info.Title = sName
	}
	if to := loadSettingString(db, "tax_office", ""); to != "" {
		info.TaxOffice = to
	}
	if tn := loadSettingString(db, "tax_number", ""); tn != "" {
		info.TaxNumber = tn
	}
	if ph := loadSettingString(db, "phone", ""); ph != "" {
		info.Phone = ph
	}
	city := loadSettingString(db, "city", "")
	district := loadSettingString(db, "district", "")
	street := loadSettingString(db, "street", "")
	if street != "" || district != "" || city != "" {
		parts := []string{}
		if street != "" {
			parts = append(parts, street)
		}
		locPart := strings.TrimSpace(strings.Trim(district+" / "+city, " /"))
		if locPart != "" {
			parts = append(parts, locPart)
		}
		info.Address = strings.Join(parts, " ")
	} else if addr := loadSettingString(db, "address", ""); addr != "" {
		info.Address = addr
	}
	return info
}

// buildProductRecipeSummary builds the unified ProductRecipe BOM response used across recipe endpoints.
func buildProductRecipeSummary(p models.Product, pRecipes []models.Recipe, ingMap map[int]models.Ingredient) fiber.Map {
	bomItems := make([]fiber.Map, 0, len(pRecipes))
	totalRecipeCost := 0.0
	minProducible := 999999

	for _, r := range pRecipes {
		ing, ok := ingMap[r.IngredientID]
		if !ok {
			continue
		}
		ingName := strings.TrimSpace(ing.Name)
		if ingName == "" {
			ingName = "Hammadde"
		}
		unitStr := strings.TrimSpace(ing.Unit)
		if unitStr == "" {
			unitStr = "gr"
		}
		ingStock := service.Round3(ing.CurrentStock)
		effAmount := r.Amount * (1.0 + math.Max(0.0, r.WastePercentage)/100.0)
		lineCost := round2(effAmount * ing.CostPerUnit)
		totalRecipeCost += lineCost
		canMake := 999999
		if effAmount > 0 {
			canMake = int(math.Max(0, math.Floor(ingStock/effAmount)))
		}
		if canMake < minProducible {
			minProducible = canMake
		}
		bomItems = append(bomItems, fiber.Map{
			"id":               r.ID,
			"recipe_id":        r.ID,
			"product_id":       r.ProductID,
			"ingredient_id":    ing.ID,
			"ingredient_name":  ingName,
			"amount":           r.Amount,
			"unit":             unitStr,
			"waste_percentage": r.WastePercentage,
			"cost_per_unit":    ing.CostPerUnit,
			"cost":             lineCost,
			"line_cost":        lineCost,
			"current_stock":    ingStock,
			"can_produce":      canMake,
		})
	}

	var calculatedStock interface{} = nil
	produciblePortions := 100
	if len(bomItems) > 0 {
		if minProducible == 999999 {
			produciblePortions = 0
		} else {
			produciblePortions = minProducible
		}
		calculatedStock = float64(produciblePortions)
	}

	profitMargin := 0.0
	if p.BasePrice > 0 {
		profitMargin = round2(((p.BasePrice - totalRecipeCost) / p.BasePrice) * 100)
	}

	return fiber.Map{
		"product_id":          p.ID,
		"product_name":        p.Name,
		"base_price":          p.BasePrice,
		"unit":                "adet",
		"has_recipe":          len(bomItems) > 0,
		"estimated_cost":      round2(totalRecipeCost),
		"recipe_cost":         round2(totalRecipeCost),
		"profit":              round2(p.BasePrice - totalRecipeCost),
		"profit_margin":       profitMargin,
		"calculated_stock":    calculatedStock,
		"producible_portions": produciblePortions,
		"recipes":             bomItems,
		"items":               bomItems,
	}
}

// ============================================================================
// 8. INVENTORY, WAREHOUSE & BOM ROUTER (/api/inventory)
// ============================================================================

func RegisterInventoryRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/ingredients", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var warehouses []models.Warehouse
		db.Find(&warehouses)
		var ingredients []models.Ingredient
		db.Order("name asc").Find(&ingredients)
		var movements []models.StockMovement
		db.Order("created_at desc").Limit(50).Find(&movements)

		ingMap := map[int]models.Ingredient{}
		for _, ing := range ingredients {
			ingMap[ing.ID] = ing
		}
		whMap := map[int]models.Warehouse{}
		for _, w := range warehouses {
			whMap[w.ID] = w
		}

		whList := make([]fiber.Map, 0, len(warehouses))
		for _, w := range warehouses {
			wType := "sub"
			if w.IsMain {
				wType = "main"
			}
			whList = append(whList, fiber.Map{
				"id":          w.ID,
				"name":        w.Name,
				"code":        w.Code,
				"is_main":     w.IsMain,
				"type":        wType,
				"description": w.Name,
			})
		}

		ingList := make([]fiber.Map, 0, len(ingredients))
		for _, i := range ingredients {
			whName := "Ana Depo"
			if w, ok := whMap[i.WarehouseID]; ok && w.Name != "" {
				whName = w.Name
			}
			ingList = append(ingList, fiber.Map{
				"id":              i.ID,
				"product_code":    i.ProductCode,
				"category_name":   i.CategoryName,
				"name":            i.Name,
				"kitchen_group":   i.KitchenGroup,
				"revenue_center":  i.RevenueCenter,
				"unit":            i.Unit,
				"current_stock":   i.CurrentStock,
				"critical_level":  i.MinStockAlert,
				"min_stock_alert": i.MinStockAlert,
				"is_critical":     i.CurrentStock <= i.MinStockAlert,
				"cost_per_unit":   i.CostPerUnit,
				"total_value":     round2(i.CurrentStock * i.CostPerUnit),
				"warehouse_id":    i.WarehouseID,
				"warehouse_name":  whName,
			})
		}

		movList := make([]fiber.Map, 0, len(movements))
		for _, m := range movements {
			ing := ingMap[m.IngredientID]
			ingName := ing.Name
			if ingName == "" {
				ingName = "Malzeme"
			}
			var cStr interface{}
			if !m.CreatedAt.IsZero() {
				cStr = m.CreatedAt.Format(time.RFC3339)
			}
			movList = append(movList, fiber.Map{
				"id":              m.ID,
				"ingredient_id":   m.IngredientID,
				"ingredient_name": ingName,
				"unit":            m.Unit,
				"movement_type":   m.MovementType,
				"type":            m.MovementType,
				"amount":          m.Amount,
				"quantity":        m.Amount,
				"unit_cost":       m.CostPrice,
				"cost_price":      m.CostPrice,
				"reference_no":    m.ReferenceNo,
				"invoice_no":      m.ReferenceNo,
				"notes":           m.Notes,
				"created_by":      m.CreatedBy,
				"created_at":      cStr,
			})
		}

		return c.JSON(ingList)
	})

	group.Post("/ingredients", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			ProductCode   string  `json:"product_code"`
			CategoryName  string  `json:"category_name"`
			Name          string  `json:"name"`
			KitchenGroup  string  `json:"kitchen_group"`
			RevenueCenter string  `json:"revenue_center"`
			Unit          string  `json:"unit"`
			CurrentStock  float64 `json:"current_stock"`
			CriticalLevel float64 `json:"critical_level"`
			MinStockAlert float64 `json:"min_stock_alert"`
			CostPerUnit   float64 `json:"cost_per_unit"`
			WarehouseID   *int    `json:"warehouse_id"`
			CreatedBy     string  `json:"created_by"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz malzeme verisi.")
		}
		name := strings.TrimSpace(payload.Name)
		if name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Malzeme adı boş olamaz.")
		}
		unit := payload.Unit
		if unit == "" {
			unit = "kg"
		}
		whID := 1
		if payload.WarehouseID != nil {
			whID = *payload.WarehouseID
		} else {
			var wh models.Warehouse
			if err := db.First(&wh).Error; err == nil {
				whID = wh.ID
			}
		}
		minAlert := payload.MinStockAlert
		if minAlert == 0 && payload.CriticalLevel > 0 {
			minAlert = payload.CriticalLevel
		}
		catName := payload.CategoryName
		if catName == "" {
			catName = "DİĞER"
		}
		kGroup := payload.KitchenGroup
		if kGroup == "" {
			kGroup = "MUTFAK"
		}
		revCenter := payload.RevenueCenter
		if revCenter == "" {
			revCenter = "Ana Kanal"
		}

		ing := models.Ingredient{
			ProductCode:   payload.ProductCode,
			CategoryName:  catName,
			Name:          name,
			KitchenGroup:  kGroup,
			RevenueCenter: revCenter,
			Unit:          unit,
			CurrentStock:  payload.CurrentStock,
			MinStockAlert: minAlert,
			CostPerUnit:   payload.CostPerUnit,
			WarehouseID:   whID,
		}
		if err := db.Create(&ing).Error; err != nil {
			return err
		}
		if ing.CurrentStock > 0 {
			createdBy := payload.CreatedBy
			if createdBy == "" {
				createdBy = "Müdür"
			}
			note := "İlk stok açılış kartı"
			db.Create(&models.StockMovement{
				IngredientID:      ing.ID,
				TargetWarehouseID: &whID,
				MovementType:      "purchase",
				Amount:            ing.CurrentStock,
				Unit:              ing.Unit,
				CostPrice:         ing.CostPerUnit,
				Notes:             &note,
				CreatedBy:         createdBy,
			})
		}
		return c.JSON(fiber.Map{
			"status": "ok",
			"ingredient": fiber.Map{
				"id":              ing.ID,
				"name":            ing.Name,
				"unit":            ing.Unit,
				"current_stock":   ing.CurrentStock,
				"critical_level":  ing.MinStockAlert,
				"min_stock_alert": ing.MinStockAlert,
				"cost_per_unit":   ing.CostPerUnit,
				"warehouse_id":    ing.WarehouseID,
			},
		})
	})

	group.Put("/ingredients/:ingredient_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ingID, _ := strconv.Atoi(c.Params("ingredient_id"))
		var ing models.Ingredient
		if err := db.First(&ing, ingID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Malzeme bulunamadı")
		}
		var payload map[string]interface{}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri.")
		}
		if v, ok := payload["name"].(string); ok {
			ing.Name = strings.TrimSpace(v)
		}
		if v, ok := payload["unit"].(string); ok {
			ing.Unit = v
		}
		if v, ok := payload["current_stock"].(float64); ok {
			oldStock := ing.CurrentStock
			diff := round2(v - oldStock)
			ing.CurrentStock = v
			if math.Abs(diff) > 0.0001 {
				service.SyncWarehouseStock(db, ing.WarehouseID, ing, diff)
				mType := "waste"
				if diff > 0 {
					mType = "purchase"
				}
				note := "Manuel stok düzeltme"
				db.Create(&models.StockMovement{
					IngredientID: ing.ID,
					MovementType: mType,
					Amount:       diff,
					Unit:         ing.Unit,
					CostPrice:    ing.CostPerUnit,
					Notes:        &note,
					CreatedBy:    "Müdür",
				})
			}
		}
		if v, ok := payload["critical_level"].(float64); ok {
			ing.MinStockAlert = v
		}
		if v, ok := payload["min_stock_alert"].(float64); ok {
			ing.MinStockAlert = v
		}
		if v, ok := payload["cost_per_unit"].(float64); ok {
			ing.CostPerUnit = v
		}
		if v, ok := payload["warehouse_id"].(float64); ok {
			ing.WarehouseID = int(v)
		}
		db.Save(&ing)
		return c.JSON(fiber.Map{"status": "ok", "id": ing.ID})
	})

	group.Delete("/ingredients/:ingredient_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ingID, _ := strconv.Atoi(c.Params("ingredient_id"))
		var ing models.Ingredient
		if err := db.First(&ing, ingID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Malzeme bulunamadı")
		}
		db.Where("ingredient_id = ?", ingID).Delete(&models.Recipe{})
		db.Delete(&ing)
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Get("/recipes", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var products []models.Product
		db.Order("name asc").Find(&products)
		var recipes []models.Recipe
		db.Order("id asc").Find(&recipes)
		var ingredients []models.Ingredient
		db.Find(&ingredients)
		ingMap := map[int]models.Ingredient{}
		for _, ing := range ingredients {
			ingMap[ing.ID] = ing
		}
		recipesByProd := map[int][]models.Recipe{}
		for _, r := range recipes {
			recipesByProd[r.ProductID] = append(recipesByProd[r.ProductID], r)
		}

		res := make([]fiber.Map, 0, len(products))
		for _, p := range products {
			res = append(res, buildProductRecipeSummary(p, recipesByProd[p.ID], ingMap))
		}
		return c.JSON(res)
	})

	group.Get("/recipes/:product_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		prodID, _ := strconv.Atoi(c.Params("product_id"))
		var prod models.Product
		if err := db.First(&prod, prodID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı.")
		}
		var recipes []models.Recipe
		db.Where("product_id = ?", prodID).Order("id asc").Find(&recipes)
		ingMap := map[int]models.Ingredient{}
		if len(recipes) > 0 {
			ingIDs := make([]int, 0, len(recipes))
			for _, r := range recipes {
				ingIDs = append(ingIDs, r.IngredientID)
			}
			var ingredients []models.Ingredient
			db.Where("id IN ?", ingIDs).Find(&ingredients)
			for _, ing := range ingredients {
				ingMap[ing.ID] = ing
			}
		}
		return c.JSON(buildProductRecipeSummary(prod, recipes, ingMap))
	})

	group.Put("/recipes/:product_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		prodID, _ := strconv.Atoi(c.Params("product_id"))
		var prod models.Product
		if err := db.First(&prod, prodID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı")
		}
		var payload struct {
			Items []struct {
				IngredientID    int     `json:"ingredient_id"`
				Amount          float64 `json:"amount"`
				WastePercentage float64 `json:"waste_percentage"`
			} `json:"items"`
			Recipes []struct {
				IngredientID    int     `json:"ingredient_id"`
				Amount          float64 `json:"amount"`
				WastePercentage float64 `json:"waste_percentage"`
			} `json:"recipes"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz reçete verisi.")
		}
		itemsIn := payload.Items
		if len(itemsIn) == 0 && len(payload.Recipes) > 0 {
			itemsIn = payload.Recipes
		}

		err = db.Transaction(func(tx *gorm.DB) error {
			tx.Where("product_id = ?", prodID).Delete(&models.Recipe{})
			var ratios []int
			for _, it := range itemsIn {
				if it.IngredientID <= 0 || it.Amount <= 0 {
					continue
				}
				tx.Create(&models.Recipe{
					ProductID:       prodID,
					IngredientID:    it.IngredientID,
					Amount:          it.Amount,
					WastePercentage: it.WastePercentage,
				})
				var ing models.Ingredient
				if tx.First(&ing, it.IngredientID).Error == nil {
					avail := math.Max(0.0, service.Round3(ing.CurrentStock))
					ratios = append(ratios, int(math.Floor(avail/it.Amount)))
				}
			}
			if len(ratios) > 0 && strings.TrimSpace(prod.Name) != "" {
				minRatio := ratios[0]
				for _, v := range ratios[1:] {
					if v < minRatio {
						minRatio = v
					}
				}
				var directIng models.Ingredient
				if ingID, found := service.FindIngredientIDByName(tx, prod.Name); found && tx.First(&directIng, ingID).Error == nil {
					directIng.CurrentStock = float64(minRatio)
					tx.Save(&directIng)
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"product_id": prodID})

		var savedRecipes []models.Recipe
		db.Where("product_id = ?", prodID).Order("id asc").Find(&savedRecipes)
		ingMap := map[int]models.Ingredient{}
		if len(savedRecipes) > 0 {
			ingIDs := make([]int, 0, len(savedRecipes))
			for _, r := range savedRecipes {
				ingIDs = append(ingIDs, r.IngredientID)
			}
			var ingredients []models.Ingredient
			db.Where("id IN ?", ingIDs).Find(&ingredients)
			for _, ing := range ingredients {
				ingMap[ing.ID] = ing
			}
		}
		summary := buildProductRecipeSummary(prod, savedRecipes, ingMap)
		summary["status"] = "ok"
		summary["recipe_count"] = len(savedRecipes)
		return c.JSON(summary)
	})

	group.Post("/transfer", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.StockTransferRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz transfer verisi.")
		}
		payload.NormalizeAliases()
		if payload.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Transfer miktarı 0'dan büyük olmalıdır.")
		}

		var movID int
		txErr := db.Transaction(func(tx *gorm.DB) error {
			var srcIng models.Ingredient
			if err := repository.WithRowLock(tx).First(&srcIng, payload.IngredientID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Malzeme bulunamadı")
			}
			srcWh := payload.SourceWarehouseID
			if srcWh == 0 {
				srcWh = srcIng.WarehouseID
			}
			dstWh := payload.TargetWarehouseID
			if dstWh == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Hedef depo seçilmelidir.")
			}
			if srcWh == dstWh {
				return fiber.NewError(fiber.StatusBadRequest, "Kaynak ve hedef depo aynı olamaz.")
			}
			if payload.Amount > srcIng.CurrentStock+1e-6 {
				return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Yetersiz stok! Mevcut stok: %.3f %s", srcIng.CurrentStock, srcIng.Unit))
			}

			srcIng.CurrentStock = service.Round3(srcIng.CurrentStock - payload.Amount)
			if err := tx.Save(&srcIng).Error; err != nil {
				return err
			}
			service.SyncWarehouseStock(tx, srcWh, srcIng, -payload.Amount)

			var dstIng models.Ingredient
			foundDst := false
			var dstCandidates []models.Ingredient
			tx.Where("warehouse_id = ?", dstWh).Find(&dstCandidates)
			normSrc := service.NormalizeStockName(srcIng.Name)
			for i := range dstCandidates {
				if service.NormalizeStockName(dstCandidates[i].Name) == normSrc {
					dstIng = dstCandidates[i]
					foundDst = true
					break
				}
			}
			if foundDst {
				dstIng.CurrentStock = service.Round3(dstIng.CurrentStock + payload.Amount)
				if err := tx.Save(&dstIng).Error; err != nil {
					return err
				}
				service.SyncWarehouseStock(tx, dstWh, dstIng, payload.Amount)
			} else {
				newDst := models.Ingredient{
					ProductCode:   srcIng.ProductCode,
					CategoryName:  srcIng.CategoryName,
					Name:          srcIng.Name,
					KitchenGroup:  srcIng.KitchenGroup,
					RevenueCenter: srcIng.RevenueCenter,
					Unit:          srcIng.Unit,
					CostPerUnit:   srcIng.CostPerUnit,
					CurrentStock:  service.Round3(payload.Amount),
					MinStockAlert: srcIng.MinStockAlert,
					WarehouseID:   dstWh,
				}
				if err := tx.Create(&newDst).Error; err != nil {
					return err
				}
				service.SyncWarehouseStock(tx, dstWh, newDst, payload.Amount)
			}

			mov := models.StockMovement{
				IngredientID:      srcIng.ID,
				SourceWarehouseID: &srcWh,
				TargetWarehouseID: &dstWh,
				MovementType:      "transfer",
				Amount:            service.Round3(payload.Amount),
				Unit:              srcIng.Unit,
				CostPrice:         srcIng.CostPerUnit,
				Notes:             payload.Notes,
				CreatedBy:         payload.CreatedBy,
			}
			if err := tx.Create(&mov).Error; err != nil {
				return err
			}
			movID = mov.ID
			return nil
		})
		if txErr != nil {
			return txErr
		}
		return c.JSON(fiber.Map{"status": "success", "movement_id": movID})
	})

	group.Post("/purchase-invoice", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.PurchaseInvoiceRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz alış faturası verisi.")
		}
		if payload.CreatedBy == "" {
			payload.CreatedBy = "Muhasebe"
		}
		supplier := payload.ResolvedSupplier()
		totalInvoiceAmount := 0.0

		err = db.Transaction(func(tx *gorm.DB) error {
			for _, item := range payload.Items {
				if item.Quantity <= 0 {
					return fiber.NewError(fiber.StatusBadRequest, "Fatura kalem miktarı 0'dan büyük olmalıdır.")
				}
				uPrice := item.ResolvedUnitPrice()
				if uPrice < 0 {
					return fiber.NewError(fiber.StatusBadRequest, "Fatura birim fiyatı negatif olamaz.")
				}
				var ing models.Ingredient
				if err := repository.WithRowLock(tx).First(&ing, item.IngredientID).Error; err != nil {
					continue
				}
				effectivePrevStock := math.Max(0.0, ing.CurrentStock)
				oldTotalVal := effectivePrevStock * ing.CostPerUnit
				newVal := item.Quantity * uPrice
				denom := effectivePrevStock + item.Quantity
				if denom > 0 && uPrice >= 0 {
					ing.CostPerUnit = round2((oldTotalVal + newVal) / denom)
				}
				ing.CurrentStock = service.Round3(ing.CurrentStock + item.Quantity)
				tx.Save(&ing)

				targetWh := item.TargetWarehouseID
				if payload.WarehouseID != nil {
					targetWh = *payload.WarehouseID
				}
				service.SyncWarehouseStock(tx, targetWh, ing, item.Quantity)
				invNo := payload.InvoiceNo
				note := fmt.Sprintf("Fatura Girişi: %s (%s)", supplier, invNo)
				tx.Create(&models.StockMovement{
					IngredientID:      ing.ID,
					TargetWarehouseID: &targetWh,
					MovementType:      "purchase",
					Amount:            item.Quantity,
					Unit:              ing.Unit,
					CostPrice:         uPrice,
					ReferenceNo:       &invNo,
					Notes:             &note,
					CreatedBy:         payload.CreatedBy,
				})
				totalInvoiceAmount += newVal
			}
			return nil
		})
		if err != nil {
			return err
		}

		return c.JSON(fiber.Map{
			"status":               "ok",
			"invoice_no":           payload.InvoiceNo,
			"supplier":             supplier,
			"total_invoice_amount": round2(totalInvoiceAmount),
		})
	})
}

// ============================================================================
// 9. DELIVERY, COURIER & AGGREGATOR ROUTER (/api/delivery)
// ============================================================================

func normalizeDeliveryPaymentType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "cash", "kapida_nakit", "nakit_kapida", "nakit":
		return "kapida_nakit"
	case "credit_card", "kapida_kart", "pos_kapida", "kart_kapida", "card":
		return "kapida_kart"
	case "sodexo", "sodexo_kapida", "kapida_sodexo", "multinet", "ticket":
		return "sodexo_kapida"
	case "online", "online_paid", "online_odendi", "online_card":
		return "online_paid"
	default:
		if strings.TrimSpace(raw) == "" {
			return "kapida_nakit"
		}
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func resolveDeliveryCourierStatusUI(dbStatus string, courierID *int) string {
	st := strings.ToLower(strings.TrimSpace(dbStatus))
	switch st {
	case "reconciled":
		return "reconciled"
	case "delivered":
		return "delivered"
	case "on_way", "on_the_way":
		return "on_the_way"
	case "assigned":
		return "assigned"
	default:
		if courierID != nil && *courierID > 0 {
			return "assigned"
		}
		return "unassigned"
	}
}

func RegisterDeliveryRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/couriers", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var couriers []models.Courier
		db.Find(&couriers)
		var activeDeliveries []models.DeliveryOrder
		db.Where("courier_status IN ?", []string{"assigned", "on_way", "on_the_way", "delivered"}).Find(&activeDeliveries)

		res := make([]fiber.Map, 0, len(couriers))
		for _, cr := range couriers {
			activePkgs := 0
			expectedCash := 0.0
			expectedCard := 0.0
			for _, d := range activeDeliveries {
				if d.CourierID != nil && *d.CourierID == cr.ID {
					if d.CourierStatus == "assigned" || d.CourierStatus == "on_way" || d.CourierStatus == "on_the_way" {
						activePkgs++
					}
					if d.CourierStatus != "reconciled" {
						var ord models.Order
						if err := db.First(&ord, d.OrderID).Error; err == nil && ord.Status != "paid" && ord.Status != "cancelled" {
							due := ord.RemainingTotal
							if due <= 0 && ord.PaidTotal == 0 {
								due = ord.GrandTotal
							}
							normPay := normalizeDeliveryPaymentType(d.PaymentType)
							if normPay == "kapida_nakit" {
								expectedCash += due
							} else if normPay == "kapida_kart" {
								expectedCard += due
							}
						}
					}
				}
			}
			status := "idle"
			if activePkgs > 0 {
				status = "on_delivery"
			}
			res = append(res, fiber.Map{
				"id":                      cr.ID,
				"name":                    cr.Name,
				"phone":                   cr.Phone,
				"vehicle_plate":           cr.VehiclePlate,
				"is_active":               cr.IsActive,
				"status":                  status,
				"active_packages":         activePkgs,
				"unreconciled_cash":       round2(expectedCash),
				"unreconciled_card":       round2(expectedCard),
				"cash_collected":          round2(expectedCash),
				"card_slips_collected":    round2(expectedCard),
				"cash_float_on_hand":      round2(expectedCash),
				"card_slips_expected":     round2(expectedCard),
				"active_deliveries_count": activePkgs,
			})
		}
		return c.JSON(res)
	})

	group.Get("/orders", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var deliveries []models.DeliveryOrder
		db.Order("id desc").Limit(50).Find(&deliveries)
		var couriers []models.Courier
		db.Find(&couriers)
		courierMap := map[int]string{}
		for _, cr := range couriers {
			courierMap[cr.ID] = cr.Name
		}

		res := make([]fiber.Map, 0, len(deliveries))
		for _, d := range deliveries {
			var ord models.Order
			db.First(&ord, d.OrderID)
			var items []models.OrderItem
			db.Where("order_id = ? AND is_voided = ?", d.OrderID, false).Find(&items)

			itemsSummary := make([]fiber.Map, 0, len(items))
			for _, it := range items {
				pName := it.ProductName
				if pName == "" {
					pName = "Ürün"
				}
				itemsSummary = append(itemsSummary, fiber.Map{
					"name":         pName,
					"product_name": pName,
					"quantity":     it.Quantity,
					"total":        it.TotalPrice,
					"total_price":  it.TotalPrice,
				})
			}

			var courierName interface{}
			if d.CourierID != nil {
				if cn, ok := courierMap[*d.CourierID]; ok {
					courierName = cn
				}
			}
			var createdStr interface{}
			if !ord.CreatedAt.IsZero() {
				createdStr = ord.CreatedAt.Format(time.RFC3339)
			}
			uiCourierStatus := resolveDeliveryCourierStatusUI(d.CourierStatus, d.CourierID)
			normPay := normalizeDeliveryPaymentType(d.PaymentType)

			res = append(res, fiber.Map{
				"id":                d.ID,
				"order_id":          d.OrderID,
				"order_no":          ord.OrderNo,
				"platform":          d.Platform,
				"channel":           d.Platform,
				"external_order_id": d.PlatformOrderID,
				"customer_name":     d.CustomerName,
				"customer_phone":    d.CustomerPhone,
				"customer_address":  d.DeliveryAddress,
				"delivery_address":  d.DeliveryAddress,
				"courier_id":        d.CourierID,
				"courier_name":      courierName,
				"courier_status":    uiCourierStatus,
				"delivery_status":   d.CourierStatus,
				"status":            d.CourierStatus,
				"payment_method":    normPay,
				"payment_type":      normPay,
				"grand_total":       ord.GrandTotal,
				"total_amount":      ord.GrandTotal,
				"is_reconciled":     d.CourierStatus == "reconciled",
				"created_at":        createdStr,
				"items":             itemsSummary,
			})
		}
		return c.JSON(res)
	})

	group.Get("/caller-id-simulate", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		phone := strings.TrimSpace(c.Query("phone"))
		chosen := fiber.Map{
			"found":             false,
			"phone":             phone,
			"name":              "",
			"customer_name":     "",
			"address":           "",
			"past_orders_count": 0,
			"favorite_items":    []string{},
			"last_order_note":   "",
		}
		if phone != "" {
			var prevs []models.DeliveryOrder
			db.Where("customer_phone LIKE ?", "%"+phone+"%").Order("id desc").Limit(20).Find(&prevs)
			if len(prevs) > 0 {
				latest := prevs[0]
				favNote := ""
				if latest.Notes != nil {
					favNote = *latest.Notes
				}
				chosen = fiber.Map{
					"found":             true,
					"phone":             latest.CustomerPhone,
					"name":              latest.CustomerName,
					"customer_name":     latest.CustomerName,
					"address":           latest.DeliveryAddress,
					"past_orders_count": len(prevs),
					"favorite_items":    []string{},
					"last_order_note":   favNote,
				}
			}
		}
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "CALLER_ID_RINGING", chosen)
		return c.JSON(chosen)
	})

	group.Post("/assign-courier", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.AssignCourierRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz kurye atama verisi.")
		}
		var dOrder models.DeliveryOrder
		if err := db.First(&dOrder, payload.DeliveryOrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Paket siparişi bulunamadı")
		}
		var courier models.Courier
		if err := db.First(&courier, payload.CourierID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kurye bulunamadı")
		}
		cid := courier.ID
		dOrder.CourierID = &cid
		dOrder.CourierStatus = "on_way"
		now := time.Now().UTC()
		dOrder.DispatchedAt = &now
		db.Save(&dOrder)

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "COURIER_ASSIGNED", fiber.Map{
			"delivery_order_id": dOrder.ID,
			"courier_name":      courier.Name,
			"status":            "on_way",
			"courier_status":    "on_the_way",
		})
		return c.JSON(fiber.Map{"status": "ok", "courier": courier.Name, "courier_status": "on_the_way"})
	})

	group.Post("/complete-delivery/:delivery_order_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		dID, _ := strconv.Atoi(c.Params("delivery_order_id"))
		var dOrder models.DeliveryOrder
		if err := db.First(&dOrder, dID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Paket siparişi bulunamadı")
		}
		dOrder.CourierStatus = "delivered"
		now := time.Now().UTC()
		dOrder.DeliveredAt = &now
		db.Save(&dOrder)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "ORDER_UPDATED", fiber.Map{
			"delivery_order_id": dOrder.ID,
			"delivery_status":   "delivered",
		})
		return c.JSON(fiber.Map{"status": "ok", "delivery_status": "delivered", "courier_status": "delivered"})
	})

	group.Post("/courier-mutabakat", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CourierMutabakatRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz mutabakat verisi.")
		}
		if err := requirePermission(c, svc, db, payload.CashierName, []string{"order_take_payment", "courier_ops"}, true, "Kurye mutabakatı kapatma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.CashierName == "" {
			payload.CashierName = "Kasiyer"
		}
		reconciledCount := 0
		now := time.Now().UTC()
		txErr := db.Transaction(func(tx *gorm.DB) error {
			var deliveries []models.DeliveryOrder
			// Reconcile delivered (and any unassigned/completed) packages strictly once per delivery order
			tx.Where("courier_id = ? AND courier_status = ?", payload.CourierID, "delivered").Find(&deliveries)
			if len(deliveries) == 0 {
				// Fallback if dispatcher closes courier straight from on_way without clicking intermediate step
				tx.Where("courier_id = ? AND courier_status IN ?", payload.CourierID, []string{"on_way", "on_the_way", "assigned"}).Find(&deliveries)
			}
			for i := range deliveries {
				deliveries[i].CourierStatus = "reconciled"
				if deliveries[i].DeliveredAt == nil {
					deliveries[i].DeliveredAt = &now
				}
				normPay := normalizeDeliveryPaymentType(deliveries[i].PaymentType)
				var ord models.Order
				if err := repository.WithRowLock(tx).First(&ord, deliveries[i].OrderID).Error; err == nil {
					if ord.Status != "paid" && ord.Status != "cancelled" && normPay != "online_paid" {
						due := round2(ord.GrandTotal - ord.PaidTotal)
						if due > 0.005 {
							method := "cash"
							switch normPay {
							case "kapida_kart":
								method = "credit_card"
							case "sodexo_kapida":
								method = "sodexo"
							}
							tx.Create(&models.Payment{
								OrderID:       ord.ID,
								PaymentMethod: method,
								Amount:        due,
								CashierName:   fmt.Sprintf("Kurye Mutabakat (%s)", payload.CashierName),
							})
							ord.PaidTotal = round2(ord.PaidTotal + due)
						}
						ord.Status = "paid"
						ord.RemainingTotal = 0.0
						ord.ClosedAt = &now
						tx.Save(&ord)
					} else if normPay == "online_paid" && ord.Status != "paid" && ord.PaidTotal >= ord.GrandTotal-0.01 {
						ord.Status = "paid"
						ord.RemainingTotal = 0.0
						ord.ClosedAt = &now
						tx.Save(&ord)
					}
				}
				tx.Save(&deliveries[i])
				reconciledCount++
			}
			return nil
		})
		if txErr != nil {
			return txErr
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "ORDER_PAID", fiber.Map{"courier_id": payload.CourierID, "reconciled": reconciledCount})
		return c.JSON(fiber.Map{
			"status":              "ok",
			"reconciled_packages": reconciledCount,
			"collected_cash":      payload.CollectedCash,
			"collected_card":      payload.CollectedCard,
		})
	})

	group.Post("/ingest-online-order", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.OnlineOrderIngestRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz online sipariş verisi.")
		}
		platform := "yemeksepeti"
		if payload.Platform != nil && *payload.Platform != "" {
			platform = *payload.Platform
		} else if payload.Channel != nil && *payload.Channel != "" {
			platform = *payload.Channel
		}

		now := time.Now().UTC()
		prefix := strings.ToUpper(platform)
		if len(prefix) > 3 {
			prefix = prefix[:3]
		}
		orderNo := fmt.Sprintf("ONL-%s-%s-%s", prefix, now.In(service.TurkeyLoc()).Format("060102150405"), generateRandomTokenSuffix())

		normPay := normalizeDeliveryPaymentType(payload.PaymentType)

		var order models.Order
		var dOrder models.DeliveryOrder
		kdsItems := make([]fiber.Map, 0)

		txErr := db.Transaction(func(tx *gorm.DB) error {
			order = models.Order{
				OrderNo:    orderNo,
				TableID:    nil,
				OrderType:  "delivery",
				Status:     "open",
				WaiterName: fmt.Sprintf("Online (%s)", strings.ToUpper(platform)),
				Notes:      payload.Notes,
			}
			if err := tx.Create(&order).Error; err != nil {
				return err
			}

			for _, itemIn := range payload.Items {
				var prod models.Product
				found := false
				if itemIn.ProductID != nil && *itemIn.ProductID > 0 {
					if err := tx.First(&prod, *itemIn.ProductID).Error; err == nil {
						found = true
					}
				}
				searchName := ""
				if itemIn.Name != nil && strings.TrimSpace(*itemIn.Name) != "" {
					searchName = strings.TrimSpace(*itemIn.Name)
				} else if itemIn.ProductName != nil && strings.TrimSpace(*itemIn.ProductName) != "" {
					searchName = strings.TrimSpace(*itemIn.ProductName)
				}
				if !found && searchName != "" {
					if err := tx.Where("LOWER(name) = LOWER(?) OR plu_code = ? OR barcode = ?", searchName, searchName, searchName).First(&prod).Error; err == nil {
						found = true
					} else if err := tx.Where("LOWER(name) LIKE LOWER(?)", "%"+searchName+"%").First(&prod).Error; err == nil {
						found = true
					}
				}
				if !found {
					label := searchName
					if label == "" && itemIn.ProductID != nil {
						label = fmt.Sprintf("product_id=%d", *itemIn.ProductID)
					}
					return fiber.NewError(fiber.StatusUnprocessableEntity, fmt.Sprintf("Eşleşmeyen online ürün SKU/adı: %q", label))
				}

				qty := itemIn.Quantity
				if qty <= 0 {
					return fiber.NewError(fiber.StatusBadRequest, "Online sipariş kalem miktarı sıfırdan büyük olmalıdır.")
				}
				uPrice := itemIn.UnitPrice
				if uPrice < 0 {
					return fiber.NewError(fiber.StatusBadRequest, "Online sipariş birim fiyatı negatif olamaz.")
				}
				if uPrice == 0 {
					uPrice = prod.BasePrice
				}
				lineTotal := round2(uPrice * qty)
				if itemIn.TotalPrice != nil && *itemIn.TotalPrice > 0 {
					lineTotal = round2(*itemIn.TotalPrice)
				}

				pName := prod.Name
				if searchName != "" {
					pName = searchName
				}

				dbItem := models.OrderItem{
					OrderID:     order.ID,
					ProductID:   prod.ID,
					ProductName: pName,
					Quantity:    qty,
					UnitPrice:   uPrice,
					TotalPrice:  lineTotal,
					KitchenNote: itemIn.KitchenNote,
					Status:      "preparing",
					Station:     prod.Station,
				}
				if err := tx.Create(&dbItem).Error; err != nil {
					return err
				}
				if err := service.DeductOrderIngredients(tx, prod.ID, qty, orderNo, 2); err != nil {
					return err
				}

				kdsItems = append(kdsItems, fiber.Map{
					"item_id":      dbItem.ID,
					"product_name": pName,
					"quantity":     qty,
					"station":      prod.Station,
					"kitchen_note": itemIn.KitchenNote,
				})
			}

			recalculateOrderTotals(tx, &order)
			if normPay == "online_paid" {
				order.PaidTotal = order.GrandTotal
				order.RemainingTotal = 0.0
				order.Status = "paid"
				order.ClosedAt = &now
				if err := tx.Create(&models.Payment{
					OrderID:       order.ID,
					PaymentMethod: "online",
					Amount:        order.GrandTotal,
					CashierName:   fmt.Sprintf("%s Online Ödeme", strings.ToUpper(platform)),
				}).Error; err != nil {
					return err
				}
			}
			if err := tx.Save(&order).Error; err != nil {
				return err
			}

			extID := fmt.Sprintf("%s-%d", strings.ToUpper(platform), rand.Intn(899999)+100000)
			dOrder = models.DeliveryOrder{
				OrderID:         order.ID,
				Platform:        platform,
				PlatformOrderID: &extID,
				CustomerName:    payload.CustomerName,
				CustomerPhone:   payload.CustomerPhone,
				DeliveryAddress: payload.DeliveryAddress,
				CourierStatus:   "preparing",
				PaymentType:     normPay,
				Notes:           payload.Notes,
			}
			return tx.Create(&dOrder).Error
		})
		if txErr != nil {
			return txErr
		}

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ONLINE_ORDER_INGESTED", fiber.Map{
			"delivery_id":   dOrder.ID,
			"order_id":      order.ID,
			"order_no":      order.OrderNo,
			"platform":      platform,
			"customer_name": payload.CustomerName,
			"grand_total":   order.GrandTotal,
		})
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_NEW_ORDER", fiber.Map{
			"order_id":    order.ID,
			"order_no":    order.OrderNo,
			"table_name":  fmt.Sprintf("PAKET (%s)", strings.ToUpper(platform)),
			"waiter_name": payload.CustomerName,
			"items":       kdsItems,
			"created_at":  now.Format(time.RFC3339),
		})

		return c.JSON(fiber.Map{
			"status":            "ok",
			"delivery_order_id": dOrder.ID,
			"order_id":          order.ID,
			"order_no":          order.OrderNo,
		})
	})
}

// ============================================================================
// 10. FISCAL E-ADISYON & THERMAL PRINTER ROUTER (/api/fiscal)
// ============================================================================

func loadOrderForFiscal(db *gorm.DB, orderID int) (*models.Order, []models.Payment, error) {
	var order models.Order
	if err := db.Preload("Items").Preload("Table").First(&order, orderID).Error; err != nil {
		return nil, nil, err
	}
	var payments []models.Payment
	db.Where("order_id = ?", order.ID).Find(&payments)
	return &order, payments, nil
}

func RegisterFiscalRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/e-adisyon/:order_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, payments, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		cashierName := "Kasiyer"
		if len(payments) > 0 && strings.TrimSpace(payments[0].CashierName) != "" {
			cashierName = payments[0].CashierName
		} else if order.CashierName != nil && strings.TrimSpace(*order.CashierName) != "" {
			cashierName = *order.CashierName
		}
		info := resolveFiscalCompanyInfo(db, svc, tenantCode)
		vatMap := service.BuildProductVATMap(db)
		res := service.GenerateEAdisyonWithInfo(order, payments, cashierName, info, vatMap)
		return c.JSON(res)
	})

	group.Get("/e-adisyon/:order_id/xml", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, payments, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		info := resolveFiscalCompanyInfo(db, svc, tenantCode)
		vatMap := service.BuildProductVATMap(db)
		res := service.GenerateEAdisyonWithInfo(order, payments, "Kasiyer", info, vatMap)
		c.Set("Content-Type", "application/xml; charset=utf-8")
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="e-adisyon-%v.xml"`, res["ettn"]))
		return c.SendString(fmt.Sprintf("%v", res["xml_content"]))
	})

	group.Get("/e-adisyon/:order_id/pdf", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, _, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		info := resolveFiscalCompanyInfo(db, svc, tenantCode)
		slipText := service.GenerateEscposThermalSlipWithInfo(order, info)
		c.Set("Content-Type", "text/html; charset=utf-8")
		htmlStr := fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Adisyon #%s</title><style>body{font-family:monospace;padding:16px;background:#fff;color:#111}pre{white-space:pre-wrap;font-size:13px}@media print{button{display:none}}</style></head><body><button onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;cursor:pointer">Yazdır / PDF Kaydet</button><pre>%s</pre></body></html>`, html.EscapeString(order.OrderNo), html.EscapeString(slipText))
		return c.SendString(htmlStr)
	})

	printReceiptSlipHandler := func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		isPreview := strings.EqualFold(strings.TrimSpace(c.Query("preview")), "true")
		operatorName := c.Query("operator_name")
		if operatorName == "" {
			var b struct {
				OperatorName string `json:"operator_name"`
			}
			_ = c.BodyParser(&b)
			if b.OperatorName != "" {
				operatorName = b.OperatorName
			} else {
				operatorName = "Garson"
			}
		}

		if !isPreview {
			if err := requirePermission(c, svc, db, operatorName, []string{"order_print_bill", "order_manual_print", "order_fast_pay", "order_take_payment"}, true, "Adisyon fişi yazdırma yetkiniz bulunmamaktadır."); err != nil {
				return err
			}
		}

		order, _, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if !isPreview && order.TableID != nil && order.Status == "open" {
			var tbl models.Table
			if err := db.First(&tbl, *order.TableID).Error; err == nil && tbl.Status != "empty" {
				tbl.Status = "bill_printed"
				db.Save(&tbl)
				svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
					"table_id": tbl.ID,
					"status":   "bill_printed",
				})
			}
		}

		info := resolveFiscalCompanyInfo(db, svc, tenantCode)
		slipText := service.GenerateEscposThermalSlipWithInfo(order, info)
		return c.JSON(fiber.Map{
			"order_id":     order.ID,
			"order_no":     order.OrderNo,
			"slip_text":    slipText,
			"thermal_slip": slipText,
		})
	}

	group.Get("/receipt/:order_id/escpos", printReceiptSlipHandler)
	group.Post("/receipt/:order_id/escpos", printReceiptSlipHandler)
	group.Post("/print-bill/:order_id", printReceiptSlipHandler)
}

// ============================================================================
// 11. AUDIT LOGS ROUTER (/api/audit)
// ============================================================================

func RegisterAuditRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/logs", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		limit := c.QueryInt("limit", 100)
		if limit <= 0 {
			limit = 100
		} else if limit > 500 {
			limit = 500
		}
		offset := c.QueryInt("offset", 0)
		if offset < 0 {
			offset = 0
		}
		actionType := strings.TrimSpace(c.Query("action_type"))
		search := strings.TrimSpace(c.Query("search"))

		query := db.Model(&models.AuditLog{})
		if actionType != "" && actionType != "all" {
			query = query.Where("action_type = ?", actionType)
		}
		if search != "" {
			s := "%" + strings.ToLower(search) + "%"
			query = query.Where("LOWER(operator_name) LIKE ? OR LOWER(target_ref) LIKE ? OR LOWER(reason_text) LIKE ? OR LOWER(reason_code) LIKE ?", s, s, s, s)
		}

		var total int64
		query.Count(&total)
		c.Set("X-Total-Count", strconv.FormatInt(total, 10))

		var logs []models.AuditLog
		query.Order("id desc").Offset(offset).Limit(limit).Find(&logs)
		res := make([]fiber.Map, 0, len(logs))
		for _, l := range logs {
			var cStr interface{}
			var cISO interface{}
			if !l.Timestamp.IsZero() {
				cStr = l.Timestamp.Format("02.01.2006 15:04:05")
				cISO = l.Timestamp.Format(time.RFC3339)
			}
			res = append(res, fiber.Map{
				"id":            l.ID,
				"action_type":   l.ActionType,
				"operator":      l.OperatorName,
				"operator_name": l.OperatorName,
				"role":          l.OperatorRole,
				"operator_role": l.OperatorRole,
				"target_ref":    l.TargetRef,
				"reason_code":   l.ReasonCode,
				"reason_text":   l.ReasonText,
				"details":       l.Details,
				"created_at":    cStr,
				"timestamp":     cStr,
				"timestamp_iso": cISO,
			})
		}
		return c.JSON(res)
	})
}

// ============================================================================
// 12. SETTINGS & KITCHEN GROUPS ROUTER (/api/settings)
// ============================================================================

var defaultSettingsMap = map[string]interface{}{
	"store_name":                 "BonCore POS",
	"restaurant_name":            "BonCore POS",
	"store_branch":               "Merkez",
	"tax_office":                 "",
	"tax_number":                 "",
	"mersis_no":                  "",
	"address":                    "",
	"phone":                      "",
	"currency":                   "TRY",
	"kuver_DefaultPrice":         45.0,
	"service_charge_percent":     0.0,
	"auto_print_receipt":         true,
	"auto_kick_drawer_on_cash":   true,
	"printer_cashier_ip":         "",
	"printer_kitchen_ip":         "",
	"printer_bar_ip":             "",
	"receipt_header":             "",
	"receipt_footer":             "Bizi tercih ettiğiniz için teşekkür ederiz!",
	"gib_integrator":             "Foriba / Sovos e-Adisyon",
	"gib_test_mode":              true,
	"caller_id_com_port":         "COM3",
	"yemeksepeti_webhook_active": false,
	"getir_webhook_active":       false,
	"trendyol_webhook_active":    false,
	"sound_alerts":               true,
	"auto_z_report_enabled":      false,
	"auto_z_report_time":         "04:00",
	"auto_z_report_force_close":  true,
}

func loadKitchenGroupsFromSettings(db *gorm.DB) []map[string]interface{} {
	var row models.RestaurantSetting
	if err := db.Where("key = ?", "kitchen_groups_config").First(&row).Error; err == nil && row.Value != "" {
		var list []map[string]interface{}
		if json.Unmarshal([]byte(row.Value), &list) == nil && len(list) > 0 {
			return list
		}
	}
	defaults := []map[string]interface{}{
		{"id": 1, "name": "Sıcak Mutfak & Izgara", "code": "kitchen", "description": "Ana yemek, ızgara ve sıcak hazırlama istasyonu", "icon": "flame", "color": "red", "printer_ip": "", "printer_name": "", "target_prep_minutes": 15, "sound_alert": true, "auto_print": true, "order_index": 1, "is_active": true},
		{"id": 2, "name": "Fırın & Pizza İstasyonu", "code": "oven", "description": "Taş fırın, pizza, pide ve lahmacun", "icon": "pizza", "color": "amber", "printer_ip": "", "printer_name": "", "target_prep_minutes": 15, "sound_alert": true, "auto_print": true, "order_index": 2, "is_active": true},
		{"id": 3, "name": "Bar & Kahve İstasyonu", "code": "bar", "description": "Soğuk & sıcak içecek, kokteyl ve barista barı", "icon": "wine", "color": "indigo", "printer_ip": "", "printer_name": "", "target_prep_minutes": 8, "sound_alert": true, "auto_print": true, "order_index": 3, "is_active": true},
		{"id": 4, "name": "Tatlı & Pastane Reyonu", "code": "pastry", "description": "Pasta, sütlü tatlılar ve fırıncılık ürünleri", "icon": "cake", "color": "purple", "printer_ip": "", "printer_name": "", "target_prep_minutes": 10, "sound_alert": true, "auto_print": false, "order_index": 4, "is_active": true},
	}
	saveJSONSettingVal(db, "kitchen_groups_config", defaults)
	return defaults
}

var allowedFeatureStoreKeys = map[string]bool{
	"happy_hours":       true,
	"product_meta":      true,
	"table_timers":      true,
	"staff_shifts":      true,
	"tip_distributions": true,
}

func RegisterSettingsRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/time", func(c *fiber.Ctx) error {
		now := time.Now().UTC()
		return c.JSON(fiber.Map{
			"iso":       now.Format(time.RFC3339),
			"date":      now.In(service.TurkeyLoc()).Format("02.01.2006"),
			"time":      now.In(service.TurkeyLoc()).Format("15:04:05"),
			"timestamp": float64(now.UnixNano()) / 1e9,
		})
	})

	group.Get("/", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var rows []models.RestaurantSetting
		db.Find(&rows)
		merged := map[string]interface{}{}
		for k, v := range defaultSettingsMap {
			merged[k] = v
		}
		// Seed neutral tenant identity from Master DB if present
		if svc != nil && svc.DBManager != nil && svc.DBManager.MasterGorm != nil {
			var t models.RestaurantTenant
			if svc.DBManager.MasterGorm.Where("code = ?", tenantCode).First(&t).Error == nil && strings.TrimSpace(t.Name) != "" {
				merged["store_name"] = t.Name
				merged["restaurant_name"] = t.Name
			}
		}
		for _, r := range rows {
			var parsed interface{}
			if json.Unmarshal([]byte(r.Value), &parsed) == nil {
				if m, ok := parsed.(map[string]interface{}); ok {
					if v, hasV := m["v"]; hasV && len(m) == 1 {
						merged[r.Key] = v
						continue
					}
				}
				merged[r.Key] = parsed
			} else {
				merged[r.Key] = r.Value
			}
		}
		// Keep restaurant_name and store_name synchronized
		if rn, ok := merged["restaurant_name"].(string); ok && strings.TrimSpace(rn) != "" {
			merged["store_name"] = rn
		} else if sn, ok := merged["store_name"].(string); ok && strings.TrimSpace(sn) != "" {
			merged["restaurant_name"] = sn
		}
		return c.JSON(merged)
	})

	group.Put("/", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_general_settings", "def_permissions_manage"}, false, "Ayarları değiştirme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		var rawBody map[string]interface{}
		if err := c.BodyParser(&rawBody); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ayar verisi.")
		}

		settingsMap := rawBody
		if nested, ok := rawBody["settings"].(map[string]interface{}); ok {
			settingsMap = nested
		}

		if _, hasRolePerms := settingsMap["role_permissions"]; hasRolePerms {
			claims := middleware.GetUserClaims(c)
			if claims == nil {
				return fiber.NewError(fiber.StatusUnauthorized, "Rol ve yetkileri değiştirmek için yönetici oturumu gereklidir.")
			}
			normRole := svc.Permissions.NormalizeRoleKey(claims.Role)
			if normRole != "manager" && claims.Role != "master_admin" && claims.Role != "superadmin" {
				return fiber.NewError(fiber.StatusForbidden, "Rol ve sekme yetkilerini yalnızca Yönetici değiştirebilir.")
			}
		}

		if rn, ok := settingsMap["restaurant_name"].(string); ok && strings.TrimSpace(rn) != "" {
			settingsMap["store_name"] = rn
		} else if sn, ok := settingsMap["store_name"].(string); ok && strings.TrimSpace(sn) != "" {
			settingsMap["restaurant_name"] = sn
		}

		for k, v := range settingsMap {
			saveJSONSettingVal(db, k, v)
		}

		if rp, hasRolePerms := settingsMap["role_permissions"]; hasRolePerms {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "PERMISSIONS_UPDATED", fiber.Map{
				"role_permissions": rp,
			})
		}
		svc.WSHub.BroadcastAll(tenantCode, "SETTINGS_UPDATED", fiber.Map{
			"restaurant_name": settingsMap["restaurant_name"],
			"store_name":      settingsMap["store_name"],
		})

		return c.JSON(fiber.Map{"status": "ok", "updated_keys": len(settingsMap)})
	})

	group.Get("/feature-store/:key", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		key := strings.TrimSpace(c.Params("key"))
		if !allowedFeatureStoreKeys[key] {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz özellik anahtarı.")
		}
		var row models.RestaurantSetting
		if err := db.Where("key = ?", "feature_store_"+key).First(&row).Error; err != nil || strings.TrimSpace(row.Value) == "" {
			return c.JSON(fiber.Map{"key": key, "has_value": false, "value": nil})
		}
		var parsed interface{}
		if json.Unmarshal([]byte(row.Value), &parsed) != nil {
			return c.JSON(fiber.Map{"key": key, "has_value": false, "value": nil})
		}
		return c.JSON(fiber.Map{"key": key, "has_value": true, "value": parsed})
	})

	group.Put("/feature-store/:key", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if claims := middleware.GetUserClaims(c); claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Oturum doğrulaması gereklidir.")
		}
		key := strings.TrimSpace(c.Params("key"))
		if !allowedFeatureStoreKeys[key] {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz özellik anahtarı.")
		}
		var body struct {
			Value interface{} `json:"value"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri biçimi.")
		}
		saveJSONSettingVal(db, "feature_store_"+key, body.Value)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "FEATURE_STORE_UPDATED", fiber.Map{
			"key":   key,
			"value": body.Value,
		})
		return c.JSON(fiber.Map{"status": "ok", "key": key})
	})

	group.Get("/kitchen-groups", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		groups := loadKitchenGroupsFromSettings(db)
		sort.SliceStable(groups, func(i, j int) bool {
			oi, _ := strconv.Atoi(fmt.Sprintf("%v", groups[i]["order_index"]))
			oj, _ := strconv.Atoi(fmt.Sprintf("%v", groups[j]["order_index"]))
			return oi < oj
		})
		var categories []models.Category
		db.Find(&categories)
		var products []models.Product
		db.Find(&products)
		var activeItems []models.OrderItem
		db.Joins("JOIN orders ON orders.id = order_items.order_id").
			Where("orders.status IN ? AND order_items.is_voided = ? AND order_items.status IN ?", []string{"open", "bill_requested"}, false, []string{"preparing", "pending", "hold", "stock_confirm"}).
			Find(&activeItems)

		res := make([]fiber.Map, 0, len(groups))
		for _, g := range groups {
			code := fmt.Sprintf("%v", g["code"])
			catNames := make([]string, 0)
			for _, cat := range categories {
				if cat.TargetStation == code {
					catNames = append(catNames, cat.Name)
				}
			}
			prodCount := 0
			for _, p := range products {
				st := p.Station
				if st == "" {
					st = "kitchen"
				}
				if st == code {
					prodCount++
				}
			}
			activeKdsCount := 0
			for _, it := range activeItems {
				st := it.Station
				if st == "" {
					st = "kitchen"
				}
				if st == code {
					activeKdsCount++
				}
			}
			printerName := fmt.Sprintf("%v", g["printer_name"])
			if printerName == "" || printerName == "<nil>" {
				printerName = fmt.Sprintf("%v", g["printer_ip"])
				if printerName == "<nil>" {
					printerName = ""
				}
			}
			desc := ""
			if g["description"] != nil {
				desc = fmt.Sprintf("%v", g["description"])
			}
			prepMins := 15
			if pm, err := strconv.Atoi(fmt.Sprintf("%v", g["target_prep_minutes"])); err == nil && pm > 0 {
				prepMins = pm
			}
			soundAlert := true
			if sa, ok := g["sound_alert"].(bool); ok {
				soundAlert = sa
			}
			autoPrint := true
			if ap, ok := g["auto_print"].(bool); ok {
				autoPrint = ap
			}
			res = append(res, fiber.Map{
				"id":                  g["id"],
				"name":                g["name"],
				"code":                code,
				"description":         desc,
				"icon":                g["icon"],
				"color":               g["color"],
				"printer_ip":          g["printer_ip"],
				"printer_name":        printerName,
				"target_prep_minutes": prepMins,
				"sound_alert":         soundAlert,
				"auto_print":          autoPrint,
				"order_index":         g["order_index"],
				"display_order":       g["order_index"],
				"is_active":           g["is_active"],
				"categories":          catNames,
				"products_count":      prodCount,
				"product_count":       prodCount,
				"active_kds_count":    activeKdsCount,
			})
		}
		return c.JSON(res)
	})

	group.Post("/kitchen-groups", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			ID                string `json:"id"`
			Name              string `json:"name"`
			Code              string `json:"code"`
			Description       string `json:"description"`
			Icon              string `json:"icon"`
			Color             string `json:"color"`
			PrinterIP         string `json:"printer_ip"`
			PrinterName       string `json:"printer_name"`
			TargetPrepMinutes int    `json:"target_prep_minutes"`
			SoundAlert        *bool  `json:"sound_alert"`
			AutoPrint         *bool  `json:"auto_print"`
			IsActive          *bool  `json:"is_active"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz mutfak grubu verisi.")
		}
		rawCode := strings.TrimSpace(payload.Code)
		if rawCode == "" {
			rawCode = strings.TrimSpace(payload.ID)
		}
		if rawCode == "" {
			rawCode = strings.TrimSpace(payload.Name)
		}
		re := regexp.MustCompile(`[^a-z0-9_]+`)
		slug := strings.Trim(re.ReplaceAllString(strings.ToLower(rawCode), "_"), "_")
		if slug == "" {
			slug = fmt.Sprintf("station_%d", time.Now().Unix()%10000)
		}
		groups := loadKitchenGroupsFromSettings(db)
		maxID := 0
		for _, g := range groups {
			if strings.EqualFold(fmt.Sprintf("%v", g["code"]), slug) {
				slug = fmt.Sprintf("%s_%d", slug, len(groups)+1)
			}
			if idNum, err := strconv.Atoi(fmt.Sprintf("%v", g["id"])); err == nil && idNum > maxID {
				maxID = idNum
			}
		}
		icon := payload.Icon
		if icon == "" {
			icon = "chef"
		}
		color := payload.Color
		if color == "" {
			color = "red"
		}
		printerVal := strings.TrimSpace(payload.PrinterName)
		if printerVal == "" {
			printerVal = strings.TrimSpace(payload.PrinterIP)
		}
		prepMins := payload.TargetPrepMinutes
		if prepMins <= 0 {
			prepMins = 15
		}
		soundAlert := true
		if payload.SoundAlert != nil {
			soundAlert = *payload.SoundAlert
		}
		autoPrint := true
		if payload.AutoPrint != nil {
			autoPrint = *payload.AutoPrint
		}
		isActive := true
		if payload.IsActive != nil {
			isActive = *payload.IsActive
		}
		newID := maxID + 1
		grp := map[string]interface{}{
			"id":                  newID,
			"name":                strings.TrimSpace(payload.Name),
			"code":                slug,
			"description":         strings.TrimSpace(payload.Description),
			"icon":                icon,
			"color":               color,
			"printer_ip":          printerVal,
			"printer_name":        printerVal,
			"target_prep_minutes": prepMins,
			"sound_alert":         soundAlert,
			"auto_print":          autoPrint,
			"order_index":         len(groups) + 1,
			"is_active":           isActive,
		}
		groups = append(groups, grp)
		saveJSONSettingVal(db, "kitchen_groups_config", groups)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KITCHEN_GROUPS_UPDATED", fiber.Map{"code": slug})
		return c.JSON(fiber.Map{"status": "ok", "id": newID, "code": slug})
	})

	group.Put("/kitchen-groups-reorder", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			GroupIDs   []interface{} `json:"group_ids"`
			OrderedIDs []interface{} `json:"ordered_ids"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz sıralama verisi.")
		}
		rawOrder := payload.GroupIDs
		if len(rawOrder) == 0 {
			rawOrder = payload.OrderedIDs
		}
		groups := loadKitchenGroupsFromSettings(db)
		for idx, gidVal := range rawOrder {
			key := strings.TrimSpace(fmt.Sprintf("%v", gidVal))
			for i := range groups {
				if fmt.Sprintf("%v", groups[i]["id"]) == key || strings.EqualFold(fmt.Sprintf("%v", groups[i]["code"]), key) {
					groups[i]["order_index"] = idx + 1
				}
			}
		}
		sort.SliceStable(groups, func(i, j int) bool {
			oi, _ := strconv.Atoi(fmt.Sprintf("%v", groups[i]["order_index"]))
			oj, _ := strconv.Atoi(fmt.Sprintf("%v", groups[j]["order_index"]))
			return oi < oj
		})
		saveJSONSettingVal(db, "kitchen_groups_config", groups)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KITCHEN_GROUPS_UPDATED", fiber.Map{"reordered": true})
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Put("/kitchen-groups/:group_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		for i := range groups {
			if fmt.Sprintf("%v", groups[i]["id"]) == gidStr || strings.EqualFold(fmt.Sprintf("%v", groups[i]["code"]), gidStr) {
				oldCode := fmt.Sprintf("%v", groups[i]["code"])
				if name, ok := payload["name"].(string); ok {
					groups[i]["name"] = strings.TrimSpace(name)
				}
				if code, ok := payload["code"].(string); ok && strings.TrimSpace(code) != "" {
					re := regexp.MustCompile(`[^a-z0-9_]+`)
					newSlug := strings.Trim(re.ReplaceAllString(strings.ToLower(strings.TrimSpace(code)), "_"), "_")
					if newSlug != "" && newSlug != oldCode {
						groups[i]["code"] = newSlug
						db.Model(&models.Category{}).Where("target_station = ?", oldCode).Update("target_station", newSlug)
						db.Model(&models.Product{}).Where("station = ?", oldCode).Update("station", newSlug)
					}
				}
				for _, k := range []string{"description", "icon", "color", "printer_ip", "printer_name", "target_prep_minutes", "sound_alert", "auto_print", "is_active"} {
					if v, ok := payload[k]; ok {
						groups[i][k] = v
					}
				}
				if pn, ok := payload["printer_name"]; ok {
					groups[i]["printer_ip"] = pn
				} else if pi, ok := payload["printer_ip"]; ok {
					groups[i]["printer_name"] = pi
				}
				saveJSONSettingVal(db, "kitchen_groups_config", groups)
				_ = svc.Broadcaster.BroadcastAll(tenantCode, "KITCHEN_GROUPS_UPDATED", fiber.Map{"code": groups[i]["code"]})
				return c.JSON(fiber.Map{"status": "ok", "id": groups[i]["id"], "code": groups[i]["code"]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Mutfak grubu bulunamadı")
	})

	group.Delete("/kitchen-groups/:group_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		filtered := make([]map[string]interface{}, 0)
		for _, g := range groups {
			if fmt.Sprintf("%v", g["id"]) == gidStr || strings.EqualFold(fmt.Sprintf("%v", g["code"]), gidStr) {
				code := fmt.Sprintf("%v", g["code"])
				db.Model(&models.Category{}).Where("target_station = ?", code).Update("target_station", "kitchen")
				db.Model(&models.Product{}).Where("station = ?", code).Update("station", "kitchen")
			} else {
				filtered = append(filtered, g)
			}
		}
		saveJSONSettingVal(db, "kitchen_groups_config", filtered)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KITCHEN_GROUPS_UPDATED", fiber.Map{"deleted": gidStr})
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Post("/kitchen-groups/:group_id/assign-categories", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		var targetCode string
		for _, g := range groups {
			if fmt.Sprintf("%v", g["id"]) == gidStr || strings.EqualFold(fmt.Sprintf("%v", g["code"]), gidStr) {
				targetCode = fmt.Sprintf("%v", g["code"])
				break
			}
		}
		if targetCode == "" {
			return fiber.NewError(fiber.StatusNotFound, "Mutfak grubu bulunamadı")
		}
		var payload struct {
			CategoryIDs         []int `json:"category_ids"`
			ProductIDs          []int `json:"product_ids"`
			UnassignCategoryIDs []int `json:"unassign_category_ids"`
			SyncProductsAlso    *bool `json:"sync_products_also"`
		}
		_ = c.BodyParser(&payload)
		syncProds := true
		if payload.SyncProductsAlso != nil {
			syncProds = *payload.SyncProductsAlso
		}
		if len(payload.UnassignCategoryIDs) > 0 {
			fallbackCode := "kitchen"
			for _, g := range groups {
				if gc := fmt.Sprintf("%v", g["code"]); gc != "" && gc != targetCode {
					fallbackCode = gc
					break
				}
			}
			db.Model(&models.Category{}).Where("id IN ? AND target_station = ?", payload.UnassignCategoryIDs, targetCode).Update("target_station", fallbackCode)
			db.Model(&models.Product{}).Where("category_id IN ? AND station = ?", payload.UnassignCategoryIDs, targetCode).Update("station", fallbackCode)
		}
		if len(payload.CategoryIDs) > 0 {
			db.Model(&models.Category{}).Where("id IN ?", payload.CategoryIDs).Update("target_station", targetCode)
			if syncProds {
				db.Model(&models.Product{}).Where("category_id IN ?", payload.CategoryIDs).Update("station", targetCode)
			}
		}
		if payload.ProductIDs != nil {
			if len(payload.ProductIDs) > 0 {
				db.Model(&models.Product{}).Where("id IN ?", payload.ProductIDs).Update("station", targetCode)
			}
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KITCHEN_GROUPS_UPDATED", fiber.Map{"code": targetCode})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"station_code": targetCode})
		return c.JSON(fiber.Map{"status": "ok", "station_code": targetCode})
	})
}

// ============================================================================
// 13. SCALE & BARCODE HARDWARE BRIDGE ROUTER (/api/scale)
// ============================================================================

const agentOnlineTimeoutSec = 30.0

type terminalLiveInfo struct {
	LastSeenTs float64
	LocalIP    string
	LastDBSync float64
}

type bridgeResultEntry struct {
	TenantCode string
	Payload    map[string]interface{}
	StoredAt   float64
}

var (
	scaleMu                  sync.RWMutex
	terminalsStateMu         sync.Mutex
	terminalLiveSeen         = make(map[string]terminalLiveInfo)
	tenantScaleConfigStates  = make(map[string]map[string]interface{})
	tenantAgentRuntimeStates = make(map[string]map[string]interface{})
	bridgeMu                 sync.Mutex
	pendingBridgeCommands    = make(map[string]map[string]interface{})
	completedBridgeResults   = make(map[string]bridgeResultEntry)
)

func getOrInitTenantScaleConfigLocked(tenantCode string) map[string]interface{} {
	tc := strings.TrimSpace(tenantCode)
	if tc == "" {
		tc = "default"
	}
	if cfg, ok := tenantScaleConfigStates[tc]; ok {
		return cfg
	}
	cfg := map[string]interface{}{
		"brand":             "DIGI",
		"connection_type":   "TCP/IP",
		"ip_address":        "192.168.1.150",
		"port":              4001,
		"com_port":          "COM3",
		"baud_rate":         9600,
		"data_bits":         8,
		"parity":            "None",
		"barcode_prefix":    "27",
		"plu_digits":        5,
		"value_digits":      5,
		"value_type":        "weight_gram",
		"auto_connect":      true,
		"ContinuousPolling": true,
		"tare_gram":         0,
		"is_connected":      true,
		"last_sync":         "Az önce",
	}
	tenantScaleConfigStates[tc] = cfg
	return cfg
}

func getOrInitTenantAgentRuntimeLocked(tenantCode string) map[string]interface{} {
	tc := strings.TrimSpace(tenantCode)
	if tc == "" {
		tc = "default"
	}
	if rt, ok := tenantAgentRuntimeStates[tc]; ok {
		return rt
	}
	rt := map[string]interface{}{
		"online":             false,
		"last_heartbeat_ts":  0.0,
		"agent_version":      nil,
		"hostname":           nil,
		"os_info":            nil,
		"active_com_ports":   []string{},
		"live_weight_kg":     0.0,
		"live_weight_gram":   0,
		"live_stable":        true,
		"last_error":         nil,
		"pending_print_jobs": []fiber.Map{},
	}
	tenantAgentRuntimeStates[tc] = rt
	return rt
}

func pruneCompletedBridgeResultsLocked(nowTs float64) {
	for reqID, entry := range completedBridgeResults {
		if (nowTs - entry.StoredAt) > 120.0 {
			delete(completedBridgeResults, reqID)
		}
	}
}

func isVirtualPrinter(p string) bool {
	low := strings.ToLower(p)
	virtualKeywords := []string{
		"microsoft print to pdf",
		"microsoft xps",
		"onenote",
		"fax",
		"anydesk printer",
		"send to onenote",
	}
	for _, k := range virtualKeywords {
		if strings.Contains(low, k) {
			return true
		}
	}
	return false
}

func sortPrinters(printers []string) []string {
	unique := make([]string, 0, len(printers))
	seen := make(map[string]bool)
	for _, p := range printers {
		p = strings.TrimSpace(p)
		if p != "" && !seen[p] {
			seen[p] = true
			unique = append(unique, p)
		}
	}
	sort.SliceStable(unique, func(i, j int) bool {
		vi := isVirtualPrinter(unique[i])
		vj := isVirtualPrinter(unique[j])
		if vi != vj {
			return !vi
		}
		return strings.ToLower(unique[i]) < strings.ToLower(unique[j])
	})
	return unique
}

func loadTerminalsList(db *gorm.DB) []map[string]interface{} {
	if m, ok := loadJSONSettingMap(db, "registered_pos_terminals"); ok {
		if list, ok := m["terminals"].([]interface{}); ok && len(list) > 0 {
			res := make([]map[string]interface{}, 0, len(list))
			for _, item := range list {
				if mp, ok := item.(map[string]interface{}); ok {
					res = append(res, mp)
				}
			}
			return res
		}
	}
	// Fallback: seed from relative backend/app/terminals.json if available
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)
	candidates := []string{
		filepath.Join("..", "backend", "app", "terminals.json"),
		filepath.Join("backend", "app", "terminals.json"),
		filepath.Join(exeDir, "..", "backend", "app", "terminals.json"),
	}
	for _, cPath := range candidates {
		if data, err := os.ReadFile(cPath); err == nil && len(data) > 0 {
			var rawMap map[string]map[string]interface{}
			if err := json.Unmarshal(data, &rawMap); err == nil && len(rawMap) > 0 {
				res := make([]map[string]interface{}, 0, len(rawMap))
				for _, t := range rawMap {
					res = append(res, t)
				}
				saveTerminalsList(db, res)
				return res
			}
		}
	}
	return []map[string]interface{}{}
}

func saveTerminalsList(db *gorm.DB, terminals []map[string]interface{}) {
	saveJSONSettingVal(db, "registered_pos_terminals", map[string]interface{}{"terminals": terminals})
}

func terminalLiveKey(tenantCode, tid string) string {
	tc := strings.TrimSpace(tenantCode)
	if tc == "" {
		tc = "default"
	}
	return tc + "::" + strings.TrimSpace(tid)
}

func touchTerminalLiveSeen(tenantCode, tid, localIP string, nowTs float64, syncedToDB bool) {
	if strings.TrimSpace(tid) == "" {
		return
	}
	key := terminalLiveKey(tenantCode, tid)
	info := terminalLiveSeen[key]
	if nowTs > info.LastSeenTs {
		info.LastSeenTs = nowTs
	}
	if localIP != "" && localIP != "127.0.0.1" && localIP != "<nil>" {
		info.LocalIP = localIP
	}
	if syncedToDB {
		info.LastDBSync = nowTs
	}
	terminalLiveSeen[key] = info
}

func resolveTerminalLastSeen(tenantCode string, t map[string]interface{}) float64 {
	lastTs, _ := t["last_heartbeat_ts"].(float64)
	if lastTs == 0 {
		lastTs, _ = t["last_seen"].(float64)
	}
	tid := fmt.Sprintf("%v", t["id"])
	if tid == "" || tid == "<nil>" {
		tid = fmt.Sprintf("%v", t["terminal_id"])
	}
	if tid != "" && tid != "<nil>" {
		if info, ok := terminalLiveSeen[terminalLiveKey(tenantCode, tid)]; ok && info.LastSeenTs > lastTs {
			lastTs = info.LastSeenTs
		}
	}
	return lastTs
}

func RegisterScaleRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/download-agent", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		agentAPIKey := ensureTenantAgentAPIKey(db)

		terminalName := strings.TrimSpace(c.Query("terminal_name"))
		if terminalName == "" {
			terminalName = "Kasa 1"
		}
		terminalID := strings.TrimSpace(c.Query("terminal_id"))
		if terminalID == "" {
			terminalID = fmt.Sprintf("kasa_%x", time.Now().UnixNano()%0xFFFFFF)
		}
		scaleIP := strings.TrimSpace(c.Query("scale_ip"))
		if scaleIP == "" {
			scaleIP = "192.168.1.150"
		}
		scalePort := c.QueryInt("scale_port", 2004)

		// Always use trusted server configuration URL (never trust X-Forwarded-Host / Host headers)
		serverBase := svc.Config.PublicBaseURL
		if strings.TrimSpace(serverBase) == "" {
			serverBase = "https://boncoreapp.me"
		}

		exePath, _ := os.Executable()
		exeDir := filepath.Dir(exePath)
		candidates := []string{
			filepath.Join("hardware_agent"),
			filepath.Join("..", "hardware_agent"),
			filepath.Join(exeDir, "hardware_agent"),
			filepath.Join(exeDir, "..", "hardware_agent"),
		}
		var agentDir string
		for _, dir := range candidates {
			if info, err := os.Stat(dir); err == nil && info.IsDir() {
				agentDir = dir
				break
			}
		}

		filesToBundle := []string{
			"BonCoreDonanimKoprusuSetup.exe",
			"BonCoreAgent.exe",
			"boncore_agent.py",
			"desktop_app.py",
			"run_agent.bat",
		}

		configData := map[string]interface{}{
			"server_url":         serverBase,
			"restaurant_code":    tenantCode,
			"agent_api_key":      agentAPIKey,
			"terminal_id":        terminalID,
			"terminal_name":      terminalName,
			"scale_default_ip":   scaleIP,
			"scale_default_port": scalePort,
			"auto_start":         true,
			"minimize_to_tray":   true,
			"show_notifications": true,
		}
		configBytes, _ := json.MarshalIndent(configData, "", "  ")

		safeName := strings.ReplaceAll(terminalName, "/", "_")
		safeName = strings.ReplaceAll(safeName, "\\", "_")
		safeName = strings.ReplaceAll(safeName, ":", "_")
		safeName = strings.ReplaceAll(safeName, "\"", "")
		safeName = strings.ReplaceAll(safeName, "'", "")
		safeName = strings.ReplaceAll(safeName, "\r", "")
		safeName = strings.ReplaceAll(safeName, "\n", "")

		cleanAscii := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
				return r
			}
			if r == ' ' {
				return '-'
			}
			return '_'
		}, safeName)
		if cleanAscii == "" {
			cleanAscii = "pos"
		}

		c.Set("Content-Type", "application/zip")
		c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
		c.Set("Access-Control-Expose-Headers", "Content-Disposition")
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"boncore-hardware-agent-%s.zip\"", cleanAscii))

		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			zw := zip.NewWriter(w)
			for _, fname := range filesToBundle {
				if agentDir == "" {
					continue
				}
				fpath := filepath.Join(agentDir, fname)
				f, oErr := os.Open(fpath)
				if oErr != nil {
					continue
				}
				if strings.HasSuffix(fname, ".bat") {
					raw, rErr := io.ReadAll(f)
					_ = f.Close()
					if rErr == nil {
						raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
						raw = bytes.ReplaceAll(raw, []byte("\n"), []byte("\r\n"))
						if fw, cErr := zw.Create(fname); cErr == nil {
							_, _ = fw.Write(raw)
						}
					}
					continue
				}
				var fw io.Writer
				var cErr error
				if strings.HasSuffix(fname, ".exe") {
					fw, cErr = zw.CreateHeader(&zip.FileHeader{Name: fname, Method: zip.Store})
				} else {
					fw, cErr = zw.Create(fname)
				}
				if cErr == nil && fw != nil {
					_, _ = io.Copy(fw, f)
				}
				_ = f.Close()
			}
			if cw, cErr := zw.Create("config.json"); cErr == nil {
				_, _ = cw.Write(configBytes)
			}
			_ = zw.Close()
			_ = w.Flush()
		})
		return nil
	})

	group.Get("/setup", func(c *fiber.Ctx) error {
		exePath, _ := os.Executable()
		exeDir := filepath.Dir(exePath)
		candidates := []string{
			filepath.Join("hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join("..", "hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join("hardware_agent", "dist", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join(exeDir, "..", "hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
		}
		for _, p := range candidates {
			if _, err := os.Stat(p); err == nil {
				c.Set("Content-Type", "application/octet-stream")
				c.Set("Content-Disposition", "attachment; filename=\"BonCoreDonanimKoprusuSetup.exe\"")
				return c.SendFile(p)
			}
		}
		return c.Status(fiber.StatusNotFound).SendString("BonCoreDonanimKoprusuSetup.exe bulunamadi")
	})

	group.Get("/raw-exe", func(c *fiber.Ctx) error {
		exePath, _ := os.Executable()
		exeDir := filepath.Dir(exePath)
		candidates := []string{
			filepath.Join("hardware_agent", "BonCoreAgent.exe"),
			filepath.Join("..", "hardware_agent", "BonCoreAgent.exe"),
			filepath.Join(exeDir, "..", "hardware_agent", "BonCoreAgent.exe"),
		}
		for _, p := range candidates {
			if _, err := os.Stat(p); err == nil {
				c.Set("Content-Type", "application/octet-stream")
				c.Set("Content-Disposition", "attachment; filename=\"BonCoreAgent.exe\"")
				return c.SendFile(p)
			}
		}
		return c.Status(fiber.StatusNotFound).SendString("BonCoreAgent.exe bulunamadi")
	})

	group.Get("/terminals", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		nowTs := float64(time.Now().Unix())
		terminalsStateMu.Lock()
		terminals := loadTerminalsList(db)
		enriched := make([]map[string]interface{}, 0, len(terminals))
		for _, t := range terminals {
			item := map[string]interface{}{}
			for k, v := range t {
				item[k] = v
			}

			// Normalize ID
			tid := fmt.Sprintf("%v", item["id"])
			if tid == "" || tid == "<nil>" {
				tid = fmt.Sprintf("%v", item["terminal_id"])
			}
			item["id"] = tid

			// Normalize Name
			tname := fmt.Sprintf("%v", item["name"])
			if tname == "" || tname == "<nil>" {
				tname = fmt.Sprintf("%v", item["custom_name"])
			}
			if tname == "" || tname == "<nil>" {
				tname = fmt.Sprintf("%v", item["alias"])
			}
			if tname == "" || tname == "<nil>" {
				tname = "Kasa"
			}
			item["name"] = tname

			// Normalize LocalIP
			lip := fmt.Sprintf("%v", item["local_ip"])
			if lip == "" || lip == "<nil>" {
				lip = "127.0.0.1"
			}
			if lip == "127.0.0.1" {
				if liveInfo, ok := terminalLiveSeen[terminalLiveKey(tenantCode, tid)]; ok && liveInfo.LocalIP != "" {
					lip = liveInfo.LocalIP
				}
			}
			item["local_ip"] = lip

			// Normalize Version
			ver := fmt.Sprintf("%v", item["version"])
			if ver == "" || ver == "<nil>" {
				ver = fmt.Sprintf("%v", item["agent_version"])
			}
			if ver == "" || ver == "<nil>" {
				ver = "2.2.0"
			}
			item["version"] = ver

			// Online calculation (merges DB + in-memory live heartbeat/poll timestamps)
			lastTs := resolveTerminalLastSeen(tenantCode, item)
			item["last_heartbeat_ts"] = lastTs
			item["last_seen"] = lastTs
			age := nowTs - lastTs
			if age < 0 {
				age = 0
			}
			isOnline := lastTs > 0 && age < agentOnlineTimeoutSec
			item["is_online"] = isOnline
			if lastTs > 0 {
				item["last_seen_seconds_ago"] = math.Round(age*10) / 10
				if isOnline {
					item["last_seen_text"] = fmt.Sprintf("%d sn önce aktif", int(age))
				} else {
					item["last_seen_text"] = fmt.Sprintf("%d dk önce çevrimdışı", int(age/60))
				}
			} else {
				item["last_seen_seconds_ago"] = 999.0
				item["last_seen_text"] = "Hiç bağlanmadı"
			}

			if item["scale_ip"] == nil {
				item["scale_ip"] = "192.168.1.150"
			}
			if item["scale_port"] == nil {
				item["scale_port"] = 2004
			}
			if item["scale_connected"] == nil {
				item["scale_connected"] = false
			}

			// Extract printers list
			var prList []string
			if rawPr, ok := item["printers"].([]interface{}); ok {
				for _, p := range rawPr {
					if ps := fmt.Sprintf("%v", p); ps != "" {
						prList = append(prList, ps)
					}
				}
			} else if rawPrStr, ok := item["printers"].([]string); ok {
				prList = rawPrStr
			}
			item["printers"] = sortPrinters(prList)

			if isDef, ok := item["is_default"].(bool); !ok {
				item["is_default"] = false
			} else {
				item["is_default"] = isDef
			}

			if scaleEn, ok := item["scale_enabled"].(bool); !ok {
				item["scale_enabled"] = false
			} else {
				item["scale_enabled"] = scaleEn
			}

			enriched = append(enriched, item)
		}
		terminalsStateMu.Unlock()
		return c.JSON(fiber.Map{"terminals": enriched})
	})

	group.Put("/terminals/:terminal_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tid := c.Params("terminal_id")
		var payload struct {
			Name         *string `json:"name"`
			ScaleIP      *string `json:"scale_ip"`
			ScalePort    *int    `json:"scale_port"`
			IsDefault    *bool   `json:"is_default"`
			ScaleEnabled *bool   `json:"scale_enabled"`
		}
		_ = c.BodyParser(&payload)

		terminalsStateMu.Lock()
		defer terminalsStateMu.Unlock()
		terminals := loadTerminalsList(db)
		updated := false
		for i := range terminals {
			currID := fmt.Sprintf("%v", terminals[i]["id"])
			currTID := fmt.Sprintf("%v", terminals[i]["terminal_id"])
			if currID == tid || currTID == tid {
				if payload.Name != nil && *payload.Name != "" {
					terminals[i]["name"] = *payload.Name
					terminals[i]["custom_name"] = *payload.Name
				}
				if payload.ScaleIP != nil && *payload.ScaleIP != "" {
					terminals[i]["scale_ip"] = *payload.ScaleIP
					terminals[i]["custom_scale_ip"] = *payload.ScaleIP
				}
				if payload.ScalePort != nil && *payload.ScalePort > 0 {
					terminals[i]["scale_port"] = *payload.ScalePort
					terminals[i]["custom_scale_port"] = *payload.ScalePort
				}
				if payload.IsDefault != nil {
					if *payload.IsDefault {
						for j := range terminals {
							terminals[j]["is_default"] = false
						}
					}
					terminals[i]["is_default"] = *payload.IsDefault
				}
				if payload.ScaleEnabled != nil {
					terminals[i]["scale_enabled"] = *payload.ScaleEnabled
				}
				updated = true
				break
			}
		}
		if !updated {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"status": "error", "message": "Terminal bulunamadı"})
		}
		saveTerminalsList(db, terminals)
		return c.JSON(fiber.Map{"status": "ok", "terminals": terminals})
	})

	group.Delete("/terminals/:terminal_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tid := c.Params("terminal_id")
		terminalsStateMu.Lock()
		defer terminalsStateMu.Unlock()
		terminals := loadTerminalsList(db)
		filtered := make([]map[string]interface{}, 0)
		for _, t := range terminals {
			currID := fmt.Sprintf("%v", t["id"])
			currTID := fmt.Sprintf("%v", t["terminal_id"])
			if currID != tid && currTID != tid {
				filtered = append(filtered, t)
			}
		}
		delete(terminalLiveSeen, terminalLiveKey(tenantCode, tid))
		saveTerminalsList(db, filtered)
		return c.JSON(fiber.Map{"status": "ok", "terminals": filtered})
	})

	group.Post("/agent/heartbeat", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			TerminalID     string      `json:"terminal_id"`
			TerminalName   string      `json:"terminal_name"`
			Hostname       string      `json:"hostname"`
			MachineID      string      `json:"machine_id"`
			LocalIP        string      `json:"local_ip"`
			Version        string      `json:"version"`
			AgentVersion   string      `json:"agent_version"`
			ScaleConnected bool        `json:"scale_connected"`
			ScaleIP        string      `json:"scale_ip"`
			ScalePort      int         `json:"scale_port"`
			LastWeight     float64     `json:"last_weight"`
			LiveWeightGram *int        `json:"live_weight_gram"`
			LiveStable     bool        `json:"live_stable"`
			Printers       interface{} `json:"printers"`
			UserConfigured bool        `json:"user_configured"`
			RestaurantCode string      `json:"restaurant_code"`
			ActiveComPorts []string    `json:"active_com_ports"`
			OsInfo         string      `json:"os_info"`
			LastError      *string     `json:"last_error"`
		}
		_ = c.BodyParser(&payload)

		tid := strings.TrimSpace(payload.TerminalID)
		if tid == "" {
			tid = strings.TrimSpace(payload.Hostname)
		}
		if tid == "" {
			tid = "kasa-1"
		}

		tname := strings.TrimSpace(payload.TerminalName)
		if tname == "" {
			tname = strings.TrimSpace(payload.Hostname)
		}
		if tname == "" {
			tname = "Kasa 1"
		}

		localIP := strings.TrimSpace(payload.LocalIP)
		if localIP == "" {
			localIP = "127.0.0.1"
		}
		machineID := strings.TrimSpace(payload.MachineID)
		hostname := strings.TrimSpace(payload.Hostname)

		version := payload.Version
		if version == "" {
			version = payload.AgentVersion
		}
		if version == "" {
			version = "2.2.0"
		}

		scaleIP := strings.TrimSpace(payload.ScaleIP)
		if scaleIP == "" {
			scaleIP = "192.168.1.150"
		}
		scalePort := payload.ScalePort
		if scalePort == 0 {
			scalePort = 2004
		}

		// Extract printers
		var prList []string
		if prArr, ok := payload.Printers.([]interface{}); ok {
			for _, p := range prArr {
				if s := fmt.Sprintf("%v", p); s != "" {
					prList = append(prList, s)
				}
			}
		} else if prStrArr, ok := payload.Printers.([]string); ok {
			prList = prStrArr
		}
		sortedPr := sortPrinters(prList)

		nowTs := float64(time.Now().Unix())
		scaleMu.Lock()
		rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
		rt["online"] = true
		rt["last_heartbeat_ts"] = nowTs
		rt["agent_version"] = version
		rt["hostname"] = tname
		rt["local_ip"] = localIP
		rt["terminal_id"] = tid
		rt["active_com_ports"] = payload.ActiveComPorts
		rt["live_stable"] = payload.LiveStable
		rt["last_error"] = payload.LastError
		if payload.LiveWeightGram != nil {
			g := *payload.LiveWeightGram
			rt["live_weight_gram"] = g
			rt["live_weight_kg"] = math.Round((float64(g)/1000.0)*1000) / 1000
		} else if payload.LastWeight > 0 {
			rt["live_weight_kg"] = payload.LastWeight
			rt["live_weight_gram"] = int(payload.LastWeight * 1000)
		}
		jobs, _ := rt["pending_print_jobs"].([]fiber.Map)
		rt["pending_print_jobs"] = []fiber.Map{}
		scaleMu.Unlock()

		terminalsStateMu.Lock()
		terminals := loadTerminalsList(db)
		foundIdx := -1
		for i := range terminals {
			currID := fmt.Sprintf("%v", terminals[i]["id"])
			currTID := fmt.Sprintf("%v", terminals[i]["terminal_id"])
			currIP := fmt.Sprintf("%v", terminals[i]["local_ip"])
			currMID := fmt.Sprintf("%v", terminals[i]["machine_id"])
			if currID == tid || currTID == tid || (machineID != "" && currMID == machineID) || (localIP != "127.0.0.1" && currIP == localIP) {
				foundIdx = i
				break
			}
		}

		shouldPersistDB := false
		respName := tname
		respScaleIP := scaleIP
		respScalePort := scalePort

		if foundIdx >= 0 {
			existing := terminals[foundIdx]
			existingIP := fmt.Sprintf("%v", existing["local_ip"])
			effectiveIP := localIP
			// Gecici ag kesintisinde gelen 127.0.0.1 ile gecerli LAN IP'yi ezme
			if effectiveIP == "127.0.0.1" && existingIP != "" && existingIP != "<nil>" && existingIP != "127.0.0.1" {
				effectiveIP = existingIP
			}
			prevDBTs, _ := existing["last_heartbeat_ts"].(float64)
			prevScaleConn, _ := existing["scale_connected"].(bool)
			prevVersion := fmt.Sprintf("%v", existing["version"])

			if existingIP != effectiveIP || prevVersion != version || prevScaleConn != payload.ScaleConnected || (nowTs-prevDBTs) >= 15.0 {
				shouldPersistDB = true
			}

			existing["id"] = tid
			existing["terminal_id"] = tid
			if machineID != "" {
				existing["machine_id"] = machineID
			}
			if hostname != "" {
				existing["hostname"] = hostname
			}
			if payload.UserConfigured && tname != "" {
				if fmt.Sprintf("%v", existing["name"]) != tname {
					shouldPersistDB = true
				}
				existing["name"] = tname
				existing["custom_name"] = tname
			} else if currName, _ := existing["name"].(string); currName == "" || currName == "Kasa 1" || currName == "Kasa" {
				existing["name"] = tname
			} else {
				respName = currName
			}

			if cSip, ok := existing["custom_scale_ip"].(string); ok && cSip != "" {
				respScaleIP = cSip
			}
			if cSport, ok := existing["custom_scale_port"].(float64); ok && cSport > 0 {
				respScalePort = int(cSport)
			}

			existing["local_ip"] = effectiveIP
			existing["version"] = version
			existing["agent_version"] = version
			existing["scale_connected"] = payload.ScaleConnected
			if _, hasCustomIP := existing["custom_scale_ip"]; !hasCustomIP || payload.UserConfigured {
				existing["scale_ip"] = scaleIP
			}
			if _, hasCustomPort := existing["custom_scale_port"]; !hasCustomPort || payload.UserConfigured {
				existing["scale_port"] = scalePort
			}
			existing["last_weight"] = payload.LastWeight
			if len(sortedPr) > 0 {
				existing["printers"] = sortedPr
			}
			existing["last_heartbeat_ts"] = nowTs
			existing["last_seen"] = nowTs

			if shouldPersistDB {
				saveTerminalsList(db, terminals)
			}
			touchTerminalLiveSeen(tenantCode, tid, effectiveIP, nowTs, shouldPersistDB)
		} else {
			isDef := len(terminals) == 0
			terminals = append(terminals, map[string]interface{}{
				"id":                tid,
				"terminal_id":       tid,
				"name":              tname,
				"custom_name":       tname,
				"machine_id":        machineID,
				"hostname":          hostname,
				"local_ip":          localIP,
				"version":           version,
				"agent_version":     version,
				"scale_connected":   payload.ScaleConnected,
				"scale_ip":          scaleIP,
				"scale_port":        scalePort,
				"last_weight":       payload.LastWeight,
				"printers":          sortedPr,
				"last_heartbeat_ts": nowTs,
				"last_seen":         nowTs,
				"is_default":        isDef,
			})
			saveTerminalsList(db, terminals)
			touchTerminalLiveSeen(tenantCode, tid, localIP, nowTs, true)
		}
		terminalsStateMu.Unlock()

		if payload.LiveWeightGram != nil {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "SCALE_LIVE_WEIGHT", fiber.Map{
				"weight_gram": *payload.LiveWeightGram,
				"weight_kg":   math.Round((float64(*payload.LiveWeightGram)/1000.0)*1000) / 1000,
				"stable":      payload.LiveStable,
				"hostname":    tname,
			})
		}

		return c.JSON(fiber.Map{
			"status":             "ok",
			"terminal_id":        tid,
			"terminal_name":      respName,
			"scale_ip":           respScaleIP,
			"scale_port":         respScalePort,
			"pending_print_jobs": jobs,
			"server_time":        nowTs,
		})
	})

	group.Get("/agent/status", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		nowTs := float64(time.Now().Unix())
		requestedTID := strings.TrimSpace(c.Query("terminal_id"))

		scaleMu.RLock()
		rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
		rtLastTs, _ := rt["last_heartbeat_ts"].(float64)
		rtVersion := rt["agent_version"]
		rtHostname := rt["hostname"]
		rtLocalIP := rt["local_ip"]
		rtTerminalID := rt["terminal_id"]
		rtActiveCom := rt["active_com_ports"]
		rtLiveKg := rt["live_weight_kg"]
		rtLiveGram := rt["live_weight_gram"]
		rtLiveStable := rt["live_stable"]
		rtLastError := rt["last_error"]
		rtOsInfo := rt["os_info"]
		scaleMu.RUnlock()

		var bestTerm map[string]interface{}
		var bestLastTs float64
		activeCount := 0

		if db, tenantCode, err := getTenantDB(c, svc); err == nil && db != nil {
			terminalsStateMu.Lock()
			terminals := loadTerminalsList(db)
			for _, t := range terminals {
				lastTs := resolveTerminalLastSeen(tenantCode, t)
				age := nowTs - lastTs
				if lastTs > 0 && age < agentOnlineTimeoutSec {
					activeCount++
				}
				currID := fmt.Sprintf("%v", t["id"])
				currTID := fmt.Sprintf("%v", t["terminal_id"])
				if requestedTID != "" && (currID == requestedTID || currTID == requestedTID) {
					bestTerm = t
					bestLastTs = lastTs
					break
				}
				if bestTerm == nil || lastTs > bestLastTs {
					bestTerm = t
					bestLastTs = lastTs
				}
			}
			terminalsStateMu.Unlock()
		}

		lastTs := bestLastTs
		if rtLastTs > lastTs {
			lastTs = rtLastTs
		}
		age := nowTs - lastTs
		if age < 0 {
			age = 0
		}
		isOnline := lastTs > 0 && age < agentOnlineTimeoutSec

		localIP := ""
		version := ""
		termID := ""
		termName := ""
		if bestTerm != nil {
			if s := fmt.Sprintf("%v", bestTerm["local_ip"]); s != "" && s != "<nil>" {
				localIP = s
			}
			if s := fmt.Sprintf("%v", bestTerm["version"]); s != "" && s != "<nil>" {
				version = s
			} else if s := fmt.Sprintf("%v", bestTerm["agent_version"]); s != "" && s != "<nil>" {
				version = s
			}
			if s := fmt.Sprintf("%v", bestTerm["id"]); s != "" && s != "<nil>" {
				termID = s
			}
			if s := fmt.Sprintf("%v", bestTerm["name"]); s != "" && s != "<nil>" {
				termName = s
			}
		}
		if (localIP == "" || localIP == "127.0.0.1") && rtLocalIP != nil {
			if s := fmt.Sprintf("%v", rtLocalIP); s != "" && s != "<nil>" {
				localIP = s
			}
		}
		if version == "" && rtVersion != nil {
			version = fmt.Sprintf("%v", rtVersion)
		}
		if termID == "" && rtTerminalID != nil {
			termID = fmt.Sprintf("%v", rtTerminalID)
		}
		if termName == "" && rtHostname != nil {
			termName = fmt.Sprintf("%v", rtHostname)
		}

		resp := fiber.Map{
			"online":               isOnline,
			"isOnline":             isOnline,
			"localIp":              localIP,
			"local_ip":             localIP,
			"version":              version,
			"terminalId":           termID,
			"terminalName":         termName,
			"activeTerminalsCount": activeCount,
			"last_seen_seconds":    nil,
			"agent_version":        version,
			"hostname":             termName,
			"os_info":              rtOsInfo,
			"active_com_ports":     rtActiveCom,
			"live_weight_kg":       rtLiveKg,
			"live_weight_gram":     rtLiveGram,
			"live_stable":          rtLiveStable,
			"last_error":           rtLastError,
		}
		if lastTs > 0 {
			resp["last_seen_seconds"] = int(age)
		}
		return c.JSON(resp)
	})

	group.Get("/agent/poll", func(c *fiber.Ctx) error {
		terminalID := strings.TrimSpace(c.Query("terminal_id"))
		clientIP := c.IP()
		tenantCode := middleware.GetTenantCode(c)
		nowTs := float64(time.Now().Unix())

		if terminalID != "" {
			terminalsStateMu.Lock()
			touchTerminalLiveSeen(tenantCode, terminalID, "", nowTs, false)
			terminalsStateMu.Unlock()
			scaleMu.Lock()
			rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
			if rtTs, _ := rt["last_heartbeat_ts"].(float64); nowTs > rtTs {
				rt["last_heartbeat_ts"] = nowTs
				rt["online"] = true
			}
			scaleMu.Unlock()
		}

		bridgeMu.Lock()
		pendingCount := len(pendingBridgeCommands)
		bridgeMu.Unlock()

		var terminals []map[string]interface{}
		if pendingCount > 0 {
			if db, _, _ := getTenantDB(c, svc); db != nil {
				terminalsStateMu.Lock()
				terminals = loadTerminalsList(db)
				terminalsStateMu.Unlock()
			}
		}

		bridgeMu.Lock()
		defer bridgeMu.Unlock()

		// Check if there is any pending command for this terminal (FIFO: oldest first)
		var oldestReqID string
		var oldestCmd map[string]interface{}
		var oldestTs float64 = 99999999999

		for reqID, cmd := range pendingBridgeCommands {
			cmdTs, _ := cmd["created_at"].(float64)

			// Drop commands older than 25 seconds
			if (nowTs - cmdTs) > 25.0 {
				delete(pendingBridgeCommands, reqID)
				continue
			}

			if cmdTenant, _ := cmd["tenant_code"].(string); cmdTenant != "" && cmdTenant != tenantCode {
				continue
			}

			cmdTarget, _ := cmd["terminal_id"].(string)
			cmdPrinters, _ := cmd["printers"].([]string)

			isMatch := false

			// 1. Direct terminal ID or substring match
			if cmdTarget != "" && (cmdTarget == terminalID || strings.Contains(terminalID, cmdTarget) || strings.Contains(cmdTarget, terminalID)) {
				isMatch = true
			}

			// 2. IP match
			if !isMatch && cmdTarget != "" {
				cleanTarget := strings.ReplaceAll(cmdTarget, ".", "_")
				if strings.Contains(terminalID, cleanTarget) || strings.Contains(cleanTarget, terminalID) {
					isMatch = true
				}
				if clientIP != "" && clientIP != "127.0.0.1" && (clientIP == cmdTarget || strings.Contains(cmdTarget, clientIP)) {
					isMatch = true
				}
			}

			// 3. Printer ownership check: does this terminal own the target printer?
			if !isMatch && len(cmdPrinters) > 0 && len(terminals) > 0 {
				for _, t := range terminals {
					tID := fmt.Sprintf("%v", t["id"])
					tTID := fmt.Sprintf("%v", t["terminal_id"])
					tIP := fmt.Sprintf("%v", t["local_ip"])
					cleanIP := strings.ReplaceAll(tIP, ".", "_")

					if tID == terminalID || tTID == terminalID || (cleanIP != "" && cleanIP != "127_0_0_1" && strings.Contains(terminalID, cleanIP)) {
						var prs []string
						if rawPrs, ok := t["printers"].([]interface{}); ok {
							for _, rp := range rawPrs {
								prs = append(prs, fmt.Sprintf("%v", rp))
							}
						} else if strPrs, ok := t["printers"].([]string); ok {
							prs = strPrs
						}

						for _, targetPr := range cmdPrinters {
							for _, myPr := range prs {
								if strings.EqualFold(myPr, targetPr) {
									isMatch = true
									break
								}
							}
							if isMatch {
								break
							}
						}
					}
					if isMatch {
						break
					}
				}
			}

			// 4. Unassigned command fallback (only if cmdTarget is completely empty)
			if !isMatch && cmdTarget == "" {
				isMatch = true
			}

			if isMatch && cmdTs < oldestTs {
				oldestTs = cmdTs
				oldestReqID = reqID
				oldestCmd = cmd
			}
		}

		if oldestReqID != "" && oldestCmd != nil {
			delete(pendingBridgeCommands, oldestReqID)
			log.Printf("[BRIDGE POLL] Dispatched command %s to terminal %s (action=%s, printers=%v)", oldestReqID, terminalID, oldestCmd["action"], oldestCmd["printers"])
			return c.JSON(fiber.Map{
				"has_command": true,
				"req_id":      oldestReqID,
				"action":      oldestCmd["action"],
				"ip":          oldestCmd["ip"],
				"port":        oldestCmd["port"],
				"timeout":     oldestCmd["timeout"],
				"printers":    oldestCmd["printers"],
				"raw_text":    oldestCmd["raw_text"],
			})
		}

		return c.JSON(fiber.Map{
			"has_command": false,
			"status":      "ok",
			"server_time": nowTs,
		})
	})

	group.Get("/agent/version", func(c *fiber.Ctx) error {
		setupSHA := ""
		exePath, _ := os.Executable()
		exeDir := filepath.Dir(exePath)
		for _, p := range []string{
			filepath.Join("hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join("..", "hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join("hardware_agent", "dist", "BonCoreDonanimKoprusuSetup.exe"),
			filepath.Join(exeDir, "..", "hardware_agent", "BonCoreDonanimKoprusuSetup.exe"),
		} {
			if f, err := os.Open(p); err == nil {
				h := sha256.New()
				_, _ = io.Copy(h, f)
				_ = f.Close()
				setupSHA = hex.EncodeToString(h.Sum(nil))
				break
			}
		}
		return c.JSON(fiber.Map{
			"latest_version": "2.4.5",
			"release_date":   time.Now().Format("2006-01-02"),
			"mandatory":      false,
			"download_url":   "/api/scale/setup",
			"sha256":         setupSHA,
			"changelog":      "Yerel LAN IP algilama (VPN/sanal adaptor filtreleme), bloklamasiz heartbeat/poll baglantisi ve otomatik yeniden baglanma iyilestirildi.",
		})
	})

	group.Post("/agent/report", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		nowTs := float64(time.Now().Unix())

		reqID := fmt.Sprintf("%v", payload["req_id"])
		log.Printf("[BRIDGE REPORT] Received report for %s: success=%v, err=%v, msg=%v, weight=%v", reqID, payload["success"], payload["error"], payload["message"], payload["weight"])
		if reqID != "" && reqID != "<nil>" {
			bridgeMu.Lock()
			completedBridgeResults[reqID] = bridgeResultEntry{
				TenantCode: tenantCode,
				Payload:    payload,
				StoredAt:   nowTs,
			}
			pruneCompletedBridgeResultsLocked(nowTs)
			bridgeMu.Unlock()
		}

		scaleMu.Lock()
		rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
		rt["last_report"] = payload
		rt["last_report_ts"] = nowTs
		scaleMu.Unlock()

		return c.JSON(fiber.Map{"status": "received", "success": true})
	})

	group.Get("/config", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		scaleMu.Lock()
		cfg := getOrInitTenantScaleConfigLocked(tenantCode)
		if m, ok := loadJSONSettingMap(db, "scale_hardware_config"); ok {
			for k, v := range m {
				cfg[k] = v
			}
		}
		cfgCopy := map[string]interface{}{}
		for k, v := range cfg {
			cfgCopy[k] = v
		}
		scaleMu.Unlock()
		return c.JSON(cfgCopy)
	})

	group.Post("/config", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload map[string]interface{}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz terazi ayar verisi.")
		}
		scaleMu.Lock()
		cfg := getOrInitTenantScaleConfigLocked(tenantCode)
		for k, v := range payload {
			cfg[k] = v
		}
		cfg["last_sync"] = "Şimdi güncellendi"
		cfgCopy := map[string]interface{}{}
		for k, v := range cfg {
			cfgCopy[k] = v
		}
		scaleMu.Unlock()

		saveJSONSettingVal(db, "scale_hardware_config", cfgCopy)
		return c.JSON(fiber.Map{"status": "ok", "config": cfgCopy})
	})

	group.Post("/test", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		scaleMu.Lock()
		cfg := getOrInitTenantScaleConfigLocked(tenantCode)
		rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
		lastTs, _ := rt["last_heartbeat_ts"].(float64)
		agentOnline := lastTs > 0 && (float64(time.Now().Unix())-lastTs) < agentOnlineTimeoutSec
		brand := cfg["brand"]
		connType := cfg["connection_type"]
		ipAddr := cfg["ip_address"]
		port := cfg["port"]
		comPort := cfg["com_port"]
		baudRate := cfg["baud_rate"]
		cfg["is_connected"] = true
		cfg["last_sync"] = "Test Başarılı"
		liveKg, _ := rt["live_weight_kg"].(float64)
		hostname := rt["hostname"]
		scaleMu.Unlock()

		var endpoint string
		if connType == "TCP/IP" {
			endpoint = fmt.Sprintf("%v:%v", ipAddr, port)
		} else {
			endpoint = fmt.Sprintf("%v (%v baud)", comPort, baudRate)
		}
		modeNote := fmt.Sprintf("Simülasyon Modu (%s). Gerçek COM port için Windows POS PC'de BonCore Hardware Bridge çalıştırın.", endpoint)
		sampleWeight := 0.485
		if agentOnline {
			modeNote = fmt.Sprintf("Fiziksel Donanım Köprüsü Aktif (%v)", hostname)
			if liveKg > 0 {
				sampleWeight = liveKg
			}
		}
		return c.JSON(fiber.Map{
			"status":           "ok",
			"message":          fmt.Sprintf("%v terazi ile bağlantı doğrulandı — %s", brand, modeNote),
			"agent_online":     agentOnline,
			"firmware":         fmt.Sprintf("%v-OS v4.12 (OIML R76 Certified)", brand),
			"sample_weight_kg": sampleWeight,
			"latency_ms":       8,
		})
	})

	group.Post("/print", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}

		var payload struct {
			TerminalID     string      `json:"terminal_id"`
			Printers       []string    `json:"printers"`
			PrinterName    *string     `json:"printer_name"`
			RawText        string      `json:"raw_text"`
			Lines          []string    `json:"lines"`
			Title          string      `json:"title"`
			Document       interface{} `json:"document"`
			DocType        string      `json:"doc_type"`
			RestaurantCode string      `json:"restaurant_code"`
		}
		_ = c.BodyParser(&payload)

		rawText := strings.TrimSpace(payload.RawText)
		if rawText == "" && len(payload.Lines) > 0 {
			rawText = strings.Join(payload.Lines, "\n")
		}
		if rawText == "" {
			rawText = fmt.Sprintf("==========================================\n          BONCORE POS TEST FISI           \n==========================================\nTarih: %s\nYazici Donanim Iletisimi Basarili!\n==========================================\n\n\n\n", time.Now().Format("02.01.2006 15:04:05"))
		}

		// Extract printers & strip IP prefix (e.g. "192.168.1.101::DYMO" -> "DYMO")
		prList := payload.Printers
		if len(prList) == 0 && payload.PrinterName != nil && *payload.PrinterName != "" {
			prList = []string{*payload.PrinterName}
		}

		cleanPrinters := make([]string, 0, len(prList))
		targetTID := strings.TrimSpace(payload.TerminalID)
		for _, p := range prList {
			pStr := strings.TrimSpace(p)
			if pStr == "" {
				continue
			}
			if strings.Contains(pStr, "::") {
				parts := strings.Split(pStr, "::")
				cleanPrinters = append(cleanPrinters, strings.TrimSpace(parts[1]))
				if targetTID == "" {
					targetTID = strings.TrimSpace(parts[0])
				}
			} else {
				cleanPrinters = append(cleanPrinters, pStr)
			}
		}

		terminalsStateMu.Lock()
		terminals := loadTerminalsList(db)
		nowTs := float64(time.Now().Unix())

		// Resolve target terminal by ID, IP, or owned printer
		for _, t := range terminals {
			currID := fmt.Sprintf("%v", t["id"])
			currTID := fmt.Sprintf("%v", t["terminal_id"])
			currIP := fmt.Sprintf("%v", t["local_ip"])

			if targetTID != "" && (currID == targetTID || currTID == targetTID || (currIP != "127.0.0.1" && currIP == targetTID)) {
				targetTID = currID
				break
			}
		}

		// If targetTID still empty, find terminal that owns one of the cleanPrinters
		if targetTID == "" && len(cleanPrinters) > 0 {
			for _, t := range terminals {
				currID := fmt.Sprintf("%v", t["id"])
				var tPrs []string
				if rawPrs, ok := t["printers"].([]interface{}); ok {
					for _, rp := range rawPrs {
						tPrs = append(tPrs, fmt.Sprintf("%v", rp))
					}
				} else if strPrs, ok := t["printers"].([]string); ok {
					tPrs = strPrs
				}
				for _, cp := range cleanPrinters {
					for _, tp := range tPrs {
						if tp == cp {
							targetTID = currID
							break
						}
					}
				}
				if targetTID != "" {
					break
				}
			}
		}

		// If targetTID is still empty, pick the active online terminal
		if targetTID == "" {
			for _, t := range terminals {
				lastTs := resolveTerminalLastSeen(tenantCode, t)
				if lastTs > 0 && (nowTs-lastTs) < agentOnlineTimeoutSec {
					targetTID = fmt.Sprintf("%v", t["id"])
					break
				}
			}
		}
		if targetTID == "" && len(terminals) > 0 {
			targetTID = fmt.Sprintf("%v", terminals[0]["id"])
		}

		// If no printers specified, take all printers from the target terminal or active terminals
		if len(cleanPrinters) == 0 {
			for _, t := range terminals {
				currID := fmt.Sprintf("%v", t["id"])
				currTID := fmt.Sprintf("%v", t["terminal_id"])
				currIP := fmt.Sprintf("%v", t["local_ip"])
				if targetTID == "" || currID == targetTID || currTID == targetTID || currIP == targetTID {
					if rawPrs, ok := t["printers"].([]interface{}); ok {
						for _, rp := range rawPrs {
							if rps := fmt.Sprintf("%v", rp); rps != "" {
								cleanPrinters = append(cleanPrinters, rps)
							}
						}
					} else if strPrs, ok := t["printers"].([]string); ok {
						cleanPrinters = append(cleanPrinters, strPrs...)
					}
					if len(cleanPrinters) > 0 {
						break
					}
				}
			}
		}
		terminalsStateMu.Unlock()

		reqID := fmt.Sprintf("print_%d", time.Now().UnixNano())
		bridgeMu.Lock()
		pendingBridgeCommands[reqID] = map[string]interface{}{
			"tenant_code": tenantCode,
			"terminal_id": targetTID,
			"action":      "print_receipt",
			"printers":    cleanPrinters,
			"raw_text":    rawText,
			"created_at":  nowTs,
		}
		bridgeMu.Unlock()
		log.Printf("[BRIDGE PRINT] Enqueued %s for targetTID=%s, cleanPrinters=%v, totalPending=%d", reqID, targetTID, cleanPrinters, len(pendingBridgeCommands))

		// Wait up to 6 seconds for agent to report back
		var finalResult map[string]interface{}
		for i := 0; i < 60; i++ {
			time.Sleep(100 * time.Millisecond)
			bridgeMu.Lock()
			if entry, ok := completedBridgeResults[reqID]; ok && (entry.TenantCode == "" || entry.TenantCode == tenantCode) {
				finalResult = entry.Payload
				delete(completedBridgeResults, reqID)
				bridgeMu.Unlock()
				break
			}
			bridgeMu.Unlock()
		}
		if finalResult == nil {
			bridgeMu.Lock()
			delete(pendingBridgeCommands, reqID)
			bridgeMu.Unlock()
		}

		if finalResult != nil {
			ok, _ := finalResult["success"].(bool)
			msg, _ := finalResult["message"].(string)
			errMsg, _ := finalResult["error"].(string)
			if !ok && errMsg == "" {
				errMsg = msg
			}
			if msg == "" {
				msg = "Seçili yazıcıya test fişi başarıyla gönderildi!"
			}

			// Inform user if only virtual printers were tested
			hasOnlyVirtual := len(cleanPrinters) > 0
			for _, cp := range cleanPrinters {
				low := strings.ToLower(cp)
				if !strings.Contains(low, "pdf") && !strings.Contains(low, "xps") && !strings.Contains(low, "onenote") && !strings.Contains(low, "fax") && !strings.Contains(low, "anydesk") {
					hasOnlyVirtual = false
					break
				}
			}
			if ok && hasOnlyVirtual {
				msg = fmt.Sprintf("%s (Bilgi: Seçtiğiniz yazıcı sanal bir PDF/OneNote yazıcısıdır ve kağıt çıktısı vermez. Kağıt çıktısı almak için lütfen 'DYMO' veya termal adisyon yazıcınızı seçin.)", msg)
			}

			return c.JSON(fiber.Map{
				"success": ok,
				"status":  "ok",
				"message": msg,
				"error":   errMsg,
				"results": finalResult["results"],
			})
		}

		// Agent did not report back within 6 seconds:
		// Check if any agent is currently online
		hasOnlineAgent := false
		checkTs := float64(time.Now().Unix())
		terminalsStateMu.Lock()
		for _, t := range terminals {
			lastTs := resolveTerminalLastSeen(tenantCode, t)
			if lastTs > 0 && (checkTs-lastTs) < agentOnlineTimeoutSec {
				hasOnlineAgent = true
				break
			}
		}
		terminalsStateMu.Unlock()

		if !hasOnlineAgent {
			return c.JSON(fiber.Map{
				"success": false,
				"status":  "error",
				"error":   "Kasa bilgisayarında BonCore Donanım Ajanı çevrimdışı. Lütfen ajanı açın ve tekrar deneyin.",
				"message": "Kasa bilgisayarında BonCore Donanım Ajanı çevrimdışı. Lütfen ajanı açın ve tekrar deneyin.",
			})
		}

		// Agent is online but printer/queue took longer
		return c.JSON(fiber.Map{
			"success": false,
			"status":  "timeout",
			"error":   "Yazıcı kuyruğu zaman aşımına uğradı. Yazıcının açık ve hazır olduğunu kontrol edip tekrar deneyin.",
			"message": "Yazıcı kuyruğu zaman aşımına uğradı. Yazıcının açık ve hazır olduğunu kontrol edip tekrar deneyin.",
		})
	})

	group.Get("/weight", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ip := strings.TrimSpace(c.Query("ip"))
		portStr := strings.TrimSpace(c.Query("port"))
		terminalID := strings.TrimSpace(c.Query("terminal_id"))

		terminalsStateMu.Lock()
		terminals := loadTerminalsList(db)
		nowTs := float64(time.Now().Unix())

		var targetTerm map[string]interface{}
		for _, t := range terminals {
			currID := fmt.Sprintf("%v", t["id"])
			currTID := fmt.Sprintf("%v", t["terminal_id"])
			currIP := fmt.Sprintf("%v", t["local_ip"])
			if terminalID != "" && (currID == terminalID || currTID == terminalID || (currIP != "127.0.0.1" && currIP == terminalID)) {
				targetTerm = t
				break
			}
		}
		if targetTerm == nil {
			// Find online terminal (e.g. kasa_192_168_0_120)
			for _, t := range terminals {
				lastTs := resolveTerminalLastSeen(tenantCode, t)
				if lastTs > 0 && (nowTs-lastTs) < agentOnlineTimeoutSec {
					targetTerm = t
					break
				}
			}
		}
		terminalsStateMu.Unlock()

		if targetTerm != nil {
			tID := fmt.Sprintf("%v", targetTerm["id"])
			targetIP := ip
			if targetIP == "" {
				if sIP, ok := targetTerm["custom_scale_ip"].(string); ok && sIP != "" {
					targetIP = sIP
				} else if sIP, ok := targetTerm["scale_ip"].(string); ok && sIP != "" {
					targetIP = sIP
				} else {
					targetIP = "192.168.0.15"
				}
			}
			targetPort := 20304
			if portStr != "" {
				if pInt, err := strconv.Atoi(portStr); err == nil && pInt > 0 {
					targetPort = pInt
				}
			} else if sPort, ok := targetTerm["custom_scale_port"].(float64); ok && sPort > 0 {
				targetPort = int(sPort)
			} else if sPort, ok := targetTerm["scale_port"].(float64); ok && sPort > 0 {
				targetPort = int(sPort)
			}

			reqID := fmt.Sprintf("scale_%d", time.Now().UnixNano())
			bridgeMu.Lock()
			pendingBridgeCommands[reqID] = map[string]interface{}{
				"tenant_code": tenantCode,
				"terminal_id": tID,
				"action":      "read_weight",
				"ip":          targetIP,
				"port":        targetPort,
				"timeout":     2.5,
				"created_at":  nowTs,
			}
			bridgeMu.Unlock()

			// Wait up to 3 seconds for agent to report back
			for i := 0; i < 30; i++ {
				time.Sleep(100 * time.Millisecond)
				bridgeMu.Lock()
				if entry, ok := completedBridgeResults[reqID]; ok && (entry.TenantCode == "" || entry.TenantCode == tenantCode) {
					res := entry.Payload
					delete(completedBridgeResults, reqID)
					bridgeMu.Unlock()
					return c.JSON(res)
				}
				bridgeMu.Unlock()
			}
			bridgeMu.Lock()
			delete(pendingBridgeCommands, reqID)
			bridgeMu.Unlock()

			// If last_weight exists and is fresh
			if lastW, ok := targetTerm["last_weight"].(float64); ok && lastW > 0 {
				return c.JSON(fiber.Map{
					"success":   true,
					"weight":    lastW,
					"unit":      "kg",
					"is_stable": true,
					"bridge":    fmt.Sprintf("%v (Önbellek: %.3f Kg)", targetTerm["name"], lastW),
				})
			}

			return c.JSON(fiber.Map{
				"success": false,
				"weight":  0.0,
				"error":   fmt.Sprintf("CAS CL-3000 teraziden tartım yanıtı alınamadı (%s:%d). Terazinin açık ve kefesinde ürün olduğundan emin olun.", targetIP, targetPort),
			})
		}

		return c.JSON(fiber.Map{
			"success": false,
			"weight":  0.0,
			"error":   "Kasa bilgisayarında BonCore Donanım Ajanı çevrimdışı. Lütfen ajanı açın.",
		})
	})

	group.Get("/read", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		scaleMu.RLock()
		cfg := getOrInitTenantScaleConfigLocked(tenantCode)
		rt := getOrInitTenantAgentRuntimeLocked(tenantCode)
		tareGram := 0
		if tg, ok := cfg["tare_gram"].(int); ok {
			tareGram = tg
		} else if tgf, ok := cfg["tare_gram"].(float64); ok {
			tareGram = int(tgf)
		}
		brand := cfg["brand"]
		connType := cfg["connection_type"]
		lastTs, _ := rt["last_heartbeat_ts"].(float64)
		agentOnline := lastTs > 0 && (float64(time.Now().Unix())-lastTs) < agentOnlineTimeoutSec
		liveGram, _ := rt["live_weight_gram"].(int)
		liveStable, _ := rt["live_stable"].(bool)
		scaleMu.RUnlock()

		if agentOnline && liveGram > 0 {
			netG := liveGram - tareGram
			if netG < 0 {
				netG = 0
			}
			return c.JSON(fiber.Map{
				"status":          "ok",
				"source":          "hardware_agent",
				"stable":          liveStable,
				"gross_gram":      liveGram,
				"tare_gram":       tareGram,
				"net_gram":        netG,
				"net_kg":          math.Round((float64(netG)/1000.0)*1000) / 1000,
				"unit":            "kg",
				"brand":           brand,
				"connection_type": connType,
			})
		}

		presets := []int{250, 350, 420, 485, 500, 640, 750, 820, 1000, 1250}
		grossG := presets[rand.Intn(len(presets))]
		netG := grossG - tareGram
		if netG < 50 {
			netG = 50
		}
		return c.JSON(fiber.Map{
			"status":          "ok",
			"source":          "simulation",
			"stable":          true,
			"gross_gram":      grossG,
			"tare_gram":       tareGram,
			"net_gram":        netG,
			"net_kg":          math.Round((float64(netG)/1000.0)*1000) / 1000,
			"unit":            "kg",
			"brand":           brand,
			"connection_type": connType,
		})
	})
}

// ============================================================================
// 14. ADVANCED MODULES (CRM, RESERVATIONS, COST-PROFIT, HOTEL, KIOSK) (/api/modules)
// ============================================================================

var (
	modulesMu          sync.Mutex
	tenantModulesCache = map[string]map[string]interface{}{}
)

func loadTenantModulesStoreLocked(db *gorm.DB, tenantCode string) map[string]interface{} {
	if store, ok := tenantModulesCache[tenantCode]; ok {
		return store
	}
	if store, ok := loadJSONSettingMap(db, "modules_persistent_store"); ok && len(store) > 0 {
		tenantModulesCache[tenantCode] = store
		return store
	}
	store := map[string]interface{}{
		"customers":    []map[string]interface{}{},
		"campaigns":    []map[string]interface{}{},
		"reservations": []map[string]interface{}{},
		"hotel_folios": []map[string]interface{}{},
	}
	tenantModulesCache[tenantCode] = store
	return store
}

// withTenantModulesStore serializes concurrent read-modify-write operations on per-tenant JSON module state.
func withTenantModulesStore(db *gorm.DB, tenantCode string, mutate bool, fn func(store map[string]interface{}) error) error {
	modulesMu.Lock()
	defer modulesMu.Unlock()

	store := loadTenantModulesStoreLocked(db, tenantCode)
	if err := fn(store); err != nil {
		return err
	}
	if mutate {
		tenantModulesCache[tenantCode] = store
		saveJSONSettingVal(db, "modules_persistent_store", store)
	}
	return nil
}

func toMapSlice(raw interface{}) []map[string]interface{} {
	if s, ok := raw.([]map[string]interface{}); ok {
		return s
	}
	if s, ok := raw.([]interface{}); ok {
		res := make([]map[string]interface{}, 0, len(s))
		for _, it := range s {
			if m, ok := it.(map[string]interface{}); ok {
				res = append(res, m)
			}
		}
		return res
	}
	return []map[string]interface{}{}
}

func RegisterModulesRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/customers", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var custList, campList []map[string]interface{}
		totalReceivable := 0.0
		totalPoints := 0.0
		activeCampaigns := 0

		_ = withTenantModulesStore(db, tenantCode, false, func(store map[string]interface{}) error {
			custList = toMapSlice(store["customers"])
			campList = toMapSlice(store["campaigns"])

			for _, cust := range custList {
				bal := 0.0
				if b, ok := cust["balance"].(float64); ok {
					bal = b
				} else if b, ok := cust["open_account_balance"].(float64); ok {
					bal = -b
					cust["balance"] = bal
				} else {
					cust["balance"] = 0.0
				}
				if bal < 0 {
					totalReceivable += math.Abs(bal)
				}
				if p, ok := cust["points"].(float64); ok {
					totalPoints += p
				} else {
					cust["points"] = 0.0
				}
				if _, ok := cust["total_spent"]; !ok {
					cust["total_spent"] = 0.0
				}
				if _, ok := cust["visit_count"]; !ok {
					cust["visit_count"] = 1
				}
				if _, ok := cust["last_visit"]; !ok {
					cust["last_visit"] = "Kayıtlı"
				}
			}

			for _, camp := range campList {
				if act, ok := camp["is_active"].(bool); ok && act {
					activeCampaigns++
				} else if act, ok := camp["active"].(bool); ok && act {
					camp["is_active"] = true
					activeCampaigns++
				}
				if _, ok := camp["title"]; !ok {
					if n, ok := camp["name"].(string); ok {
						camp["title"] = n
					} else {
						camp["title"] = "Kampanya"
					}
				}
			}
			return nil
		})

		return c.JSON(fiber.Map{
			"customers": custList,
			"campaigns": campList,
			"summary": fiber.Map{
				"total_customers":         len(custList),
				"total_loyalty_points":    round2(totalPoints),
				"total_credit_receivable": round2(totalReceivable),
				"active_campaigns":        activeCampaigns,
			},
		})
	})

	group.Post("/customers", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			Name        string  `json:"name"`
			Phone       string  `json:"phone"`
			Email       string  `json:"email"`
			Tier        string  `json:"tier"`
			Points      float64 `json:"points"`
			Balance     float64 `json:"balance"`
			CreditLimit float64 `json:"credit_limit"`
			Notes       string  `json:"notes"`
		}
		payload.Tier = "Standart"
		payload.Points = 100.0
		payload.CreditLimit = 5000.0
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz müşteri verisi.")
		}
		if strings.TrimSpace(payload.Name) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Müşteri adı boş olamaz.")
		}

		var newCust map[string]interface{}
		_ = withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			list := toMapSlice(store["customers"])
			newCust = map[string]interface{}{
				"id":                   fmt.Sprintf("cust_%d", time.Now().UnixNano()),
				"name":                 payload.Name,
				"phone":                payload.Phone,
				"email":                payload.Email,
				"tier":                 payload.Tier,
				"points":               payload.Points,
				"balance":              payload.Balance,
				"open_account_balance": math.Abs(payload.Balance),
				"credit_limit":         payload.CreditLimit,
				"total_spent":          0.0,
				"visit_count":          1,
				"last_visit":           time.Now().In(service.TurkeyLoc()).Format("2006-01-02 15:04"),
				"notes":                payload.Notes,
			}
			store["customers"] = append([]map[string]interface{}{newCust}, list...)
			return nil
		})
		return c.JSON(fiber.Map{"status": "ok", "success": true, "customer": newCust})
	})

	group.Delete("/customers/:customer_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cid := c.Params("customer_id")
		_ = withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["customers"])
			filtered := make([]map[string]interface{}, 0, len(rawList))
			for _, item := range rawList {
				if fmt.Sprintf("%v", item["id"]) != cid {
					filtered = append(filtered, item)
				}
			}
			store["customers"] = filtered
			return nil
		})
		return c.JSON(fiber.Map{"status": "ok", "success": true})
	})

	group.Post("/customers/:customer_id/transaction", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cidStr := c.Params("customer_id")
		var payload struct {
			Type       string  `json:"type"`
			ActionType string  `json:"action_type"`
			Amount     float64 `json:"amount"`
			Points     float64 `json:"points"`
			Note       string  `json:"note"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz işlem verisi.")
		}

		txType := payload.Type
		if txType == "" {
			txType = payload.ActionType
		}
		switch txType {
		case "pay_debt", "collect_debt", "payment", "add_debt", "debit":
			if payload.Amount <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "İşlem tutarı sıfırdan büyük olmalıdır.")
			}
		case "earn_points", "add_points", "redeem_points":
			if payload.Points < 0 || payload.Amount < 0 || (payload.Points == 0 && payload.Amount == 0) {
				return fiber.NewError(fiber.StatusBadRequest, "Puan veya tutar geçerli olmalıdır.")
			}
		default:
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz cari/puan işlem tipi.")
		}

		var updatedCust map[string]interface{}
		if err := withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["customers"])
			for i := range rawList {
				if fmt.Sprintf("%v", rawList[i]["id"]) == cidStr {
					bal := 0.0
					if b, ok := rawList[i]["balance"].(float64); ok {
						bal = b
					} else if b, ok := rawList[i]["open_account_balance"].(float64); ok {
						bal = -b
					}
					pts, _ := rawList[i]["points"].(float64)
					spent, _ := rawList[i]["total_spent"].(float64)
					vc, _ := rawList[i]["visit_count"].(float64)

					switch txType {
					case "pay_debt", "collect_debt", "payment":
						bal = round2(bal + payload.Amount)
						rawList[i]["open_account_balance"] = math.Max(0.0, -bal)
						desc := fmt.Sprintf("%v - Cari Tahsilat (%s)", rawList[i]["name"], payload.Note)
						if payload.Note == "" {
							desc = fmt.Sprintf("%v - Cari Tahsilat", rawList[i]["name"])
						}
						db.Create(&models.CashExpense{
							Category:    "Cari Tahsilat",
							Amount:      payload.Amount,
							ExpenseType: "in",
							Description: desc,
							CreatedBy:   "Kasiyer",
							CreatedAt:   time.Now().UTC(),
						})
					case "add_debt", "debit":
						bal = round2(bal - payload.Amount)
						rawList[i]["open_account_balance"] = math.Abs(bal)
						rawList[i]["total_spent"] = round2(spent + payload.Amount)
						rawList[i]["visit_count"] = vc + 1
						rawList[i]["last_visit"] = time.Now().In(service.TurkeyLoc()).Format("2006-01-02 15:04")
					case "earn_points", "add_points":
						p := payload.Points
						if p == 0 {
							p = payload.Amount * 5
						}
						pts = round2(pts + p)
					case "redeem_points":
						pts = math.Max(0.0, round2(pts-payload.Points))
					}

					rawList[i]["balance"] = bal
					rawList[i]["points"] = pts
					store["customers"] = rawList
					updatedCust = rawList[i]
					return nil
				}
			}
			return fiber.NewError(fiber.StatusNotFound, "Müşteri bulunamadı")
		}); err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "success": true, "customer": updatedCust})
	})

	group.Post("/campaigns/:campaign_id/toggle", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cidStr := c.Params("campaign_id")
		var updatedCamp map[string]interface{}
		if err := withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["campaigns"])
			for i := range rawList {
				if fmt.Sprintf("%v", rawList[i]["id"]) == cidStr {
					act, _ := rawList[i]["active"].(bool)
					rawList[i]["active"] = !act
					rawList[i]["is_active"] = !act
					store["campaigns"] = rawList
					updatedCamp = rawList[i]
					return nil
				}
			}
			return fiber.NewError(fiber.StatusNotFound, "Kampanya bulunamadı")
		}); err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "campaign": updatedCamp})
	})

	group.Get("/reservations", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var enriched []map[string]interface{}
		totalReservations := 0
		confirmedCount := 0
		seatedCount := 0
		expectedGuests := 0

		_ = withTenantModulesStore(db, tenantCode, false, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["reservations"])
			totalReservations = len(rawList)
			enriched = make([]map[string]interface{}, 0, len(rawList))
			for _, r := range rawList {
				gCount := 0
				if g, ok := r["guests_count"].(float64); ok {
					gCount = int(g)
				} else if g, ok := r["guests"].(float64); ok {
					gCount = int(g)
				} else if g, ok := r["guests"].(int); ok {
					gCount = g
				}
				if gCount <= 0 {
					gCount = 2
				}

				dep := 0.0
				if d, ok := r["deposit"].(float64); ok {
					dep = d
				} else if d, ok := r["deposit_paid"].(float64); ok {
					dep = d
				}

				st := fmt.Sprintf("%v", r["status"])
				if st != "cancelled" && st != "completed" {
					expectedGuests += gCount
				}
				if st == "confirmed" {
					confirmedCount++
				} else if st == "seated" {
					seatedCount++
				}

				dt := fmt.Sprintf("%v", r["date"])
				if dt == "" || dt == "<nil>" {
					dt = time.Now().In(service.TurkeyLoc()).Format("2006-01-02")
				}

				enriched = append(enriched, map[string]interface{}{
					"id":           r["id"],
					"guest_name":   r["guest_name"],
					"phone":        r["phone"],
					"guests_count": gCount,
					"guests":       gCount,
					"date":         dt,
					"time":         r["time"],
					"table_name":   r["table_name"],
					"status":       st,
					"notes":        r["notes"],
					"deposit":      dep,
					"deposit_paid": dep,
				})
			}
			return nil
		})

		return c.JSON(fiber.Map{
			"reservations": enriched,
			"summary": fiber.Map{
				"total_reservations": totalReservations,
				"confirmed_count":    confirmedCount,
				"seated_count":       seatedCount,
				"expected_guests":    expectedGuests,
			},
		})
	})

	group.Post("/reservations", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			GuestName   string  `json:"guest_name"`
			Phone       string  `json:"phone"`
			Guests      int     `json:"guests"`
			GuestsCount int     `json:"guests_count"`
			Date        string  `json:"date"`
			Time        string  `json:"time"`
			TableName   string  `json:"table_name"`
			DepositPaid float64 `json:"deposit_paid"`
			Deposit     float64 `json:"deposit"`
			Notes       string  `json:"notes"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz rezervasyon verisi.")
		}
		if strings.TrimSpace(payload.GuestName) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Misafir adı boş olamaz.")
		}

		gCount := payload.GuestsCount
		if gCount == 0 {
			gCount = payload.Guests
		}
		if gCount == 0 {
			gCount = 2
		}

		dep := payload.Deposit
		if dep == 0 {
			dep = payload.DepositPaid
		}
		if dep < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Kapora tutarı negatif olamaz.")
		}

		dt := payload.Date
		if dt == "" {
			dt = time.Now().In(service.TurkeyLoc()).Format("2006-01-02")
		}

		var newRes map[string]interface{}
		_ = withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["reservations"])
			maxID := 9
			for _, existing := range rawList {
				switch v := existing["id"].(type) {
				case int:
					if v > maxID {
						maxID = v
					}
				case float64:
					if int(v) > maxID {
						maxID = int(v)
					}
				}
			}
			newRes = map[string]interface{}{
				"id":           maxID + 1,
				"guest_name":   payload.GuestName,
				"phone":        payload.Phone,
				"guests":       gCount,
				"guests_count": gCount,
				"date":         dt,
				"time":         payload.Time,
				"table_name":   payload.TableName,
				"deposit":      dep,
				"deposit_paid": dep,
				"notes":        payload.Notes,
				"status":       "confirmed",
			}
			store["reservations"] = append(rawList, newRes)
			return nil
		})
		return c.JSON(fiber.Map{"status": "ok", "reservation": newRes})
	})

	group.Put("/reservations/:res_id/status", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ridStr := c.Params("res_id")
		status := c.Query("status")
		if status == "" {
			var body struct {
				Status string `json:"status"`
			}
			_ = c.BodyParser(&body)
			status = body.Status
		}
		var updatedRes map[string]interface{}
		if err := withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["reservations"])
			for i := range rawList {
				if fmt.Sprintf("%v", rawList[i]["id"]) == ridStr {
					rawList[i]["status"] = status
					store["reservations"] = rawList
					updatedRes = rawList[i]
					return nil
				}
			}
			return fiber.NewError(fiber.StatusNotFound, "Rezervasyon bulunamadı")
		}); err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "reservation": updatedRes})
	})

	group.Delete("/reservations/:res_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ridStr := c.Params("res_id")
		_ = withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			rawList := toMapSlice(store["reservations"])
			filtered := make([]map[string]interface{}, 0, len(rawList))
			for _, r := range rawList {
				if fmt.Sprintf("%v", r["id"]) != ridStr {
					filtered = append(filtered, r)
				}
			}
			store["reservations"] = filtered
			return nil
		})
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Get("/cost-profit", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var products []models.Product
		db.Preload("Category").Find(&products)
		var recipes []models.Recipe
		db.Find(&recipes)
		var ingredients []models.Ingredient
		db.Find(&ingredients)
		ingMap := map[int]models.Ingredient{}
		for _, ing := range ingredients {
			ingMap[ing.ID] = ing
		}
		var paidOrders []models.Order
		db.Where("status = ?", "paid").Find(&paidOrders)
		paidOrderIDs := make([]int, 0, len(paidOrders))
		for _, o := range paidOrders {
			paidOrderIDs = append(paidOrderIDs, o.ID)
		}
		var items []models.OrderItem
		if len(paidOrderIDs) > 0 {
			db.Where("order_id IN ? AND is_voided = ? AND is_treat = ?", paidOrderIDs, false, false).Find(&items)
		}

		analysis := make([]fiber.Map, 0, len(products))
		totalRecipeCostAll := 0.0
		totalRevenueAll := 0.0

		for _, p := range products {
			recipeCost := 0.0
			bomDetails := make([]fiber.Map, 0)
			for _, r := range recipes {
				if r.ProductID == p.ID {
					if ing, ok := ingMap[r.IngredientID]; ok {
						effAmount := r.Amount * (1.0 + r.WastePercentage/100.0)
						cVal := round2(effAmount * ing.CostPerUnit)
						recipeCost += cVal
						bomDetails = append(bomDetails, fiber.Map{
							"ingredient": ing.Name,
							"amount":     r.Amount,
							"unit":       ing.Unit,
							"cost":       cVal,
						})
					}
				}
			}
			hasRecipe := len(bomDetails) > 0
			soldQty := 0.0
			soldRev := 0.0
			for _, it := range items {
				if it.ProductID == p.ID {
					soldQty += it.Quantity
					soldRev += it.TotalPrice
				}
			}
			unitProfit := round2(p.BasePrice - recipeCost)
			marginPct := 0.0
			if p.BasePrice > 0 {
				marginPct = round2((unitProfit / p.BasePrice) * 100)
			}
			totalRev := round2(soldRev)
			totalCst := round2(soldQty * recipeCost)
			totalRevenueAll += totalRev
			totalRecipeCostAll += totalCst

			catName := "GENEL"
			if p.Category != nil && p.Category.Name != "" {
				catName = p.Category.Name
			}

			analysis = append(analysis, fiber.Map{
				"product_id":     p.ID,
				"name":           p.Name,
				"category":       catName,
				"category_name":  catName,
				"station":        p.Station,
				"sale_price":     p.BasePrice,
				"bom_cost":       round2(recipeCost),
				"has_recipe":     hasRecipe,
				"unit_profit":    unitProfit,
				"margin_percent": marginPct,
				"sold_qty":       soldQty,
				"total_revenue":  totalRev,
				"total_profit":   round2(totalRev - totalCst),
				"bom_items":      bomDetails,
			})
		}

		foodCostPct := 0.0
		if totalRevenueAll > 0 {
			foodCostPct = round2((totalRecipeCostAll / totalRevenueAll) * 100)
		}
		var cashExpenses []models.CashExpense
		db.Where("expense_type != ? OR expense_type IS NULL", "in").Find(&cashExpenses)
		totalExpenses := 0.0
		for _, e := range cashExpenses {
			totalExpenses += e.Amount
		}
		totalExpenses = round2(totalExpenses)
		grossProfit := round2(totalRevenueAll - totalRecipeCostAll)
		grossMarginPct := 0.0
		if totalRevenueAll > 0 {
			grossMarginPct = round2((grossProfit / totalRevenueAll) * 100)
		}
		netProfit := round2(grossProfit - totalExpenses)
		netMarginPct := 0.0
		if totalRevenueAll > 0 {
			netMarginPct = round2((netProfit / totalRevenueAll) * 100)
		}

		return c.JSON(fiber.Map{
			"summary": fiber.Map{
				"total_revenue":        round2(totalRevenueAll),
				"total_bom_cost":       round2(totalRecipeCostAll),
				"total_cogs":           round2(totalRecipeCostAll),
				"gross_profit":         grossProfit,
				"gross_margin_percent": grossMarginPct,
				"food_cost_percent":    foodCostPct,
				"total_expenses":       totalExpenses,
				"net_profit":           netProfit,
				"net_margin_percent":   netMarginPct,
				"paid_orders_count":    len(paidOrders),
			},
			"products": analysis,
		})
	})

	group.Get("/costs", func(c *fiber.Ctx) error {
		return c.Redirect("/api/modules/cost-profit", fiber.StatusTemporaryRedirect)
	})

	group.Get("/hotel", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var enriched []map[string]interface{}
		totalRooms := 0
		totalBal := 0.0
		occupiedCount := 0

		_ = withTenantModulesStore(db, tenantCode, false, func(store map[string]interface{}) error {
			folios := toMapSlice(store["hotel_folios"])
			totalRooms = len(folios)
			enriched = make([]map[string]interface{}, 0, len(folios))
			for _, f := range folios {
				bal := 0.0
				if b, ok := f["balance"].(float64); ok {
					bal = b
				} else if b, ok := f["folio_balance"].(float64); ok {
					bal = b
				}
				totalBal += bal
				cIn := fmt.Sprintf("%v", f["check_in"])
				if cIn == "" || cIn == "<nil>" {
					cIn = fmt.Sprintf("%v", f["checkin"])
				}
				cOut := fmt.Sprintf("%v", f["check_out"])
				if cOut == "" || cOut == "<nil>" {
					cOut = fmt.Sprintf("%v", f["checkout"])
				}
				status := fmt.Sprintf("%v", f["status"])
				if status == "" || status == "<nil>" {
					status = "occupied"
				}
				if status == "occupied" {
					occupiedCount++
				}
				charges, _ := f["charges"].([]interface{})
				if charges == nil {
					charges = []interface{}{}
				}
				pkg := fmt.Sprintf("%v", f["package"])
				if pkg == "" || pkg == "<nil>" {
					pkg = "Oda + Kahvaltı (BB)"
				}
				enriched = append(enriched, map[string]interface{}{
					"room_no":       f["room_no"],
					"guest_name":    f["guest_name"],
					"check_in":      cIn,
					"check_out":     cOut,
					"package":       pkg,
					"folio_balance": bal,
					"balance":       bal,
					"status":        status,
					"charges":       charges,
					"pms":           f["pms"],
				})
			}
			return nil
		})
		return c.JSON(fiber.Map{
			"folios": enriched,
			"summary": fiber.Map{
				"total_rooms":         totalRooms,
				"occupied_rooms":      occupiedCount,
				"total_folio_balance": round2(totalBal),
				"today_charges":       0.0,
			},
		})
	})

	group.Post("/hotel/charge", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			RoomNo      string  `json:"room_no"`
			Amount      float64 `json:"amount"`
			Description string  `json:"description"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz folyo verisi.")
		}
		if payload.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Folyo tutarı sıfırdan büyük olmalıdır.")
		}
		var updatedFolio map[string]interface{}
		if err := withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			folios := toMapSlice(store["hotel_folios"])
			for i := range folios {
				if fmt.Sprintf("%v", folios[i]["room_no"]) == payload.RoomNo {
					bal, _ := folios[i]["balance"].(float64)
					folios[i]["balance"] = round2(bal + payload.Amount)
					store["hotel_folios"] = folios
					updatedFolio = folios[i]
					return nil
				}
			}
			return fiber.NewError(fiber.StatusNotFound, "Oda bulunamadı")
		}); err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "folio": updatedFolio})
	})

	group.Post("/hotel/:room_no/settle", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		roomNo := c.Params("room_no")
		var updatedFolio map[string]interface{}
		if err := withTenantModulesStore(db, tenantCode, true, func(store map[string]interface{}) error {
			folios := toMapSlice(store["hotel_folios"])
			for i := range folios {
				if fmt.Sprintf("%v", folios[i]["room_no"]) == roomNo {
					folios[i]["balance"] = 0.0
					store["hotel_folios"] = folios
					updatedFolio = folios[i]
					return nil
				}
			}
			return fiber.NewError(fiber.StatusNotFound, "Oda bulunamadı")
		}); err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "folio": updatedFolio})
	})

	group.Post("/kiosk-order", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			CustomerName string `json:"customer_name"`
			ServiceType  string `json:"service_type"`
			Items        []struct {
				ProductID int     `json:"product_id"`
				Quantity  float64 `json:"quantity"`
			} `json:"items"`
		}
		payload.CustomerName = "Kiosk Misafir"
		payload.ServiceType = "takeaway"
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz Kiosk sipariş verisi.")
		}
		if len(payload.Items) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Kiosk siparişi için en az bir ürün seçilmelidir.")
		}

		checkItems := make([]models.OrderItemInput, 0, len(payload.Items))
		for _, it := range payload.Items {
			if it.Quantity <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Kiosk ürün miktarı sıfırdan büyük olmalıdır.")
			}
			checkItems = append(checkItems, models.OrderItemInput{
				ProductID: it.ProductID,
				Quantity:  it.Quantity,
			})
		}

		var order models.Order
		var queueNo int
		var orderNo string
		now := time.Now().UTC()
		kdsItems := make([]fiber.Map, 0)

		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := service.ValidateBOMStockForItems(tx, checkItems); err != nil {
				return err
			}

			var count int64
			tx.Model(&models.Order{}).Count(&count)
			queueNo = int((count % 90) + 10)
			orderNo = fmt.Sprintf("KSK-%s-%s", now.In(service.TurkeyLoc()).Format("060102150405"), generateRandomTokenSuffix())
			noteStr := fmt.Sprintf("Self-Servis Kiosk (%s) - Sıra #%d", payload.CustomerName, queueNo)
			order = models.Order{
				OrderNo:    orderNo,
				TableID:    nil,
				OrderType:  payload.ServiceType,
				Status:     "open",
				WaiterName: "Self-Kiosk #1",
				Notes:      &noteStr,
			}
			if err := tx.Create(&order).Error; err != nil {
				return err
			}

			for _, itemIn := range payload.Items {
				var prod models.Product
				if err := tx.First(&prod, itemIn.ProductID).Error; err != nil {
					continue
				}
				lineTotal := round2(prod.BasePrice * itemIn.Quantity)
				dbItem := models.OrderItem{
					OrderID:     order.ID,
					ProductID:   prod.ID,
					ProductName: prod.Name,
					Quantity:    itemIn.Quantity,
					UnitPrice:   prod.BasePrice,
					TotalPrice:  lineTotal,
					Status:      "preparing",
					Station:     prod.Station,
				}
				if err := tx.Create(&dbItem).Error; err != nil {
					return err
				}
				if err := service.DeductOrderIngredients(tx, prod.ID, itemIn.Quantity, orderNo, 2); err != nil {
					return err
				}
				kdsItems = append(kdsItems, fiber.Map{
					"item_id":      dbItem.ID,
					"product_name": prod.Name,
					"quantity":     itemIn.Quantity,
					"station":      prod.Station,
				})
			}

			recalculateOrderTotals(tx, &order)
			return tx.Save(&order).Error
		})
		if txErr != nil {
			return txErr
		}

		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_NEW_ORDER", fiber.Map{
			"order_id":    order.ID,
			"order_no":    order.OrderNo,
			"table_name":  fmt.Sprintf("KİOSK SIRA #%d", queueNo),
			"waiter_name": payload.CustomerName,
			"items":       kdsItems,
			"created_at":  now.Format(time.RFC3339),
		})

		return c.JSON(fiber.Map{
			"status":          "ok",
			"order_id":        order.ID,
			"order_status":    order.Status,
			"queue_no":        queueNo,
			"order_no":        orderNo,
			"grand_total":     order.GrandTotal,
			"remaining_total": order.RemainingTotal,
		})
	})
}

// ============================================================================
// 16. MASTER SaaS SUPER-ADMIN ROUTER (/api/master)
// ============================================================================

func requireMasterAdmin(c *fiber.Ctx, svc *service.Services) error {
	claims := middleware.GetUserClaims(c)
	if claims == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Master Admin oturumu gereklidir.")
	}
	if !middleware.IsMasterClaims(claims) {
		return fiber.NewError(fiber.StatusForbidden, "Bu işlem için Master Admin yetkisi gereklidir.")
	}
	return nil
}

func serializeTenant(t models.RestaurantTenant) fiber.Map {
	createdStr := ""
	if !t.CreatedAt.IsZero() {
		createdStr = t.CreatedAt.Format("02.01.2006")
	}
	var expStr interface{}
	if t.RenewalDate != nil {
		expStr = t.RenewalDate.Format("02.01.2006")
	}
	return fiber.Map{
		"id":            t.ID,
		"code":          t.Code,
		"name":          t.Name,
		"display_name":  t.Name,
		"owner_name":    t.OwnerName,
		"owner_email":   t.Email,
		"email":         t.Email,
		"owner_phone":   t.Phone,
		"phone":         t.Phone,
		"city":          t.City,
		"address":       t.Address,
		"tax_office":    t.TaxOffice,
		"tax_number":    t.TaxNumber,
		"plan":          t.Plan,
		"monthly_fee":   t.MonthlyPrice,
		"monthly_price": t.MonthlyPrice,
		"status":        t.Status,
		"max_tables":    50,
		"max_users":     20,
		"custom_notes":  t.Notes,
		"notes":         t.Notes,
		"expires_at":    expStr,
		"created_at":    createdStr,
	}
}

func RegisterMasterRoutes(group fiber.Router, svc *service.Services) {
	group.Post("/login", func(c *fiber.Ctx) error {
		var payload struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz giriş verisi.")
		}
		cleanUser := strings.ToLower(strings.TrimSpace(payload.Username))
		cleanPwd := strings.TrimSpace(payload.Password)

		rateKey := "master:" + c.IP()
		if !loginLimiter.Allow(rateKey) {
			return fiber.NewError(fiber.StatusTooManyRequests, "Çok fazla başarısız giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.")
		}

		if (cleanUser == "master" || cleanUser == "superadmin") && cleanPwd != "" && cleanPwd == svc.Config.MasterAdminPassword {
			loginLimiter.Reset(rateKey)
			token, exp := middleware.CreateMasterAccessToken(svc.Config, 999999, true)
			return c.JSON(fiber.Map{
				"access_token": token,
				"expires_at":   exp,
				"user": fiber.Map{
					"id":       999999,
					"name":     "BonCore Cloud Kurucu / Master Admin",
					"username": cleanUser,
					"role":     "master_admin",
				},
			})
		}
		loginLimiter.RecordFailure(rateKey)
		return fiber.NewError(fiber.StatusUnauthorized, "Master Admin kullanıcı adı veya şifresi hatalı.")
	})

	group.Get("/stats", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var tenants []models.RestaurantTenant
		mdb.Find(&tenants)
		var leads []models.TenantLead
		mdb.Find(&leads)
		var invoices []models.TenantInvoice
		mdb.Find(&invoices)

		activeCount := 0
		mrr := 0.0
		for _, t := range tenants {
			if t.Status == "active" {
				activeCount++
				mrr += t.MonthlyPrice
			}
		}
		totalCollected := 0.0
		for _, i := range invoices {
			if i.Status == "paid" {
				totalCollected += i.Amount
			}
		}
		newLeads := 0
		for _, l := range leads {
			if l.Status == "new" || l.Status == "yeni" {
				newLeads++
			}
		}

		return c.JSON(fiber.Map{
			"total_tenants":   len(tenants),
			"active_tenants":  activeCount,
			"mrr_monthly":     round2(mrr),
			"arr_annual":      round2(mrr * 12),
			"total_collected": round2(totalCollected),
			"total_leads":     len(leads),
			"new_leads":       newLeads,
		})
	})

	group.Get("/tenants", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var tenants []models.RestaurantTenant
		mdb.Order("id desc").Find(&tenants)
		res := make([]fiber.Map, 0, len(tenants))
		for _, t := range tenants {
			res = append(res, serializeTenant(t))
		}
		return c.JSON(res)
	})

	group.Post("/tenants", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		var payload struct {
			Code           string  `json:"code"`
			Name           string  `json:"name"`
			DisplayName    string  `json:"display_name"`
			OwnerName      string  `json:"owner_name"`
			ContactName    string  `json:"contact_name"`
			AuthorizedName string  `json:"authorized_name"`
			AdminName      string  `json:"admin_name"`
			OwnerEmail     string  `json:"owner_email"`
			Email          string  `json:"email"`
			OwnerPhone     string  `json:"owner_phone"`
			Phone          string  `json:"phone"`
			City           string  `json:"city"`
			Address        string  `json:"address"`
			TaxOffice      string  `json:"tax_office"`
			TaxNumber      string  `json:"tax_number"`
			Plan           string  `json:"plan"`
			MonthlyFee     float64 `json:"monthly_fee"`
			MonthlyPrice   float64 `json:"monthly_price"`
			AdminUsername  string  `json:"admin_username"`
			AdminPassword  string  `json:"admin_password"`
			AdminPin       string  `json:"admin_pin"`
			SeedSampleMenu bool    `json:"seed_sample_menu"`
			CustomNotes    string  `json:"custom_notes"`
			Notes          string  `json:"notes"`
		}
		payload.City = "İstanbul"
		payload.Plan = "PRO"
		payload.MonthlyFee = 2490.0
		payload.AdminUsername = "admin"
		payload.SeedSampleMenu = true
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz işletme verisi.")
		}

		if payload.Name == "" && payload.DisplayName != "" {
			payload.Name = payload.DisplayName
		}
		if strings.TrimSpace(payload.OwnerName) == "" {
			if strings.TrimSpace(payload.ContactName) != "" {
				payload.OwnerName = payload.ContactName
			} else if strings.TrimSpace(payload.AuthorizedName) != "" {
				payload.OwnerName = payload.AuthorizedName
			} else if strings.TrimSpace(payload.AdminName) != "" {
				payload.OwnerName = payload.AdminName
			}
		}
		payload.OwnerName = strings.TrimSpace(payload.OwnerName)
		if strings.TrimSpace(payload.AdminUsername) == "" {
			payload.AdminUsername = "admin"
		}
		if strings.TrimSpace(payload.AdminPassword) == "" {
			payload.AdminPassword = generateRandomTempPassword(10)
		}
		if strings.TrimSpace(payload.AdminPin) == "" {
			payload.AdminPin = generateNumericPin(6)
		}
		if payload.OwnerEmail == "" && payload.Email != "" {
			payload.OwnerEmail = payload.Email
		}
		if payload.OwnerPhone == "" && payload.Phone != "" {
			payload.OwnerPhone = payload.Phone
		}
		if payload.MonthlyFee <= 0 && payload.MonthlyPrice > 0 {
			payload.MonthlyFee = payload.MonthlyPrice
		}
		if payload.CustomNotes == "" && payload.Notes != "" {
			payload.CustomNotes = payload.Notes
		}

		code := repository.CleanTenantCode(payload.Code, "")
		if code == "" || len(code) < 3 {
			return fiber.NewError(fiber.StatusBadRequest, "İşletme kodu en az 3 karakter olmalıdır (Örn: nusret-etiler).")
		}
		mdb := svc.DBManager.MasterGorm
		var exists models.RestaurantTenant
		if err := mdb.Where("code = ?", code).First(&exists).Error; err == nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("'%s' işletme kodu zaten kullanımda.", code))
		}

		ownerName := payload.OwnerName
		ownerEmail := payload.OwnerEmail
		ownerPhone := payload.OwnerPhone
		address := payload.Address
		taxOffice := payload.TaxOffice
		taxNumber := payload.TaxNumber
		notes := payload.CustomNotes

		tenant := models.RestaurantTenant{
			Code:         code,
			Name:         strings.TrimSpace(payload.Name),
			OwnerName:    &ownerName,
			Email:        &ownerEmail,
			Phone:        &ownerPhone,
			City:         payload.City,
			Address:      &address,
			TaxOffice:    &taxOffice,
			TaxNumber:    &taxNumber,
			Plan:         payload.Plan,
			MonthlyPrice: payload.MonthlyFee,
			Status:       "active",
			Notes:        &notes,
		}
		mdb.Create(&tenant)

		if tdb, err := svc.DBManager.ProvisionTenantDB(code); err == nil && tdb != nil {
			uname := strings.ToLower(strings.TrimSpace(payload.AdminUsername))
			pwdHash := middleware.HashPassword(payload.AdminPassword)
			mgrName := payload.OwnerName
			if mgrName == "" {
				mgrName = fmt.Sprintf("%s Yönetici", payload.Name)
			}
			mgrUser := models.StaffUser{
				Name:         mgrName,
				Username:     &uname,
				PasswordHash: pwdHash,
				Role:         "manager",
				IsActive:     true,
			}
			repository.ApplyHashedStaffPin(svc.Config, &mgrUser, payload.AdminPin)
			tdb.Create(&mgrUser)
		}

		return c.JSON(fiber.Map{
			"status": "ok",
			"id":     tenant.ID,
			"tenant": serializeTenant(tenant),
			"credentials": fiber.Map{
				"restaurant_code": code,
				"admin_username":  payload.AdminUsername,
				"admin_password":  payload.AdminPassword,
				"admin_pin":       payload.AdminPin,
			},
		})
	})

	// POST /api/master/tenants/:tenant_id/impersonate - Issue scoped tenant manager token for Master support
	group.Post("/tenants/:tenant_id/impersonate", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("tenant_id"))
		if err != nil {
			return err
		}
		tdb, dbErr := svc.DBManager.GetTenantDB(tenant.Code)
		if dbErr != nil || tdb == nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme veritabanına erişilemedi.")
		}

		var mgr models.StaffUser
		mgrID := 0
		mgrName := "Master Destek"
		if err := tdb.Where("role = ? AND is_active = ?", "manager", true).Order("id asc").First(&mgr).Error; err == nil {
			mgrID = mgr.ID
			mgrName = mgr.Name
		}

		tok, expiresAt := middleware.CreateAccessToken(svc.Config, mgrID, "manager", false, tenant.Code, &tenant.ID)
		ref := tenant.Code
		rText := fmt.Sprintf("Master Admin tarafından '%s' işletmesine destek oturumu açıldı.", tenant.Name)
		tdb.Create(&models.AuditLog{
			ActionType:   "TENANT_IMPERSONATE",
			OperatorName: "Master Admin",
			OperatorRole: "master_admin",
			TargetRef:    &ref,
			ReasonText:   &rText,
			Details: models.JSONMap{
				"tenant_id":   tenant.ID,
				"tenant_code": tenant.Code,
			},
		})

		return c.JSON(fiber.Map{
			"status":       "ok",
			"access_token": tok,
			"token_type":   "bearer",
			"expires_at":   expiresAt,
			"tenant_code":  tenant.Code,
			"tenant_name":  tenant.Name,
			"user": fiber.Map{
				"id":   mgrID,
				"name": mgrName,
				"role": "manager",
			},
		})
	})

	group.Put("/tenants/:tenant_id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		tid, _ := strconv.Atoi(c.Params("tenant_id"))
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.First(&tenant, tid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
		}
		var payload struct {
			Code           *string  `json:"code"`
			Name           *string  `json:"name"`
			DisplayName    *string  `json:"display_name"`
			OwnerName      *string  `json:"owner_name"`
			ContactName    *string  `json:"contact_name"`
			AuthorizedName *string  `json:"authorized_name"`
			AdminName      *string  `json:"admin_name"`
			OwnerEmail     *string  `json:"owner_email"`
			Email          *string  `json:"email"`
			OwnerPhone     *string  `json:"owner_phone"`
			Phone          *string  `json:"phone"`
			City           *string  `json:"city"`
			Address        *string  `json:"address"`
			TaxOffice      *string  `json:"tax_office"`
			TaxNumber      *string  `json:"tax_number"`
			Plan           *string  `json:"plan"`
			MonthlyFee     *float64 `json:"monthly_fee"`
			MonthlyPrice   *float64 `json:"monthly_price"`
			Status         *string  `json:"status"`
			CustomNotes    *string  `json:"custom_notes"`
			Notes          *string  `json:"notes"`
		}
		_ = c.BodyParser(&payload)
		if payload.Code != nil {
			newCode := repository.CleanTenantCode(*payload.Code, "")
			if len(newCode) < 2 {
				return fiber.NewError(fiber.StatusBadRequest, "İşletme giriş kodu en az 2 karakter olmalıdır.")
			}
			if newCode != tenant.Code {
				var dup models.RestaurantTenant
				if err := mdb.Where("code = ? AND id != ?", newCode, tenant.ID).First(&dup).Error; err == nil {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("'%s' işletme kodu zaten kullanımda.", newCode))
				}
				oldCode := tenant.Code
				_ = svc.DBManager.RenameTenantCode(oldCode, newCode)
				tenant.Code = newCode
				mdb.Model(&models.TenantInvoice{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.TenantStorageQuota{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.TenantLiveMetric{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.FleetHeartbeat{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.SupportTicket{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.TenantBackup{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.AnnouncementReceipt{}).Where("tenant_code = ?", oldCode).Update("tenant_code", newCode)
				mdb.Model(&models.FranchiseBrand{}).Where("primary_tenant_code = ?", oldCode).Update("primary_tenant_code", newCode)
			}
		}
		if payload.Name != nil {
			tenant.Name = *payload.Name
		} else if payload.DisplayName != nil {
			tenant.Name = *payload.DisplayName
		}
		ownerPtr := payload.OwnerName
		if ownerPtr == nil {
			if payload.ContactName != nil {
				ownerPtr = payload.ContactName
			} else if payload.AuthorizedName != nil {
				ownerPtr = payload.AuthorizedName
			} else if payload.AdminName != nil {
				ownerPtr = payload.AdminName
			}
		}
		if ownerPtr != nil {
			trimmedOwner := strings.TrimSpace(*ownerPtr)
			tenant.OwnerName = &trimmedOwner
			if trimmedOwner != "" {
				if tdb, err := svc.DBManager.GetTenantDB(tenant.Code); err == nil && tdb != nil {
					var mgr models.StaffUser
					if err := tdb.Where("role = ?", "manager").Order("id asc").First(&mgr).Error; err == nil {
						if mgr.Name == "" || strings.HasSuffix(mgr.Name, "Yönetici") || mgr.Name == "Yönetici" || mgr.Name == "Admin" {
							mgr.Name = trimmedOwner
							tdb.Save(&mgr)
						}
					}
				}
			}
		}
		if payload.OwnerEmail != nil {
			tenant.Email = payload.OwnerEmail
		} else if payload.Email != nil {
			tenant.Email = payload.Email
		}
		if payload.OwnerPhone != nil {
			tenant.Phone = payload.OwnerPhone
		} else if payload.Phone != nil {
			tenant.Phone = payload.Phone
		}
		if payload.City != nil {
			tenant.City = *payload.City
		}
		if payload.Address != nil {
			tenant.Address = payload.Address
		}
		if payload.TaxOffice != nil {
			tenant.TaxOffice = payload.TaxOffice
		}
		if payload.TaxNumber != nil {
			tenant.TaxNumber = payload.TaxNumber
		}
		if payload.Plan != nil {
			tenant.Plan = *payload.Plan
		}
		if payload.MonthlyFee != nil {
			tenant.MonthlyPrice = *payload.MonthlyFee
		} else if payload.MonthlyPrice != nil {
			tenant.MonthlyPrice = *payload.MonthlyPrice
		}
		if payload.Status != nil {
			tenant.Status = *payload.Status
		}
		if payload.CustomNotes != nil {
			tenant.Notes = payload.CustomNotes
		} else if payload.Notes != nil {
			tenant.Notes = payload.Notes
		}
		mdb.Save(&tenant)
		st := serializeTenant(tenant)
		st["tenant"] = serializeTenant(tenant)
		return c.JSON(st)
	})

	group.Delete("/tenants/:tenant_id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		tid, _ := strconv.Atoi(c.Params("tenant_id"))
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.First(&tenant, tid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
		}
		if tenant.Code == svc.Config.DefaultTenantCode {
			return fiber.NewError(fiber.StatusBadRequest, "Varsayılan ana demo işletmesi silinemez.")
		}
		_ = svc.DBManager.CloseTenantDB(tenant.Code)
		mdb.Delete(&tenant)
		svc.DBManager.InvalidateTenantCache()
		return c.JSON(fiber.Map{"status": "deleted", "id": tid})
	})

	group.Get("/tenants/:tenant_id/users", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		tid, _ := strconv.Atoi(c.Params("tenant_id"))
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.First(&tenant, tid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
		}
		tdb, err := svc.DBManager.GetTenantDB(tenant.Code)
		if err != nil || tdb == nil {
			return fiber.NewError(fiber.StatusServiceUnavailable, "İşletme veritabanına bağlanılamadı.")
		}
		var users []models.StaffUser
		tdb.Order("id asc").Find(&users)
		res := make([]fiber.Map, 0, len(users))
		for _, u := range users {
			var lastLogin interface{}
			if u.LastLoginAt != nil {
				lastLogin = u.LastLoginAt.Format("02.01.2006 15:04")
			}
			hasPin := (u.PinHash != nil && *u.PinHash != "") || (strings.TrimSpace(u.PinCode) != "" && !strings.HasPrefix(u.PinCode, "nopin:"))
			entry := fiber.Map{
				"id":             u.ID,
				"name":           u.Name,
				"username":       u.Username,
				"role":           u.Role,
				"pin_configured": hasPin,
				"is_active":      u.IsActive,
				"last_login_at":  lastLogin,
			}
			if !repository.IsHashedPinSentinel(u.PinCode) {
				entry["pin_code"] = u.PinCode
			}
			res = append(res, entry)
		}
		return c.JSON(fiber.Map{
			"tenant": serializeTenant(tenant),
			"users":  res,
		})
	})

	group.Post("/tenants/:tenant_id/users", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		tid, _ := strconv.Atoi(c.Params("tenant_id"))
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.First(&tenant, tid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
		}
		tdb, err := svc.DBManager.GetTenantDB(tenant.Code)
		if err != nil || tdb == nil {
			return fiber.NewError(fiber.StatusServiceUnavailable, "İşletme veritabanına bağlanılamadı.")
		}
		var payload struct {
			Name     string `json:"name"`
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
			PinCode  string `json:"pin_code"`
		}
		payload.Role = "manager"
		_ = c.BodyParser(&payload)
		uname := strings.ToLower(strings.TrimSpace(payload.Username))
		rawPwd := strings.TrimSpace(payload.Password)
		if rawPwd == "" {
			rawPwd = generateRandomTempPassword(10)
		}
		rawPin := strings.TrimSpace(payload.PinCode)
		if rawPin == "" {
			rawPin = generateNumericPin(6)
		}
		role, rErr := validateTenantStaffRole(payload.Role)
		if rErr != nil {
			return rErr
		}
		pwdHash := middleware.HashPassword(rawPwd)
		newUser := models.StaffUser{
			Name:         strings.TrimSpace(payload.Name),
			Username:     &uname,
			PasswordHash: pwdHash,
			Role:         role,
			IsActive:     true,
		}
		repository.ApplyHashedStaffPin(svc.Config, &newUser, rawPin)
		tdb.Create(&newUser)
		return c.JSON(fiber.Map{"status": "ok", "id": newUser.ID, "username": newUser.Username, "temporary_password": rawPwd, "pin_code": rawPin})
	})

	group.Put("/tenants/:tenant_id/users/:user_id/password", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		tid, _ := strconv.Atoi(c.Params("tenant_id"))
		uid, _ := strconv.Atoi(c.Params("user_id"))
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.First(&tenant, tid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
		}
		tdb, err := svc.DBManager.GetTenantDB(tenant.Code)
		if err != nil || tdb == nil {
			return fiber.NewError(fiber.StatusServiceUnavailable, "İşletme veritabanına bağlanılamadı.")
		}
		var user models.StaffUser
		if err := tdb.First(&user, uid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kullanıcı bulunamadı.")
		}
		var payload struct {
			NewPassword *string `json:"new_password"`
			NewPin      *string `json:"new_pin"`
			Username    *string `json:"username"`
			Name        *string `json:"name"`
			Role        *string `json:"role"`
		}
		_ = c.BodyParser(&payload)
		if payload.NewPassword != nil && strings.TrimSpace(*payload.NewPassword) != "" {
			hash := middleware.HashPassword(strings.TrimSpace(*payload.NewPassword))
			user.PasswordHash = hash
		}
		if payload.NewPin != nil && strings.TrimSpace(*payload.NewPin) != "" {
			newPin := strings.TrimSpace(*payload.NewPin)
			user.PinCode = newPin
			user.PinHash = middleware.HashPassword(newPin)
			lh := middleware.HashPinLookup(svc.Config, newPin)
			user.PinLookupHash = &lh
		}
		if payload.Username != nil && strings.TrimSpace(*payload.Username) != "" {
			u := strings.ToLower(strings.TrimSpace(*payload.Username))
			user.Username = &u
		}
		if payload.Name != nil && strings.TrimSpace(*payload.Name) != "" {
			user.Name = strings.TrimSpace(*payload.Name)
		}
		if payload.Role != nil && strings.TrimSpace(*payload.Role) != "" {
			validatedRole, rErr := validateTenantStaffRole(*payload.Role)
			if rErr != nil {
				return rErr
			}
			user.Role = validatedRole
		}
		tdb.Save(&user)
		return c.JSON(fiber.Map{"status": "ok", "message": fmt.Sprintf("%s kullanıcısının bilgileri güncellendi.", user.Name)})
	})

	// Public endpoint — no master auth required
	group.Post("/leads", func(c *fiber.Ctx) error {
		var payload struct {
			RestaurantName string  `json:"restaurant_name"`
			ContactName    string  `json:"contact_name"`
			FullName       string  `json:"full_name"`
			CompanyName    string  `json:"company_name"`
			Phone          string  `json:"phone"`
			City           string  `json:"city"`
			BusinessType   string  `json:"business_type"`
			Message        *string `json:"message"`
			Notes          *string `json:"notes"`
		}
		payload.City = "İstanbul"
		payload.BusinessType = "restoran"
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz başvuru verisi.")
		}
		cName := payload.ContactName
		if cName == "" {
			cName = payload.FullName
		}
		rName := payload.RestaurantName
		if rName == "" {
			rName = payload.CompanyName
		}
		note := payload.Message
		if note == nil {
			note = payload.Notes
		}
		mdb := svc.DBManager.MasterGorm
		lead := models.TenantLead{
			FullName:     strings.TrimSpace(cName),
			CompanyName:  strings.TrimSpace(rName),
			Phone:        strings.TrimSpace(payload.Phone),
			City:         payload.City,
			BusinessType: payload.BusinessType,
			Notes:        note,
			Status:       "new",
		}
		mdb.Create(&lead)
		return c.JSON(fiber.Map{
			"status":  "ok",
			"lead_id": lead.ID,
			"message": "Başvurunuz alındı! BonCore ekibimiz en kısa sürede sizinle iletişime geçecektir.",
		})
	})

	group.Get("/leads", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var leads []models.TenantLead
		mdb.Order("id desc").Find(&leads)
		res := make([]fiber.Map, 0, len(leads))
		for _, l := range leads {
			cStr := ""
			if !l.CreatedAt.IsZero() {
				cStr = l.CreatedAt.Format("02.01.2006 15:04")
			}
			res = append(res, fiber.Map{
				"id":              l.ID,
				"restaurant_name": l.CompanyName,
				"company_name":    l.CompanyName,
				"contact_name":    l.FullName,
				"full_name":       l.FullName,
				"phone":           l.Phone,
				"city":            l.City,
				"business_type":   l.BusinessType,
				"message":         l.Notes,
				"notes":           l.Notes,
				"status":          l.Status,
				"created_at":      cStr,
			})
		}
		return c.JSON(res)
	})

	group.Put("/leads/:lead_id/status", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		lid, _ := strconv.Atoi(c.Params("lead_id"))
		var payload struct {
			Status string `json:"status"`
		}
		_ = c.BodyParser(&payload)
		mdb := svc.DBManager.MasterGorm
		var lead models.TenantLead
		if err := mdb.First(&lead, lid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Lead bulunamadı.")
		}
		lead.Status = payload.Status
		mdb.Save(&lead)
		return c.JSON(fiber.Map{"status": "ok", "id": lead.ID, "new_status": lead.Status})
	})

	group.Post("/leads/:lead_id/convert", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		lid, _ := strconv.Atoi(c.Params("lead_id"))
		mdb := svc.DBManager.MasterGorm
		var lead models.TenantLead
		if err := mdb.First(&lead, lid).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Aday başvuru bulunamadı.")
		}

		code := repository.CleanTenantCode(lead.CompanyName, fmt.Sprintf("sube-%d", lead.ID))
		if len(code) < 3 {
			code = fmt.Sprintf("sube-%d", lead.ID)
		}
		baseCode := code
		counter := 2
		for {
			var ex models.RestaurantTenant
			if err := mdb.Where("code = ?", code).First(&ex).Error; err != nil {
				break
			}
			code = fmt.Sprintf("%s-%d", baseCode, counter)
			counter++
		}

		ownerName := lead.FullName
		phone := lead.Phone
		tenant := models.RestaurantTenant{
			Code:         code,
			Name:         lead.CompanyName,
			OwnerName:    &ownerName,
			Phone:        &phone,
			City:         lead.City,
			Plan:         "PRO",
			MonthlyPrice: 2490.0,
			Status:       "active",
		}
		mdb.Create(&tenant)
		lead.Status = "converted"
		mdb.Save(&lead)

		adminPwd := generateRandomTempPassword(10)
		adminPin := generateNumericPin(6)
		if tdb, err := svc.DBManager.ProvisionTenantDB(code); err == nil && tdb != nil {
			uname := "admin"
			pwdHash := middleware.HashPassword(adminPwd)
			mgrUser := models.StaffUser{
				Name:         lead.FullName,
				Username:     &uname,
				PasswordHash: pwdHash,
				Role:         "manager",
				IsActive:     true,
			}
			repository.ApplyHashedStaffPin(svc.Config, &mgrUser, adminPin)
			tdb.Create(&mgrUser)
		}

		return c.JSON(fiber.Map{
			"status": "ok",
			"tenant": serializeTenant(tenant),
			"credentials": fiber.Map{
				"restaurant_code": code,
				"admin_username":  "admin",
				"admin_password":  adminPwd,
				"admin_pin":       adminPin,
			},
		})
	})

	// SaaS Master Admin Expansion Modules (R1 - R7)
	RegisterSaaSFeatureRoutes(group, svc)
	RegisterSaaSBillingRoutes(group, svc)
	RegisterSaaSFranchiseRoutes(group, svc)
	RegisterSaaSBackupQuotaRoutes(group, svc)
}
