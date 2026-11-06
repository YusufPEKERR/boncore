package ws

// EventBroadcaster defines the contract for real-time WebSocket & Redis Pub/Sub broadcasting.
// Full implementation with Redis Pub/Sub and sub-5ms fan-out will be completed in ADIM 3.
type EventBroadcaster interface {
	BroadcastToChannel(tenantCode string, channel string, eventType string, data interface{}) error
	BroadcastToTable(tenantCode string, tableID int, eventType string, data interface{}) error
	BroadcastAll(tenantCode string, eventType string, data interface{}) error
	IsRedisActive() bool
}

// NoopBroadcaster is a placeholder implementation for the ADIM 2 skeleton before ADIM 3 Hub is wired.
type NoopBroadcaster struct{}

func NewNoopBroadcaster() *NoopBroadcaster {
	return &NoopBroadcaster{}
}

func (n *NoopBroadcaster) BroadcastToChannel(tenantCode string, channel string, eventType string, data interface{}) error {
	return nil
}

func (n *NoopBroadcaster) BroadcastToTable(tenantCode string, tableID int, eventType string, data interface{}) error {
	return nil
}

func (n *NoopBroadcaster) BroadcastAll(tenantCode string, eventType string, data interface{}) error {
	return nil
}

func (n *NoopBroadcaster) IsRedisActive() bool {
	return false
}
