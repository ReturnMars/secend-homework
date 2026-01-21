package api

import (
	"etl-tool/internal/api/handler"
	"etl-tool/internal/service"
	"net/http/pprof"

	"github.com/arl/statsviz"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(svc *service.CleanerService) *gin.Engine {
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// 设置上传文件的内存限制为 128MB，超出部分自动存入磁盘临时文件
	r.MaxMultipartMemory = 128 << 20

	// CORS Setup
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	config.ExposeHeaders = []string{"Content-Length", "Content-Disposition", "Content-Description"}
	r.Use(cors.New(config))

	h := handler.NewCsvHandler(svc)
	authHandler := handler.NewAuthHandler(svc.DB)

	// PPROF Debug Routes
	debug := r.Group("/debug/pprof")
	{
		debug.GET("/", gin.WrapF(pprof.Index))
		debug.GET("/cmdline", gin.WrapF(pprof.Cmdline))
		debug.GET("/profile", gin.WrapF(pprof.Profile))
		debug.GET("/symbol", gin.WrapF(pprof.Symbol))
		debug.GET("/trace", gin.WrapF(pprof.Trace))
		debug.GET("/allocs", gin.WrapF(pprof.Handler("allocs").ServeHTTP))
		debug.GET("/block", gin.WrapF(pprof.Handler("block").ServeHTTP))
		debug.GET("/goroutine", gin.WrapF(pprof.Handler("goroutine").ServeHTTP))
		debug.GET("/heap", gin.WrapF(pprof.Handler("heap").ServeHTTP))
		debug.GET("/mutex", gin.WrapF(pprof.Handler("mutex").ServeHTTP))
		debug.GET("/threadcreate", gin.WrapF(pprof.Handler("threadcreate").ServeHTTP))
		debug.POST("/symbol", gin.WrapF(pprof.Symbol))
	}

	// Statsviz
	srv, _ := statsviz.NewServer() // default root is /debug/statsviz
	r.GET("/debug/statsviz/*filepath", func(context *gin.Context) {
		if context.Param("filepath") == "/ws" {
			srv.Ws()(context.Writer, context.Request)
			return
		}
		srv.Index()(context.Writer, context.Request)
	})

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
			protected.GET("/auth/download-token", authHandler.GetDownloadToken)
			protected.POST("/upload/check", h.CheckHash)
			protected.POST("/upload", h.Upload)
			protected.GET("/batches", h.GetBatches)
			protected.GET("/batches/:id", h.GetBatchStatus)
			protected.GET("/batches/:id/records", h.GetBatchRecords)
			protected.GET("/batches/:id/export", h.ExportBatch)
			protected.PATCH("/batches/:id", h.UpdateBatch)
			protected.GET("/batches/:id/progress", h.StreamBatchProgress)
			protected.POST("/batches/:id/pause", h.PauseBatch)
			protected.POST("/batches/:id/resume", h.ResumeBatch)
			protected.POST("/batches/:id/cancel", h.CancelBatch)
			protected.DELETE("/batches/:id", h.DeleteBatch)

			protected.PUT("/records/:id", h.UpdateRecord)
			protected.POST("/records/:id/validate", h.ValidateRecord)
			protected.GET("/records/:id/history", h.GetRecordHistory)
			protected.POST("/records/:id/rollback/:version_id", h.RollbackRecord)
			protected.PATCH("/versions/:id/reason", h.UpdateVersionReason)
		}
	}

	return r
}
