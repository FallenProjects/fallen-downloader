package api

import (
	"github.com/gofiber/fiber/v3"
)

func CORS() fiber.Handler {
	return func(c fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CF-Turnstile-Token")

		if string(c.Request().Header.Method()) == "OPTIONS" {
			return c.SendStatus(200)
		}

		return c.Next()
	}
}
