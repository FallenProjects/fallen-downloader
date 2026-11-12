package api

import (
	"dl/internal/config"
	"dl/internal/httpx"
	"dl/internal/platform"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
)

type errorResponse struct {
	Message string `json:"message"`
}

func fail(c fiber.Ctx, status int, message string) error {
	c.Set("Cache-Control", "no-store")
	return c.Status(status).JSON(errorResponse{message})
}

type visitor struct {
	count int
	reset time.Time
}

var limits = struct {
	sync.Mutex
	visitors map[string]visitor
}{visitors: map[string]visitor{}}
var capacity = make(chan struct{}, 8)

func protect(c fiber.Ctx) error {
	now := time.Now()
	ip := c.IP()
	limits.Lock()
	v := limits.visitors[ip]
	if now.After(v.reset) {
		v = visitor{reset: now.Add(time.Minute)}
	}
	if v.count == 0 && len(limits.visitors) >= 5000 {
		for key, item := range limits.visitors {
			if now.After(item.reset) {
				delete(limits.visitors, key)
			}
		}
		if len(limits.visitors) >= 5000 {
			limits.Unlock()
			return fail(c, fiber.StatusServiceUnavailable, "The service is busy. Please try again shortly.")
		}
	}
	v.count++
	limits.visitors[ip] = v
	if len(limits.visitors) > 5000 {
		for key, item := range limits.visitors {
			if now.After(item.reset) {
				delete(limits.visitors, key)
			}
		}
	}
	limits.Unlock()
	if v.count > 30 {
		return fail(c, fiber.StatusTooManyRequests, "Too many requests. Please try again in a minute.")
	}
	select {
	case capacity <- struct{}{}:
		defer func() { <-capacity }()
		return c.Next()
	default:
		return fail(c, fiber.StatusServiceUnavailable, "The service is busy. Please try again shortly.")
	}
}

func classifiedURL(c fiber.Ctx) error {
	p, err := platform.Classify(c.Query("url"))
	if err != nil {
		if errors.Is(err, platform.ErrYouTube) {
			return fail(c, fiber.StatusUnprocessableEntity, platform.YouTubeUnavailable)
		}
		return fail(c, fiber.StatusBadRequest, err.Error())
	}
	c.Locals("platform", p)
	return c.Next()
}

func searchGuard(c fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	searchPlatform := c.Query("platform", "spotify")
	if platform.ContainsYouTubeLink(q) {
		return fail(c, fiber.StatusUnprocessableEntity, platform.YouTubeUnavailable)
	}
	if !platform.SearchPlatformAllowed(searchPlatform) {
		return fail(c, fiber.StatusBadRequest, "Choose a supported music service to search.")
	}
	if len(q) < 2 || len(q) > 120 || strings.ContainsAny(q, "\r\n") {
		return fail(c, fiber.StatusBadRequest, "Enter a search term between 2 and 120 characters.")
	}
	c.Locals("query", q)
	c.Locals("searchPlatform", searchPlatform)
	return c.Next()
}

func upstream(c fiber.Ctx, data json.RawMessage, err error) error {
	if err == nil {
		data, err = stripYouTube(data)
		if err != nil {
			if errors.Is(err, platform.ErrYouTube) {
				return fail(c, fiber.StatusUnprocessableEntity, platform.YouTubeUnavailable)
			}
			return fail(c, fiber.StatusBadGateway, "The media service returned an unreadable result. Please try another link.")
		}
		c.Set("Cache-Control", "no-store")
		return c.Type("json").Send(data)
	}
	var ue *httpx.UpstreamError
	if errors.As(err, &ue) {
		log.Warnf("OneGrab status %d", ue.Status)
		switch ue.Status {
		case 400, 404, 422:
			return fail(c, fiber.StatusUnprocessableEntity, "This link could not be resolved. Check the URL or try another supported link.")
		case 401, 403:
			return fail(c, fiber.StatusBadGateway, "The media service is unavailable right now. Please try again later.")
		case 429:
			return fail(c, fiber.StatusTooManyRequests, "The media service request limit has been reached. Please try again after it resets.")
		}
	}
	log.Warnf("OneGrab request failed: %T", err)
	return fail(c, fiber.StatusBadGateway, "We could not reach the media service. Please try again shortly.")
}

func stripYouTube(data json.RawMessage) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}
	cleaned, keep := cleanValue(value)
	if !keep {
		return nil, platform.ErrYouTube
	}
	return json.Marshal(cleaned)
}

func cleanValue(value any) (any, bool) {
	switch v := value.(type) {
	case []any:
		out := make([]any, 0, len(v))
		for _, item := range v {
			if clean, keep := cleanValue(item); keep {
				out = append(out, clean)
			}
		}
		return out, true
	case map[string]any:
		if name, ok := v["platform"].(string); ok {
			name = strings.ToLower(name)
			if strings.Contains(name, "youtube") || strings.Contains(name, "ytmusic") {
				return nil, false
			}
		}
		for _, key := range []string{"url", "link", "permalink", "webpage_url", "source_url", "cdnurl", "cdnUrl"} {
			if raw, ok := v[key].(string); ok {
				if _, err := platform.Classify(raw); errors.Is(err, platform.ErrYouTube) {
					return nil, false
				}
			}
		}
		out := make(map[string]any, len(v))
		for key, item := range v {
			if clean, keep := cleanValue(item); keep {
				out[key] = clean
			}
		}
		return out, true
	default:
		return value, true
	}
}

func Endpoints(app *fiber.App, cfg *config.Config, client *httpx.Client) {
	api := app.Group("/api")
	api.Use(protect)
	api.Get("/extract", classifiedURL, TurnstileMiddleware(cfg.TurnstileSecret), func(c fiber.Ctx) error {
		p := c.Locals("platform").(platform.Platform)
		if p.Kind == "music" {
			data, err := client.Info(c.Query("url"))
			return upstream(c, data, err)
		}
		data, err := client.Snap(c.Query("url"))
		return upstream(c, data, err)
	})
	api.Get("/resolve", classifiedURL, TurnstileMiddleware(cfg.TurnstileSecret), func(c fiber.Ctx) error {
		p := c.Locals("platform").(platform.Platform)
		if p.Kind != "music" {
			return fail(c, fiber.StatusBadRequest, "Use a supported music link for this action.")
		}
		data, err := client.Track(c.Query("url"))
		return upstream(c, data, err)
	})
	api.Get("/search", searchGuard, TurnstileMiddleware(cfg.TurnstileSecret), func(c fiber.Ctx) error {
		data, err := client.Search(c.Locals("query").(string), c.Locals("searchPlatform").(string))
		return upstream(c, data, err)
	})
}
