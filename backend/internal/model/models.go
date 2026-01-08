package model

import (
	"time"

	"gorm.io/gorm"
)

type BatchStatus string

const (
	BatchStatusPending    BatchStatus = "Pending"
	BatchStatusProcessing BatchStatus = "Processing"
	BatchStatusCompleted  BatchStatus = "Completed"
	BatchStatusFailed     BatchStatus = "Failed"
)

// ImportBatch tracks the lifecycle of a CSV upload
type ImportBatch struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	OriginalFilename string         `gorm:"size:255" json:"original_filename"`
	Status           BatchStatus    `gorm:"size:50;index;default:'Pending'" json:"status"`
	TotalRows        int            `json:"total_rows"`
	ProcessedRows    int            `json:"processed_rows"` // New field for progress tracking
	SuccessCount     int            `json:"success_count"`
	FailureCount     int            `json:"failure_count"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}

// Record represents a single row from the CSV
type Record struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	BatchID  uint `gorm:"index;not null" json:"batch_id"`
	RowIndex int  `json:"row_index"` // Original row number in CSV

	// Data Fields
	Name  string `gorm:"size:255" json:"name"`
	Phone string `gorm:"size:50" json:"phone"`
	Date  string `gorm:"size:50" json:"date"` // Storing normalized string, or could be time.Time

	Address string `gorm:"size:255" json:"address"` // Original full address

	// Location Fields
	Province string `gorm:"size:100" json:"province"`
	City     string `gorm:"size:100" json:"city"`
	District string `gorm:"size:100" json:"district"`

	Status       string `gorm:"size:50;index" json:"status"` // "Clean" or "Error"
	ErrorMessage string `gorm:"type:text" json:"error_message"`
	RawData      string `gorm:"type:text" json:"raw_data"` // Backup of original row JSON
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
