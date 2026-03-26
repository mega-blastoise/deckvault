# Local Development Setup

## Architecture

```
bun run dev (turbo)
  ├── apps/web        → hot-reload on :3000  (Bun, no Docker)
  └── apps/rest-api   → watch mode on :3001  (Bun, no Docker)
        └── connects to → pokemon-postgres-dev on localhost:5433 (Docker)
```

Production runs entirely separately from `/opt/deckvault/` under the
`pokemon` Docker Compose project. The dev postgres is project `pokemon-dev`
and shares nothing with prod.

---

## Why dev postgres is on port 5433 (not 5432)

Prod postgres (`pokemon-postgres`) runs on the `pokemon_pika` Docker network
with no host port binding — it is NOT accessible at `localhost:5432`. But
using 5433 for dev makes the distinction explicit and eliminates any future
ambiguity. Never change this to 5432.

---

## Why the `name: pokemon-dev` field in docker-compose.dev.yml matters

Docker Compose derives a project name from the working directory when no
`name:` is set. Both compose files live in the same dir (`Pokemon/`), so
without `name:` they'd share project name `pokemon` — the same name as the
prod stack. Running `compose up` with the dev file would then orphan-remove
all prod containers not in the dev file (nginx, web, cloudflared, etc.).

The `name: pokemon-dev` field + `--project-name pokemon-dev` in scripts
provides a belt-and-suspenders guarantee of isolation.

---

## First-time setup

### 1. Start dev postgres
```bash
bun run db:dev
# Starts pokemon-postgres-dev on localhost:5433
# Data persists in Docker volume: pokemon-dev_pokemon_dev_postgres_data
```

Wait ~5 seconds for postgres to be healthy, then verify:
```bash
docker exec pokemon-postgres-dev pg_isready -U pokemon -d pokemon_tcg
# Expected: localhost:5432 - accepting connections
```

### 2. Configure the rest-api environment
```bash
cp apps/rest-api/.env.example apps/rest-api/.env
```

Edit `apps/rest-api/.env` and fill in:
- `JWT_SECRET` — any 32+ char random string: `openssl rand -hex 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
  - Authorized redirect URI: `http://localhost:3001/auth/callback`

Everything else defaults to sensible dev values (postgres at localhost:5433,
CORS for localhost:3000, etc.).

### 3. Run the apps
```bash
bun run dev
# Turbo runs web (:3000) and rest-api (:3001) in parallel with hot reload
```

The rest-api auto-runs all pending migrations on startup — no manual
`psql` needed. You'll see `[pg] Connected and migrations applied` in the
rest-api logs.

---

## Daily workflow

```bash
# Start dev postgres (if not already running — restart: unless-stopped handles reboots)
bun run db:dev

# Run all apps in dev mode
bun run dev

# Or run individually
cd apps/rest-api && bun run dev
cd apps/web && bun run dev
```

---

## Useful db:dev commands

```bash
bun run db:dev           # start dev postgres (detached)
bun run db:dev:stop      # stop it (keeps data)
bun run db:dev:reset     # nuke volume and restart (fresh schema)
bun run db:dev:logs      # tail postgres logs
bun run db:dev:psql      # interactive psql session against dev db
```

---

## Environment variables at runtime

The rest-api reads from `apps/rest-api/.env` (via `dotenv/config` at startup).
The web app reads API URLs from `API_URL` env var — defaults to `window.location.origin/api/v1`
when running in dev, which proxies to the local rest-api correctly since both run
on localhost.

---

## Checking that prod is untouched

```bash
# Prod stack should show all containers Up
docker compose --project-name pokemon -f /opt/deckvault/docker-compose.prod.yml ps

# Dev stack (if running)
docker compose --project-name pokemon-dev ps
```

These are completely separate projects. `bun run db:dev:stop` cannot affect prod.

---

## Troubleshooting

**`JWT_SECRET` missing error on startup**
→ `apps/rest-api/.env` is missing or `JWT_SECRET` is empty. The config throws immediately on startup.

**`ECONNREFUSED` connecting to postgres**
→ Run `bun run db:dev`, wait for healthcheck, then retry.

**Port 5433 already in use**
→ `docker ps` — check if `pokemon-postgres-dev` is already running. If something else is on 5433, stop it or change the port in `docker-compose.dev.yml` and `apps/rest-api/.env`.

**Migrations not applying**
→ The rest-api applies migrations on every startup via `PostgresService.runMigrations()`. If a migration fails, you'll see an error in the rest-api logs. Run `bun run db:dev:psql` to inspect the `_migrations` table.
