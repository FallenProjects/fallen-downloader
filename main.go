package main

import (
	"dl/internal/api"
	"dl/internal/config"
	"dl/internal/httpx"
	"dl/internal/platform"
	"embed"
	"errors"
	"io/fs"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/gofiber/template/html/v2"
)

//go:embed templates/* static/*
var assetsFS embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	client := httpx.New(cfg.ApiKey, cfg.ApiUrl)

	engine := html.NewFileSystem(http.FS(assetsFS), ".html")

	app := fiber.New(fiber.Config{
		Views: engine,
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := errors.AsType[*fiber.Error](err); ok {
				code = e.Code
			}
			message := "Something went wrong. Please try again."
			if code == fiber.StatusNotFound {
				message = "Page not found."
			}
			return c.Status(code).JSON(fiber.Map{"message": message})
		},
	})

	app.Use(recover.New())
	app.Use(func(c fiber.Ctx) error {
		c.Set("Referrer-Policy", "no-referrer")
		c.Set("X-Content-Type-Options", "nosniff")
		return c.Next()
	})

	app.Use(compress.New(compress.Config{
		Level: compress.LevelBestSpeed,
	}))

	app.Get("/", func(c fiber.Ctx) error {
		return c.Render("templates/index", fiber.Map{
			"TurnstileSiteKey": cfg.TurnstileSiteKey,
			"Platforms":        platform.Supported(),
			"YouTubeMessage":   platform.YouTubeUnavailable,
			"YouTubeHosts":     platform.YouTubeHostsCSV(),
		})
	})

	subFS, _ := fs.Sub(assetsFS, "templates")
	app.Use("/", static.New("", static.Config{
		FS: subFS,
	}))

	staticFS, _ := fs.Sub(assetsFS, "static")
	app.Use("/", static.New("", static.Config{
		FS: staticFS,
	}))

	app.Get("/health", func(c fiber.Ctx) error {
		data := fiber.Map{
			"status": "ok",
		}
		return c.JSON(data)
	})

	api.Endpoints(app, cfg, client)
	log.Info("Server started on :" + cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		panic(err)
	}
	log.Info("Server stopped")
}
