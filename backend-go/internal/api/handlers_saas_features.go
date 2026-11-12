package api

import (
	"strconv"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// RegisterSaaSFeatureRoutes mounts R1 Feature Flags & Plan Management routes
func RegisterSaaSFeatureRoutes(group fiber.Router, svc *service.Services) {
	// GET /api/master/plans - list all standard SaaS plans
	group.Get("/plans", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var plans []models.SaaSPlan
		if err := mdb.Order("price_monthly asc").Find(&plans).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Planlar yüklenemedi: "+err.Error())
		}
		return c.JSON(plans)
	})

	// GET /api/master/tenants/:id/features - return tenant's plan and 7 feature toggles
	group.Get("/tenants/:id/features", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("id"))
		if err != nil {
			return err
		}

		return c.JSON(fiber.Map{
			"tenant_id":            tenant.ID,
			"tenant_code":          tenant.Code,
			"tenant_name":          tenant.Name,
			"plan":                 tenant.Plan,
			"plan_code":            tenant.PlanCode,
			"status":               tenant.Status,
			"read_only_mode":       tenant.ReadOnlyMode,
			"feature_qr_menu":      tenant.FeatureQRMenu,
			"feature_kds":          tenant.FeatureKDS,
			"feature_delivery":     tenant.FeatureDelivery,
			"feature_integrations": tenant.FeatureIntegrations,
			"feature_e_invoice":    tenant.FeatureEInvoice,
			"feature_stock_recipe": tenant.FeatureStockRecipe,
			"feature_loyalty":      tenant.FeatureLoyalty,
			"feature_hotel":        tenant.FeatureHotel,
			"feature_kiosk":        tenant.FeatureKiosk,
			"feature_reservations": tenant.FeatureReservations,
			"feature_cost_profit":  tenant.FeatureCostProfit,
			"is_brand_master":      tenant.IsBrandMaster,
			"brand_id":             tenant.BrandID,
			"branch_code":          tenant.BranchCode,
			"branch_name":          tenant.BranchName,
		})
	})

	// PUT /api/master/tenants/:id/features - update plan and individual module toggles
	group.Put("/tenants/:id/features", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("id"))
		if err != nil {
			return err
		}

		var payload struct {
			Plan                *string `json:"plan"`
			PlanCode            *string `json:"plan_code"`
			FeatureQRMenu       *bool   `json:"feature_qr_menu"`
			FeatureKDS          *bool   `json:"feature_kds"`
			FeatureDelivery     *bool   `json:"feature_delivery"`
			FeatureIntegrations *bool   `json:"feature_integrations"`
			FeatureEInvoice     *bool   `json:"feature_e_invoice"`
			FeatureStockRecipe  *bool   `json:"feature_stock_recipe"`
			FeatureLoyalty      *bool   `json:"feature_loyalty"`
			FeatureHotel        *bool   `json:"feature_hotel"`
			FeatureKiosk        *bool   `json:"feature_kiosk"`
			FeatureReservations *bool   `json:"feature_reservations"`
			FeatureCostProfit   *bool   `json:"feature_cost_profit"`
			ReadOnlyMode        *bool   `json:"read_only_mode"`
			Status              *string `json:"status"`
			MonthlyPrice        *float64 `json:"monthly_price"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi: "+err.Error())
		}

		updates := make(map[string]interface{})
		if payload.Plan != nil {
			updates["plan"] = *payload.Plan
			if payload.PlanCode == nil {
				updates["plan_code"] = *payload.Plan
			}
		}
		if payload.PlanCode != nil {
			updates["plan_code"] = *payload.PlanCode
			if payload.Plan == nil {
				updates["plan"] = *payload.PlanCode
			}
		}
		if payload.FeatureQRMenu != nil {
			updates["feature_qr_menu"] = *payload.FeatureQRMenu
		}
		if payload.FeatureKDS != nil {
			updates["feature_kds"] = *payload.FeatureKDS
		}
		if payload.FeatureDelivery != nil {
			updates["feature_delivery"] = *payload.FeatureDelivery
		}
		if payload.FeatureIntegrations != nil {
			updates["feature_integrations"] = *payload.FeatureIntegrations
		}
		if payload.FeatureEInvoice != nil {
			updates["feature_e_invoice"] = *payload.FeatureEInvoice
		}
		if payload.FeatureStockRecipe != nil {
			updates["feature_stock_recipe"] = *payload.FeatureStockRecipe
		}
		if payload.FeatureLoyalty != nil {
			updates["feature_loyalty"] = *payload.FeatureLoyalty
		}
		if payload.FeatureHotel != nil {
			updates["feature_hotel"] = *payload.FeatureHotel
		}
		if payload.FeatureKiosk != nil {
			updates["feature_kiosk"] = *payload.FeatureKiosk
		}
		if payload.FeatureReservations != nil {
			updates["feature_reservations"] = *payload.FeatureReservations
		}
		if payload.FeatureCostProfit != nil {
			updates["feature_cost_profit"] = *payload.FeatureCostProfit
		}
		if payload.ReadOnlyMode != nil {
			updates["read_only_mode"] = *payload.ReadOnlyMode
		}
		if payload.Status != nil {
			updates["status"] = *payload.Status
		}
		if payload.MonthlyPrice != nil {
			updates["monthly_price"] = *payload.MonthlyPrice
		}

		if len(updates) > 0 {
			if err := mdb.Model(&tenant).Updates(updates).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Özellikler güncellenemedi: "+err.Error())
			}
		}

		// Re-fetch updated tenant
		_ = mdb.First(&tenant, tenant.ID)

		// Broadcast FEATURES_UPDATED via WebSocket
		featurePayload := fiber.Map{
			"tenant_code":          tenant.Code,
			"plan":                 tenant.Plan,
			"plan_code":            tenant.PlanCode,
			"feature_qr_menu":      tenant.FeatureQRMenu,
			"feature_kds":          tenant.FeatureKDS,
			"feature_delivery":     tenant.FeatureDelivery,
			"feature_integrations": tenant.FeatureIntegrations,
			"feature_e_invoice":    tenant.FeatureEInvoice,
			"feature_stock_recipe": tenant.FeatureStockRecipe,
			"feature_loyalty":      tenant.FeatureLoyalty,
			"feature_hotel":        tenant.FeatureHotel,
			"feature_kiosk":        tenant.FeatureKiosk,
			"feature_reservations": tenant.FeatureReservations,
			"feature_cost_profit":  tenant.FeatureCostProfit,
			"read_only_mode":       tenant.ReadOnlyMode,
			"status":               tenant.Status,
		}
		_ = svc.Broadcaster.BroadcastToChannel(tenant.Code, "all", "FEATURES_UPDATED", featurePayload)
		_ = svc.Broadcaster.BroadcastToChannel(tenant.Code, "pos", "FEATURES_UPDATED", featurePayload)

		respMap := fiber.Map{
			"success": true,
			"message": "İşletme lisans ve modül özellikleri başarıyla güncellendi.",
			"tenant":  featurePayload,
		}
		for k, v := range featurePayload {
			respMap[k] = v
		}
		return c.JSON(respMap)
	})
}

// RegisterTenantModuleStatusRoute mounts GET /api/modules/status, /tenant-status, /tenant-modules
func RegisterTenantModuleStatusRoute(group fiber.Router, svc *service.Services) {
	statusHandler := func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		mdb := svc.DBManager.MasterGorm
		var tenant models.RestaurantTenant
		if err := mdb.Where("code = ?", tenantCode).First(&tenant).Error; err != nil {
			// If not found in master DB, return default active flags
			return c.JSON(fiber.Map{
				"tenant_code":    tenantCode,
				"plan":           "pro",
				"plan_code":      "pro",
				"status":         "active",
				"read_only_mode": false,
				"features": fiber.Map{
					"qr_menu":      true,
					"kds":          true,
					"delivery":     true,
					"integrations": true,
					"fiscal":       true,
					"inventory":    true,
					"loyalty":      true,
					"hotel":        true,
					"kiosk":        true,
					"reservations": true,
					"cost_profit":  true,
				},
			})
		}

		return c.JSON(fiber.Map{
			"tenant_code":    tenant.Code,
			"tenant_name":    tenant.Name,
			"plan":           tenant.Plan,
			"plan_code":      tenant.PlanCode,
			"status":         tenant.Status,
			"read_only_mode": tenant.ReadOnlyMode,
			"features": fiber.Map{
				"qr_menu":      tenant.FeatureQRMenu,
				"kds":          tenant.FeatureKDS,
				"delivery":     tenant.FeatureDelivery,
				"integrations": tenant.FeatureIntegrations,
				"fiscal":       tenant.FeatureEInvoice,
				"inventory":    tenant.FeatureStockRecipe,
				"loyalty":      tenant.FeatureLoyalty,
				"hotel":        tenant.FeatureHotel,
				"kiosk":        tenant.FeatureKiosk,
				"reservations": tenant.FeatureReservations,
				"cost_profit":  tenant.FeatureCostProfit,
			},
		})
	}

	group.Get("/status", statusHandler)
	group.Get("/tenant-status", statusHandler)
	group.Get("/tenant-modules", statusHandler)
}

func findTenantByIDOrCode(mdb *gorm.DB, idOrCode string) (*models.RestaurantTenant, error) {
	var tenant models.RestaurantTenant
	idNum, err := strconv.Atoi(idOrCode)
	if err == nil {
		if err := mdb.Where("id = ?", idNum).First(&tenant).Error; err == nil {
			return &tenant, nil
		}
	}
	if err := mdb.Where("code = ?", idOrCode).First(&tenant).Error; err == nil {
		return &tenant, nil
	}
	return nil, fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı: "+idOrCode)
}
