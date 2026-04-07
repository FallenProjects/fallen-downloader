package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
)

type turnstileResponse struct {
	Success     bool      `json:"success"`
	ChallengeTs time.Time `json:"challenge_ts"`
	Hostname    string    `json:"hostname"`
	ErrorCodes  []string  `json:"error-codes"`
	Action      string    `json:"action"`
	Cdata       string    `json:"cdata"`
}

var turnstileClient = &http.Client{
	Timeout: 5 * time.Second,
}

func TurnstileMiddleware(secret string) fiber.Handler {
	return func(c fiber.Ctx) error {

		if secret == "" {
			return c.Next()
		}

		token := c.Get("X-CF-Turnstile-Token")
		if token == "" {
			log.Warnf("Turnstile missing token ip=%s", c.IP())
			return c.Status(fiber.StatusForbidden).
				JSON(NewErrorResponse(fiber.StatusForbidden, "Verification failed"))
		}

		form := url.Values{}
		form.Set("secret", secret)
		form.Set("response", token)
		form.Set("remoteip", c.IP())

		resp, err := turnstileClient.PostForm(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			form,
		)
		if err != nil {
			log.Warnf("Turnstile verify error ip=%s err=%v", c.IP(), err)
			return c.Status(fiber.StatusInternalServerError).
				JSON(NewErrorResponse(fiber.StatusInternalServerError, "Captcha verification failed"))
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Warnf("Turnstile bad status ip=%s status=%d", c.IP(), resp.StatusCode)
			return c.Status(fiber.StatusInternalServerError).
				JSON(NewErrorResponse(fiber.StatusInternalServerError, "Captcha verification failed"))
		}

		var result turnstileResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			log.Warnf("Turnstile decode error ip=%s err=%v", c.IP(), err)
			return c.Status(fiber.StatusInternalServerError).
				JSON(NewErrorResponse(fiber.StatusInternalServerError, "Captcha verification failed"))
		}

		log.Debugf("Result %+v", result)

		if !result.Success {
			log.Warnf("Turnstile invalid ip=%s errors=%v", c.IP(), result.ErrorCodes)
			return c.Status(fiber.StatusForbidden).
				JSON(NewErrorResponse(fiber.StatusForbidden, "Verification failed"))
		}

		// if result.Hostname != "dl.fallenapi.fun" {
		//     return c.Status(fiber.StatusForbidden).
		//         JSON(NewErrorResponse(fiber.StatusForbidden, "Invalid hostname"))
		// }

		return c.Next()
	}
}
