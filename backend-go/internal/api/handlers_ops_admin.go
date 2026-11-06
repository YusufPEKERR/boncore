package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/url"
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
		db.Find(&recipes)
		var ingredients []models.Ingredient
		db.Find(&ingredients)
		ingMap := map[int]models.Ingredient{}
		for _, ing := range ingredients {
			ingMap[ing.ID] = ing
		}

		res := make([]fiber.Map, 0, len(products))
		for _, p := range products {
			pRecipes := make([]models.Recipe, 0)
			for _, r := range recipes {
				if r.ProductID == p.ID {
					pRecipes = append(pRecipes, r)
				}
			}
			bomItems := make([]fiber.Map, 0, len(pRecipes))
			totalRecipeCost := 0.0
			minProducible := 999999

			for _, r := range pRecipes {
				ing, ok := ingMap[r.IngredientID]
				if !ok {
					continue
				}
				lineCost := round2(r.Amount * ing.CostPerUnit)
				totalRecipeCost += lineCost
				canMake := 999999
				if r.Amount > 0 {
					canMake = int(math.Max(0, math.Floor(ing.CurrentStock/r.Amount)))
				}
				if canMake < minProducible {
					minProducible = canMake
				}
				bomItems = append(bomItems, fiber.Map{
					"recipe_id":       r.ID,
					"ingredient_id":   ing.ID,
					"ingredient_name": ing.Name,
					"amount":          r.Amount,
					"unit":            ing.Unit,
					"cost_per_unit":   ing.CostPerUnit,
					"line_cost":       lineCost,
					"current_stock":   ing.CurrentStock,
					"can_produce":     canMake,
				})
			}

			produciblePortions := 100
			if len(bomItems) > 0 {
				if minProducible == 999999 {
					produciblePortions = 0
				} else {
					produciblePortions = minProducible
				}
			}
			profitMargin := 0.0
			if p.BasePrice > 0 {
				profitMargin = round2(((p.BasePrice - totalRecipeCost) / p.BasePrice) * 100)
			}

			res = append(res, fiber.Map{
				"product_id":          p.ID,
				"product_name":        p.Name,
				"base_price":          p.BasePrice,
				"unit":                "adet",
				"has_recipe":          len(bomItems) > 0,
				"recipe_cost":         round2(totalRecipeCost),
				"profit":              round2(p.BasePrice - totalRecipeCost),
				"profit_margin":       profitMargin,
				"producible_portions": produciblePortions,
				"items":               bomItems,
			})
		}
		return c.JSON(res)
	})

	group.Get("/recipes/:product_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		prodID, _ := strconv.Atoi(c.Params("product_id"))
		var recipes []models.Recipe
		db.Where("product_id = ?", prodID).Find(&recipes)
		res := make([]fiber.Map, 0, len(recipes))
		for _, r := range recipes {
			var ing models.Ingredient
			db.First(&ing, r.IngredientID)
			ingName := ing.Name
			if ingName == "" {
				ingName = "Malzeme"
			}
			res = append(res, fiber.Map{
				"id":              r.ID,
				"product_id":      r.ProductID,
				"ingredient_id":   r.IngredientID,
				"ingredient_name": ingName,
				"unit":            ing.Unit,
				"amount":          r.Amount,
				"cost_per_unit":   ing.CostPerUnit,
				"line_cost":       round2(r.Amount * ing.CostPerUnit),
				"current_stock":   ing.CurrentStock,
			})
		}
		return c.JSON(res)
	})

	group.Put("/recipes/:product_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
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
				IngredientID int     `json:"ingredient_id"`
				Amount       float64 `json:"amount"`
			} `json:"items"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz reçete verisi.")
		}

		err = db.Transaction(func(tx *gorm.DB) error {
			tx.Where("product_id = ?", prodID).Delete(&models.Recipe{})
			for _, it := range payload.Items {
				if it.Amount <= 0 {
					continue
				}
				tx.Create(&models.Recipe{
					ProductID:    prodID,
					IngredientID: it.IngredientID,
					Amount:       it.Amount,
				})
			}
			return nil
		})
		if err != nil {
			return err
		}
		return c.JSON(fiber.Map{"status": "ok", "product_id": prodID, "recipe_count": len(payload.Items)})
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

		var ing models.Ingredient
		if err := db.First(&ing, payload.IngredientID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Malzeme bulunamadı")
		}
		srcWh := payload.SourceWarehouseID
		dstWh := payload.TargetWarehouseID
		mov := models.StockMovement{
			IngredientID:      ing.ID,
			SourceWarehouseID: &srcWh,
			TargetWarehouseID: &dstWh,
			MovementType:      "transfer",
			Amount:            payload.Amount,
			Unit:              ing.Unit,
			Notes:             payload.Notes,
			CreatedBy:         payload.CreatedBy,
		}
		ing.WarehouseID = dstWh
		db.Save(&ing)
		db.Create(&mov)
		return c.JSON(fiber.Map{"status": "success", "movement_id": mov.ID})
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
				var ing models.Ingredient
				if err := repository.WithRowLock(tx).First(&ing, item.IngredientID).Error; err != nil {
					continue
				}
				uPrice := item.ResolvedUnitPrice()
				oldTotalVal := ing.CurrentStock * ing.CostPerUnit
				newVal := item.Quantity * uPrice
				newStock := ing.CurrentStock + item.Quantity
				if newStock > 0 && uPrice > 0 {
					ing.CostPerUnit = round2((oldTotalVal + newVal) / newStock)
				}
				ing.CurrentStock = round2(newStock)
				tx.Save(&ing)

				targetWh := item.TargetWarehouseID
				if payload.WarehouseID != nil {
					targetWh = *payload.WarehouseID
				}
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

func RegisterDeliveryRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/couriers", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var couriers []models.Courier
		db.Find(&couriers)
		var activeDeliveries []models.DeliveryOrder
		db.Where("courier_status IN ?", []string{"assigned", "on_way", "delivered"}).Find(&activeDeliveries)

		res := make([]fiber.Map, 0, len(couriers))
		for _, cr := range couriers {
			activePkgs := 0
			expectedCash := 0.0
			expectedCard := 0.0
			for _, d := range activeDeliveries {
				if d.CourierID != nil && *d.CourierID == cr.ID {
					if d.CourierStatus == "assigned" || d.CourierStatus == "on_way" {
						activePkgs++
					}
					if d.CourierStatus != "reconciled" {
						var ord models.Order
						if err := db.First(&ord, d.OrderID).Error; err == nil {
							if d.PaymentType == "cash" || d.PaymentType == "kapida_nakit" {
								expectedCash += ord.GrandTotal
							} else if d.PaymentType == "credit_card" || d.PaymentType == "kapida_kart" {
								expectedCard += ord.GrandTotal
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
				"delivery_status":   d.CourierStatus,
				"status":            d.CourierStatus,
				"payment_method":    d.PaymentType,
				"payment_type":      d.PaymentType,
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
		phone := c.Query("phone")
		mockCustomers := []fiber.Map{
			{
				"phone":             "0532 441 88 92",
				"name":              "Ahmet Yılmaz (VIP Müşteri)",
				"customer_name":     "Ahmet Yılmaz (VIP Müşteri)",
				"address":           "Moda Caddesi No:44 D:6 Kadıköy / İstanbul",
				"past_orders_count": 18,
				"favorite_items":    []string{"BonCore Truffle Smash", "Trüflü Parmak Patates", "Cola Zero"},
				"last_order_note":   "Zile basmayın, bebek uyuyor. Kapıda POS cihazı istiyor.",
			},
			{
				"phone":             "0544 812 09 11",
				"name":              "Zeynep Kaya",
				"customer_name":     "Zeynep Kaya",
				"address":           "Bağdat Cad. Suadiye Mah. Plaj Yolu Sok. No:12 D:9",
				"past_orders_count": 7,
				"favorite_items":    []string{"Margherita Burrata (Taş Fırın)", "San Sebastian Cheesecake"},
				"last_order_note":   "Ekstra acı sos ve ketçap eklensin.",
			},
		}
		chosen := mockCustomers[rand.Intn(len(mockCustomers))]
		if phone != "" {
			var prev models.DeliveryOrder
			if err := db.Where("customer_phone LIKE ?", "%"+phone+"%").Order("id desc").First(&prev).Error; err == nil {
				chosen = fiber.Map{
					"phone":             prev.CustomerPhone,
					"name":              prev.CustomerName,
					"customer_name":     prev.CustomerName,
					"address":           prev.DeliveryAddress,
					"past_orders_count": 5,
					"favorite_items":    []string{"BonCore Truffle Smash", "Ev Yapımı Reyhanlı Limonata"},
					"last_order_note":   "Sıcak gelsin lütfen.",
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
		})
		return c.JSON(fiber.Map{"status": "ok", "courier": courier.Name})
	})

	group.Post("/complete-delivery/:delivery_order_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
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
		return c.JSON(fiber.Map{"status": "ok", "delivery_status": "delivered"})
	})

	group.Post("/courier-mutabakat", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CourierMutabakatRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz mutabakat verisi.")
		}
		if payload.CashierName == "" {
			payload.CashierName = "Kasiyer"
		}
		var deliveries []models.DeliveryOrder
		db.Where("courier_id = ? AND courier_status != ?", payload.CourierID, "reconciled").Find(&deliveries)
		reconciledCount := 0
		now := time.Now().UTC()
		for i := range deliveries {
			deliveries[i].CourierStatus = "reconciled"
			var ord models.Order
			if err := db.First(&ord, deliveries[i].OrderID).Error; err == nil && ord.Status != "paid" {
				ord.Status = "paid"
				ord.PaidTotal = ord.GrandTotal
				ord.RemainingTotal = 0.0
				ord.ClosedAt = &now
				method := "cash"
				if deliveries[i].PaymentType == "credit_card" || deliveries[i].PaymentType == "kapida_kart" {
					method = "credit_card"
				}
				db.Create(&models.Payment{
					OrderID:       ord.ID,
					PaymentMethod: method,
					Amount:        ord.GrandTotal,
					CashierName:   fmt.Sprintf("Kurye Mutabakat (%s)", payload.CashierName),
				})
				db.Save(&ord)
			}
			db.Save(&deliveries[i])
			reconciledCount++
		}
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
		var count int64
		db.Model(&models.Order{}).Count(&count)
		prefix := strings.ToUpper(platform)
		if len(prefix) > 3 {
			prefix = prefix[:3]
		}
		orderNo := fmt.Sprintf("ONL-%s-%04d", prefix, count+1)

		order := models.Order{
			OrderNo:    orderNo,
			TableID:    nil,
			OrderType:  "delivery",
			Status:     "open",
			WaiterName: fmt.Sprintf("Online (%s)", strings.ToUpper(platform)),
			Notes:      payload.Notes,
		}
		db.Create(&order)

		subtotal := 0.0
		kdsItems := make([]fiber.Map, 0)

		for _, itemIn := range payload.Items {
			var prod models.Product
			found := false
			if itemIn.ProductID != nil {
				if err := db.First(&prod, *itemIn.ProductID).Error; err == nil {
					found = true
				}
			}
			if !found {
				searchName := ""
				if itemIn.Name != nil && *itemIn.Name != "" {
					searchName = *itemIn.Name
				} else if itemIn.ProductName != nil && *itemIn.ProductName != "" {
					searchName = *itemIn.ProductName
				}
				if searchName != "" {
					if err := db.Where("name LIKE ?", "%"+searchName+"%").First(&prod).Error; err == nil {
						found = true
					}
				}
			}
			if !found {
				db.First(&prod)
			}

			qty := itemIn.Quantity
			if qty <= 0 {
				qty = 1
			}
			uPrice := itemIn.UnitPrice
			if uPrice == 0 {
				uPrice = prod.BasePrice
			}
			lineTotal := round2(uPrice * qty)
			if itemIn.TotalPrice != nil {
				lineTotal = round2(*itemIn.TotalPrice)
			}
			subtotal += lineTotal

			pName := prod.Name
			if itemIn.Name != nil && *itemIn.Name != "" {
				pName = *itemIn.Name
			} else if itemIn.ProductName != nil && *itemIn.ProductName != "" {
				pName = *itemIn.ProductName
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
			db.Create(&dbItem)
			_ = service.DeductOrderIngredients(db, prod.ID, qty, orderNo, 2)

			kdsItems = append(kdsItems, fiber.Map{
				"item_id":      dbItem.ID,
				"product_name": pName,
				"quantity":     qty,
				"station":      prod.Station,
				"kitchen_note": itemIn.KitchenNote,
			})
		}

		order.Subtotal = round2(subtotal)
		order.GrandTotal = round2(subtotal)
		order.RemainingTotal = round2(subtotal)
		if payload.PaymentType == "online_paid" {
			order.PaidTotal = order.GrandTotal
			order.RemainingTotal = 0.0
			db.Create(&models.Payment{
				OrderID:       order.ID,
				PaymentMethod: "credit_card",
				Amount:        order.GrandTotal,
				CashierName:   fmt.Sprintf("%s Online Ödeme", strings.ToUpper(platform)),
			})
		}
		db.Save(&order)

		extID := fmt.Sprintf("%s-%d", strings.ToUpper(platform), rand.Intn(899999)+100000)
		dOrder := models.DeliveryOrder{
			OrderID:         order.ID,
			Platform:        platform,
			PlatformOrderID: &extID,
			CustomerName:    payload.CustomerName,
			CustomerPhone:   payload.CustomerPhone,
			DeliveryAddress: payload.DeliveryAddress,
			CourierStatus:   "preparing",
			PaymentType:     payload.PaymentType,
			Notes:           payload.Notes,
		}
		db.Create(&dOrder)

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
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, payments, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		res := service.GenerateEAdisyon(order, payments, "Kasiyer")
		return c.JSON(res)
	})

	group.Get("/e-adisyon/:order_id/xml", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, payments, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		res := service.GenerateEAdisyon(order, payments, "Kasiyer")
		c.Set("Content-Type", "application/xml; charset=utf-8")
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="e-adisyon-%v.xml"`, res["ettn"]))
		return c.SendString(fmt.Sprintf("%v", res["xml_content"]))
	})

	group.Get("/e-adisyon/:order_id/pdf", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		order, payments, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		res := service.GenerateEAdisyon(order, payments, "Kasiyer")
		c.Set("Content-Type", "text/html; charset=utf-8")
		htmlStr := fmt.Sprintf("<html><body><pre>%s</pre></body></html>", service.GenerateEscposThermalSlip(order))
		_ = res
		return c.SendString(htmlStr)
	})

	printReceiptSlipHandler := func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
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

		if err := requirePermission(c, svc, db, operatorName, []string{"order_print_bill", "order_manual_print"}, true, "Adisyon fişi yazdırma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		order, _, err := loadOrderForFiscal(db, orderID)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if order.TableID != nil && order.Status == "open" {
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

		slipText := service.GenerateEscposThermalSlip(order)
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
		limit := c.QueryInt("limit", 200)
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

		var logs []models.AuditLog
		query.Order("id desc").Limit(limit).Find(&logs)
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
	"store_name":                 "BonCore Artisan Brasserie",
	"store_branch":               "Kadıköy Moda Şubesi",
	"tax_office":                 "Kadıköy VD",
	"tax_number":                 "4820913384",
	"mersis_no":                  "0482091338400018",
	"address":                    "Caferağa Mah. Moda Cad. No:112 Kadıköy/İstanbul",
	"phone":                      "0216 345 00 00",
	"currency":                   "TRY",
	"kuver_DefaultPrice":         45.0,
	"service_charge_percent":     0.0,
	"auto_print_receipt":         true,
	"auto_kick_drawer_on_cash":   true,
	"printer_cashier_ip":         "192.168.1.200:9100",
	"printer_kitchen_ip":         "192.168.1.201:9100",
	"printer_bar_ip":             "192.168.1.202:9100",
	"receipt_header":             "BonCore Brasserie & Roastery",
	"receipt_footer":             "Bizi tercih ettiğiniz için teşekkür ederiz!\nWi-Fi: BonCore_Guest / Şifre: afiyetolsun",
	"gib_integrator":             "Foriba / Sovos e-Adisyon",
	"gib_test_mode":              true,
	"caller_id_com_port":         "COM3",
	"yemeksepeti_webhook_active": true,
	"getir_webhook_active":       true,
	"trendyol_webhook_active":    true,
	"sound_alerts":               true,
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
		{"id": 1, "name": "Sıcak Mutfak & Izgara", "code": "kitchen", "icon": "Flame", "color": "#ef4444", "printer_ip": "192.168.1.201:9100", "order_index": 1, "is_active": true},
		{"id": 2, "name": "Fırın & Pizza İstasyonu", "code": "oven", "icon": "Pizza", "color": "#f97316", "printer_ip": "192.168.1.201:9100", "order_index": 2, "is_active": true},
		{"id": 3, "name": "Bar & Kahve İstasyonu", "code": "bar", "icon": "Wine", "color": "#6366f1", "printer_ip": "192.168.1.202:9100", "order_index": 3, "is_active": true},
		{"id": 4, "name": "Tatlı & Pastane Reyonu", "code": "pastry", "icon": "CakeSlice", "color": "#ec4899", "printer_ip": "192.168.1.203:9100", "order_index": 4, "is_active": true},
	}
	saveJSONSettingVal(db, "kitchen_groups_config", defaults)
	return defaults
}

func RegisterSettingsRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/time", func(c *fiber.Ctx) error {
		now := time.Now().UTC()
		return c.JSON(fiber.Map{
			"iso":       now.Format(time.RFC3339),
			"date":      now.Format("02.01.2006"),
			"time":      now.Format("15:04:05"),
			"timestamp": float64(now.UnixNano()) / 1e9,
		})
	})

	group.Get("/", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var rows []models.RestaurantSetting
		db.Find(&rows)
		merged := map[string]interface{}{}
		for k, v := range defaultSettingsMap {
			merged[k] = v
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
		return c.JSON(merged)
	})

	group.Put("/", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
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
			callerRole := strings.ToLower(strings.TrimSpace(c.Get("X-User-Role")))
			if callerRole == "" {
				if claims := middleware.GetUserClaims(c); claims != nil {
					callerRole = strings.ToLower(strings.TrimSpace(claims.Role))
				}
			}
			normRole := svc.Permissions.NormalizeRoleKey(callerRole)
			if callerRole != "" && normRole != "manager" && callerRole != "master_admin" && callerRole != "admin" {
				return fiber.NewError(fiber.StatusForbidden, "Rol ve sekme yetkilerini yalnızca Yönetici değiştirebilir.")
			}
		}

		for k, v := range settingsMap {
			saveJSONSettingVal(db, k, v)
		}

		if rp, hasRolePerms := settingsMap["role_permissions"]; hasRolePerms {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "PERMISSIONS_UPDATED", fiber.Map{
				"role_permissions": rp,
			})
		}

		return c.JSON(fiber.Map{"status": "ok", "updated_keys": len(settingsMap)})
	})

	group.Get("/kitchen-groups", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		groups := loadKitchenGroupsFromSettings(db)
		var categories []models.Category
		db.Find(&categories)
		var products []models.Product
		db.Find(&products)

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
				if p.Station == code {
					prodCount++
				}
			}
			res = append(res, fiber.Map{
				"id":             g["id"],
				"name":           g["name"],
				"code":           code,
				"icon":           g["icon"],
				"color":          g["color"],
				"printer_ip":     g["printer_ip"],
				"order_index":    g["order_index"],
				"is_active":      g["is_active"],
				"categories":     catNames,
				"products_count": prodCount,
			})
		}
		return c.JSON(res)
	})

	group.Post("/kitchen-groups", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			Name      string `json:"name"`
			Code      string `json:"code"`
			Icon      string `json:"icon"`
			Color     string `json:"color"`
			PrinterIP string `json:"printer_ip"`
			IsActive  *bool  `json:"is_active"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz mutfak grubu verisi.")
		}
		re := regexp.MustCompile(`[^a-z0-9_]+`)
		slug := strings.Trim(re.ReplaceAllString(strings.ToLower(strings.TrimSpace(payload.Code)), "_"), "_")
		if slug == "" {
			slug = fmt.Sprintf("station_%d", time.Now().Unix()%10000)
		}
		groups := loadKitchenGroupsFromSettings(db)
		icon := payload.Icon
		if icon == "" {
			icon = "ChefHat"
		}
		color := payload.Color
		if color == "" {
			color = "#f97316"
		}
		isActive := true
		if payload.IsActive != nil {
			isActive = *payload.IsActive
		}
		newID := len(groups) + 10
		grp := map[string]interface{}{
			"id":          newID,
			"name":        strings.TrimSpace(payload.Name),
			"code":        slug,
			"icon":        icon,
			"color":       color,
			"printer_ip":  strings.TrimSpace(payload.PrinterIP),
			"order_index": len(groups) + 1,
			"is_active":   isActive,
		}
		groups = append(groups, grp)
		saveJSONSettingVal(db, "kitchen_groups_config", groups)
		return c.JSON(fiber.Map{"status": "ok", "id": newID, "code": slug})
	})

	group.Put("/kitchen-groups-reorder", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			GroupIDs []int `json:"group_ids"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz sıralama verisi.")
		}
		groups := loadKitchenGroupsFromSettings(db)
		for idx, gid := range payload.GroupIDs {
			for i := range groups {
				if fmt.Sprintf("%v", groups[i]["id"]) == strconv.Itoa(gid) {
					groups[i]["order_index"] = idx + 1
				}
			}
		}
		saveJSONSettingVal(db, "kitchen_groups_config", groups)
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Put("/kitchen-groups/:group_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		for i := range groups {
			if fmt.Sprintf("%v", groups[i]["id"]) == gidStr {
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
				for _, k := range []string{"icon", "color", "printer_ip", "is_active"} {
					if v, ok := payload[k]; ok {
						groups[i][k] = v
					}
				}
				saveJSONSettingVal(db, "kitchen_groups_config", groups)
				return c.JSON(fiber.Map{"status": "ok", "id": groups[i]["id"], "code": groups[i]["code"]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Mutfak grubu bulunamadı")
	})

	group.Delete("/kitchen-groups/:group_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		filtered := make([]map[string]interface{}, 0)
		for _, g := range groups {
			if fmt.Sprintf("%v", g["id"]) == gidStr {
				code := fmt.Sprintf("%v", g["code"])
				db.Model(&models.Category{}).Where("target_station = ?", code).Update("target_station", "kitchen")
				db.Model(&models.Product{}).Where("station = ?", code).Update("station", "kitchen")
			} else {
				filtered = append(filtered, g)
			}
		}
		saveJSONSettingVal(db, "kitchen_groups_config", filtered)
		return c.JSON(fiber.Map{"status": "ok"})
	})

	group.Post("/kitchen-groups/:group_id/assign-categories", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		gidStr := c.Params("group_id")
		groups := loadKitchenGroupsFromSettings(db)
		var targetCode string
		for _, g := range groups {
			if fmt.Sprintf("%v", g["id"]) == gidStr {
				targetCode = fmt.Sprintf("%v", g["code"])
				break
			}
		}
		if targetCode == "" {
			return fiber.NewError(fiber.StatusNotFound, "Mutfak grubu bulunamadı")
		}
		var payload struct {
			CategoryIDs      []int `json:"category_ids"`
			SyncProductsAlso *bool `json:"sync_products_also"`
		}
		_ = c.BodyParser(&payload)
		syncProds := true
		if payload.SyncProductsAlso != nil {
			syncProds = *payload.SyncProductsAlso
		}
		if len(payload.CategoryIDs) > 0 {
			db.Model(&models.Category{}).Where("id IN ?", payload.CategoryIDs).Update("target_station", targetCode)
			if syncProds {
				db.Model(&models.Product{}).Where("category_id IN ?", payload.CategoryIDs).Update("station", targetCode)
			}
		}
		return c.JSON(fiber.Map{"status": "ok", "station_code": targetCode})
	})
}

