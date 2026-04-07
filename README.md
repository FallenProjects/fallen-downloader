# Fallen Downloader

Fallen Downloader is a Go web app that lets users paste supported media links, solve Cloudflare Turnstile verification, and download media through `api.fallenapi.fun`.

It serves a built-in frontend and exposes a small API used by that frontend.

## Features

- Web UI with platform detection for social and music URLs
- Snap workflow for video/audio/image extraction
- Music workflow for track search and download
- Cloudflare Turnstile verification on `/api/*` routes
- Embedded templates and static assets (single Go binary)
- Dockerfile and Docker Compose support

## Tech Stack

- Go 1.26+
- Fiber v3
- Cloudflare Turnstile
- External provider API: `https://api.fallenapi.fun`

## Project Structure

```text
.
|- main.go
|- internal/
|  |- api/
|  |- config/
|  `- httpx/
`- templates/
```

## Configuration

The app uses environment variables (auto-loaded from `.env` via `godotenv/autoload`).

Copy `sample.env` to `.env` and update values.

| Variable             | Required    | Default                     | Description                                      |
|----------------------|-------------|-----------------------------|--------------------------------------------------|
| `API_KEY`            | Yes         | -                           | API key sent to upstream provider in `X-API-Key` |
| `API_URL`            | No          | `https://api.fallenapi.fun` | Base URL for upstream provider                   |
| `PORT`               | No          | `8080`                      | HTTP server port                                 |
| `TURNSTILE_SECRET`   | Yes         | -                           | Secret used to verify `X-CF-Turnstile-Token`     |
| `TURNSTILE_SITE_KEY` | Recommended | empty                       | Site key injected into frontend Turnstile widget |

## Run Locally

```bash
git clone https://github.com/FallenProjects/fallen-downloader
cd fallen-downloader
cp sample.env .env
# edit .env with your real values
go run .
```

Then open:

- `http://localhost:8080/` - web UI
- `http://localhost:8080/health` - health check

## Run with Docker Compose

```bash
git clone https://github.com/FallenProjects/fallen-downloader
cd fallen-downloader
cp sample.env .env
# edit .env with your real values
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

## API Endpoints (this app)

All `/api/*` routes require header `X-CF-Turnstile-Token`.

- `GET /api/snap?url=<target_url>`
- `GET /api/info?url=<target_url>`
- `GET /api/dl?url=<target_url>`

Health endpoint does not require Turnstile:

- `GET /health`

Example request:

```bash
curl -sS "http://localhost:8080/api/snap?url=https://www.instagram.com/reel/abc" \
  -H "X-CF-Turnstile-Token: <turnstile_token>"
```

## Internal Flow

1. Browser calls this app's `/api/*` endpoint.
2. Middleware validates Turnstile token with Cloudflare.
3. Server calls upstream provider using `API_KEY`.
4. Response is returned to browser and frontend triggers download links.

## Observability

- Request logs enabled (except `/stream`)
- Panic recovery middleware enabled
- pprof middleware enabled (Fiber default pprof routes)

## Development Notes

- Templates and static files are embedded with `go:embed`.
- CORS is currently permissive (`*`).
- The frontend supports multiple URL patterns (Instagram, TikTok, Spotify, etc.) defined in `templates/app.js`.

## License

Licensed under the MIT License. See `LICENSE`.
