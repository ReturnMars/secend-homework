package api

import (
	"etl-tool/internal/api/handler"
	"etl-tool/internal/service"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(svc *service.CleanerService) *gin.Engine {
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// CORS Setup
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept"}
	r.Use(cors.New(config))

	h := handler.NewCsvHandler(svc)

	// API Routes
	api := r.Group("/api")
	{
		api.POST("/upload", h.Upload)
		api.GET("/batches/:id", h.GetBatchStatus)
		api.GET("/batches/:id/records", h.GetBatchRecords)
		api.GET("/batches/:id/export", h.ExportBatch)
		api.GET("/batches/:id/progress", h.StreamBatchProgress) // SSE Endpoint

		// CRUD & Versioning
		api.GET("/batches", h.GetBatches)
		api.PUT("/records/:id", h.UpdateRecord)
		api.GET("/records/:id/history", h.GetRecordHistory)
		// Maintain legacy compatibility if needed, or just break it as planned.
		// api.POST("/process-csv", ... ) -> Deprecated
	}

	return r
}
