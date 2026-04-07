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

	cfg.TurnstileSecret = os.Getenv("TURNSTILE_SECRET")
	if cfg.TurnstileSecret == "" {
		return nil, fmt.Errorf("%w: %s", ErrMissingEnv, "TURNSTILE_SECRET")
	}

	cfg.TurnstileSiteKey = os.Getenv("TURNSTILE_SITE_KEY")
	return cfg, nil
}

func requireEnv(key string) (string, error) {
	val := os.Getenv(key)
	if val == "" {
		return "", fmt.Errorf("%w: %s", ErrMissingEnv, key)
	}

	return val, nil
}
