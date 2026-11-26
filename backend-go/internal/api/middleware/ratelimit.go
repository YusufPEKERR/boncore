package middleware

import (
	"sync"
	"time"
)

type rateBucket struct {
	failures  int
	windowEnd time.Time
}

// LoginRateLimiter limits repeated failed authentication attempts per IP/identifier.
type LoginRateLimiter struct {
	mu          sync.Mutex
	buckets     map[string]*rateBucket
	maxAttempts int
	window      time.Duration
}

// NewLoginRateLimiter creates a fixed-window rate limiter for authentication endpoints.
func NewLoginRateLimiter(maxAttempts int, window time.Duration) *LoginRateLimiter {
	if maxAttempts <= 0 {
		maxAttempts = 15
	}
	if window <= 0 {
		window = 5 * time.Minute
	}
	return &LoginRateLimiter{
		buckets:     make(map[string]*rateBucket),
		maxAttempts: maxAttempts,
		window:      window,
	}
}

// Allow checks if the key is currently permitted to attempt authentication.
func (rl *LoginRateLimiter) Allow(key string) bool {
	if rl == nil {
		return true
	}
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if len(rl.buckets) > 2048 {
		for k, b := range rl.buckets {
			if now.After(b.windowEnd) {
				delete(rl.buckets, k)
			}
		}
	}

	b, ok := rl.buckets[key]
	if !ok || now.After(b.windowEnd) {
		return true
	}
	return b.failures < rl.maxAttempts
}

// RecordFailure increments failure count for the given key.
func (rl *LoginRateLimiter) RecordFailure(key string) {
	if rl == nil {
		return
	}
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok || now.After(b.windowEnd) {
		rl.buckets[key] = &rateBucket{
			failures:  1,
			windowEnd: now.Add(rl.window),
		}
		return
	}
	b.failures++
}

// Reset clears failures for the key after successful authentication.
func (rl *LoginRateLimiter) Reset(key string) {
	if rl == nil {
		return
	}
	rl.mu.Lock()
	delete(rl.buckets, key)
	rl.mu.Unlock()
}
