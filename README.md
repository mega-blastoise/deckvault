# DeckVault — Project Johto

A competitive Pokemon TCG platform built as a Turborepo monorepo. The product targets competitive players with a "From Meta → My Deck" workflow, deck analytics, and local meta tracking — differentiating against Limitless TCG and RK9.gg on the personalization and iteration layer.

**Production:** NVIDIA DGX Spark (self-hosted) → Cloudflare Tunnel → deckvault.gg | Images via GHCR (`ghcr.io/mega-blastoise/deckvault-*`)

---

## Architecture at a Glance

```text
┌──────────────────────────────────────────────────────────────────┐
│  Production (DGX Spark / Cloudflare Tunnel)                      │
│                                                                  │
│  Cloudflare Edge (TLS termination)                               │
│    └── cloudflared tunnel → nginx (HTTP · :80)                   │
│          ├── apps/web         (React 19 SSR · Bun · :3000)       │
│          ├── apps/rest-api    (REST · Bun · :3001)  → PG         │
│          └── apps/graphql-api (Apollo · Bun · :3002) → SQLite    │
│                                                                  │
│  Local / Development                                             │
│    ├── apps/tcg-api    (GraphQL · Rust · :8080) → PG + Neo4j    │
│    ├── apps/cron       (background scheduler · Bun)              │
│    ├── apps/mcp-server (MCP server · Rust · axum)                │
│    └── apps/scripts    (data sync CLI · Bun)                     │
│                                                                  │
│  Tooling                                                         │
│    └── apps/distributed-ledger (blockchain prototype · Rust)     │
└──────────────────────────────────────────────────────────────────┘
```

Card and set data lives in a read-only SQLite volume (`pokemon-data.sqlite3.db`). User data (accounts, decks, collections, meta reports) is stored in a containerized PostgreSQL instance in both production and local dev.

---

## Monorepo Layout

```text
Pokemon/
├── apps/
│   ├── web/                  # React 19 SSR frontend (DeckVault UI)
│   ├── rest-api/             # REST API (Bun) — primary prod API
│   ├── graphql-api/          # Apollo GraphQL (Bun) — read-layer
│   ├── tcg-api/              # Rust · Actix-web · async-graphql
│   ├── mcp-server/           # MCP server (Rust · axum)
│   ├── cron/                 # Background job scheduler (Bun)
│   ├── scripts/              # Data-sync CLI (Bun)
│   ├── docs/                 # Internal docs app
│   └── distributed-ledger/   # Blockchain prototype (Rust)
├── packages/
│   ├── @build/               # Build presets & concurrent runner
│   ├── @clients/             # Pokemon TCG API client
│   ├── @configs/             # Shared tsconfig presets
│   ├── @database/            # PostgreSQL · SQLite · Neo4j adapters
│   ├── @framework/           # Zero-dep Bun HTTP framework
│   ├── @logger/              # Namespaced debug logger
│   ├── @pokemon-data/        # Static card & set JSON (50+ sets)
│   └── @utils/               # Zod schemas & type guards
├── docsites/                 # Five standalone documentation sites
│   ├── api/                  # REST & GraphQL endpoint reference
│   ├── architecture/         # System design docs
│   ├── database/             # Schema, migrations, SQLite/PG split
│   ├── deployment/           # Cloudflare Tunnel · nginx · systemd
│   └── development/          # Contributor guides
├── docker/
│   ├── nginx/                # nginx config for prod reverse proxy
│   └── database/             # PG & Neo4j compose + init SQL
├── database/                 # SQLite card data (mounted as volume)
├── scripts/
│   └── migrate-prod.sh       # Run pending migrations against prod Postgres
├── docker-compose.yml        # Local dev orchestration (all services)
├── docker-compose.prod.yml   # Production orchestration (nginx+3 services)
├── turbo.json                # Turborepo task graph
├── package.json              # Root workspace manifest
├── .mise.toml                # Dev toolchain (Bun, Node, Rust)
└── .claude/                  # Claude Code project configuration
    ├── specs/                # Moonshot spec documents
    └── guides/               # Deployment recipes
```

