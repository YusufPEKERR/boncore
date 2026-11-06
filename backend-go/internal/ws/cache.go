package ws

import (
	"context"
	"encoding/json"
	"path/filepath"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type cacheEntry struct {
	value     string
	expiresAt time.Time
}

// CacheManager provides a hybrid L1 (In-Memory) + L2 (Redis) caching layer
// with 100% behavioral parity to `backend/app/cache.py` and zero-downtime fallback.
type CacheManager struct {
	mu          sync.RWMutex
	l1          map[string]cacheEntry
	redisClient *redis.Client
	isRedis     bool
}

func NewCacheManager(redisClient *redis.Client, isRedis bool) *CacheManager {
	cm := &CacheManager{
		l1:          make(map[string]cacheEntry),
		redisClient: redisClient,
		isRedis:     isRedis,
	}
	return cm
}

func (c *CacheManager) IsRedis() bool {
	return c.isRedis
}

func (c *CacheManager) Get(ctx context.Context, key string) (string, bool) {
	c.mu.RLock()
	entry, ok := c.l1[key]
	c.mu.RUnlock()
	if ok {
		if entry.expiresAt.IsZero() || time.Now().Before(entry.expiresAt) {
			return entry.value, true
		}
		c.mu.Lock()
		delete(c.l1, key)
		c.mu.Unlock()
	}

	if c.isRedis && c.redisClient != nil {
		val, err := c.redisClient.Get(ctx, key).Result()
		if err == nil {
			c.mu.Lock()
			c.l1[key] = cacheEntry{
				value:     val,
				expiresAt: time.Now().Add(30 * time.Second),
			}
			c.mu.Unlock()
			return val, true
		}
	}
	return "", false
}

func (c *CacheManager) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	var exp time.Time
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	c.mu.Lock()
	c.l1[key] = cacheEntry{
		value:     value,
		expiresAt: exp,
	}
	c.mu.Unlock()

	if c.isRedis && c.redisClient != nil {
		return c.redisClient.Set(ctx, key, value, ttl).Err()
	}
	return nil
}

func (c *CacheManager) GetJSON(ctx context.Context, key string, dest interface{}) bool {
	raw, ok := c.Get(ctx, key)
	if !ok || raw == "" {
		return false
	}
	if err := json.Unmarshal([]byte(raw), dest); err != nil {
		return false
	}
	return true
}

func (c *CacheManager) SetJSON(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	bytes, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.Set(ctx, key, string(bytes), ttl)
}

func (c *CacheManager) Delete(ctx context.Context, key string) error {
	c.mu.Lock()
	delete(c.l1, key)
	c.mu.Unlock()

	if c.isRedis && c.redisClient != nil {
		return c.redisClient.Del(ctx, key).Err()
	}
	return nil
}

func (c *CacheManager) Keys(ctx context.Context, pattern string) []string {
	if c.isRedis && c.redisClient != nil {
		keys, err := c.redisClient.Keys(ctx, pattern).Result()
		if err == nil {
			return keys
		}
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	var matched []string
	now := time.Now()
	for k, v := range c.l1 {
		if !v.expiresAt.IsZero() && now.After(v.expiresAt) {
			continue
		}
		if pattern == "*" || pattern == "" {
			matched = append(matched, k)
			continue
		}
		if ok, _ := filepath.Match(pattern, k); ok {
			matched = append(matched, k)
		}
	}
	return matched
}
