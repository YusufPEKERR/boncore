package api

import (
	"os"
	"path/filepath"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RegisterRoutes mounts the /health endpoint, /ws WebSocket endpoints, and all 16 /api router groups
// with 100% route-level parity to `backend/app/main.py`.
func RegisterRoutes(app *fiber.App, svc *service.Services) {
	// Global Multi-Tenant & Optional Bearer Token Resolution Middleware
	app.Use(middleware.TenantAndAuthMiddleware(svc.Config))

	// Static file serving for uploads (tickets, attachments, photos)
	uploadsDir := filepath.Join(svc.DBManager.GetSqliteBaseDir(), "static", "uploads")
	_ = os.MkdirAll(uploadsDir, 0755)
	app.Static("/static/uploads", uploadsDir)

	// Health Check Endpoint (/health)
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":   "healthy",
			"app":      svc.Config.AppName,
			"is_redis": svc.Broadcaster.IsRedisActive(),
			"mode":     "production_ready",
		})
	})

	// Real-Time WebSocket Endpoints (/ws/:channel and /ws/table/:table_id)
	RegisterWebSocketRoutes(app, svc.WSHub)

	apiGroup := app.Group(svc.Config.APIV1Prefix)

	// SaaS Account Delinquency & Read-Only Guard Middleware (enforces 403 for suspended/read-only tenants)
	apiGroup.Use(middleware.CheckTenantDelinquencyMiddleware(svc))

	// 1. Auth & Staff Router (/api/auth)
	RegisterAuthRoutes(apiGroup.Group("/auth"), svc)

	// 2. QR Customer Menu Router (/api/qr) - Protected by RequireFeature("qr_menu")
	RegisterQRRoutes(apiGroup.Group("/qr", middleware.RequireFeature("qr_menu", svc)), svc)

	// 3. Tables & Floor Plan Router (/api/tables)
	RegisterTablesRoutes(apiGroup.Group("/tables"), svc)

	// 4. Products & Categories Router (/api/products)
	RegisterProductsRoutes(apiGroup.Group("/products"), svc)

	// 5. Orders, Discounts, Treats & Analytics Router (/api/orders)
	RegisterOrdersRoutes(apiGroup.Group("/orders"), svc)

	// 6. Kitchen Display System Router (/api/kds) - Protected by RequireFeature("kds")
	RegisterKDSRoutes(apiGroup.Group("/kds", middleware.RequireFeature("kds", svc)), svc)

	// 7. Cashier, Payments & Z-Reports Router (/api/cashier)
	RegisterCashierRoutes(apiGroup.Group("/cashier"), svc)

	// 8. Inventory, Warehouses & BOM Recipes Router (/api/inventory) - Protected by RequireFeature("inventory")
	RegisterInventoryRoutes(apiGroup.Group("/inventory", middleware.RequireFeature("inventory", svc)), svc)

	// 9. Delivery, Couriers & Online Aggregators Router (/api/delivery) - Protected by RequireFeature("delivery")
	RegisterDeliveryRoutes(apiGroup.Group("/delivery", middleware.RequireFeature("delivery", svc)), svc)

	// 10. Fiscal & GIB E-Adisyon Router (/api/fiscal) - Core restaurant receipt & adisyon generation
	RegisterFiscalRoutes(apiGroup.Group("/fiscal"), svc)

	// 11. Security & Audit Trail Router (/api/audit)
	RegisterAuditRoutes(apiGroup.Group("/audit"), svc)

	// 12. Settings, Permissions & Kitchen Groups Router (/api/settings)
	RegisterSettingsRoutes(apiGroup.Group("/settings"), svc)

	// 13. Hardware Agent & CAS CL-3000 Scale Router (/api/scale)
	RegisterScaleRoutes(apiGroup.Group("/scale"), svc)

	// 14. Advanced Modules: CRM, Reservations, Cost/Profit, Hotel, Kiosk (/api/modules)
	modulesGroup := apiGroup.Group("/modules")
	RegisterModulesRoutes(modulesGroup, svc)
	RegisterTenantModuleStatusRoute(modulesGroup, svc)

	// 16. Master SaaS Administration Router (/api/master) & Cross-Tenant POS Endpoints
	masterGroup := apiGroup.Group("/master")
	RegisterMasterRoutes(masterGroup, svc)
	RegisterSaaSFleetRoutes(masterGroup, apiGroup, svc)
	RegisterSaaSAnnouncementRoutes(masterGroup, apiGroup, svc)
	RegisterSaaSSupportRoutes(masterGroup, apiGroup, svc)
}
