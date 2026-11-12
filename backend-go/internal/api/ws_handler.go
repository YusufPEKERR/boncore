package api

import (
	"strconv"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

// RegisterWebSocketRoutes mounts the persistent WebSocket endpoints:
// 1. GET /ws/table/:table_id -> Customer QR mobile table live tracking (subscribed to "pos", "all", and table_id)
// 2. GET /ws/:channel        -> POS, KDS, Cashier, Waiter, Delivery, All live event streams
func RegisterWebSocketRoutes(app *fiber.App, hub *ws.Hub) {
	if hub == nil {
		return
	}

	// WebSocket Upgrade Guard Middleware for all /ws/* routes
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			// Pass resolved tenant code into Locals for the WebSocket connection
			c.Locals("tenant_code", middleware.GetTenantCode(c))
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// 1. Customer QR Table WebSocket Endpoint (/ws/table/:table_id)
	// Must be registered BEFORE /ws/:channel so `/ws/table/5` does not match `:channel = "table"`
	app.Get("/ws/table/:table_id", websocket.New(func(c *websocket.Conn) {
		tableIDStr := c.Params("table_id")
		tableID, err := strconv.Atoi(tableIDStr)
		if err != nil {
			_ = c.Close()
			return
		}
		tenantCode, _ := c.Locals("tenant_code").(string)
		client := ws.NewClient(hub, c, "pos", &tableID, tenantCode)
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
