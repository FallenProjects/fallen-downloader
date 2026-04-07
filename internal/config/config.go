package config

import (
	"errors"
	"fmt"
	"os"

	"github.com/gofiber/fiber/v3/log"
	_ "github.com/joho/godotenv/autoload"
)

type Config struct {
	ApiKey           string
	ApiUrl           string
	Port             string
	TurnstileSecret  string
	TurnstileSiteKey string
}

var ErrMissingEnv = errors.New("missing required environment variable")

func Load() (*Config, error) {
	cfg := &Config{}
	var err error

	cfg.ApiKey, err = requireEnv("API_KEY")
	if err != nil {
		return nil, err
	}

	cfg.ApiUrl = os.Getenv("API_URL")
	if cfg.ApiUrl == "" {
		cfg.ApiUrl = "https://api.fallenapi.fun"
	}

	cfg.Port = os.Getenv("PORT")
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
	cfg.TurnstileSecret = os.Getenv("TURNSTILE_SECRET")
	if cfg.TurnstileSecret == "" {
		log.Warnf("TURNSTILE_SECRET not set, using default test secret key. This should not be used in production.")
		cfg.TurnstileSecret = "1x0000000000000000000000000000000AA"
	}

	cfg.TurnstileSiteKey = os.Getenv("TURNSTILE_SITE_KEY")
	if cfg.TurnstileSiteKey == "" {
		log.Warnf("TURNSTILE_SITE_KEY not set, using default test site key. This should not be used in production.")
		cfg.TurnstileSiteKey = "1x00000000000000000000BB"
	}
	return cfg, nil
}

func requireEnv(key string) (string, error) {
	val := os.Getenv(key)
	if val == "" {
		return "", fmt.Errorf("%w: %s", ErrMissingEnv, key)
	}

	return val, nil
}
