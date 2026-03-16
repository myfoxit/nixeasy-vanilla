# NixEasy CPQ

Configure–Price–Quote tool powered by PocketBase + vanilla JS.

## Quick Start (Docker Compose)

```bash
docker compose up -d
```

This starts:
- **PocketBase** on `localhost:8090` (API + Admin UI)
- **NixEasy App** on `localhost:8080` (nginx serving the frontend, proxying API)

### First-time setup

1. Open the PocketBase admin UI: http://localhost:8090/_/
2. Create your superuser account
3. Import the schema: Settings → Import collections → paste contents of `pb_schema.json`
4. Open the app: http://localhost:8080

### Stopping

```bash
docker compose down        # stop containers (data persists in Docker volume)
docker compose down -v     # stop + delete data volume
```

## Development (without Docker)

Just serve the files with any static server and point the app at a running PocketBase instance:

```bash
# e.g. with Python
python3 -m http.server 8080

# or npx
npx serve .
```

The app auto-detects: on `localhost` it uses the same origin (expects PocketBase proxy), otherwise falls back to `https://base.heli0s.dev`.

## Project Structure

```
├── index.html          # Entry point
├── css/                # Stylesheets
├── js/                 # Application code
│   ├── api.js          # PocketBase client
│   ├── app.js          # Boot & routing
│   ├── state.js        # Pub/sub state
│   ├── router.js       # Hash-based router
│   ├── components/     # Reusable UI components
│   ├── configurator/   # CPQ configurator
│   ├── views/          # Page views
│   └── utils/          # Helpers
├── pb_schema.json      # PocketBase collection schema
├── docker-compose.yml  # Local dev stack
└── nginx.conf          # Nginx config for Docker
```
