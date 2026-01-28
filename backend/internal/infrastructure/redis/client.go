// internal/infrastructure/redis/client.go - Redis Client Initialization
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

// InitRedis initializes the global Redis client
func InitRedis(addr string, password string, db int) error {
	Client = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := Client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to redis: %v", err)
	}

	return nil
}
