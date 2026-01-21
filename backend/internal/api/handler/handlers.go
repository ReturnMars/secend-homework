package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"etl-tool/internal/model"
	"etl-tool/internal/service"
	"etl-tool/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CsvHandler struct {
	Service *service.CleanerService
}

func NewCsvHandler(s *service.CleanerService) *CsvHandler {
	return &CsvHandler{Service: s}
}

// CheckHash 检查文件 Hash 是否已上传过（物理秒传预检）
func (h *CsvHandler) CheckHash(c *gin.Context) {
	var body struct {
		Hash string `json:"hash" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing 'hash' in request body"})
		return
	}

	existingBatch, err := h.Service.FindBatchByHash(body.Hash)
	if err == nil && existingBatch != nil {
		// 仅检查物理文件是否真的还在 uploads 目录里
		if _, err := os.Stat(existingBatch.FilePath); err == nil {
			log.Printf("[Instant Check] Physical file exists for Hash %s. Ready for de-duplication.", body.Hash)

			utils.SuccessResponse(c, gin.H{
				"exists": true,
			})
			return
		}
		// 如果记录存在但文件离奇失踪，认为不存在
		log.Printf("[Instant Check] Record exists but physical file is missing: %s", existingBatch.FilePath)
	}

	utils.SuccessResponse(c, gin.H{"exists": false})
}

// Upload handles the CSV upload with streaming and de-duplication
func (h *CsvHandler) Upload(c *gin.Context) {
	mr, err := c.Request.MultipartReader()
	if err != nil {
		log.Printf("[Upload Error] Failed to get MultipartReader: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to initialize stream: " + err.Error()})
		return
	}

	uploadDir := "uploads"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.Mkdir(uploadDir, 0755)
	}

	var savedPath string
	var originalName string
	var fileHash string
	var cleaningRules string
	var reused bool

	// 遍历 multipart 部分
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("[Upload Error] NextPart error: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Stream break: " + err.Error()})
			return
		}

		// 处理 Hash 字段（由于前端调整了顺序，这个会先于 file 到达）
		if part.FormName() == "hash" {
			buf := new(strings.Builder)
			io.Copy(buf, part)
			fileHash = buf.String()
			log.Printf("[Upload] Received fingerprint from client: %s", fileHash)
			continue
		}

		// 处理 Rules 字段
		if part.FormName() == "rules" {
			buf := new(strings.Builder)
			io.Copy(buf, part)
			cleaningRules = buf.String()
			log.Printf("[Upload] Received custom cleaning rules from client")
			continue
		}

		// 处理 filename 字段 (针对快传模式，前端会单独传一个文件名)
		if part.FormName() == "filename" {
			buf := new(strings.Builder)
			io.Copy(buf, part)
			originalName = buf.String()
			log.Printf("[Upload] Received filename from client: %s", originalName)
			continue
		}

		if part.FormName() == "file" {
			originalName = part.FileName()
			// 先存为临时文件以计算哈希
			tempFilename := fmt.Sprintf("temp_%s_%d", uuid.New().String(), time.Now().UnixNano())
			tempPath := filepath.Join(uploadDir, tempFilename)

			dst, err := os.Create(tempPath)
			if err != nil {
				log.Printf("[Upload Error] Create temp file error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Disk error: " + err.Error()})
				return
			}

			// 同时计算哈希
			hash := sha256.New()
			mw := io.MultiWriter(dst, hash)

			if _, err := io.Copy(mw, part); err != nil {
				dst.Close()
				os.Remove(tempPath)
				log.Printf("[Upload Error] IO Copy error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Upload interrupted: " + err.Error()})
				return
			}
			dst.Close()

			// 如果前端没提供 Hash，则回退到后端的全量哈希（向上兼容）
			if fileHash == "" {
				fileHash = hex.EncodeToString(hash.Sum(nil))
			}

			existingBatch, err := h.Service.FindBatchByHash(fileHash)
			if err == nil && existingBatch != nil {
				os.Remove(tempPath) // Remove the temporary file as we'll use the existing one
				log.Printf("[Upload] Physical file exists (Hash: %s). Creating NEW batch from existing file.", fileHash)

				// Create NEW Batch Record instead of re-using old one
				username := c.GetString("username")
				batch, err := h.Service.CreateBatchFromHash(originalName, username, fileHash, cleaningRules)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create new batch from existing file: " + err.Error()})
					return
				}

				// Trigger Async Processing for the NEW batch
				h.Service.ProcessFileAsync(batch.ID, batch.FilePath)

				utils.SuccessResponse(c, gin.H{
					"message":  "File bits already on server, created new batch for processing.",
					"batch_id": batch.ID,
					"reused":   true,
				})
				return
			}

			// 否则存为永久文件 (UUID + OriginalExt)
			ext := filepath.Ext(originalName)
			permanentFilename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
			savedPath = filepath.Join(uploadDir, permanentFilename)

			if err := os.Rename(tempPath, savedPath); err != nil {
				log.Printf("[Upload Error] Rename error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "File save error: " + err.Error()})
				return
			}
			//} // 配合上述注释
			break
		}
	}

	if savedPath == "" {
		// 如果没有文件流但是有 Hash 和 OriginalName，说明是快传模式
		if fileHash != "" && originalName != "" {
			username := c.GetString("username")
			batch, err := h.Service.CreateBatchFromHash(originalName, username, fileHash, cleaningRules)
			if err == nil {
				h.Service.ProcessFileAsync(batch.ID, batch.FilePath)
				utils.SuccessResponse(c, gin.H{
					"message":  "Fast-track: reused existing physical file.",
					"batch_id": batch.ID,
					"reused":   true,
				})
				return
			}
			log.Printf("[Upload Error] Fast-track failed for hash %s: %v", fileHash, err)
		}

		c.JSON(http.StatusBadRequest, gin.H{"error": "No file field found in form or missing metadata for fast-track"})
		return
	}

	// Create Batch Record
	username := c.GetString("username")
	batch, err := h.Service.CreateBatch(originalName, username, fileHash, savedPath, cleaningRules)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create batch"})
		return
	}

	// Trigger Async Processing
	h.Service.ProcessFileAsync(batch.ID, savedPath)

	// Return Batch ID immediately
	utils.SuccessResponse(c, gin.H{
		"message":  "Upload successful, processing started",
		"batch_id": batch.ID,
		"reused":   reused,
	})
}

// GetBatchStatus returns the processing status
func (h *CsvHandler) GetBatchStatus(c *gin.Context) {
	id := c.Param("id")
	batch, err := h.Service.GetBatch(id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Batch not found")
		return
	}
	utils.SuccessResponse(c, batch)
}

// GetBatchRecords returns paginated records
func (h *CsvHandler) GetBatchRecords(c *gin.Context) {
	id := c.Param("id")
	filter := c.Query("filter") // all, clean, error
	search := c.Query("search")

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

	records, total, err := h.Service.GetRecords(id, filter, search, q.Page, q.PageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.SuccessResponse(c, gin.H{
		"data":     records,
		"total":    total,
		"page":     q.Page,
		"pageSize": q.PageSize,
	})
}

// ExportBatch downloads the processed CSV/Excel
func (h *CsvHandler) ExportBatch(c *gin.Context) {
	id := c.Param("id")
	filter := c.Query("type") // compatible with frontend query naming if needed, or use 'filter'

	downloadName, err := h.Service.GetBatchFilename(id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// 根据过滤器调整文件名
	if filter == "clean" {
		downloadName = "Clean_" + downloadName
	} else if filter == "error" {
		downloadName = "Error_Report_" + downloadName
	}

	// Detect format based on extension
	isExcel := strings.HasSuffix(strings.ToLower(downloadName), ".xlsx")

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(downloadName)))
	c.Header("Transfer-Encoding", "chunked")

	if isExcel {
		// Excel Streaming
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		if err := h.Service.ExportBatchWithExcelStream(id, filter, c.Writer); err != nil {
			fmt.Printf("Export excel stream failed: %v\n", err)
		}
	} else {
		// CSV Streaming (Default)
		c.Header("Content-Type", "text/csv; charset=utf-8")
		if err := h.Service.ExportBatchStream(id, filter, c.Writer); err != nil {
			fmt.Printf("Export csv stream failed: %v\n", err)
		}
	}
}

// StreamBatchProgress streams progress updates via SSE
func (h *CsvHandler) StreamBatchProgress(c *gin.Context) {
	id := c.Param("id")
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	c.Stream(func(w io.Writer) bool {
		batch, err := h.Service.GetBatch(id)
		if err != nil {
			c.SSEvent("message", gin.H{
				"type":    "error",
				"message": "Batch not found",
			})
			return false
		}

		// Calculate stats
		elapsed := int(time.Since(batch.CreatedAt).Seconds())
		percent := 0
		if batch.TotalRows > 0 {
			percent = int(float64(batch.ProcessedRows) / float64(batch.TotalRows) * 100)
			if percent > 100 {
				percent = 100
			}
		}

		var bid uint
		fmt.Sscanf(id, "%d", &bid)
		currentSpeed := h.Service.GetBatchSpeed(bid)

		eta := 0
		if currentSpeed > 0 && batch.TotalRows > batch.ProcessedRows {
			eta = int(float64(batch.TotalRows-batch.ProcessedRows) / currentSpeed)
		}

		// Standard Progress Message
		c.SSEvent("message", gin.H{
			"type":      "progress",
			"status":    string(batch.Status),
			"processed": batch.ProcessedRows,
			"total":     batch.TotalRows,
			"success":   batch.SuccessCount,
			"failed":    batch.FailureCount,
			"speed":     currentSpeed,
			"percent":   percent,
			"elapsed":   elapsed,
			"eta":       eta,
		})

		// Termination Logic
		if batch.Status == model.BatchStatusCompleted {
			// Send final completed event with preview
			records, _, _ := h.Service.GetRecords(id, "all", "", 1, 5)
			c.SSEvent("message", gin.H{
				"type":    "completed",
				"total":   batch.TotalRows,
				"success": batch.SuccessCount,
				"failed":  batch.FailureCount,
				"preview": records,
			})
			return false
		}

		if batch.Status == model.BatchStatusFailed {
			c.SSEvent("message", gin.H{
				"type":    "error",
				"message": batch.Error,
			})
			return false
		}

		if batch.Status == model.BatchStatusCancelled {
			c.SSEvent("message", gin.H{
				"type":   "progress",
				"status": "Cancelled",
			})
			return false
		}

		time.Sleep(500 * time.Millisecond)
		return true
	})
}

// GetBatches returns all batches
func (h *CsvHandler) GetBatches(c *gin.Context) {
	username := c.GetString("username")
	batches, err := h.Service.GetBatches(username)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, batches)
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, record)
}

// ValidateRecord 验证记录更并预判状态
func (h *CsvHandler) ValidateRecord(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Updates map[string]interface{} `json:"updates"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.Service.ValidateRecordUpdate(id, req.Updates)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, result)
}

