package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/redis/go-redis/v9"
)

const (
	// RedisPubSubChannel is the global Redis Pub/Sub channel for real-time POS/KDS/Waiter/QR events.
	RedisPubSubChannel = "boncore:ws:events"

	// WebSocket connection tuning parameters for sub-5ms dispatch & dead-peer detection.
	writeWait      = 5 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 64 * 1024
	sendBufferSize = 256
)

// ChannelWirePayload matches the exact JSON schema sent by `backend/app/websocket_hub.py`
// for `broadcast_to_channel` and `broadcast_all`:
// `{"type": "...", "data": {...}, "timestamp": "2026-11-03 17:00:00.000000"}`
type ChannelWirePayload struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp string      `json:"timestamp"`
}

// TableWirePayload matches the exact JSON schema sent by `backend/app/websocket_hub.py`
// for `broadcast_to_table`:
// `{"type": "...", "data": {...}, "table_id": 12}`
type TableWirePayload struct {
	Type    string      `json:"type"`
	Data    interface{} `json:"data"`
	TableID int         `json:"table_id"`
}

// PubSubEnvelope is the internal message published across Redis Pub/Sub nodes.
type PubSubEnvelope struct {
	TargetType string          `json:"target_type"` // "channel" | "table"
	TenantCode string          `json:"tenant_code,omitempty"`
	Channel    string          `json:"channel,omitempty"`
	TableID    int             `json:"table_id,omitempty"`
	WireBytes  json.RawMessage `json:"wire_bytes"`
}

// Client represents a single persistent WebSocket connection (POS, KDS, Waiter, Cashier, Delivery, or Customer QR Table).
type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	channel    string
	tableID    *int
	tenantCode string
	send       chan []byte
	closeOnce  sync.Once
}

// NewClient wraps a Fiber WebSocket connection into a managed Hub client.
func NewClient(hub *Hub, conn *websocket.Conn, channel string, tableID *int, tenantCode string) *Client {
	return &Client{
		hub:        hub,
		conn:       conn,
		channel:    channel,
		tableID:    tableID,
		tenantCode: tenantCode,
		send:       make(chan []byte, sendBufferSize),
	}
}

// SendQueued pushes raw JSON bytes to the client's outbound buffer without blocking.
func (c *Client) SendQueued(payload []byte) bool {
	select {
	case c.send <- payload:
		return true
	default:
		// Client outbound buffer is full (stalled/unresponsive network); evict client to protect Hub latency.
		go c.hub.Unregister(c)
		return false
	}
}

func (c *Client) closeSend() {
	c.closeOnce.Do(func() {
		close(c.send)
	})
}

// WritePump pumps messages from the Hub to the WebSocket connection with periodic Ping frames.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if c.conn == nil {
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			if c.conn == nil {
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump pumps incoming frames from the WebSocket connection and handles Pong / client heartbeats.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		if c.conn != nil {
			_ = c.conn.Close()
		}
	}()

	if c.conn == nil {
		return
	}

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Refresh read deadline on any incoming text/ping payload from the client
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		if len(msg) > 0 && string(msg) == "ping" {
			c.SendQueued([]byte(`{"type":"PONG","data":{}}`))
		}
	}
}

// Hub maintains the set of active WebSocket clients across channels and tables,
// coordinates Redis Pub/Sub real-time event fan-out, and exposes the L1/L2 CacheManager.
type Hub struct {
	mu            sync.RWMutex
	channels      map[string]map[*Client]struct{}
	tableChannels map[int]map[*Client]struct{}

	redisClient *redis.Client
	pubsub      *redis.PubSub
	isRedis     bool
	cache       *CacheManager

	ctx    context.Context
	cancel context.CancelFunc
}

