package ws

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestHubBroadcastAndSub5msLatency(t *testing.T) {
	hub := NewHub("") // Force local in-memory mode for deterministic unit test
	defer hub.Close()

	posClient := NewClient(hub, nil, "pos", nil, "fatihciftligi")
	kdsClient := NewClient(hub, nil, "kds", nil, "fatihciftligi")
	allClient := NewClient(hub, nil, "all", nil, "fatihciftligi")
	table12ID := 12
	qrTable12Client := NewClient(hub, nil, "pos", &table12ID, "fatihciftligi")

	hub.Register(posClient)
	hub.Register(kdsClient)
	hub.Register(allClient)
	hub.Register(qrTable12Client)

	if count := hub.ActiveClientCount(); count != 4 {
		t.Fatalf("expected 4 active clients, got %d", count)
	}

	// 1. Test BroadcastToChannel("kds") -> should deliver to kdsClient and allClient (and NOT duplicate to kdsClient)
	start := time.Now()
	err := hub.BroadcastToChannel("fatihciftligi", "kds", "KDS_NEW_ORDER", map[string]interface{}{
		"order_id":   101,
		"table_name": "Bahçe 4",
	})
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("BroadcastToChannel error: %v", err)
	}
	if elapsed > 5*time.Millisecond {
		t.Errorf("expected sub-5ms dispatch latency, got %v", elapsed)
	}
	t.Logf("[LATENCY] BroadcastToChannel fan-out completed in %v", elapsed)

	// Verify kdsClient received exactly 1 message with exact contract schema
	select {
	case msg := <-kdsClient.send:
		var parsed ChannelWirePayload
		if err := json.Unmarshal(msg, &parsed); err != nil {
			t.Fatalf("invalid JSON wire payload: %v", err)
		}
		if parsed.Type != "KDS_NEW_ORDER" {
			t.Errorf("expected type KDS_NEW_ORDER, got %s", parsed.Type)
		}
		if parsed.Timestamp == "" {
			t.Errorf("expected non-empty timestamp in wire payload")
		}
	case <-time.After(50 * time.Millisecond):
		t.Fatal("kdsClient did not receive KDS_NEW_ORDER")
	}

	// Ensure kdsClient did NOT receive a duplicate message (since it's in both channels["kds"] and channels["all"])
	select {
	case dup := <-kdsClient.send:
		t.Fatalf("kdsClient received duplicate message: %s", string(dup))
	default:
	}

	// 2. Test BroadcastToTable(12) -> should ONLY deliver to qrTable12Client with table_id envelope
	startTable := time.Now()
	err = hub.BroadcastToTable("fatihciftligi", 12, "TABLE_STATUS_CHANGED", map[string]interface{}{
		"status": "bill_requested",
	})
	tableElapsed := time.Since(startTable)
	if err != nil {
		t.Fatalf("BroadcastToTable error: %v", err)
	}
	t.Logf("[LATENCY] BroadcastToTable fan-out completed in %v", tableElapsed)

	select {
	case msg := <-qrTable12Client.send:
		var parsed TableWirePayload
		if err := json.Unmarshal(msg, &parsed); err != nil {
			t.Fatalf("invalid table JSON wire payload: %v", err)
		}
		if parsed.Type != "TABLE_STATUS_CHANGED" || parsed.TableID != 12 {
			t.Errorf("unexpected table payload: %+v", parsed)
		}
	case <-time.After(50 * time.Millisecond):
		t.Fatal("qrTable12Client did not receive TABLE_STATUS_CHANGED")
	}

	// Ensure kdsClient did NOT receive table-specific message
	select {
	case unexpected := <-kdsClient.send:
		t.Fatalf("kdsClient should not receive table 12 message: %s", string(unexpected))
	default:
	}

	// 3. Test CacheManager L1 In-Memory JSON Set/Get/Delete
	ctx := context.Background()
	type sampleMenuCache struct {
		Categories int `json:"categories"`
	}
	if err := hub.Cache().SetJSON(ctx, "menu:fatihciftligi", sampleMenuCache{Categories: 8}, time.Minute); err != nil {
		t.Fatalf("Cache SetJSON failed: %v", err)
	}
	var cached sampleMenuCache
	if ok := hub.Cache().GetJSON(ctx, "menu:fatihciftligi", &cached); !ok || cached.Categories != 8 {
		t.Fatalf("Cache GetJSON mismatch: ok=%v, val=%+v", ok, cached)
	}
	_ = hub.Cache().Delete(ctx, "menu:fatihciftligi")
	if ok := hub.Cache().GetJSON(ctx, "menu:fatihciftligi", &cached); ok {
		t.Fatal("expected deleted key to miss cache")
	}
}
