package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"etl-tool/internal/model"
	"etl-tool/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CsvHandler struct {
	Service *service.CleanerService
}

func NewCsvHandler(s *service.CleanerService) *CsvHandler {
	return &CsvHandler{Service: s}
}

// Upload handles the CSV upload
func (h *CsvHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	// Ensure upload dir exists
	uploadDir := "uploads"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.Mkdir(uploadDir, 0755)
	}

	// Save file with unique name
	filename := fmt.Sprintf("%s_%s", uuid.New().String(), filepath.Base(file.Filename))
	dst := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Create Batch Record
	batch, err := h.Service.CreateBatch(file.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create batch"})
		return
	}

	// Trigger Async Processing
	h.Service.ProcessFileAsync(batch.ID, dst)

	// Return Batch ID immediately
	c.JSON(http.StatusOK, gin.H{
		"message":  "Upload successful, processing started",
		"batch_id": batch.ID,
	})
}

// GetBatchStatus returns the processing status
func (h *CsvHandler) GetBatchStatus(c *gin.Context) {
	id := c.Param("id")
	batch, err := h.Service.GetBatch(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Batch not found"})
		return
	}
	c.JSON(http.StatusOK, batch)
}

// GetBatchRecords returns paginated records
func (h *CsvHandler) GetBatchRecords(c *gin.Context) {
	id := c.Param("id")
	filter := c.Query("filter") // all, clean, error

	// Bind query params might fail if strictly typed, manual parse is safer for quick impl
	// but let's assume default simple binding works or just stay simple
	// Actually let's use simple manual parsing or gin Set defaults

	// Just simplified binding:
	type Query struct {
		Page     int `form:"page,default=1"`
		PageSize int `form:"pageSize,default=10"`
	}
	var q Query
	if err := c.ShouldBindQuery(&q); err != nil {
		q.Page = 1
		q.PageSize = 10
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize > 100 {
		q.PageSize = 100
	}

	records, total, err := h.Service.GetRecords(id, filter, q.Page, q.PageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     records,
		"total":    total,
		"page":     q.Page,
		"pageSize": q.PageSize,
	})
}

// ExportBatch downloads the processed CSV/Excel
func (h *CsvHandler) ExportBatch(c *gin.Context) {
	id := c.Param("id")
	filePath, err := h.Service.ExportBatch(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Force download
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(filePath)))
	c.File(filePath)
}

// StreamBatchProgress streams progress updates via SSE
func (h *CsvHandler) StreamBatchProgress(c *gin.Context) {
	id := c.Param("id")
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")

	c.Stream(func(w io.Writer) bool {
		batch, err := h.Service.GetBatch(id)
		if err != nil {
			return false // stop stream
		}

		// Construct progress JSON
		type Progress struct {
			Status        string `json:"status"`
			ProcessedRows int    `json:"processed_rows"`
			TotalRows     int    `json:"total_rows"`
			Filters       struct {
				Success int `json:"success"`
				Failed  int `json:"failed"`
			} `json:"filters"`
			Error string `json:"error,omitempty"`
		}

		data := Progress{
			Status:        string(batch.Status),
			ProcessedRows: batch.ProcessedRows,
			TotalRows:     batch.TotalRows,
		}
		data.Filters.Success = batch.SuccessCount
		data.Filters.Failed = batch.FailureCount

		c.SSEvent("message", data)

		if batch.Status == model.BatchStatusCompleted || batch.Status == model.BatchStatusFailed {
			return false // stop
		}

		time.Sleep(500 * time.Millisecond) // Poll DB every 500ms
		return true
	})
}

// GetBatches returns all batches
func (h *CsvHandler) GetBatches(c *gin.Context) {
	batches, err := h.Service.GetBatches()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, batches)
}

// UpdateRecord handles manual corrections
func (h *CsvHandler) UpdateRecord(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Reason  string                 `json:"reason"`
		Updates map[string]interface{} `json:"updates"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	record, err := h.Service.UpdateRecord(id, req.Updates, req.Reason)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, record)
}

// GetRecordHistory returns history for a record
func (h *CsvHandler) GetRecordHistory(c *gin.Context) {
	id := c.Param("id")
	history, err := h.Service.GetRecordHistory(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, history)
}
