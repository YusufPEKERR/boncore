package middleware

import (
	"fmt"
	"strings"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RequireFeature returns a Fiber middleware handler that enforces module licensing.
// If the tenant does not have the specified feature flag enabled, it rejects the request with HTTP 403 Forbidden.
func RequireFeature(featureKey string, svc *service.Services) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Master admin bypasses feature restrictions
		if claims := GetUserClaims(c); claims != nil && (claims.Role == "master_admin" || claims.Role == "superadmin") {
			return c.Next()
		}

		tenantCode := GetTenantCode(c)
		if tenantCode == "" {
			tenantCode = "fatihciftligi"
		}

		mdb := svc.DBManager.MasterGorm
		if mdb == nil {
			return c.Next()
		}

		var tenant models.RestaurantTenant
		if err := mdb.Where("code = ?", tenantCode).First(&tenant).Error; err != nil {
			// If tenant record is not yet in master DB, allow pass-through
			return c.Next()
		}

		if !IsFeatureEnabled(&tenant, featureKey) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"detail":  fmt.Sprintf("Bu modül işletmeniz için aktif değildir (%s). Lütfen paketinizi yükseltin veya yöneticiyle iletişime geçin.", featureKey),
				"feature": featureKey,
				"code":    "FEATURE_DISABLED",
			})
		}

		return c.Next()
	}
}

// IsFeatureEnabled evaluates whether the given feature key is enabled for the tenant.
func IsFeatureEnabled(tenant *models.RestaurantTenant, key string) bool {
	if tenant == nil {
		return true
	}
	cleanKey := strings.ToLower(strings.TrimSpace(key))
	switch cleanKey {
	case "qr", "qr_menu", "feature_qr_menu":
		return tenant.FeatureQRMenu
	case "kds", "kitchen", "feature_kds":
		return tenant.FeatureKDS
	case "delivery", "feature_delivery":
		return tenant.FeatureDelivery
	case "integrations", "aggregator", "feature_integrations":
		return tenant.FeatureIntegrations
	case "fiscal", "e_invoice", "feature_e_invoice":
		return tenant.FeatureEInvoice
	case "stock", "recipe", "inventory", "feature_stock_recipe":
		return tenant.FeatureStockRecipe
	case "loyalty", "crm", "feature_loyalty":
		return tenant.FeatureLoyalty
	case "hotel", "folio", "pms", "feature_hotel":
		return tenant.FeatureHotel
	case "kiosk", "cfd", "feature_kiosk":
		return tenant.FeatureKiosk
	case "reservations", "reservation", "feature_reservations":
		return tenant.FeatureReservations
	case "cost_profit", "profit", "wizard", "feature_cost_profit":
		return tenant.FeatureCostProfit
	default:
		return true
	}
}

// CheckTenantDelinquencyMiddleware enforces SaaS subscription delinquency rules:
// - If tenant status == "suspended": all requests are blocked with HTTP 403 Forbidden.
// - If tenant status == "read_only" or ReadOnlyMode == true: write operations (POST, PUT, DELETE, PATCH)
//   are blocked with HTTP 403 Forbidden. Read operations (GET, HEAD, OPTIONS) are allowed.
func CheckTenantDelinquencyMiddleware(svc *service.Services) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()

		// Bypass delinquency checks for master admin routes, public health, auth logins, and heartbeats
		if strings.HasPrefix(path, "/api/master") ||
			strings.HasPrefix(path, "/health") ||
			strings.HasPrefix(path, "/api/auth/login") ||
			strings.HasPrefix(path, "/api/auth/pin-login") ||
			strings.HasPrefix(path, "/api/heartbeat") ||
			strings.HasPrefix(path, "/ws") ||
			strings.HasPrefix(path, "/static") {
			return c.Next()
		}

		// Master admin bypasses delinquency
		if claims := GetUserClaims(c); claims != nil && (claims.Role == "master_admin" || claims.Role == "superadmin") {
			return c.Next()
		}

		tenantCode := GetTenantCode(c)
		if tenantCode == "" {
			tenantCode = "fatihciftligi"
		}

		mdb := svc.DBManager.MasterGorm
		if mdb == nil {
			return c.Next()
		}

		var tenant models.RestaurantTenant
		if err := mdb.Where("code = ?", tenantCode).First(&tenant).Error; err != nil {
			return c.Next()
		}

		// 1. Account Suspended Check
		if strings.EqualFold(tenant.Status, "suspended") {
			reason := "Abonelik ödemesi yapılmadığı için hesabınız askıya alınmıştır."
			if tenant.SuspensionReason != nil && *tenant.SuspensionReason != "" {
				reason = *tenant.SuspensionReason
			}
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"detail": fmt.Sprintf("Hesap Askıya Alındı: %s", reason),
				"status": "suspended",
				"code":   "ACCOUNT_SUSPENDED",
			})
		}

		// 2. Read-Only Mode Check (Enforce read-only: block POST, PUT, DELETE, PATCH)
		if tenant.ReadOnlyMode || strings.EqualFold(tenant.Status, "read_only") {
			method := c.Method()
			if method == fiber.MethodPost || method == fiber.MethodPut || method == fiber.MethodDelete || method == fiber.MethodPatch {
				// Allow support ticket submissions even in read-only mode so restaurant can request assistance
				if strings.HasPrefix(path, "/api/support/tickets") {
					return c.Next()
				}

				reason := "Vadesi geçen fatura nedeniyle işletmeniz salt okunur (read-only) modundadır."
				if tenant.SuspensionReason != nil && *tenant.SuspensionReason != "" {
					reason = *tenant.SuspensionReason
				}
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"detail": fmt.Sprintf("Salt Okunur Mod: %s Yeni sipariş veya değişiklik yapılamaz.", reason),
					"status": "read_only",
					"code":   "READ_ONLY_MODE",
				})
			}
		}

		return c.Next()
	}
}
