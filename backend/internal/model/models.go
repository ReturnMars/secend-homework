package model

import (
	"time"

	"gorm.io/gorm"
)

type BatchStatus string

const (
	BatchStatusPending    BatchStatus = "Pending"
	BatchStatusProcessing BatchStatus = "Processing"
	BatchStatusIndexing   BatchStatus = "Indexing"
	BatchStatusPaused     BatchStatus = "Paused"
	BatchStatusCancelled  BatchStatus = "Cancelled"
	BatchStatusCompleted  BatchStatus = "Completed"
	BatchStatusFailed     BatchStatus = "Failed"
)

// ImportBatch tracks the lifecycle of a CSV upload
type ImportBatch struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	OriginalFilename string         `gorm:"size:255" json:"original_filename"`
	FileHash         string         `gorm:"size:64;index" json:"file_hash"` // SHA256 hash
	FilePath         string         `gorm:"size:500" json:"file_path"`
	Status           BatchStatus    `gorm:"size:50;index;default:'Pending'" json:"status"`
	TotalRows        int            `json:"total_rows"`
	ProcessedRows    int            `json:"processed_rows"` // New field for progress tracking
	SuccessCount     int            `json:"success_count"`
	FailureCount     int            `json:"failure_count"`
	CreatedBy        string         `gorm:"size:100;index" json:"created_by"` // Username of uploader
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	CompletedAt      *time.Time     `json:"completed_at"` // Pointer to allow null
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
	Error            string         `gorm:"type:text" json:"error"` // 存储失败原因
	Rules            string         `gorm:"type:text" json:"rules"` // JSON 清洗规则
}

// Record represents a single row from the CSV
type Record struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	BatchID  uint   `json:"batch_id"`
	RowIndex int    `json:"row_index"` // Original row number in CSV
	Name     string `gorm:"size:255" json:"name"`
	Phone    string `gorm:"size:50" json:"phone"`
	Date     string `gorm:"size:50" json:"date"`

	Address string `gorm:"size:255" json:"address"`

	// Location Fields
	Province string `gorm:"size:100" json:"province"`
	City     string `gorm:"size:100" json:"city"`
	District string `gorm:"size:100" json:"district"`

	Status       string `gorm:"size:50" json:"status"` // "Clean" or "Error"
	ErrorMessage string `gorm:"type:text" json:"error_message"`
	RawData      string `gorm:"type:text" json:"raw_data"`
}

// RecordVersion tracks changes to a record
type RecordVersion struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RecordID  uint      `gorm:"index;not null" json:"record_id"`
	Before    string    `gorm:"type:text" json:"before"` // JSON string of invalid state
	After     string    `gorm:"type:text" json:"after"`  // JSON string of new state
	ChangedAt time.Time `json:"changed_at"`
	Reason    string    `gorm:"size:255" json:"reason"` // Manual correction reason
}

// User represents a system user (for auth)
type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:100;uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"size:255" json:"-"` // Allow null for migration safety
	CreatedAt    time.Time `json:"created_at"`
}
