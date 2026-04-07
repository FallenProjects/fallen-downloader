package api

import (
	"dl/internal/config"
	"dl/internal/httpx"

	"github.com/gofiber/fiber/v3"
)

func Endpoints(app *fiber.App, cfg *config.Config, client *httpx.Client) {
	api := app.Group("/api")

	api.Use(TurnstileMiddleware(cfg.TurnstileSecret))

	api.Get("/snap", func(c fiber.Ctx) error { return snapHandler(c, client) })
	api.Get("/info", func(c fiber.Ctx) error { return infoHandler(c, client) })
	api.Get("/dl", func(c fiber.Ctx) error { return dlHandler(c, client) })
}