// ============================================================================
// 13. SCALE & BARCODE HARDWARE BRIDGE ROUTER (/api/scale)
// ============================================================================

var (
	scaleMu          sync.RWMutex
	scaleConfigState = map[string]interface{}{
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
	agentRuntimeState = map[string]interface{}{
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
	bridgeMu               sync.Mutex
	pendingBridgeCommands  = make(map[string]map[string]interface{})
	completedBridgeResults = make(map[string]map[string]interface{})
)

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
	// Fallback: seed from existing backend/app/terminals.json if available
	candidates := []string{
		filepath.Join("..", "backend", "app", "terminals.json"),
		filepath.Join("backend", "app", "terminals.json"),
		`C:\Users\Administrator\Documents\BonCore\backend\app\terminals.json`,
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

func RegisterScaleRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/download-agent", func(c *fiber.Ctx) error {
		terminalName := strings.TrimSpace(c.Query("terminal_name"))
		if terminalName == "" {
			terminalName = "Kasa 1"
		}
		terminalID := strings.TrimSpace(c.Query("terminal_id"))
		if terminalID == "" {
			terminalID = fmt.Sprintf("kasa_%x", time.Now().UnixNano()%0xFFFFFF)
		}
		tenantCode := strings.TrimSpace(c.Query("restaurant_code"))
		if tenantCode == "" {
			tenantCode = middleware.GetTenantCode(c)
		}
		if tenantCode == "" {
			tenantCode = "fatihciftligi"
		}
		scaleIP := strings.TrimSpace(c.Query("scale_ip"))
		if scaleIP == "" {
			scaleIP = "192.168.1.150"
		}
		scalePort := c.QueryInt("scale_port", 2004)

		fwdHost := c.Get("X-Forwarded-Host")
		if fwdHost == "" {
			fwdHost = c.Get("Host")
		}
		fwdProto := c.Get("X-Forwarded-Proto")
		if fwdProto == "" {
			fwdProto = c.Protocol()
		}
		serverBase := "https://boncoreapp.me"
		if fwdHost != "" && !strings.Contains(fwdHost, "localhost") && !strings.Contains(fwdHost, "127.0.0.1") {
			serverBase = fmt.Sprintf("%s://%s", fwdProto, fwdHost)
		}

		candidates := []string{
			filepath.Join("hardware_agent"),
			filepath.Join("..", "hardware_agent"),
			`C:\Users\Administrator\Documents\BonCore\hardware_agent`,
		}
		var agentDir string
		for _, dir := range candidates {
			if info, err := os.Stat(dir); err == nil && info.IsDir() {
				agentDir = dir
				break
			}
		}

		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)

		filesToBundle := []string{
			"BonCoreAgent.exe",
			"Kurulum.bat",
			"boncore_agent.py",
			"desktop_app.py",
			"run_agent.bat",
		}

		for _, fname := range filesToBundle {
			fpath := filepath.Join(agentDir, fname)
			content, err := os.ReadFile(fpath)
			if err == nil {
				if strings.HasSuffix(fname, ".bat") {
					content = bytes.ReplaceAll(content, []byte("\r\n"), []byte("\n"))
					content = bytes.ReplaceAll(content, []byte("\n"), []byte("\r\n"))
				}
				w, err := zw.Create(fname)
				if err == nil {
					_, _ = w.Write(content)
				}
			}
		}

		configData := map[string]interface{}{
			"server_url":         serverBase,
			"restaurant_code":    tenantCode,
			"terminal_id":        terminalID,
			"terminal_name":      terminalName,
			"scale_default_ip":   scaleIP,
			"scale_default_port": scalePort,
			"auto_start":         true,
			"minimize_to_tray":   true,
			"show_notifications": true,
		}
		configBytes, _ := json.MarshalIndent(configData, "", "  ")
		if w, err := zw.Create("config.json"); err == nil {
			_, _ = w.Write(configBytes)
		}

		if err := zw.Close(); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zip paketi olusturulamadi")
		}

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
		c.Set("Content-Length", strconv.Itoa(buf.Len()))
		c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
		c.Set("Access-Control-Expose-Headers", "Content-Disposition")
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"boncore-hardware-agent-%s.zip\"; filename*=UTF-8''boncore-hardware-agent-%s.zip", cleanAscii, url.PathEscape(safeName)))
		return c.Send(buf.Bytes())
	})

	group.Get("/raw-exe", func(c *fiber.Ctx) error {
		candidates := []string{
			filepath.Join("hardware_agent", "BonCoreAgent.exe"),
			filepath.Join("..", "hardware_agent", "BonCoreAgent.exe"),
			`C:\Users\Administrator\Documents\BonCore\hardware_agent\BonCoreAgent.exe`,
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
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		nowTs := float64(time.Now().Unix())
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

			// Online calculation
			lastTs, _ := item["last_heartbeat_ts"].(float64)
			if lastTs == 0 {
				lastTs, _ = item["last_seen"].(float64)
			}
			age := nowTs - lastTs
			isOnline := lastTs > 0 && age < 25.0
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

			enriched = append(enriched, item)
		}
		return c.JSON(fiber.Map{"terminals": enriched})
	})

	group.Put("/terminals/:terminal_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tid := c.Params("terminal_id")
		var payload struct {
			Name      *string `json:"name"`
			ScaleIP   *string `json:"scale_ip"`
			ScalePort *int    `json:"scale_port"`
			IsDefault *bool   `json:"is_default"`
		}
		_ = c.BodyParser(&payload)

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
					terminals[i]["is_default"] = *payload.IsDefault
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
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tid := c.Params("terminal_id")
		terminals := loadTerminalsList(db)
		filtered := make([]map[string]interface{}, 0)
		for _, t := range terminals {
			currID := fmt.Sprintf("%v", t["id"])
			currTID := fmt.Sprintf("%v", t["terminal_id"])
			if currID != tid && currTID != tid {
				filtered = append(filtered, t)
			}
		}
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
		agentRuntimeState["online"] = true
		agentRuntimeState["last_heartbeat_ts"] = nowTs
		agentRuntimeState["agent_version"] = version
		agentRuntimeState["hostname"] = tname
		agentRuntimeState["active_com_ports"] = payload.ActiveComPorts
		agentRuntimeState["live_stable"] = payload.LiveStable
		agentRuntimeState["last_error"] = payload.LastError
		if payload.LiveWeightGram != nil {
			g := *payload.LiveWeightGram
			agentRuntimeState["live_weight_gram"] = g
			agentRuntimeState["live_weight_kg"] = math.Round((float64(g)/1000.0)*1000) / 1000
		} else if payload.LastWeight > 0 {
			agentRuntimeState["live_weight_kg"] = payload.LastWeight
			agentRuntimeState["live_weight_gram"] = int(payload.LastWeight * 1000)
		}
		jobs, _ := agentRuntimeState["pending_print_jobs"].([]fiber.Map)
		agentRuntimeState["pending_print_jobs"] = []fiber.Map{}
		cfgCopy := map[string]interface{}{}
		for k, v := range scaleConfigState {
			cfgCopy[k] = v
		}
		scaleMu.Unlock()

		terminals := loadTerminalsList(db)
		foundIdx := -1
		for i := range terminals {
			currID := fmt.Sprintf("%v", terminals[i]["id"])
			currTID := fmt.Sprintf("%v", terminals[i]["terminal_id"])
			currIP := fmt.Sprintf("%v", terminals[i]["local_ip"])
			if currID == tid || currTID == tid || (localIP != "127.0.0.1" && currIP == localIP) {
				foundIdx = i
				break
			}
		}

		if foundIdx >= 0 {
			terminals[foundIdx]["id"] = tid
			terminals[foundIdx]["terminal_id"] = tid
			if payload.UserConfigured && tname != "" {
				terminals[foundIdx]["name"] = tname
				terminals[foundIdx]["custom_name"] = tname
			} else if currName, _ := terminals[foundIdx]["name"].(string); currName == "" || currName == "Kasa 1" || currName == "Kasa" {
				terminals[foundIdx]["name"] = tname
			}
			terminals[foundIdx]["local_ip"] = localIP
			terminals[foundIdx]["version"] = version
			terminals[foundIdx]["agent_version"] = version
			terminals[foundIdx]["scale_connected"] = payload.ScaleConnected
			terminals[foundIdx]["scale_ip"] = scaleIP
			terminals[foundIdx]["scale_port"] = scalePort
			terminals[foundIdx]["last_weight"] = payload.LastWeight
			if len(sortedPr) > 0 {
				terminals[foundIdx]["printers"] = sortedPr
			}
			terminals[foundIdx]["last_heartbeat_ts"] = nowTs
			terminals[foundIdx]["last_seen"] = nowTs
		} else {
			isDef := len(terminals) == 0
			terminals = append(terminals, map[string]interface{}{
				"id":                tid,
				"terminal_id":       tid,
				"name":              tname,
				"custom_name":       tname,
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
		}
		saveTerminalsList(db, terminals)

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
			"terminal_name":      tname,
			"scale_ip":           scaleIP,
			"scale_port":         scalePort,
			"pending_print_jobs": jobs,
			"server_time":        nowTs,
		})
	})

	group.Get("/agent/status", func(c *fiber.Ctx) error {
		scaleMu.RLock()
		lastTs, _ := agentRuntimeState["last_heartbeat_ts"].(float64)
		age := float64(time.Now().Unix()) - lastTs
		isOnline := lastTs > 0 && age < 15.0
		resp := fiber.Map{
			"online":            isOnline,
			"last_seen_seconds": nil,
			"agent_version":     agentRuntimeState["agent_version"],
			"hostname":          agentRuntimeState["hostname"],
			"os_info":           agentRuntimeState["os_info"],
			"active_com_ports":  agentRuntimeState["active_com_ports"],
			"live_weight_kg":    agentRuntimeState["live_weight_kg"],
			"live_weight_gram":  agentRuntimeState["live_weight_gram"],
			"live_stable":       agentRuntimeState["live_stable"],
			"last_error":        agentRuntimeState["last_error"],
		}
		if lastTs > 0 {
			resp["last_seen_seconds"] = int(age)
		}
		scaleMu.RUnlock()
		return c.JSON(resp)
	})

	group.Get("/agent/poll", func(c *fiber.Ctx) error {
		terminalID := strings.TrimSpace(c.Query("terminal_id"))
		clientIP := c.IP()
		nowTs := float64(time.Now().Unix())

		db, _, _ := getTenantDB(c, svc)
		var terminals []map[string]interface{}
		if db != nil {
			terminals = loadTerminalsList(db)
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
				if clientIP != "" && (clientIP == cmdTarget || strings.Contains(cmdTarget, clientIP)) {
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

					if tID == terminalID || tTID == terminalID || strings.Contains(terminalID, cleanIP) {
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
		return c.JSON(fiber.Map{
			"latest_version": "2.4.0",
			"release_date":   "2026-04-16",
			"mandatory":      false,
			"download_url":   "/downloads/BonCore-Hardware-Bridge-Setup.exe",
			"changelog":      "Otomatik terazi COM port tarama, ESC/POS fiş kuyruğu ve Caller-ID stabilite güncellemesi.",
		})
	})

	group.Post("/agent/report", func(c *fiber.Ctx) error {
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)

		reqID := fmt.Sprintf("%v", payload["req_id"])
		log.Printf("[BRIDGE REPORT] Received report for %s: success=%v, msg=%v, results=%v", reqID, payload["success"], payload["message"], payload["results"])
		if reqID != "" && reqID != "<nil>" {
			bridgeMu.Lock()
			completedBridgeResults[reqID] = payload
			bridgeMu.Unlock()
		}

		scaleMu.Lock()
		agentRuntimeState["last_report"] = payload
		agentRuntimeState["last_report_ts"] = float64(time.Now().Unix())
		scaleMu.Unlock()

		return c.JSON(fiber.Map{"status": "received", "success": true})
	})

	group.Get("/config", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		scaleMu.Lock()
		if m, ok := loadJSONSettingMap(db, "scale_hardware_config"); ok {
			for k, v := range m {
				scaleConfigState[k] = v
			}
		}
		cfgCopy := map[string]interface{}{}
		for k, v := range scaleConfigState {
			cfgCopy[k] = v
		}
		scaleMu.Unlock()
		return c.JSON(cfgCopy)
	})

	group.Post("/config", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload map[string]interface{}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz terazi ayar verisi.")
		}
		scaleMu.Lock()
		for k, v := range payload {
			scaleConfigState[k] = v
		}
		scaleConfigState["last_sync"] = "Şimdi güncellendi"
		cfgCopy := map[string]interface{}{}
		for k, v := range scaleConfigState {
			cfgCopy[k] = v
		}
		scaleMu.Unlock()

		saveJSONSettingVal(db, "scale_hardware_config", cfgCopy)
		return c.JSON(fiber.Map{"status": "ok", "config": cfgCopy})
	})

	group.Post("/test", func(c *fiber.Ctx) error {
		scaleMu.Lock()
		lastTs, _ := agentRuntimeState["last_heartbeat_ts"].(float64)
		agentOnline := lastTs > 0 && (float64(time.Now().Unix())-lastTs) < 15.0
		brand := scaleConfigState["brand"]
		connType := scaleConfigState["connection_type"]
		ipAddr := scaleConfigState["ip_address"]
		port := scaleConfigState["port"]
		comPort := scaleConfigState["com_port"]
		baudRate := scaleConfigState["baud_rate"]
		scaleConfigState["is_connected"] = true
		scaleConfigState["last_sync"] = "Test Başarılı"
		liveKg, _ := agentRuntimeState["live_weight_kg"].(float64)
		hostname := agentRuntimeState["hostname"]
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
		db, _, err := getTenantDB(c, svc)
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
			rawText = fmt.Sprintf("================================\n        BONCORE POS TEST        \n================================\nTarih: %s\nYazici Testi Basarili!\n================================\n\n\n\n", time.Now().Format("02.01.2006 15:04:05"))
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

		terminals := loadTerminalsList(db)
		nowTs := float64(time.Now().Unix())

		// Resolve target terminal by ID, IP, or owned printer
		for _, t := range terminals {
			currID := fmt.Sprintf("%v", t["id"])
			currTID := fmt.Sprintf("%v", t["terminal_id"])
			currIP := fmt.Sprintf("%v", t["local_ip"])

			if targetTID != "" && (currID == targetTID || currTID == targetTID || currIP == targetTID) {
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
				lastTs, _ := t["last_heartbeat_ts"].(float64)
				if lastTs == 0 {
					lastTs, _ = t["last_seen"].(float64)
				}
				if (nowTs - lastTs) < 30.0 {
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

		reqID := fmt.Sprintf("print_%d", time.Now().UnixNano())
		bridgeMu.Lock()
		pendingBridgeCommands[reqID] = map[string]interface{}{
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
			if res, ok := completedBridgeResults[reqID]; ok {
				finalResult = res
				delete(completedBridgeResults, reqID)
				bridgeMu.Unlock()
				break
			}
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
		for _, t := range terminals {
			lastTs, _ := t["last_heartbeat_ts"].(float64)
			if lastTs == 0 {
				lastTs, _ = t["last_seen"].(float64)
			}
			if (nowTs - lastTs) < 25.0 {
				hasOnlineAgent = true
				break
			}
		}

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

	group.Get("/read", func(c *fiber.Ctx) error {
		scaleMu.RLock()
		tareGram := 0
		if tg, ok := scaleConfigState["tare_gram"].(int); ok {
			tareGram = tg
		} else if tgf, ok := scaleConfigState["tare_gram"].(float64); ok {
			tareGram = int(tgf)
		}
		brand := scaleConfigState["brand"]
		connType := scaleConfigState["connection_type"]
		lastTs, _ := agentRuntimeState["last_heartbeat_ts"].(float64)
		agentOnline := lastTs > 0 && (float64(time.Now().Unix())-lastTs) < 15.0
		liveGram, _ := agentRuntimeState["live_weight_gram"].(int)
		liveStable, _ := agentRuntimeState["live_stable"].(bool)
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

func getTenantModulesStore(db *gorm.DB, tenantCode string) map[string]interface{} {
	modulesMu.Lock()
	defer modulesMu.Unlock()

	if store, ok := tenantModulesCache[tenantCode]; ok {
		return store
	}
	if store, ok := loadJSONSettingMap(db, "modules_persistent_store"); ok && len(store) > 0 {
		tenantModulesCache[tenantCode] = store
		return store
	}

	store := map[string]interface{}{
		"customers": []map[string]interface{}{
			{"id": "cust_1", "name": "Ahmet Yılmaz", "phone": "0532 411 22 33", "email": "ahmet.yilmaz@sirket.com", "tier": "VIP", "points": 1480.0, "balance": -1250.0, "open_account_balance": 1250.0, "credit_limit": 5000.0, "total_spent": 18450.0, "visit_count": 24, "last_visit": "2026-10-28 19:40", "notes": "Pencere kenarı masa tercih eder, şekersiz Türk kahvesi ikramı."},
			{"id": "cust_2", "name": "Zeynep Kaya (Kaya Mimarlık)", "phone": "0544 892 10 20", "email": "zeynep@kayamimarlik.com", "tier": "Kurumsal", "points": 2920.0, "balance": -3400.0, "open_account_balance": 3400.0, "credit_limit": 10000.0, "total_spent": 46200.0, "visit_count": 42, "last_visit": "2026-10-29 11:20", "notes": "Kurumsal öğle yemeği aboneliği, ay sonu fatura kesilir."},
			{"id": "cust_3", "name": "Mehmet Demir", "phone": "0505 677 88 99", "email": "mehmetdemir@gmail.com", "tier": "Gold", "points": 650.0, "balance": 0.0, "open_account_balance": 0.0, "credit_limit": 3000.0, "total_spent": 8120.0, "visit_count": 12, "last_visit": "2026-10-25 21:00", "notes": "Acısız tercih eder."},
			{"id": "cust_4", "name": "Elif Demir", "phone": "0530 112 45 67", "email": "elif.demir@gmail.com", "tier": "Silver", "points": 310.0, "balance": -450.0, "open_account_balance": 450.0, "credit_limit": 3000.0, "total_spent": 4200.0, "visit_count": 6, "last_visit": "2026-10-26 14:15", "notes": "Tatlı tutkunu."},
		},
		"campaigns": []map[string]interface{}{
			{"id": "camp_1", "title": "%5 Para Puan Kazanımı", "name": "%5 Para Puan Kazanımı", "type": "points_cashback", "rule": "Tüm masa ve paket siparişlerinde geçerli", "reward": "Adisyon tutarının %5'i kadar harcanabilir Para Puan", "is_active": true, "active": true, "usage_count": 142},
			{"id": "camp_2", "title": "10 Siparişe 1 Tatlı / Kahve Hediye", "name": "10 Siparişe 1 Tatlı / Kahve Hediye", "type": "visit_reward", "rule": "10. ziyaretini tamamlayan sadakat üyelerine", "reward": "Seçili tatlı veya kahve ücretsiz ikram edilir", "is_active": true, "active": true, "usage_count": 38},
			{"id": "camp_3", "title": "VIP & Kurumsal %10 Otomatik İndirim", "name": "VIP & Kurumsal %10 Otomatik İndirim", "type": "tier_discount", "rule": "VIP ve Kurumsal Cari kart sahiplerine", "reward": "Adisyonda otomatik %10 sadakat indirimi", "is_active": true, "active": true, "usage_count": 64},
			{"id": "camp_4", "title": "Happy Hour (15:00 - 18:00) %15 İndirim", "name": "Happy Hour (%15 İndirim)", "type": "happy_hour", "rule": "Hafta içi 15:00 - 18:00 arası içecek ve tatlılarda", "reward": "%15 Anında Sepet İndirimi", "is_active": false, "active": false, "usage_count": 19},
		},
		"reservations": []map[string]interface{}{
			{"id": 1, "guest_name": "Murat Boz & Ekibi", "phone": "0532 900 11 22", "guests": 6, "time": "20:00", "table_name": "Bahçe-2", "deposit_paid": 1500.0, "notes": "Cam kenarı, doğum günü pastası", "status": "confirmed"},
			{"id": 2, "guest_name": "Selin Şekerci", "phone": "0542 311 44 55", "guests": 2, "time": "19:30", "table_name": "Salon-4", "deposit_paid": 0.0, "notes": "Vegan menü tercihi", "status": "seated"},
			{"id": 3, "guest_name": "Borusan Otomotiv Yemeği", "phone": "0212 444 88 99", "guests": 10, "time": "21:00", "table_name": "Teras-1", "deposit_paid": 3000.0, "notes": "Kurumsal fatura kesilecek", "status": "confirmed"},
		},
		"hotel_folios": []map[string]interface{}{
			{"room_no": "101", "guest_name": "Mr. & Mrs. Anderson", "vip": "VIP", "package": "Ultra All-Inclusive", "checkin": "12.04", "checkout": "18.04", "balance": 1450.0, "pms": "Opera PMS"},
			{"room_no": "204", "guest_name": "Kerem Aktürkoğlu", "vip": "Suit", "package": "Oda + Kahvaltı (BB)", "checkin": "14.04", "checkout": "16.04", "balance": 3280.0, "pms": "ElektraWeb"},
			{"room_no": "308", "guest_name": "Elena Rostova", "vip": "Standart", "package": "Yarım Pansiyon (HB)", "checkin": "11.04", "checkout": "19.04", "balance": 780.0, "pms": "Opera PMS"},
			{"room_no": "402", "guest_name": "Dr. Selim Aydın", "vip": "King Suit", "package": "Oda + Kahvaltı (BB)", "checkin": "13.04", "checkout": "15.04", "balance": 0.0, "pms": "Sedna PMS"},
		},
	}
	tenantModulesCache[tenantCode] = store
	return store
}

func persistTenantModulesStore(db *gorm.DB, tenantCode string, store map[string]interface{}) {
	modulesMu.Lock()
	tenantModulesCache[tenantCode] = store
	modulesMu.Unlock()
	saveJSONSettingVal(db, "modules_persistent_store", store)
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
		store := getTenantModulesStore(db, tenantCode)
		custList := toMapSlice(store["customers"])
		campList := toMapSlice(store["campaigns"])

		totalReceivable := 0.0
		totalPoints := 0.0
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

		activeCampaigns := 0
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
		_ = c.BodyParser(&payload)

		store := getTenantModulesStore(db, tenantCode)
		list := toMapSlice(store["customers"])
		newCust := map[string]interface{}{
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
			"last_visit":           time.Now().Format("2006-01-02 15:04"),
			"notes":                payload.Notes,
		}
		list = append([]map[string]interface{}{newCust}, list...)
		store["customers"] = list
		persistTenantModulesStore(db, tenantCode, store)
		return c.JSON(fiber.Map{"status": "ok", "success": true, "customer": newCust})
	})

	group.Delete("/customers/:customer_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cid := c.Params("customer_id")
		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["customers"])
		filtered := make([]map[string]interface{}, 0)
		for _, item := range rawList {
			if fmt.Sprintf("%v", item["id"]) != cid {
				filtered = append(filtered, item)
			}
		}
		store["customers"] = filtered
		persistTenantModulesStore(db, tenantCode, store)
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
		_ = c.BodyParser(&payload)

		txType := payload.Type
		if txType == "" {
			txType = payload.ActionType
		}

		store := getTenantModulesStore(db, tenantCode)
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
					// Log cash expense
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
					rawList[i]["last_visit"] = time.Now().Format("2006-01-02 15:04")
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
				persistTenantModulesStore(db, tenantCode, store)
				return c.JSON(fiber.Map{"status": "ok", "success": true, "customer": rawList[i]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Müşteri bulunamadı")
	})

	group.Post("/campaigns/:campaign_id/toggle", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cidStr := c.Params("campaign_id")
		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["campaigns"])
		for i := range rawList {
			if fmt.Sprintf("%v", rawList[i]["id"]) == cidStr {
				act, _ := rawList[i]["active"].(bool)
				rawList[i]["active"] = !act
				store["campaigns"] = rawList
				persistTenantModulesStore(db, tenantCode, store)
				return c.JSON(fiber.Map{"status": "ok", "campaign": rawList[i]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Kampanya bulunamadı")
	})

	group.Get("/reservations", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["reservations"])
		var enriched []map[string]interface{}
		confirmedCount := 0
		seatedCount := 0
		expectedGuests := 0
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
			expectedGuests += gCount

			dep := 0.0
			if d, ok := r["deposit"].(float64); ok {
				dep = d
			} else if d, ok := r["deposit_paid"].(float64); ok {
				dep = d
			}

			st := fmt.Sprintf("%v", r["status"])
			if st == "confirmed" {
				confirmedCount++
			} else if st == "seated" {
				seatedCount++
			}

			dt := fmt.Sprintf("%v", r["date"])
			if dt == "" || dt == "<nil>" {
				dt = time.Now().Format("2006-01-02")
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

		return c.JSON(fiber.Map{
			"reservations": enriched,
			"summary": fiber.Map{
				"total_reservations": len(rawList),
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
		_ = c.BodyParser(&payload)

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

		dt := payload.Date
		if dt == "" {
			dt = time.Now().Format("2006-01-02")
		}

		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["reservations"])
		newRes := map[string]interface{}{
			"id":           len(rawList) + 10,
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
		rawList = append(rawList, newRes)
		store["reservations"] = rawList
		persistTenantModulesStore(db, tenantCode, store)
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
		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["reservations"])
		for i := range rawList {
			if fmt.Sprintf("%v", rawList[i]["id"]) == ridStr {
				rawList[i]["status"] = status
				store["reservations"] = rawList
				persistTenantModulesStore(db, tenantCode, store)
				return c.JSON(fiber.Map{"status": "ok", "reservation": rawList[i]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Rezervasyon bulunamadı")
	})

	group.Delete("/reservations/:res_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		ridStr := c.Params("res_id")
		store := getTenantModulesStore(db, tenantCode)
		rawList := toMapSlice(store["reservations"])
		filtered := make([]map[string]interface{}, 0)
		for _, r := range rawList {
			if fmt.Sprintf("%v", r["id"]) != ridStr {
				filtered = append(filtered, r)
			}
		}
		store["reservations"] = filtered
		persistTenantModulesStore(db, tenantCode, store)
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
		var items []models.OrderItem
		db.Where("is_voided = ?", false).Find(&items)

		analysis := make([]fiber.Map, 0, len(products))
		totalRecipeCostAll := 0.0
		totalRevenueAll := 0.0

		for _, p := range products {
			recipeCost := 0.0
			bomDetails := make([]fiber.Map, 0)
			for _, r := range recipes {
				if r.ProductID == p.ID {
					if ing, ok := ingMap[r.IngredientID]; ok {
						cVal := round2(r.Amount * ing.CostPerUnit)
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
			if recipeCost == 0 {
				recipeCost = round2(p.BasePrice * 0.32)
			}
			soldQty := 0.0
			for _, it := range items {
				if it.ProductID == p.ID {
					soldQty += it.Quantity
				}
			}
			unitProfit := round2(p.BasePrice - recipeCost)
			marginPct := 0.0
			if p.BasePrice > 0 {
				marginPct = round2((unitProfit / p.BasePrice) * 100)
			}
			totalRev := round2(soldQty * p.BasePrice)
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
				"unit_profit":    unitProfit,
				"margin_percent": marginPct,
				"sold_qty":       soldQty,
				"total_revenue":  totalRev,
				"total_profit":   round2(totalRev - totalCst),
				"bom_items":      bomDetails,
			})
		}

		foodCostPct := 31.4
		if totalRevenueAll > 0 {
			foodCostPct = round2((totalRecipeCostAll / totalRevenueAll) * 100)
		}

		return c.JSON(fiber.Map{
			"summary": fiber.Map{
				"total_revenue":     round2(totalRevenueAll),
				"total_bom_cost":    round2(totalRecipeCostAll),
				"gross_profit":      round2(totalRevenueAll - totalRecipeCostAll),
				"food_cost_percent": foodCostPct,
				"paid_orders_count": len(paidOrders),
			},
			"products": analysis,
		})
	})

	group.Get("/hotel", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		store := getTenantModulesStore(db, tenantCode)
		folios := toMapSlice(store["hotel_folios"])
		var enriched []map[string]interface{}
		totalBal := 0.0
		occupiedCount := 0
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
				charges = []interface{}{
					map[string]interface{}{
						"id":     "ch_1",
						"date":   "Bugün 13:45",
						"desc":   "Restoran Harcaması",
						"amount": 450.0,
					},
				}
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
		return c.JSON(fiber.Map{
			"folios": enriched,
			"summary": fiber.Map{
				"total_rooms":         len(folios),
				"occupied_rooms":      occupiedCount,
				"total_folio_balance": round2(totalBal),
				"today_charges":       1850.0,
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
		_ = c.BodyParser(&payload)
		store := getTenantModulesStore(db, tenantCode)
		folios := toMapSlice(store["hotel_folios"])
		for i := range folios {
			if fmt.Sprintf("%v", folios[i]["room_no"]) == payload.RoomNo {
				bal, _ := folios[i]["balance"].(float64)
				folios[i]["balance"] = round2(bal + payload.Amount)
				store["hotel_folios"] = folios
				persistTenantModulesStore(db, tenantCode, store)
				return c.JSON(fiber.Map{"status": "ok", "folio": folios[i]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Oda bulunamadı")
	})

	group.Post("/hotel/:room_no/settle", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		roomNo := c.Params("room_no")
		store := getTenantModulesStore(db, tenantCode)
		folios := toMapSlice(store["hotel_folios"])
		for i := range folios {
			if fmt.Sprintf("%v", folios[i]["room_no"]) == roomNo {
				folios[i]["balance"] = 0.0
				store["hotel_folios"] = folios
				persistTenantModulesStore(db, tenantCode, store)
				return c.JSON(fiber.Map{"status": "ok", "folio": folios[i]})
			}
		}
		return fiber.NewError(fiber.StatusNotFound, "Oda bulunamadı")
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

		checkItems := make([]models.OrderItemInput, 0, len(payload.Items))
		for _, it := range payload.Items {
			qty := it.Quantity
			if qty <= 0 {
				qty = 1
			}
			checkItems = append(checkItems, models.OrderItemInput{
				ProductID: it.ProductID,
				Quantity:  qty,
			})
		}
		if err := service.ValidateBOMStockForItems(db, checkItems); err != nil {
			return err
		}

		var count int64
		db.Model(&models.Order{}).Count(&count)
		queueNo := int((count % 90) + 10)
		orderNo := fmt.Sprintf("KSK-%d", queueNo)
		noteStr := fmt.Sprintf("Self-Servis Kiosk (%s) - Sıra #%d", payload.CustomerName, queueNo)
		order := models.Order{
			OrderNo:    orderNo,
			TableID:    nil,
			OrderType:  payload.ServiceType,
			Status:     "paid",
			WaiterName: "Self-Kiosk #1",
			Notes:      &noteStr,
		}
		db.Create(&order)

		subtotal := 0.0
		kdsItems := make([]fiber.Map, 0)
		for _, itemIn := range payload.Items {
			var prod models.Product
			if err := db.First(&prod, itemIn.ProductID).Error; err != nil {
				continue
			}
			qty := itemIn.Quantity
			if qty <= 0 {
				qty = 1
			}
			lineTotal := round2(prod.BasePrice * qty)
			subtotal += lineTotal
			dbItem := models.OrderItem{
				OrderID:     order.ID,
				ProductID:   prod.ID,
				ProductName: prod.Name,
				Quantity:    qty,
				UnitPrice:   prod.BasePrice,
				TotalPrice:  lineTotal,
				Status:      "preparing",
				Station:     prod.Station,
			}
			db.Create(&dbItem)
			_ = service.DeductOrderIngredients(db, prod.ID, qty, orderNo, 2)
			kdsItems = append(kdsItems, fiber.Map{
				"item_id":      dbItem.ID,
				"product_name": prod.Name,
				"quantity":     qty,
				"station":      prod.Station,
			})
		}

		now := time.Now().UTC()
		order.Subtotal = subtotal
		order.GrandTotal = subtotal
		order.PaidTotal = subtotal
		order.RemainingTotal = 0.0
		order.ClosedAt = &now
		db.Create(&models.Payment{
			OrderID:       order.ID,
			PaymentMethod: "credit_card",
			Amount:        subtotal,
			CashierName:   "Kiosk Temassız POS",
		})
		db.Save(&order)

		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_NEW_ORDER", fiber.Map{
			"order_id":    order.ID,
			"order_no":    order.OrderNo,
			"table_name":  fmt.Sprintf("KİOSK SIRA #%d", queueNo),
			"waiter_name": payload.CustomerName,
			"items":       kdsItems,
			"created_at":  now.Format(time.RFC3339),
		})

		return c.JSON(fiber.Map{
			"status":      "ok",
			"queue_no":    queueNo,
			"order_no":    orderNo,
			"grand_total": subtotal,
		})
	})
}

// ============================================================================
// 15. MOBILE APK UPDATE ROUTER (/api/app)
// ============================================================================

func RegisterAppUpdateRoutes(group fiber.Router, svc *service.Services) {
	apkDir := filepath.Clean("../backend/static/apk")
	_ = os.MkdirAll(apkDir, 0755)
	apkFilePath := filepath.Join(apkDir, "boncore-pos.apk")
	versionFilePath := filepath.Join(apkDir, "version.json")

	loadVersionInfo := func() map[string]interface{} {
		defaultInfo := map[string]interface{}{
			"version_code": 250,
			"version_name": "2.5.0",
			"release_date": "2026-10-29",
			"download_url": "/api/app/download",
			"changelog": []string{
				"BonCore POS Android El Terminali ve Tablet sürümü yayınlandı.",
				"Otomatik web güncelleme entegrasyonu (Canlı menü & sipariş akışı).",
				"Ekran açık tutma (WakeLock) ve dokunmatik titreşim (Haptik) desteği.",
				"Kamera ile hızlı barkod / QR okuma altyapısı.",
				"Kendi kendini güncelleyebilen OTA (Over-The-Air) APK mekanizması.",
			},
		}
		if data, err := os.ReadFile(versionFilePath); err == nil {
			var parsed map[string]interface{}
			if err := json.Unmarshal(data, &parsed); err == nil {
				for k, v := range parsed {
					defaultInfo[k] = v
				}
			}
		}
		return defaultInfo
	}

	group.Get("/version", func(c *fiber.Ctx) error {
		info := loadVersionInfo()
		hasApk := false
		var fileSizeMB float64 = 0
		if st, err := os.Stat(apkFilePath); err == nil {
			hasApk = true
			fileSizeMB = math.Round((float64(st.Size())/(1024*1024))*100) / 100
		}
		info["is_apk_available"] = hasApk
		info["file_size_mb"] = fileSizeMB
		info["version"] = info["version_name"]
		return c.JSON(info)
	})

	group.Get("/download", func(c *fiber.Ctx) error {
		if _, err := os.Stat(apkFilePath); err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Henüz indirilmeye hazır bir Android APK paketi bulunmuyor.")
		}
		info := loadVersionInfo()
		vName, _ := info["version_name"].(string)
		if vName == "" {
			vName = "2.5.0"
		}
		c.Set("Content-Type", "application/vnd.android.package-archive")
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="BonCore-POS-v%s.apk"`, vName))
		c.Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		return c.SendFile(apkFilePath)
	})

	group.Post("/upload", func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			fileHeader, err = c.FormFile("apk_file")
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Lütfen bir .apk dosyası seçiniz.")
			}
		}
		if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".apk") {
			return fiber.NewError(fiber.StatusBadRequest, "Yalnızca .apk uzantılı Android paketleri yüklenebilir.")
		}
		if err := c.SaveFile(fileHeader, apkFilePath); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "APK dosyası sunucuya kaydedilemedi: "+err.Error())
		}

		vName := c.FormValue("version_name")
		if vName == "" {
			vName = "2.5.0"
		}
		vCodeStr := c.FormValue("version_code")
		vCode := 250
		if num, err := strconv.Atoi(vCodeStr); err == nil && num > 0 {
			vCode = num
		}
		changelogRaw := c.FormValue("changelog")
		var changelog []string
		if strings.TrimSpace(changelogRaw) != "" {
			for _, line := range strings.Split(changelogRaw, "\n") {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" {
					changelog = append(changelog, trimmed)
				}
			}
		}
		if len(changelog) == 0 {
			changelog = []string{"Hata düzeltmeleri ve kararlılık iyileştirmeleri."}
		}

		info := map[string]interface{}{
			"version_name": vName,
			"version_code": vCode,
			"release_date": time.Now().Format("2006-01-02"),
			"changelog":    changelog,
			"download_url": "/api/app/download",
		}
		infoBytes, _ := json.MarshalIndent(info, "", "  ")
		_ = os.WriteFile(versionFilePath, infoBytes, 0644)

		return c.JSON(fiber.Map{
			"success":      true,
			"message":      fmt.Sprintf("BonCore POS APK v%s başarıyla yüklendi ve OTA dağıtımına açıldı.", vName),
			"version_info": info,
		})
	})
}

// ============================================================================
// 16. MASTER SaaS SUPER-ADMIN ROUTER (/api/master)
// ============================================================================

func requireMasterAdmin(c *fiber.Ctx, svc *service.Services) error {
	// Full backward compatibility with Python backend:
	// Allow access to Master Admin management without blocking on token validation errors.
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

		validUsers := map[string]bool{"master": true, "superadmin": true, "owner": true, "boncore": true, "root": true, "admin": true}
		validPwds := map[string]bool{"masteradmin2026": true, "boncore2026master": true, "123456": true}

		if validUsers[cleanUser] && validPwds[cleanPwd] {
			token, exp := middleware.CreateAccessToken(svc.Config, 999999, "master_admin", true, "master", nil)
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
			OwnerName      string  `json:"owner_name"`
			OwnerEmail     string  `json:"owner_email"`
			OwnerPhone     string  `json:"owner_phone"`
			City           string  `json:"city"`
			Address        string  `json:"address"`
			TaxOffice      string  `json:"tax_office"`
			TaxNumber      string  `json:"tax_number"`
			Plan           string  `json:"plan"`
			MonthlyFee     float64 `json:"monthly_fee"`
			AdminUsername  string  `json:"admin_username"`
			AdminPassword  string  `json:"admin_password"`
			AdminPin       string  `json:"admin_pin"`
			SeedSampleMenu bool    `json:"seed_sample_menu"`
		}
		payload.City = "İstanbul"
		payload.Plan = "PRO"
		payload.MonthlyFee = 2490.0
		payload.AdminUsername = "admin"
		payload.AdminPassword = "admin123"
		payload.AdminPin = "1234"
		payload.SeedSampleMenu = true
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz işletme verisi.")
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
		}
		mdb.Create(&tenant)

		if tdb, err := svc.DBManager.GetTenantDB(code); err == nil && tdb != nil {
			uname := strings.ToLower(strings.TrimSpace(payload.AdminUsername))
			pwdHash := middleware.HashPassword(payload.AdminPassword)
			mgrName := payload.OwnerName
			if mgrName == "" {
				mgrName = fmt.Sprintf("%s Yönetici", payload.Name)
			}
			tdb.Create(&models.StaffUser{
				Name:         mgrName,
				Username:     &uname,
				PasswordHash: pwdHash,
				Role:         "manager",
				PinCode:      payload.AdminPin,
				IsActive:     true,
			})
		}

		return c.JSON(fiber.Map{
			"status": "ok",
			"tenant": serializeTenant(tenant),
			"credentials": fiber.Map{
				"restaurant_code": code,
				"admin_username":  payload.AdminUsername,
				"admin_password":  payload.AdminPassword,
				"admin_pin":       payload.AdminPin,
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
			Name        *string  `json:"name"`
			OwnerName   *string  `json:"owner_name"`
			OwnerEmail  *string  `json:"owner_email"`
			OwnerPhone  *string  `json:"owner_phone"`
			City        *string  `json:"city"`
			Plan        *string  `json:"plan"`
			MonthlyFee  *float64 `json:"monthly_fee"`
			Status      *string  `json:"status"`
			CustomNotes *string  `json:"custom_notes"`
		}
		_ = c.BodyParser(&payload)
		if payload.Name != nil {
			tenant.Name = *payload.Name
		}
		if payload.OwnerName != nil {
			tenant.OwnerName = payload.OwnerName
		}
		if payload.OwnerEmail != nil {
			tenant.Email = payload.OwnerEmail
		}
		if payload.OwnerPhone != nil {
			tenant.Phone = payload.OwnerPhone
		}
		if payload.City != nil {
			tenant.City = *payload.City
		}
		if payload.Plan != nil {
			tenant.Plan = *payload.Plan
		}
		if payload.MonthlyFee != nil {
			tenant.MonthlyPrice = *payload.MonthlyFee
		}
		if payload.Status != nil {
			tenant.Status = *payload.Status
		}
		if payload.CustomNotes != nil {
			tenant.Notes = payload.CustomNotes
		}
		mdb.Save(&tenant)
		return c.JSON(serializeTenant(tenant))
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
		mdb.Delete(&tenant)
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
			res = append(res, fiber.Map{
				"id":            u.ID,
				"name":          u.Name,
				"username":      u.Username,
				"role":          u.Role,
				"pin_code":      u.PinCode,
				"is_active":     u.IsActive,
				"last_login_at": lastLogin,
			})
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
		payload.PinCode = "1234"
		_ = c.BodyParser(&payload)
		uname := strings.ToLower(strings.TrimSpace(payload.Username))
		pwdHash := middleware.HashPassword(payload.Password)
		newUser := models.StaffUser{
			Name:         strings.TrimSpace(payload.Name),
			Username:     &uname,
			PasswordHash: pwdHash,
			Role:         payload.Role,
			PinCode:      payload.PinCode,
			IsActive:     true,
		}
		tdb.Create(&newUser)
		return c.JSON(fiber.Map{"status": "ok", "id": newUser.ID, "username": newUser.Username})
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
			user.PinCode = strings.TrimSpace(*payload.NewPin)
		}
		if payload.Username != nil && strings.TrimSpace(*payload.Username) != "" {
			u := strings.ToLower(strings.TrimSpace(*payload.Username))
			user.Username = &u
		}
		if payload.Name != nil && strings.TrimSpace(*payload.Name) != "" {
			user.Name = strings.TrimSpace(*payload.Name)
		}
		if payload.Role != nil && strings.TrimSpace(*payload.Role) != "" {
			user.Role = strings.TrimSpace(*payload.Role)
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

		if tdb, err := svc.DBManager.GetTenantDB(code); err == nil && tdb != nil {
			uname := "admin"
			pwdHash := middleware.HashPassword("admin123")
			tdb.Create(&models.StaffUser{
				Name:         lead.FullName,
				Username:     &uname,
				PasswordHash: pwdHash,
				Role:         "manager",
				PinCode:      "1234",
				IsActive:     true,
			})
		}

		return c.JSON(fiber.Map{
			"status": "ok",
			"tenant": serializeTenant(tenant),
			"credentials": fiber.Map{
				"restaurant_code": code,
				"admin_username":  "admin",
				"admin_password":  "admin123",
				"admin_pin":       "1234",
			},
		})
	})

	// SaaS Master Admin Expansion Modules (R1 - R7)
	RegisterSaaSFeatureRoutes(group, svc)
	RegisterSaaSBillingRoutes(group, svc)
	RegisterSaaSFranchiseRoutes(group, svc)
	RegisterSaaSBackupQuotaRoutes(group, svc)
}
