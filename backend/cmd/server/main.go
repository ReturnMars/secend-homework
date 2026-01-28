package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"etl-tool/internal/api"
	"etl-tool/internal/config"
	infra_redis "etl-tool/internal/infrastructure/redis"
	"etl-tool/internal/repository"
	"etl-tool/internal/service"
)

func main() {
	// 1. Load Config
	cfg := config.LoadConfig()

	// 2. Initialize Database
	if err := repository.InitDB(cfg.GetDatabaseDSN()); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// 2.1 Initialize Redis
	redisAddr := "127.0.0.1:6379"
	if cfg.Redis.Addr != "" {
		redisAddr = cfg.Redis.Addr
	}

	if err := infra_redis.InitRedis(redisAddr, "", 0); err != nil {
		log.Printf("Warning: Failed to connect to Redis at %s: %v. Async features may not work.", redisAddr, err)
	} else {
		log.Printf("Connected to Redis at %s", redisAddr)
	}

	// 3. Initialize Service
	cleanerService := service.NewCleanerService()

	// 3.1 Start Backgroup Worker (Embedded Mode for Dev)
	go func() {
		log.Println("[Worker] Embedded Worker started")
		ctx := context.Background()
		for {
			task, err := cleanerService.Queue.DequeueTask(2 * time.Second)
			if err != nil {
				if err.Error() != "redis: nil" {
					log.Printf("[Worker] Queue error: %v", err)
				}
				time.Sleep(1 * time.Second)
				continue
			}
			if task != nil {
				log.Printf("[Worker] Processing batch %d", task.BatchID)
				cleanerService.ProcessBatch(ctx, task.BatchID, task.FilePath)
			}
		}
	}()

	// 4. Setup Router
	r := api.SetupRouter(cleanerService)

	// 5. Run Server
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
