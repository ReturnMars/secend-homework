package repository

import (
	"fmt"
	"log"

	"etl-tool/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB(dsn string) error {
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Auto Migrate
	log.Println("Running Auto Migration...")
	if err := DB.AutoMigrate(&model.ImportBatch{}, &model.Record{}); err != nil {
		return fmt.Errorf("failed to auto migrate: %w", err)
	}

	log.Println("Database initialized and migrated successfully.")
	return nil
}
