package main

import (
	"fmt"
	"log"

	"etl-tool/internal/api"
	"etl-tool/internal/config"
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

	// 3. Initialize Service
	cleanerService := service.NewCleanerService()

	// 4. Setup Router
	r := api.SetupRouter(cleanerService)

	// 5. Run Server
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
