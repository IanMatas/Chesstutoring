# Agent notes

- Static site (no build). Served by `python -m http.server` on port 3000 via `docker-compose.base44.yml`; source is bind-mounted, so edits show on browser refresh (no live reload — reload the preview).
- Runtime deps load from CDNs (chess.js, Stockfish, Wikimedia piece SVGs, Google Fonts); no secrets.
- Tests in `tests/*.cjs` are Node smoke scripts.
