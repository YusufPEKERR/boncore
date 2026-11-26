package api

import (
	"strconv"
	"strings"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

// RegisterWebSocketRoutes mounts the persistent WebSocket endpoints:
// 1. GET /ws/table/:table_id -> Customer QR mobile table live tracking (strictly isolated to table_id; never subscribed to "pos"/"all")
// 2. GET /ws/:channel        -> Authenticated POS, KDS, Cashier, Waiter, Delivery, All live event streams
func RegisterWebSocketRoutes(app *fiber.App, svc *service.Services) {
	if svc == nil || svc.WSHub == nil {
		return
	}
	hub := svc.WSHub

	// WebSocket Upgrade & Auth Guard Middleware for all /ws/* routes
	app.Use("/ws", func(c *fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}

		path := c.Path()
		// QR Customer table stream: require registered active tenant with qr_menu enabled, isolate strictly to tableID
		if strings.HasPrefix(path, "/ws/table/") {
			tenantCode := middleware.GetTenantCode(c)
			if svc.DBManager != nil && svc.DBManager.MasterGorm != nil {
				var tenant models.RestaurantTenant
				if err := svc.DBManager.MasterGorm.Where("code = ? AND status != ?", tenantCode, "deleted").First(&tenant).Error; err != nil {
					return fiber.NewError(fiber.StatusNotFound, "İşletme bulunamadı.")
				}
				if !middleware.IsFeatureEnabled(&tenant, "qr_menu") {
					return fiber.NewError(fiber.StatusForbidden, "QR menü modülü aktif değil.")
				}
			}
			c.Locals("tenant_code", tenantCode)
			return c.Next()
		}

		// Staff/POS/KDS/All WebSocket channels require a valid JWT or short-lived WS ticket
		claims := middleware.GetUserClaims(c)
		if claims == nil {
			rawTok := strings.TrimSpace(c.Query("ticket"))
			if rawTok == "" {
				rawTok = strings.TrimSpace(c.Query("token"))
			}
			if rawTok != "" {
				if decoded, err := middleware.DecodeAccessToken(svc.Config, rawTok); err == nil {
					claims = decoded
				}
			}
		}
		if claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "WebSocket bağlantısı için geçerli oturum gereklidir.")
		}

		tenantCode := middleware.GetTenantCode(c)
		if !middleware.IsMasterClaims(claims) && claims.RC != "" {
			tenantCode = claims.RC
		}
		c.Locals("tenant_code", tenantCode)
		return c.Next()
	})

	// 1. Customer QR Table WebSocket Endpoint (/ws/table/:table_id)
	// Strictly isolated to tableChannels[tableID] — empty channel prevents joining "pos" or "all".
	app.Get("/ws/table/:table_id", websocket.New(func(c *websocket.Conn) {
		tableIDStr := c.Params("table_id")
		tableID, err := strconv.Atoi(tableIDStr)
		if err != nil || tableID <= 0 {
			_ = c.Close()
			return
		}
		tenantCode, _ := c.Locals("tenant_code").(string)
		client := ws.NewClient(hub, c, "", &tableID, tenantCode)
		hub.Register(client)
		go client.WritePump()
		client.ReadPump()
	}))

	// 2. Channel WebSocket Endpoint (/ws/:channel -> pos, kds, cashier, waiter, delivery, all)
	app.Get("/ws/:channel", websocket.New(func(c *websocket.Conn) {
		channel := c.Params("channel")
		if channel == "" {
			channel = "pos"
		}
		tenantCode, _ := c.Locals("tenant_code").(string)
		client := ws.NewClient(hub, c, channel, nil, tenantCode)
		hub.Register(client)
		go client.WritePump()
		client.ReadPump()
	}))

	// 3. Fallback Root WebSocket Endpoint (/ws -> defaults to channel "all")
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		tenantCode, _ := c.Locals("tenant_code").(string)
		client := ws.NewClient(hub, c, "all", nil, tenantCode)
		hub.Register(client)
		go client.WritePump()
		client.ReadPump()
	}))
}
