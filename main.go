package main

import (
	"dl/internal/api"
	"dl/internal/config"
	"dl/internal/httpx"
	"embed"
	"errors"
	"io/fs"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/pprof"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/gofiber/template/html/v2"
)

//go:embed templates/*
var templatesFS embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	client := httpx.New(cfg.ApiKey, cfg.ApiUrl)

	engine := html.NewFileSystem(http.FS(templatesFS), ".html")

	app := fiber.New(fiber.Config{
		Views:       engine,
		ProxyHeader: "CF-Connecting-IP",
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"code":    code,
				"message": err.Error(),
			})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		TimeFormat: "15:04:05 ",
		Format:     "${time} | ${status} | ${latency} | ${method} | ${url}\n",
		Next: func(c fiber.Ctx) bool {
			return c.Path() == "/stream"
		},
	}))

	app.Use(compress.New(compress.Config{
		Level: compress.LevelBestSpeed,
	}))

	app.Use(pprof.New())
	port := cfg.Port
	app.Use(api.CORS())

	app.Get("/", func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")

		return c.Render("templates/index", fiber.Map{
			"TurnstileSiteKey": cfg.TurnstileSiteKey,
		})
	})

	subFS, _ := fs.Sub(templatesFS, "templates")
	app.Use("/", static.New("", static.Config{
		FS:            subFS,
		MaxAge:        0,
		Browse:        false,
		CacheDuration: 0,
	}))

	app.Get("/health", func(c fiber.Ctx) error {
		data := fiber.Map{
			"status": "ok",
		}
		return c.JSON(data)
	})

	api.Endpoints(app, cfg, client)
	log.Info("Server started on :" + port)
	if err := app.Listen(":" + port); err != nil {
		panic(err)
	}
	log.Info("Server stopped")
}
