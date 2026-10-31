// Package cache stores the Customer Information cache with a TTL.
package cache

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store is the minimum cache surface used by the external client.
type Store interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
}

// Redis is the production store; cif_cache lives in Redis per the spec.
type Redis struct{ client *redis.Client }

func (r *Redis) Get(ctx context.Context, key string) ([]byte, error) {
	value, err := r.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return value, err
}

func (r *Redis) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

// New returns a Redis store, or an in-process TTL store when Redis is unreachable.
// The fallback keeps the API usable in local runs; the cache contract still holds.
func New(addr, password string) Store {
	client := redis.NewClient(&redis.Options{Addr: addr, Password: password})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Warn("redis unavailable, using in-memory cache", "addr", addr, "error", err)
		return newMemory()
	}
	return &Redis{client: client}
}

type entry struct {
	value   []byte
	expires time.Time
}

type memory struct {
	mu      sync.Mutex
	entries map[string]entry
}

func newMemory() *memory { return &memory{entries: map[string]entry{}} }

func (m *memory) Get(_ context.Context, key string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item, ok := m.entries[key]
	if !ok || time.Now().After(item.expires) {
		delete(m.entries, key)
		return nil, nil
	}
	return item.value, nil
}

func (m *memory) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries[key] = entry{value: value, expires: time.Now().Add(ttl)}
	return nil
}