// RollbackRecord handles record rollback
func (h *CsvHandler) RollbackRecord(c *gin.Context) {
	id := c.Param("id")
	versionID := c.Param("version_id")

	record, err := h.Service.RollbackRecord(id, versionID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, record)
}

// GetRecordHistory returns history for a record
func (h *CsvHandler) GetRecordHistory(c *gin.Context) {
	id := c.Param("id")
	history, err := h.Service.GetRecordHistory(id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	// Explicitly handle nil slice to return empty array
	if history == nil {
		history = []model.RecordVersion{}
	}
	utils.SuccessResponse(c, history)
}

// UpdateVersionReason handles version reason update
func (h *CsvHandler) UpdateVersionReason(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.Service.UpdateVersionReason(id, req.Reason); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Reason updated successfully"})
}

// UpdateBatch handles updating batch metadata (like filename)
func (h *CsvHandler) UpdateBatch(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.Service.UpdateBatchName(id, req.Name); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Batch updated successfully"})
}

// PauseBatch 暂停批次处理
func (h *CsvHandler) PauseBatch(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)

	if err := h.Service.PauseBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Batch paused successfully"})
}

// ResumeBatch 恢复批次处理
func (h *CsvHandler) ResumeBatch(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)

	if err := h.Service.ResumeBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Batch resumed successfully"})
}

// CancelBatch 取消批次处理
func (h *CsvHandler) CancelBatch(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)

	if err := h.Service.CancelBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Batch cancelled successfully"})
}

// DeleteBatch 删除一个批次
func (h *CsvHandler) DeleteBatch(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)

	if err := h.Service.DeleteBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}
	utils.SuccessResponse(c, gin.H{"message": "Batch deleted successfully"})
}
