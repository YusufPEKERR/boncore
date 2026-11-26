package ws

import (
	"fmt"
	"sync"
	"testing"
)

func TestHubConcurrentRegisterUnregisterBroadcastNoPanic(t *testing.T) {
	hub := NewHub("")
	defer hub.Close()

	const workers = 16
	const iters = 40
	var wg sync.WaitGroup

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := 0; i < iters; i++ {
				tblID := (id % 4) + 1
				ch := "pos"
				if id%2 == 1 {
					ch = "kds"
				}
				c1 := NewClient(hub, nil, ch, nil, "tenant-a")
				c2 := NewClient(hub, nil, "", &tblID, "tenant-a")
				hub.Register(c1)
				hub.Register(c2)

				_ = hub.BroadcastToChannel("tenant-a", ch, "ORDER_UPDATED", map[string]interface{}{
					"worker": id,
					"iter":   i,
				})
				_ = hub.BroadcastToTable("tenant-a", tblID, "TABLE_ORDER_UPDATED", map[string]interface{}{
					"worker": id,
					"iter":   i,
				})

				hub.Unregister(c1)
				hub.Unregister(c2)
				// Intentional second Unregister to verify idempotency and closed-channel safety
				hub.Unregister(c1)
				_ = hub.BroadcastAll("tenant-a", fmt.Sprintf("PING_%d", id), map[string]interface{}{"ok": true})
			}
		}(w)
	}

	wg.Wait()
	if got := hub.ActiveClientCount(); got != 0 {
		t.Fatalf("expected 0 active clients after concurrent unregister, got %d", got)
	}
}
