package middleware

import (
	"bytes"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

type cachedIdempotentResp struct {
	inFlight    bool
	status      int
	contentType string
	body        []byte
	expiresAt   time.Time
}

// IdempotencyMiddleware guards critical state-changing endpoints against duplicate client retries
// when the X-Idempotency-Key header is provided.
func IdempotencyMiddleware(ttl time.Duration) fiber.Handler {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	var mu sync.Mutex
	store := make(map[string]*cachedIdempotentResp)

	return func(c *fiber.Ctx) error {
		key := strings.TrimSpace(c.Get("X-Idempotency-Key"))
		if key == "" {
			return c.Next()
		}
		if len(key) > 128 {
			return fiber.NewError(fiber.StatusBadRequest, "X-Idempotency-Key 128 karakteri aşamaz.")
		}

		tenantCode := strings.TrimSpace(c.Get("X-Restaurant-Code"))
		if claims := GetUserClaims(c); claims != nil && strings.TrimSpace(claims.RC) != "" && !IsMasterClaims(claims) {
			tenantCode = claims.RC
		}
		compositeKey := tenantCode + ":" + c.Method() + ":" + c.Path() + ":" + key

		now := time.Now().UTC()
		mu.Lock()
		for k, entry := range store {
			if !entry.inFlight && now.After(entry.expiresAt) {
				delete(store, k)
			}
		}
		if existing, ok := store[compositeKey]; ok {
			if existing.inFlight {
				mu.Unlock()
				return fiber.NewError(fiber.StatusConflict, "Aynı X-Idempotency-Key ile başka bir istek şu anda işleniyor.")
			}
			if now.Before(existing.expiresAt) {
				status := existing.status
				ct := existing.contentType
				bodyCopy := bytes.Clone(existing.body)
				mu.Unlock()
				if ct != "" {
					c.Set("Content-Type", ct)
				}
				c.Set("X-Idempotency-Replay", "true")
				return c.Status(status).Send(bodyCopy)
			}
		}
		store[compositeKey] = &cachedIdempotentResp{
			inFlight:  true,
			expiresAt: now.Add(ttl),
		}
		mu.Unlock()

		err := c.Next()
		status := c.Response().StatusCode()
		if err != nil || status >= 500 || status == 0 {
			mu.Lock()
			delete(store, compositeKey)
			mu.Unlock()
			return err
		}

		ct := string(c.Response().Header.ContentType())
		bodyCopy := bytes.Clone(c.Response().Body())
		mu.Lock()
		store[compositeKey] = &cachedIdempotentResp{
			inFlight:    false,
			status:      status,
			contentType: ct,
			body:        bodyCopy,
			expiresAt:   time.Now().UTC().Add(ttl),
		}
		mu.Unlock()
		return nil
	}
}