// NewHub initializes the WebSocket Hub, attempts to connect to Redis for Pub/Sub & L2 Cache,
// and gracefully falls back to ultra-fast local In-Memory dispatch if Redis is unreachable.
func NewHub(redisURL string) *Hub {
	ctx, cancel := context.WithCancel(context.Background())

	h := &Hub{
		channels: map[string]map[*Client]struct{}{
			"pos":      make(map[*Client]struct{}),
			"kds":      make(map[*Client]struct{}),
			"cashier":  make(map[*Client]struct{}),
			"waiter":   make(map[*Client]struct{}),
			"delivery": make(map[*Client]struct{}),
			"all":      make(map[*Client]struct{}),
		},
		tableChannels: make(map[int]map[*Client]struct{}),
		ctx:           ctx,
		cancel:        cancel,
	}

	if redisURL != "" {
		opts, err := redis.ParseURL(redisURL)
		if err == nil {
			opts.DialTimeout = 1500 * time.Millisecond
			opts.ReadTimeout = 2 * time.Second
			opts.WriteTimeout = 2 * time.Second

			client := redis.NewClient(opts)
			pingCtx, pingCancel := context.WithTimeout(ctx, 1500*time.Millisecond)
			if pingErr := client.Ping(pingCtx).Err(); pingErr == nil {
				h.redisClient = client
				h.isRedis = true
				h.pubsub = client.Subscribe(ctx, RedisPubSubChannel)
				go h.listenRedisPubSub()
				log.Printf("[BonCore WS Hub] Redis Pub/Sub & Cache aktif (%s -> kanal: %s)", redisURL, RedisPubSubChannel)
			} else {
				_ = client.Close()
				log.Printf("[BonCore WS Hub] Redis erisilemedi (%v) — Dahili sub-ms In-Memory Pub/Sub & Cache motoru devrede.", pingErr)
			}
			pingCancel()
		}
	}

	h.cache = NewCacheManager(h.redisClient, h.isRedis)

	// Pre-warm Go JSON reflection cache and Windows local timezone initialization
	// so the very first real-time order broadcast executes in sub-millisecond time without cold-start allocation.
	_ = time.Now().Format("2006-01-02 15:04:05.000000")
	_, _ = json.Marshal(ChannelWirePayload{Type: "WARMUP", Data: map[string]interface{}{"ok": true}, Timestamp: "2026-01-01 00:00:00.000000"})
	_, _ = json.Marshal(TableWirePayload{Type: "WARMUP", Data: map[string]interface{}{"ok": true}, TableID: 0})
	_, _ = json.Marshal(PubSubEnvelope{TargetType: "channel", Channel: "pos", WireBytes: json.RawMessage(`{}`)})

	return h
}

// Cache returns the hybrid L1 In-Memory + L2 Redis CacheManager.
func (h *Hub) Cache() *CacheManager {
	return h.cache
}

// IsRedisActive reports whether Redis Pub/Sub & Cache are connected.
func (h *Hub) IsRedisActive() bool {
	return h.isRedis
}

// Register subscribes a client to its requested channel, the global "all" channel,
// and optionally a specific QR customer table channel (`table_id`).
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.channels[client.channel]; !exists {
		h.channels[client.channel] = make(map[*Client]struct{})
	}
	h.channels[client.channel][client] = struct{}{}
	h.channels["all"][client] = struct{}{}

	if client.tableID != nil {
		tid := *client.tableID
		if _, exists := h.tableChannels[tid]; !exists {
			h.tableChannels[tid] = make(map[*Client]struct{})
		}
		h.tableChannels[tid][client] = struct{}{}
	}
}

// Unregister removes a client from all subscribed channels and closes its outbound buffer.
func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if chMap, exists := h.channels[client.channel]; exists {
		delete(chMap, client)
	}
	if allMap, exists := h.channels["all"]; exists {
		delete(allMap, client)
	}

	if client.tableID != nil {
		tid := *client.tableID
		if tblMap, exists := h.tableChannels[tid]; exists {
			delete(tblMap, client)
			if len(tblMap) == 0 {
				delete(h.tableChannels, tid)
			}
		}
	}

	client.closeSend()
}

// ActiveClientCount returns the total number of unique connected WebSocket clients.
func (h *Hub) ActiveClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.channels["all"])
}

// BroadcastToChannel publishes an event to a specific channel ('pos', 'kds', 'cashier', 'waiter', 'delivery', 'all')
// and all clients subscribed to 'all'. Uses Redis Pub/Sub when active, with instant local fallback.
func (h *Hub) BroadcastToChannel(tenantCode string, channel string, eventType string, data interface{}) error {
	if data == nil {
		data = map[string]interface{}{}
	}
	wire := ChannelWirePayload{
		Type:      eventType,
		Data:      data,
		Timestamp: time.Now().Format("2006-01-02 15:04:05.000000"),
	}
	wireBytes, err := json.Marshal(wire)
	if err != nil {
		return err
	}

	envelope := PubSubEnvelope{
		TargetType: "channel",
		TenantCode: tenantCode,
		Channel:    channel,
		WireBytes:  wireBytes,
	}

	if h.isRedis && h.redisClient != nil {
		envBytes, err := json.Marshal(envelope)
		if err == nil {
			pubCtx, cancel := context.WithTimeout(h.ctx, 500*time.Millisecond)
			pubErr := h.redisClient.Publish(pubCtx, RedisPubSubChannel, envBytes).Err()
			cancel()
			if pubErr == nil {
				return nil
			}
			log.Printf("[BonCore WS Hub] Redis publish fallback to local memory: %v", pubErr)
		}
	}

	h.dispatchLocal(envelope)
	return nil
}

