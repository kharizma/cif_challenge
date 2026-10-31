// Command api runs the CIF HTTP server.
package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"cif-backend/internal/cache"
	"cif-backend/internal/config"
	"cif-backend/internal/handlers"
	"cif-backend/internal/httpx"
	"cif-backend/internal/repository"
	"cif-backend/internal/services"
)

func main() {
	cfg := config.LoadOptional(envOr("CONFIG_FILE", ".env"))

	db, err := gorm.Open(postgres.Open(cfg.PostgresURL()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		slog.Error("connect database failed", "error", err)
		os.Exit(1)
	}
	sqlDB, err := db.DB()
	if err != nil {
		slog.Error("access database handle failed", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		slog.Error("database unreachable", "error", err)
		os.Exit(1)
	}

	ttl := cacheTTL(cfg.Get("CACHE_TTL_SECONDS", "300"))
	redisAddr := net.JoinHostPort(cfg.Get("REDIS_HOST", "localhost"), cfg.Get("REDIS_PORT", "6379"))
	external := services.NewExternal(
		cfg.Get("CUSTOMER_INFO_URL", "https://candidate.free.beeceptor.com/api/customer-information"),
		cfg.Get("SCORING_URL", "https://candidate.free.beeceptor.com/api/scoring"),
		cache.New(redisAddr, cfg.Get("REDIS_PASSWORD", "")),
		ttl,
	)

	customers := repository.NewCustomerRepository(db)
	documents := repository.NewDocumentRepository(db)
	cifHandler := handlers.NewCifHandler(services.NewCifService(customers, external))
	uploadHandler := handlers.NewUploadHandler(documents, customers, cfg.Get("UPLOAD_DIR", "uploads"))

	router := gin.New()
	router.Use(gin.Recovery(), httpx.LogRequests())
	router.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	api := router.Group("/api")
	api.POST("/cif/check", cifHandler.Check)
	api.GET("/cif", cifHandler.List)
	api.GET("/cif/:application_id", cifHandler.Get)
	uploads := api.Group("/uploads")
	uploads.Use(uploadHandler.RequireApplicationHeader)
	uploads.POST("", uploadHandler.Create)
	uploads.GET("/:upload_id", uploadHandler.Get)

	addr := ":" + cfg.Get("PORT", "8080")
	slog.Info("api listening", "addr", addr, "cache_ttl", ttl.String())
	if err := router.Run(addr); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// cacheTTL keeps the external-data cache at the required 5 minute minimum.
func cacheTTL(raw string) time.Duration {
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds < 300 {
		seconds = 300
	}
	return time.Duration(seconds) * time.Second
}