---

## Tech Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| Frontend       | React 19.2, TypeScript 5.5, Webpack 5, Storybook 8.5            |
| Runtime        | Bun 1.3.5 (TS execution, bundler, test runner, package manager) |
| Rust API       | Actix-web 4.9, async-graphql 7.0, Tokio, serde                  |
| Rust MCP       | axum 0.8, serde, tokio                                          |
| Databases      | PostgreSQL 17 (sqlx), SQLite (card data), Neo4j (neo4rs)        |
| GraphQL        | async-graphql (Rust), Apollo Server (Bun)                       |
| Validation     | Zod 4                                                           |
| Build          | Turborepo 2.3, esbuild                                          |
| Infrastructure | DGX Spark · Cloudflare Tunnel · nginx · Docker · systemd        |
| CI/CD          | GitHub Actions (lint, check-types, test, release, deploy-docs)  |
| Registry       | GHCR (`ghcr.io/mega-blastoise/deckvault-*`)                     |
| Dev Tooling    | mise, ESLint, Prettier, Cargo, Playwright (e2e)                 |

---

## Product Features (Moonshot Workstream — all shipped)

The Moonshot workstream transformed DeckVault from a collection tracker into a competitive platform:

| Spec    | Feature                        | Description                                                                 |
| ------- | ------------------------------ | --------------------------------------------------------------------------- |
| SPEC_01 | Landing page + feature gates   | Marketing landing with sign-up CTA; Collection and Dashboard gated          |
| SPEC_02 | Meta Deck Browser              | Curated tournament decklists; filter by owned cards; clone to builder       |
| SPEC_03 | Deck Analytics Engine          | Hypergeometric opening-hand sim, prize risk, energy curve — pure math lib   |
| SPEC_04 | Deck Evolution Tracking        | Auto-snapshot on every save; diff view between any two versions             |
| SPEC_05 | Visual Deck Builder            | Drag-and-drop card reordering; type-grouped visual layout; live legality    |
| SPEC_06 | Local Meta Tracking            | Log decks faced at LGS; frequency dashboard for top archetypes              |

### Core library: `deck-math`

```text
apps/web/src/web/lib/deck-math/
├── hypergeometric.ts   # P(drawing k copies in opening hand)
├── opening-hand.ts     # Full opening hand simulation
├── prize-risk.ts       # Prize card risk per key card
└── energy-curve.ts     # Energy count vs. attack curve
```

---

## Apps

### `web` — React SSR Frontend

Server-side rendered React 19 application. Routes: `/` (landing), `/browse`, `/decks`, `/meta-decks`, `/local-meta`, `/collection` (gated), `/dashboard` (gated).

**Ports:** `3000` (app) · `6006` (Storybook)

### `rest-api` — Primary REST API (Production)

The primary production API. Bun-native, built on `@pokemon/framework`. Connects to PostgreSQL for user data (auth, decks, collections, meta reports) and SQLite for card/set data. Runs migrations automatically on startup.

**Port:** `3001`

### `graphql-api` — Apollo GraphQL API

Secondary GraphQL read layer. Apollo Server with DataLoader batching. Reads from the SQLite card data snapshot for low-latency card/set queries.

**Port:** `3002`

### `tcg-api` — Rust GraphQL API

The original Rust API. Actix-web + async-graphql + sqlx (compile-time query checking) + neo4rs for graph queries (evolution chains, deck synergies). Used locally; not part of the prod compose.

**Port:** `8080`

### `mcp-server` — MCP Server

Rust + axum MCP (Model Context Protocol) server for AI tool integration.

### `cron` — Background Scheduler

Recurring jobs: SQLite data sync, PostgreSQL replication, automated backups with retention, health monitoring. Supports job dependencies and exclusive-execution locks.

### `scripts` — Data Sync CLI

Seeds and synchronises Pokemon TCG data into SQLite. Primary entry point: `docker:scripts:db:sync`.

### `distributed-ledger` — Blockchain Prototype

