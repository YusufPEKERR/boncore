package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/boncore/pos-backend/internal/api"
	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	cfg := config.Load()

	// Initialize PostgreSQL Connection Pool & Multi-Tenant Repository Manager
	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		log.Printf("[WARN] Veritabani havuzu baslatilirken uyari: %v", err)
	}
	defer dbManager.Close()

	// Initialize Real-Time Redis Pub/Sub + WebSocket Hub Engine (ADIM 3)
	wsHub := ws.NewHub(cfg.RedisURL)
	defer wsHub.Close()

	// Initialize Domain Services
	services := service.NewServices(cfg, dbManager, wsHub)

	// Initialize Fiber v2 Engine with FastAPI-compatible JSON ErrorHandler (`{"detail": "..."}`)
	app := fiber.New(fiber.Config{
		AppName:               cfg.AppName,
		DisableStartupMessage: false,
		StrictRouting:         false, // Trailing slash (/api/settings vs /api/settings/) 307 redirect olmadan çalışır
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(models.FastAPIErrorResponse{
				Detail: err.Error(),
			})
		},
	})

	// Crash-Free Recovery & Request Logging Middleware
	app.Use(recover.New(recover.Config{
		EnableStackTrace: true,
	}))
	app.Use(logger.New())

	// High-Performance Gzip / Brotli Compression Middleware
	app.Use(compress.New(compress.Config{
		Level: compress.LevelBestSpeed,
	}))

	// CORS Configuration (100% parity with backend/app/main.py)
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "*",
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS,PATCH",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Restaurant-Code,X-Tenant-Code,X-User-Role",
		AllowCredentials: false,
	}))

	// Register All REST & WebSocket Routes
	api.RegisterRoutes(app, services)

	// Graceful Shutdown Channel
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		listenAddr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
		log.Printf("[BonCore Go Engine] Listening on http://%s", listenAddr)
		if err := app.Listen(listenAddr); err != nil {
			log.Fatalf("[FATAL] Fiber server error: %v", err)
		}
	}()

	<-quit
	log.Println("[BonCore Go Engine] Shutting down gracefully...")
	_ = app.Shutdown()
}
