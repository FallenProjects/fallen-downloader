package config

import (
	"errors"
	"fmt"
	"os"

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
	cfg.ApiKey = os.Getenv("ONEGRAB_API_KEY")
	if cfg.ApiKey == "" {
		return nil, fmt.Errorf("%w: ONEGRAB_API_KEY", ErrMissingEnv)
	}

	cfg.ApiUrl = os.Getenv("API_URL")
	if cfg.ApiUrl == "" {
		cfg.ApiUrl = "https://api.onegrab.fun"
	}
	cfg.Port = os.Getenv("PORT")
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	cfg.TurnstileSecret = os.Getenv("TURNSTILE_SECRET")
	cfg.TurnstileSiteKey = os.Getenv("TURNSTILE_SITE_KEY")
	if (cfg.TurnstileSecret == "") != (cfg.TurnstileSiteKey == "") {
		return nil, fmt.Errorf("TURNSTILE_SECRET and TURNSTILE_SITE_KEY must be set together")
	}

	return cfg, nil
}
