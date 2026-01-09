package repository

import (
	"database/sql"
	"etl-tool/internal/model"
	"fmt"
	"log"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB(dsn string) error {
	var err error

	// 1. Connect using GORM, with SILENT logger for performance and clean console
	DB, err = gorm.Open(gormPostgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// 2. Run Database Migrations (golang-migrate)
	log.Println("Step 1/2: Checking base migrations...")
	if err := runMigrations(dsn); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	// 3. 分阶段 AutoMigrate
	log.Println("Step 2/3: Checking Schema (Base Tables)...")
	start := time.Now()
	// 先迁移小表，确保基础功能立即可用
	if err := DB.AutoMigrate(&model.User{}, &model.ImportBatch{}, &model.RecordVersion{}); err != nil {
		return fmt.Errorf("base automigrate failed: %w", err)
	}

	log.Println("Step 2/3: Checking Schema (Massive Record Table)...")
	// 针对 20M 行的 Record 表进行迁移（GORM 在此处仅扫描元数据，通常很快，除非有锁冲突）
	if err := DB.AutoMigrate(&model.Record{}); err != nil {
		return fmt.Errorf("record automigrate failed: %w", err)
	}
	log.Printf("[Init] Schema check finished in %v.", time.Since(start))

	// 4. 物理性能加固
	log.Println("Step 3/3: Hardening Database Engine...")

	// 连接池优化：针对 10w/sec 写入场景调优
	sqlDB, _ := DB.DB()
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(50)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 检查并设置 UNLOGGED
	var persistence string
	DB.Raw("SELECT relpersistence FROM pg_class WHERE relname = 'records'").Scan(&persistence)
	if persistence == "p" {
		log.Println("[Perf] Speed Mode: Converting records to UNLOGGED (one-time setup)...")
		if err := DB.Exec("ALTER TABLE records SET UNLOGGED").Error; err != nil {
			log.Printf("Warning: UNLOGGED conversion skipped: %v", err)
		}
	}

	tuningSQLs := []struct {
		name string
		sql  string
	}{
		{"Disable Sync Commit", "SET synchronous_commit TO OFF"},
		{"Expand Work Mem", "SET work_mem = '64MB'"},
		{"Expand Maint Work Mem", "SET maintenance_work_mem = '512MB'"},
		{"Index: Phone (Pattern)", "CREATE INDEX IF NOT EXISTS idx_records_fast_phone ON records (batch_id, phone varchar_pattern_ops, row_index)"},
		{"Index: Name (Pattern)", "CREATE INDEX IF NOT EXISTS idx_records_fast_name ON records (batch_id, name varchar_pattern_ops, row_index)"},
		{"Index: Sort/Batch", "CREATE INDEX IF NOT EXISTS idx_records_fast_batch_row ON records (batch_id, row_index)"},
	}

	for _, item := range tuningSQLs {
		sSub := time.Now()
		if err := DB.Exec(item.sql).Error; err != nil {
			log.Printf("Note (%s): %v", item.name, err)
		} else {
			log.Printf("[Init] %s optimized in %v.", item.name, time.Since(sSub))
		}
	}

	log.Printf("ALL SYSTEMS GO. Total init time: %v.", time.Since(start))
	return nil
}

func runMigrations(dsn string) error {
	// Need raw sql.DB for migration driver
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		return err
	}

	// Point to the relative path "migrations"
	// Note: In Docker, ensure this folder is copied or mounted
	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"postgres", driver,
	)
	if err != nil {
		return err
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}

	return nil
}
