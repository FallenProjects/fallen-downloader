package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v3"
)

var turnstileClient = &http.Client{Timeout: 5 * time.Second}

func TurnstileMiddleware(secret string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if secret == "" {
			return c.Next()
		}
		token := c.Get("X-CF-Turnstile-Token")
		if token == "" {
			return fail(c, fiber.StatusForbidden, "Complete the verification and try again.")
		}
		form := url.Values{"secret": {secret}, "response": {token}, "remoteip": {c.IP()}}
		resp, err := turnstileClient.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
		if err != nil {
			return fail(c, fiber.StatusBadGateway, "Verification is unavailable. Please try again shortly.")
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fail(c, fiber.StatusBadGateway, "Verification is unavailable. Please try again shortly.")
		}
		var result struct {
			Success bool `json:"success"`
		}
		if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil || !result.Success {
			return fail(c, fiber.StatusForbidden, "Verification failed. Please try again.")
		}
		return c.Next()
	}
}
