package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"etl-tool/internal/config"
	infra_redis "etl-tool/internal/infrastructure/redis"
	"etl-tool/internal/repository"
	"etl-tool/internal/service"
)

func main() {
	log.Println("[Worker] Starting CSV Processing Worker...")

	// 1. Load Config
	cfg := config.LoadConfig()

	// 2. Initialize Database
	if err := repository.InitDB(cfg.GetDatabaseDSN()); err != nil {
		log.Fatalf("[Worker] Failed to connect to database: %v", err)
	}

	// 3. Initialize Redis
	redisAddr := "127.0.0.1:6379"
	if cfg.Redis.Addr != "" {
		redisAddr = cfg.Redis.Addr
	}
	if err := infra_redis.InitRedis(redisAddr, "", 0); err != nil {
		log.Fatalf("[Worker] Failed to connect to Redis: %v", err)
	}

	// 4. Initialize Service
	svc := service.NewCleanerService()

	// 5. Worker Loop
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("[Worker] Shutting down...")
		cancel()
	}()

	log.Println("[Worker] Waiting for tasks...")
	for {
		select {
		case <-ctx.Done():
			log.Println("[Worker] Stopped.")
			return
		default:
			// Blocking pop with timeout (allows checking context periodically)
			task, err := svc.Queue.DequeueTask(5 * time.Second)
			if err != nil {
				// Redis nil means timeout (no task)
				if err.Error() == "redis: nil" {
					continue
				}
				// Retry on connection error
				log.Printf("[Worker] Redis error: %v. Retrying in 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}

			if task != nil {
				log.Printf("[Worker] Received task: ID=%d File=%s", task.BatchID, task.FilePath)
				svc.ProcessBatch(ctx, task.BatchID, task.FilePath)
				log.Printf("[Worker] Task %d completed/processed", task.BatchID)
			}
		}
	}
}
