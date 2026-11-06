package api

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// RegisterSaaSFranchiseRoutes mounts R4 Multi-Branch & Franchise Management routes
func RegisterSaaSFranchiseRoutes(group fiber.Router, svc *service.Services) {
	// GET /api/master/brands - List franchise brands with branch counts
	group.Get("/brands", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var brands []models.FranchiseBrand
		if err := mdb.Order("name asc").Find(&brands).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Franchise markaları yüklenemedi: "+err.Error())
		}

		var tenants []models.RestaurantTenant
		mdb.Find(&tenants)

		branchCounts := make(map[int]int)
		for _, t := range tenants {
			if t.BrandID != nil {
				branchCounts[*t.BrandID]++
			}
		}

		res := make([]fiber.Map, 0, len(brands))
		for _, b := range brands {
			res = append(res, fiber.Map{
				"id":                   b.ID,
				"code":                 b.Code,
				"name":                 b.Name,
				"tax_number":           b.TaxNumber,
				"tax_office":           b.TaxOffice,
				"headquarters_address": b.HeadquartersAddress,
				"contact_person":       b.ContactPerson,
				"contact_phone":        b.ContactPhone,
				"contact_email":        b.ContactEmail,
				"primary_tenant_code":  b.PrimaryTenantCode,
				"status":               b.Status,
				"branch_count":         branchCounts[b.ID],
				"created_at":           b.CreatedAt,
				"updated_at":           b.UpdatedAt,
			})
		}

		return c.JSON(res)
	})

	// POST /api/master/brands - Create a new franchise brand
	group.Post("/brands", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		var payload struct {
			Code                string  `json:"code"`
			Name                string  `json:"name"`
			TaxNumber           *string `json:"tax_number"`
			TaxOffice           *string `json:"tax_office"`
			HeadquartersAddress *string `json:"headquarters_address"`
			ContactPerson       *string `json:"contact_person"`
			ContactPhone        *string `json:"contact_phone"`
			ContactEmail        *string `json:"contact_email"`
			PrimaryTenantCode   string  `json:"primary_tenant_code"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz marka verisi: "+err.Error())
		}
		cleanCode := strings.ToLower(strings.TrimSpace(payload.Code))
		if cleanCode == "" || len(payload.Name) < 2 {
			return fiber.NewError(fiber.StatusBadRequest, "Marka kodu ve adı zorunludur.")
		}

		mdb := svc.DBManager.MasterGorm
		var exists models.FranchiseBrand
		if err := mdb.Where("code = ?", cleanCode).First(&exists).Error; err == nil {
			return fiber.NewError(fiber.StatusBadRequest, "Bu marka kodu zaten mevcut: "+cleanCode)
		}

		brand := models.FranchiseBrand{
			Code:                cleanCode,
			Name:                strings.TrimSpace(payload.Name),
			TaxNumber:           payload.TaxNumber,
			TaxOffice:           payload.TaxOffice,
			HeadquartersAddress: payload.HeadquartersAddress,
			ContactPerson:       payload.ContactPerson,
			ContactPhone:        payload.ContactPhone,
			ContactEmail:        payload.ContactEmail,
			PrimaryTenantCode:   payload.PrimaryTenantCode,
			Status:              "active",
		}

		if err := mdb.Create(&brand).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Marka oluşturulamadı: "+err.Error())
		}

		// If primary tenant is given, associate it
		if brand.PrimaryTenantCode != "" {
			mdb.Model(&models.RestaurantTenant{}).
				Where("code = ?", brand.PrimaryTenantCode).
				Updates(map[string]interface{}{
					"brand_id":        brand.ID,
					"is_brand_master": true,
				})
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Franchise markası başarıyla oluşturuldu.",
			"brand":   brand,
		})
	})

	// GET /api/master/brands/:id/analytics - Consolidated turnover, orders & branch comparisons
	group.Get("/brands/:id/analytics", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		idParam := c.Params("id")
		mdb := svc.DBManager.MasterGorm

		var brand models.FranchiseBrand
		idNum, convErr := strconv.Atoi(idParam)
		if convErr == nil {
			if err := mdb.Where("id = ?", idNum).First(&brand).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Marka bulunamadı: "+idParam)
			}
		} else {
			if err := mdb.Where("code = ?", idParam).First(&brand).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Marka bulunamadı: "+idParam)
			}
		}

		// Find all branches associated with this brand
		var branches []models.RestaurantTenant
		mdb.Where("brand_id = ?", brand.ID).Order("id asc").Find(&branches)

		// Aggregate operational metrics across all branches
		totalTurnoverToday := 0.0
		totalTurnoverMonth := 0.0
		totalOrdersToday := 0
		totalActiveTables := 0
		branchReports := make([]fiber.Map, 0, len(branches))

		for _, b := range branches {
			branchRevToday := 0.0
			branchRevMonth := 0.0
			branchOrdersToday := 0
			branchActiveTables := 0

			if tdb, tErr := svc.DBManager.GetTenantDB(b.Code); tErr == nil && tdb != nil {
				var todayRes struct{ Total float64 }
				tdb.Raw("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE DATE(created_at) = CURRENT_DATE").Scan(&todayRes)
				branchRevToday = todayRes.Total

				var monthRes struct{ Total float64 }
				tdb.Raw("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").Scan(&monthRes)
				branchRevMonth = monthRes.Total

				var oToday int64
				tdb.Raw("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE").Scan(&oToday)
				branchOrdersToday = int(oToday)

				var aTables int64
				tdb.Model(&models.Table{}).Where("status != ? AND status != ?", "empty", "available").Count(&aTables)
				branchActiveTables = int(aTables)
			}

			totalTurnoverToday += branchRevToday
			totalTurnoverMonth += branchRevMonth
			totalOrdersToday += branchOrdersToday
			totalActiveTables += branchActiveTables

			branchReports = append(branchReports, fiber.Map{
				"branch_id":        b.ID,
				"branch_code":      b.Code,
				"branch_name":      b.Name,
				"city":             b.City,
				"is_brand_master":  b.IsBrandMaster,
				"status":           b.Status,
				"turnover_today":   round2(branchRevToday),
				"turnover_month":   round2(branchRevMonth),
				"orders_today":     branchOrdersToday,
				"active_tables":    branchActiveTables,
			})
		}

		return c.JSON(fiber.Map{
			"brand": fiber.Map{
				"id":   brand.ID,
				"code": brand.Code,
				"name": brand.Name,
			},
			"consolidated": fiber.Map{
				"total_branches":         len(branches),
				"total_turnover_today":   round2(totalTurnoverToday),
				"total_turnover_month":   round2(totalTurnoverMonth),
				"total_orders_today":     totalOrdersToday,
				"total_active_tables":    totalActiveTables,
				"average_branch_revenue": round2(safeDiv(totalTurnoverToday, float64(len(branches)))),
			},
			"branches": branchReports,
		})
	})

	// POST /api/master/menu/clone - Clone menu categories, items, and variants across branches
	group.Post("/menu/clone", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		var payload struct {
			SourceTenantCode       string   `json:"source_tenant_code"`
			TargetTenantCodes      []string `json:"target_tenant_codes"`
			CloneCategories        bool     `json:"clone_categories"`
			CloneProducts          bool     `json:"clone_products"`
			PriceAdjustmentPercent float64  `json:"price_adjustment_percent"`
			ClonedBy               string   `json:"cloned_by"`
		}
		payload.CloneCategories = true
		payload.CloneProducts = true
		payload.ClonedBy = "master_admin"
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz menü klonlama verisi: "+err.Error())
		}

		if payload.SourceTenantCode == "" || len(payload.TargetTenantCodes) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "source_tenant_code ve en az bir target_tenant_codes belirtilmelidir.")
		}

		// 1. Get Source Branch DB
		sourceDB, err := svc.DBManager.GetTenantDB(payload.SourceTenantCode)
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kaynak işletme veritabanı açılamadı: "+payload.SourceTenantCode)
		}

		// Load Categories from source
		var sourceCategories []models.Category
		sourceDB.Order("order_index asc, id asc").Find(&sourceCategories)

		// Load Products with Variants and Modifier Groups from source
		var sourceProducts []models.Product
		sourceDB.Preload("Variants").Preload("ModifierGroups.Options").Find(&sourceProducts)

		mdb := svc.DBManager.MasterGorm
		totalCategoriesCopied := 0
		totalProductsCopied := 0
		successfulTargets := make([]string, 0, len(payload.TargetTenantCodes))

		adjPercent := payload.PriceAdjustmentPercent
		if adjPercent < -90.0 {
			adjPercent = -90.0
		}
		if adjPercent > 500.0 {
			adjPercent = 500.0
		}
		multiplier := 1.0 + (adjPercent / 100.0)

		// 2. Clone into each target branch
		for _, targetCode := range payload.TargetTenantCodes {
			if targetCode == payload.SourceTenantCode {
				continue
			}
			targetDB, tErr := svc.DBManager.GetTenantDB(targetCode)
			if tErr != nil {
				continue
			}

			// Map old category ID -> new category ID
			catIDMap := make(map[int]int)

			// Transaction per target branch
			txErr := targetDB.Transaction(func(tx *gorm.DB) error {
				// Copy categories
				for _, sc := range sourceCategories {
					var existingCat models.Category
					if err := tx.Where("name = ?", sc.Name).First(&existingCat).Error; err == nil {
						catIDMap[sc.ID] = existingCat.ID
					} else {
						newCat := models.Category{
							Name:          sc.Name,
							Icon:          sc.Icon,
							Color:         sc.Color,
							OrderIndex:    sc.OrderIndex,
							TargetStation: sc.TargetStation,
							ShowInPos:     sc.ShowInPos,
						}
						if err := tx.Create(&newCat).Error; err != nil {
							return err
						}
						catIDMap[sc.ID] = newCat.ID
						totalCategoriesCopied++
					}
				}

				// Copy products
				for _, sp := range sourceProducts {
					targetCatID, ok := catIDMap[sp.CategoryID]
					if !ok {
						if len(catIDMap) > 0 {
							for _, id := range catIDMap {
								targetCatID = id
								break
							}
						} else {
							targetCatID = 1
						}
					}

					adjustedPrice := round2(sp.BasePrice * multiplier)
					if adjustedPrice < 0.0 {
						adjustedPrice = 0.0
					}

					var existingProd models.Product
					if err := tx.Where("name = ? AND category_id = ?", sp.Name, targetCatID).First(&existingProd).Error; err == nil {
						// Update price if exists
						existingProd.BasePrice = adjustedPrice
						tx.Save(&existingProd)
					} else {
						newProd := models.Product{
							CategoryID:  targetCatID,
							Name:        sp.Name,
							Description: sp.Description,
							BasePrice:   adjustedPrice,
							PluCode:     sp.PluCode,
							Barcode:     sp.Barcode,
							VatRate:     sp.VatRate,
							Station:     sp.Station,
							OrderIndex:  sp.OrderIndex,
							IsAvailable: sp.IsAvailable,
							ShowInPos:   sp.ShowInPos,
							ImageURL:    sp.ImageURL,
							Calories:    sp.Calories,
							Allergens:   sp.Allergens,
							IsVegan:     sp.IsVegan,
							IsSpicy:     sp.IsSpicy,
						}
						if err := tx.Create(&newProd).Error; err != nil {
							return err
						}
						totalProductsCopied++

						// Copy variants
						for _, sv := range sp.Variants {
							vPrice := round2(sv.PriceDelta * multiplier)
							if vPrice < 0.0 {
								vPrice = 0.0
							}
							newVar := models.ProductVariant{
								ProductID:  newProd.ID,
								Name:       sv.Name,
								PriceDelta: vPrice,
								IsDefault:  sv.IsDefault,
							}
							tx.Create(&newVar)
						}

						// Copy modifier groups and options
						for _, smg := range sp.ModifierGroups {
							newGroup := models.ModifierGroup{
								ProductID:    newProd.ID,
								Name:         smg.Name,
								IsRequired:   smg.IsRequired,
								MinSelection: smg.MinSelection,
								MaxSelection: smg.MaxSelection,
							}
							if err := tx.Create(&newGroup).Error; err == nil {
								for _, opt := range smg.Options {
									optPrice := round2(opt.Price * multiplier)
									if optPrice < 0.0 {
										optPrice = 0.0
									}
									newOpt := models.ModifierOption{
										GroupID: newGroup.ID,
										Name:    opt.Name,
										Price:   optPrice,
									}
									tx.Create(&newOpt)
								}
							}
						}
					}
				}
				return nil
			})

			status := "completed"
			var errMsg *string
			if txErr != nil {
				status = "failed"
				msg := txErr.Error()
				errMsg = &msg
			} else {
				successfulTargets = append(successfulTargets, targetCode)
			}

			// Record in menu_clone_history in Master DB
			history := models.MenuCloneHistory{
				SourceTenantCode: payload.SourceTenantCode,
				TargetTenantCode: targetCode,
				CategoriesCopied: len(sourceCategories),
				ProductsCopied:   len(sourceProducts),
				ClonedBy:         payload.ClonedBy,
				Status:           status,
				ErrorMessage:     errMsg,
			}
			mdb.Create(&history)
		}

		return c.JSON(fiber.Map{
			"success":                   true,
			"message":                   fmt.Sprintf("Menü şablonu %d hedef şubeye başarıyla klonlandı.", len(successfulTargets)),
			"source_tenant":             payload.SourceTenantCode,
			"target_tenants":            successfulTargets,
			"total_categories_copied":   totalCategoriesCopied,
			"total_products_copied":     totalProductsCopied,
			"price_adjustment_percent":  payload.PriceAdjustmentPercent,
		})
	})
}

func safeDiv(a, b float64) float64 {
	if b == 0 {
		return 0.0
	}
	return a / b
}
