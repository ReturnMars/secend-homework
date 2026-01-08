package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"etl-tool/service"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Init Service
	service.InitProcessor()

	// Ensure temp dir
	os.MkdirAll("temp", 0755)
	os.MkdirAll("uploads", 0755)

	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods:     []string{"GET", "POST"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	r.POST("/upload", func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
			return
		}

		// Save to uploads
		filename := filepath.Base(file.Filename)
		savePath := filepath.Join("uploads", filename)
		if err := c.SaveUploadedFile(file, savePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}

		// Process
		stats, err := service.GlobalProcessor.ProcessFile(savePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, stats)
	})

	r.GET("/export/:id", func(c *gin.Context) {
		id := c.Param("id")
		path, ok := service.GlobalProcessor.GetResultPath(id)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found or expired"})
			return
		}

		// Set headers for download
		c.Header("Content-Description", "File Transfer")
		c.Header("Content-Transfer-Encoding", "binary")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=cleaned_data_%s.zip", id))
		c.Header("Content-Type", "application/octet-stream")
		c.File(path)
	})

	r.Run(":8080")
}
