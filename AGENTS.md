# Chess Tutor — Base44 Dev Environment

## What this is
A pure static site (HTML/CSS/JS) with no build step, no backend, no database.
All logic runs in the browser; chess.js, Stockfish, piece images, and fonts load from CDNs.

## Running it
```sh
docker compose -f docker-compose.base44.yml up -d
```
Serves on port 3000 via `python3 -m http.server` inside a container. The repo is
bind-mounted read-only at `/app`.

## No credentials needed
No external-service credentials are required. The app is entirely client-side.

## Editing
No build or restart needed for changes — just refresh the browser after editing
HTML/CSS/JS files. The static server picks up file changes on the next request.

## Tests
Smoke tests live in `tests/` and are plain Node scripts (`.cjs`), run with `node tests/<file>.cjs`.
They require Node and a browser environment (puppeteer-style).
