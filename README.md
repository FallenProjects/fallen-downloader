# Fallen Downloader

Fallen Downloader is an open-source Go web app for finding media available from social and music links. It uses [OneGrab](https://api.onegrab.fun/docs) for extraction and keeps the API key on the server.

## Run

Go 1.27 or Docker is required. Copy `sample.env` to `.env` and set `ONEGRAB_API_KEY`.

```sh
cp sample.env .env
go run .
```

The app listens on `http://localhost:8080` by default. To run it with Docker, use `docker compose up --build`.

| Variable | Purpose |
| --- | --- |
| `ONEGRAB_API_KEY` | Required OneGrab key. `API_KEY` is also accepted for existing deployments. |
| `API_URL` | Optional OneGrab base URL. Defaults to `https://api.onegrab.fun`. |
| `PORT` | App and Docker Compose port. Defaults to `8080`. |
| `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY` | Optional Cloudflare Turnstile protection. Set both or neither. |

## How it works

Paste a supported link to see available video, audio, or images, or search music on a selected service. Download actions open the media URL returned by OneGrab directly; the app does not proxy media files. HLS links need a compatible player, and Telegram message links open in Telegram. Encrypted streams cannot be opened directly by this app.

YouTube and YouTube Music are temporarily unavailable. They will be handled through a future Telegram integration. No account is required, and the app does not save submitted links or download history.

## License

MIT. See [LICENSE](LICENSE).
