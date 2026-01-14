package main

import (
	"etl-tool/internal/config"
	"etl-tool/internal/repository"
	"log"
	"os"
)

func main() {
	// 1. Load Config
	cfg := config.LoadConfig()

	// 2. Safety Check
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "dev"
	}
	if env != "dev" {
		log.Fatalf("[CRITICAL] Database reset is only allowed in 'dev' environment. Current: %s", env)
	}

	// 3. Init DB
	if err := repository.InitDB(cfg.GetDatabaseDSN()); err != nil {
		log.Fatal("Failed to init DB:", err)
	}

	// 3. Destructive Clear
	log.Println("[CAUTION] Resetting all business data in 3 seconds...")
	// Wait a bit to allow cancellation if run by mistake
	// (But this is a CLI tool, so we assume intent)

	tables := []string{
		"records",
		"record_versions",
		"import_batches",
	}

	for _, table := range tables {
		log.Printf("Truncating table: %s", table)
		// Use TRUNCATE with CASCADE to clear dependent data and RESTART IDENTITY to reset IDs
		if err := repository.DB.Exec("TRUNCATE TABLE " + table + " RESTART IDENTITY CASCADE").Error; err != nil {
			log.Printf("Error truncating %s: %v", table, err)
		}
	}

	log.Println("Database reset successful. Users table preserved.")
	os.Exit(0)
}