// BroadcastToTable publishes a targeted event to QR mobile clients seated at `tableID`.
func (h *Hub) BroadcastToTable(tenantCode string, tableID int, eventType string, data interface{}) error {
	if data == nil {
		data = map[string]interface{}{}
	}
	wire := TableWirePayload{
		Type:    eventType,
		Data:    data,
		TableID: tableID,
	}
	wireBytes, err := json.Marshal(wire)
	if err != nil {
		return err
	}

	envelope := PubSubEnvelope{
		TargetType: "table",
		TenantCode: tenantCode,
		TableID:    tableID,
		WireBytes:  wireBytes,
	}

	if h.isRedis && h.redisClient != nil {
		envBytes, err := json.Marshal(envelope)
		if err == nil {
			pubCtx, cancel := context.WithTimeout(h.ctx, 500*time.Millisecond)
			pubErr := h.redisClient.Publish(pubCtx, RedisPubSubChannel, envBytes).Err()
			cancel()
			if pubErr == nil {
				return nil
			}
			log.Printf("[BonCore WS Hub] Redis table publish fallback to local memory: %v", pubErr)
		}
	}

	h.dispatchLocal(envelope)
	return nil
}

// BroadcastAll broadcasts an event to every connected WebSocket client across all channels.
func (h *Hub) BroadcastAll(tenantCode string, eventType string, data interface{}) error {
	return h.BroadcastToChannel(tenantCode, "all", eventType, data)
}

// dispatchLocal performs lock-minimal, non-blocking sub-millisecond fan-out to local WebSocket clients.
func (h *Hub) dispatchLocal(env PubSubEnvelope) {
	h.mu.RLock()
	var targets []*Client

	if env.TargetType == "table" {
		if tblMap, ok := h.tableChannels[env.TableID]; ok {
			targets = make([]*Client, 0, len(tblMap))
			for client := range tblMap {
				targets = append(targets, client)
			}
		}
	} else {
		// When broadcasting to a specific channel (e.g. "kds"), deliver to that channel's clients.
		// When broadcasting to "all", deliver to all clients.
		seen := make(map[*Client]struct{})
		if env.Channel == "all" {
			if allMap, ok := h.channels["all"]; ok {
				for client := range allMap {
					targets = append(targets, client)
					seen[client] = struct{}{}
				}
			}
		} else {
			if chMap, ok := h.channels[env.Channel]; ok {
				for client := range chMap {
					targets = append(targets, client)
					seen[client] = struct{}{}
				}
			}
			// Also deliver to clients who explicitly connected to the global "all" channel (e.g. App.tsx, Dashboard)
			if allMap, ok := h.channels["all"]; ok {
				for client := range allMap {
					if client.channel == "all" {
						if _, already := seen[client]; !already {
							targets = append(targets, client)
							seen[client] = struct{}{}
						}
					}
				}
			}
		}
	}
	h.mu.RUnlock()

	for _, client := range targets {
		client.SendQueued(env.WireBytes)
	}
}

// listenRedisPubSub continuously consumes messages from Redis Pub/Sub and fans them out to local WebSocket clients.
func (h *Hub) listenRedisPubSub() {
	if h.pubsub == nil {
		return
	}
	ch := h.pubsub.Channel()
	for {
		select {
		case <-h.ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var env PubSubEnvelope
			if err := json.Unmarshal([]byte(msg.Payload), &env); err == nil {
				h.dispatchLocal(env)
			}
		}
	}
}

// Close cleanly shuts down the Redis Pub/Sub subscription and all active WebSocket client channels.
func (h *Hub) Close() {
	h.cancel()
	if h.pubsub != nil {
		_ = h.pubsub.Close()
	}
	if h.redisClient != nil {
		_ = h.redisClient.Close()
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.channels["all"] {
		client.closeSend()
	}
}
