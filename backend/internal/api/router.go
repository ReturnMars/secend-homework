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
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	config.ExposeHeaders = []string{"Content-Length", "Content-Disposition", "Content-Description"}
	r.Use(cors.New(config))

	h := handler.NewCsvHandler(svc)
	authHandler := handler.NewAuthHandler(svc.DB)

	// API Routes
	api := r.Group("/api")
	{

		// Public Routes
		api.POST("/login", authHandler.Login)
		api.POST("/register", authHandler.Register)

		// Protected Routes
		protected := api.Group("/")
		protected.Use(func(c *gin.Context) {
			// Get token from header
			token := c.GetHeader("Authorization")
			// Remove "Bearer " prefix if present
			if len(token) > 7 && token[:7] == "Bearer " {
				token = token[7:]
			}

			// Fallback: Check query param (for SSE)
			if token == "" {
				token = c.Query("token")
			}

			// Verify
			username, ok := authHandler.VerifyToken(token)
			if !ok {
				// For SSE, maybe check query param?
				// But simpler: just return 401
				c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
				return
			}

			// Set user context
			c.Set("username", username)
			c.Next()
		})

		{
			protected.POST("/upload", h.Upload)
			protected.GET("/batches", h.GetBatches)
			protected.GET("/batches/:id", h.GetBatchStatus)
			protected.GET("/batches/:id/records", h.GetBatchRecords)
			protected.GET("/batches/:id/export", h.ExportBatch)
			protected.PATCH("/batches/:id", h.UpdateBatch)
			protected.GET("/batches/:id/progress", h.StreamBatchProgress)

			protected.PUT("/records/:id", h.UpdateRecord)
			protected.GET("/records/:id/history", h.GetRecordHistory)
			protected.POST("/records/:id/rollback/:version_id", h.RollbackRecord)
			protected.PATCH("/versions/:id/reason", h.UpdateVersionReason)
		}
	}

	return r
}