Early-stage Rust application for decentralised card-ownership tracking.

---

## Packages

| Package              | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `@pokemon/build`     | Build presets (library, server, browser), concurrent build runner, output reporter                        |
| `@pokemon/clients`   | Async `PokemonTCGClient` for querying the official Pokemon TCG API with pagination                        |
| `@pokemon/configs`   | Shared `tsconfig.json` presets: base, bun, react                                                          |
| `@pokemon/database`  | Unified adapter for PostgreSQL, SQLite, and Neo4j — connection pools, insert helpers, graph operations    |
| `@pokemon/framework` | Zero-dependency Bun HTTP framework: router, DI container, middleware (CORS, rate-limit, security headers) |
| `@pokemon/logger`    | Namespaced debug logger with chalk styling and emoji support                                              |
| `@pokemon/data`      | Static JSON card & set data for 50+ Pokemon TCG sets. Lazy-loaded via Bun File API                        |
| `@pokemon/utils`     | Zod-based validation schemas and type guards for cards, attacks, sets, weaknesses, and resistances        |

---

## Getting Started

### Prerequisites

[mise](https://mise.jdx.dev/) manages the dev toolchain. After cloning:

```sh
mise install
```

Provisions **Bun 1.3.5**, **Node 24.6**, and **Rust 1.92.0**.

### Install Dependencies

```sh
mise run install
```

### Start Everything with Docker (local dev)

```sh
docker compose up --build
```

All services start in dependency order. Once healthy:

| Service          | URL                     |
| ---------------- | ----------------------- |
| Web frontend     | `http://localhost:3000` |
| REST API         | `http://localhost:3001` |
| Apollo GraphQL   | `http://localhost:3002` |
| Rust GraphQL API | `http://localhost:8080` |
| Neo4j Browser    | `http://localhost:7474` |

### Run Locally (without Docker)

```sh
# Terminal 1 — databases
docker compose up postgres neo4j

# Terminal 2 — Rust API
cd apps/tcg-api && cargo run

# Terminal 3 — all Bun services
bun run dev
```

---

## Common Tasks

```sh
# Tests (unit + integration)
bun run test

# E2e smoke tests (Playwright)
cd apps/web && bunx playwright test

# Lint
bun run lint

# Type-check (all workspaces)
bun run check-types

# Format
bun run format

# Build everything
bun run build

# Seed SQLite card data
bun run docker:scripts:db:sync

# Storybook
cd apps/web && bun run storybook
```

---

## Production Deployment

Production runs six containers (`cloudflared`, `nginx`, `web`, `rest-api`, `graphql-api`, `postgres`) orchestrated by `docker-compose.prod.yml` on a self-hosted NVIDIA DGX Spark, managed by a systemd unit. Traffic routes through a Cloudflare Tunnel — no open inbound ports required.

### Build and push images

```sh
# Build from monorepo root (Dockerfiles COPY from repo root)
docker build -t ghcr.io/mega-blastoise/deckvault-web:latest -f apps/web/Dockerfile .
docker build -t ghcr.io/mega-blastoise/deckvault-rest-api:latest -f apps/rest-api/Dockerfile .
docker build -t ghcr.io/mega-blastoise/deckvault-graphql-api:latest -f apps/graphql-api/Dockerfile .

docker push ghcr.io/mega-blastoise/deckvault-web:latest
docker push ghcr.io/mega-blastoise/deckvault-rest-api:latest
docker push ghcr.io/mega-blastoise/deckvault-graphql-api:latest
```

### Deploy to production (DGX Spark)

```sh
# Copy updated compose file to prod directory, then restart via systemd
sudo cp docker-compose.prod.yml /opt/deckvault/
sudo chown deckvault:deckvault /opt/deckvault/docker-compose.prod.yml
sudo systemctl restart deckvault

# Or, to pull latest images without a compose change:
sudo systemctl stop deckvault
docker compose -f /opt/deckvault/docker-compose.prod.yml pull
sudo systemctl start deckvault
```

### Run pending migrations

```sh
./scripts/migrate-prod.sh
```

See `.claude/guides/SPARK_PROD_SETUP.md` for the full self-host setup recipe and `.claude/guides/MIGRATION_CONTEXT.md` for the AWS → Spark migration runbook.

---

## CI/CD

Three GitHub Actions workflows:

| Workflow          | Trigger                   | Jobs                              |
| ----------------- | ------------------------- | --------------------------------- |
| `ci.yml`          | push to `main`/`dev`, PRs | lint · type-check · test          |
| `release.yml`     | push to `main`            | build · push images · deploy      |
| `deploy-docs.yml` | push to `main`            | build & deploy docsites workspace |

---

## Docker Details

All Dockerfiles use multi-stage builds. Bun-based services run as non-root users. Every service exposes a `/health` endpoint used by Docker for dependency ordering.

### Production Service Map

| Container             | Image                                          | Port (internal) |
| --------------------- | ---------------------------------------------- | --------------- |
| `pokemon-cloudflared` | `cloudflare/cloudflared:latest`                | —               |
| `pokemon-nginx`       | `nginx:1.27-alpine`                            | 80              |
| `pokemon-web`         | `ghcr.io/mega-blastoise/deckvault-web`         | 3000            |
| `pokemon-rest-api`    | `ghcr.io/mega-blastoise/deckvault-rest-api`    | 3001            |
| `pokemon-graphql-api` | `ghcr.io/mega-blastoise/deckvault-graphql-api` | 3002            |

All containers share the `pika` Docker network.

### Data Volumes

| Volume path (host)             | Mount (container)              | Access     |
| ------------------------------ | ------------------------------ | ---------- |
| `./database/`                  | `/data/`                       | read-only  |

The SQLite card database is never written at runtime — it is updated offline and replicated manually.

---

## Database Schema (PostgreSQL)

| Table               | Key Columns                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | `id`, `username`, `email`, `password`, `created_at`                                                                                                               |
| `pokemon_card_sets` | `id`, `name`, `series`, `printed_total`, `total`, `legalities`, `images`, `release_date`                                                                          |
| `pokemon_cards`     | `id`, `name`, `supertype`, `subtypes`, `types`, `hp`, `evolves_from`, `attacks`, `weaknesses`, `set_id` (FK), `rarity`, `images`, pricing                         |
| `decks`             | `id`, `user_id`, `name`, `format`, `created_at`, `updated_at`                                                                                                     |
| `deck_cards`        | `deck_id`, `card_id`, `quantity`                                                                                                                                  |
| `deck_versions`     | `id`, `deck_id`, `snapshot` (JSON), `created_at`                                                                                                                  |
| `meta_decks`        | `id`, `name`, `archetype`, `format`, `cards` (JSON), `source`                                                                                                     |
| `local_meta`        | `id`, `user_id`, `archetype`, `event_type`, `result`, `reported_at`                                                                                               |

Neo4j stores evolution relationships, deck synergies, card combos, and type-effectiveness graphs (local dev only).

---

## Environment Variables

| Variable               | Used by                           | Example                                            |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`         | `rest-api` (prod: RDS)            | `postgresql://user:pass@rds-endpoint:5432/pokemon` |
| `NEO4J_URI`            | `tcg-api`                         | `bolt://localhost:7687`                            |
| `REST_API_URL`         | `web`                             | `http://rest-api:3001`                             |
| `GRAPHQL_API_URL`      | `web`                             | `http://graphql-api:3002`                          |
| `DATABASE_PATH`        | `rest-api`, `graphql-api`, `cron` | `/data/pokemon-data.sqlite3.db`                    |
| `DATABASE_READONLY`    | `rest-api`, `graphql-api`         | `true`                                             |
| `APOLLO_INTROSPECTION` | `graphql-api`                     | `true`                                             |

Sensitive values (`DATABASE_URL`, OAuth secrets, `TUNNEL_TOKEN`) are provided via `/opt/deckvault/.env.prod` on the Spark (gitignored, chmod 600). Per-service `.env` templates live alongside each app.
