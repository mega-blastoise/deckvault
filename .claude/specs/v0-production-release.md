# V0 Production Release Spec
**Project Johto — Pokemon TCG Platform**
**Target**: EC2-hosted, domain-associated, serving real traffic

---

## 1. Scope

V0 is a card and deck management platform for Pokemon TCG players. Users sign in with Google, manage their personal card collection, build and save decks, and browse decks shared by other users.

### In Scope (V0)
- Google OAuth 2.0 sign-in / sign-up
- Personal card collection management
- Deck creation, editing, deletion (persisted to production DB)
- Public deck browsing (other users' shared decks)
- Card browsing with search and filtering
- Individual card detail view
- Light mode + dark mode (Nebula) theme
- Production deployment: EC2 + RDS PostgreSQL (for mutable data) + domain + TLS

### Out of Scope (V0)
- `distributed-ledger` and `tcg-api` (Rust) apps — not deployed
- Neo4j — not deployed
- Trading, card ownership transfer
- Deck privacy controls (all decks are public by default at v0)
- Deck comments or social features
- Price tracking surface in UI
- Mobile-native app

---

## 2. True Architecture (as-is)

Understanding the real service topology before specifying changes:

```
Browser
  └─→ web (Bun SSR, port 3000)
        ├─→ rest-api (Bun/TS, port 3001)  ← cards, sets, decks (ACTIVE backend)
        │     ├── pokemon-data.sqlite3.db  ← card/set data, read-only, pre-seeded
        │     └── decks.sqlite3.db         ← deck data, read/write, NO user ownership
        └─→ graphql-api (Bun/TS, port 3002) ← GraphQL for cards/sets (NOT used by frontend currently)

tcg-api (Rust) — scaffolded, /api scope empty, NOT active
```

**Key facts:**
- `rest-api` is the active backend — all frontend services (`CardsService`, `DecksService`, `SetsService`) hit it
- Card/set data lives in SQLite (read-only) — this is fine; keep it; bake into Docker image
- Deck data lives in SQLite, no user association — this must move to PostgreSQL with user ownership
- No auth exists anywhere in the stack currently

---

## 3. Database Strategy

**Two-database approach (pragmatic for v0):**

| Data | Store | Rationale |
|------|-------|-----------|
| Cards, Sets | SQLite (`pokemon-data.sqlite3.db`) | Pre-seeded, read-only, fast, zero ops — keep as-is |
| Users, Decks, Collections | PostgreSQL (RDS) | Mutable, user-owned, needs production durability |

### PostgreSQL Schema (new tables in RDS)

#### `users`
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id   TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `decks`
```sql
CREATE TABLE decks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  format        TEXT NOT NULL DEFAULT 'standard',
  cover_card_id TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_decks_is_public ON decks(is_public);
CREATE INDEX idx_decks_updated_at ON decks(updated_at DESC);
```

Note: `cover_card_id` is a TEXT reference to `pokemon_cards.id` in SQLite — no FK constraint across databases.

#### `deck_cards`
```sql
CREATE TABLE deck_cards (
  deck_id   UUID    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL,
  quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 4),
  PRIMARY KEY (deck_id, card_id)
);

CREATE INDEX idx_deck_cards_deck_id ON deck_cards(deck_id);
```

#### `user_collections`
```sql
CREATE TABLE user_collections (
  user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL,
  quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX idx_user_collections_user_id ON user_collections(user_id);
```

### Migration Strategy

Migrations run via a startup check in `rest-api` using `postgres` (Bun-native or `pg` package). Stored in `apps/rest-api/migrations/`. Applied on container startup before the server binds.

---

## 4. Authentication

### Strategy: Google OAuth 2.0, server-side PKCE flow

No passwords stored. Users are identified by `google_id`.

**Flow:**
1. User clicks "Sign in with Google" → frontend navigates to `GET /auth/google`
2. Server generates PKCE code verifier/challenge, stores `code_verifier` in a short-lived signed cookie, redirects to Google OAuth consent URL
3. Google redirects to `GET /auth/callback?code=...&state=...`
4. Server exchanges code for tokens using stored `code_verifier`, fetches Google profile (`sub`, `email`, `name`, `picture`)
5. Upsert user row: `INSERT ... ON CONFLICT (google_id) DO UPDATE SET ...`
6. Issue JWT as HttpOnly cookie (`__session`, SameSite=Strict, Secure, 7-day expiry)
7. Redirect to `/` (or `returnTo` param stored in state)

**JWT payload:**
```json
{ "sub": "<user_uuid>", "email": "...", "iat": ..., "exp": ... }
```

**Auth middleware** in `rest-api`: extracts and verifies JWT from `__session` cookie on every request. Attaches `ctx.user` or returns 401.

**New auth endpoints in `rest-api`:**
```
GET  /auth/google      → initiate OAuth (public)
GET  /auth/callback    → exchange code, set cookie, redirect (public)
GET  /auth/me          → return current user JSON (auth required, 401 if not)
POST /auth/logout      → clear __session cookie, return 204 (auth required)
```

**Required env vars (new):**
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI      # e.g. https://yourdomain.com/auth/callback
JWT_SECRET               # min 256-bit random string
POSTGRES_URL             # postgres://user:pass@host:5432/pokemon_tcg
```

**Packages to add to `rest-api`:**
- `googleapis` or plain fetch to Google token/userinfo endpoints (no heavy SDK needed)
- `jsonwebtoken` (or use `jose` — Bun-compatible) for JWT sign/verify
- `postgres` (Bun-compatible Postgres client) for RDS connection

---

## 5. API Changes (rest-api)

### New: Auth routes (see §4)

### Modified: Decks — migrate from SQLite to PostgreSQL + add user ownership

**Current behavior**: deck CRUD hits `DeckDatabaseService` (SQLite), no user association
**New behavior**: deck CRUD hits PostgreSQL, every deck is owned by a user

| Endpoint | Auth | Change |
|----------|------|--------|
| `GET /api/v1/decks` | Required | Return only current user's decks |
| `GET /api/v1/decks/browse` | Optional | **New** — paginated public decks from all users |
| `GET /api/v1/decks/:id` | Optional | Return deck if public OR if owned by requesting user |
| `POST /api/v1/decks` | Required | Associate deck with `req.user.id` |
| `PUT /api/v1/decks/:id` | Required | Verify ownership before update |
| `DELETE /api/v1/decks/:id` | Required | Verify ownership before delete |

**Browse endpoint** (`GET /api/v1/decks/browse`):
- Query params: `?page=1&limit=20&format=standard&q=<name search>`
- Response: `{ data: Deck[], pagination: { page, limit, total } }`
- Each deck includes: owner `{ name, avatar_url }`, card count, cover card id, format, name, updated_at

### New: Collection routes

```
GET    /api/v1/collection              → current user's collection (auth required)
PUT    /api/v1/collection/:cardId      → upsert card with quantity (auth required) body: { quantity: number }
DELETE /api/v1/collection/:cardId      → remove card (auth required)
```

### Unchanged: Cards, Sets routes
No changes — continue reading from SQLite.

---

## 6. Frontend Changes

### 6.1 Auth

**New: `AuthContext`** (`apps/web/src/web/contexts/Auth.tsx`)
- Fetches `/auth/me` on mount via `useQuery` (staleTime: 5 min)
- Provides `user: AuthUser | null`, `isLoading: boolean`, `isAuthenticated: boolean`
- `AuthUser` type: `{ id, email, name, avatarUrl }`

**New: `useAuth()` hook** — consume `AuthContext`

**New: `ProtectedRoute`** wrapper component — redirects to `/sign-in?returnTo=<current path>` if not authenticated

**New: `/sign-in` page** — centered card, "Continue with Google" button that navigates to `/auth/google`

**Navbar updates:**
- Unauthenticated: "Sign in" button (top-right)
- Authenticated: user avatar + name, dropdown with "My Decks", "My Collection", "Sign out"

**localStorage migration**: On sign-in (AuthContext detects transition from null → user), migrate any localStorage decks to `POST /api/v1/decks`. Clear localStorage after successful migration.

### 6.2 Route Protection

| Route | Auth required? |
|-------|---------------|
| `/` | No |
| `/browse`, `/browse/:cardId` | No |
| `/cards/:id` | No |
| `/decks/browse` | No (new page) |
| `/decks/:id` | No (public decks visible to anyone) |
| `/decks` | Yes (personal decks list) |
| `/decks/new` | Yes |
| `/decks/:id/edit` | Yes |
| `/collection` | Yes |
| `/dashboard` | Yes |
| `/sign-in` | No (redirect to `/` if already authed) |

### 6.3 New Page: `/decks/browse`

Replaces the current behavior where `/decks` shows all decks globally.

**Features:**
- Grid of public deck cards: cover card image, deck name, format badge, card count, owner avatar + name
- Filter by format (standard / expanded / unlimited / all)
- Search by deck name
- Pagination (20 per page)
- "View deck" → `/decks/:id`
- Empty state if no public decks yet

### 6.4 Deck Detail Ownership

- Show owner avatar + name under deck title
- Edit/Delete buttons only rendered if `user.id === deck.userId`

### 6.5 Collection Page

Wire `CollectionPage` to the new collection API endpoints instead of localStorage (`Collection.tsx` context needs to be updated).

### 6.6 Light Mode

**Theme options (in `ThemeSwitcher`):**
- Nebula (dark, default)
- Light

Catppuccin: CSS kept, removed from `ThemeSwitcher` UI.

**Default behavior**: respect `prefers-color-scheme` on first visit; persist choice to localStorage (`__theme` key).

**Light theme variables** added to `apps/web/public/css/index.css` under `[data-theme="light"]`, mapping all semantic tokens (`--bg-sunken`, `--text-primary`, `--text-secondary`, `--surface-hover`, `--card-shadow`, etc.) to appropriate light values.

---

## 7. Infrastructure

### Architecture (production)

```
Internet
  └─→ nginx (EC2, ports 80/443, TLS via Certbot)
        ├─→ web container (Bun SSR, :3000) — all non-/auth, non-/api routes
        └─→ rest-api container (Bun, :3001) — /api/v1/* and /auth/*

rest-api container
  ├── reads: pokemon-data.sqlite3.db (baked into image)
  └── reads/writes: RDS PostgreSQL (users, decks, collections)
```

### EC2

- **Instance**: t3.small (2 vCPU, 2 GB RAM)
- **OS**: Amazon Linux 2023
- **Services**: Docker + Docker Compose
- **Elastic IP**: assigned, pointed at by Route 53 A record

### RDS PostgreSQL

- **Engine**: PostgreSQL 16
- **Instance**: db.t3.micro (single-AZ for v0, Multi-AZ for v1)
- **VPC**: private subnet — only EC2 security group can reach port 5432
- **Automated snapshots**: daily, 7-day retention
- **Database name**: `pokemon_tcg`

### DNS / TLS

- Route 53 A record → EC2 Elastic IP
- `www` CNAME → apex
- TLS via Certbot (Let's Encrypt) on nginx, auto-renew via cron

### nginx routing

```nginx
# /auth/* and /api/* → rest-api
location ~ ^/(auth|api)/ {
  proxy_pass http://rest-api:3001;
  proxy_set_header Cookie $http_cookie;   # pass cookies for auth
}

# everything else → web SSR
location / {
  proxy_pass http://web:3000;
}
```

### `docker-compose.prod.yml`

Services:
- `nginx` — reverse proxy, ports 80/443
- `web` — Bun SSR (env: `API_URL=http://rest-api:3001`)
- `rest-api` — Bun REST API (env: DB paths, Postgres URL, Google OAuth creds, JWT secret)
- No `tcg-api`, no `graphql-api` (can be added later), no `neo4j`, no `distributed-ledger`

### Secrets management

Secrets in AWS SSM Parameter Store, fetched by a startup script and written to `.env.prod` on the EC2 host before `docker-compose up`. Never committed to the repo.

```
/pokemon/prod/GOOGLE_CLIENT_ID
/pokemon/prod/GOOGLE_CLIENT_SECRET
/pokemon/prod/GOOGLE_REDIRECT_URI
/pokemon/prod/JWT_SECRET
/pokemon/prod/POSTGRES_URL
/pokemon/prod/CORS_ORIGINS          # https://yourdomain.com
```

### Deploy process (v0 — manual + script)

```bash
# On EC2
./scripts/deploy.sh
# 1. Pull secrets from SSM → .env.prod
# 2. docker compose -f docker-compose.prod.yml pull
# 3. docker compose -f docker-compose.prod.yml up -d
# 4. Run DB migrations (rest-api startup handles this)
```

Card data (SQLite) is baked into the `rest-api` Docker image at build time.

---

## 8. Implementation Workstreams

### Workstream A — PostgreSQL + Auth backend (blocks everything user-related)

1. Add `postgres` client and `jose`/`jsonwebtoken` to `rest-api` dependencies
2. Write PostgreSQL migration files: `001_users.sql`, `002_decks.sql`, `003_deck_cards.sql`, `004_user_collections.sql`
3. Add `PostgresService` to `rest-api` container (`DI container.register('pg', ...)`)
4. Implement auth endpoints: `/auth/google`, `/auth/callback`, `/auth/me`, `/auth/logout`
5. Implement JWT auth middleware — attach to all protected routes
6. Implement `GET /api/v1/decks/browse` (public, no auth)
7. Migrate deck CRUD handlers from `DeckDatabaseService` (SQLite) to `PostgresService`
8. Implement collection CRUD handlers

### Workstream B — Frontend auth + protected routes (depends on A for real data; can start with mocked `/auth/me`)

1. `AuthContext` + `useAuth()` hook
2. `ProtectedRoute` wrapper
3. `/sign-in` page
4. Navbar auth state (sign-in button / user menu)
5. localStorage deck migration on sign-in

### Workstream C — Frontend new features (depends on A for real APIs)

1. `/decks/browse` page with public deck grid, format filter, search, pagination
2. Deck detail: owner display, ownership-gated edit/delete
3. Wire `CollectionPage` to collection API (replace localStorage context)
4. Wire `DecksPage` — shows only current user's decks

### Workstream D — Light mode (independent)

1. Design light CSS variable values for all semantic tokens
2. Add `[data-theme="light"]` block to `index.css`
3. Update `ThemeSwitcher` — expose Light option, remove Catppuccin from UI
4. Default to `prefers-color-scheme`, persist to localStorage

### Workstream E — Infrastructure (can be done in parallel with B/C/D)

1. Provision RDS PostgreSQL — note connection string
2. Launch EC2 t3.small — install Docker + Compose
3. Configure security groups
4. Set up Route 53 + TLS via Certbot
5. Write `docker-compose.prod.yml`
6. Write deploy script (`scripts/deploy.sh`)
7. Store secrets in SSM Parameter Store
8. Run initial migration + card data seeding against production DB
9. Smoke test end-to-end

---

## 9. Open Questions

| # | Question | Default assumption |
|---|----------|--------------------|
| 1 | Keep `graphql-api` in production at v0? | No — skip for v0, reduces ops surface |
| 2 | Should unauthenticated users be able to VIEW a public deck detail? | Yes |
| 3 | Domain purchased and accessible? | Assumed yes — provide domain name when known |
| 4 | Should all new decks default to public? | Yes (enables browse feature from day one) |
| 5 | `tcg-api` (Rust) — continue building toward v1 or deprioritize entirely? | Defer; rest-api handles v0 |
| 6 | Card data SQLite: volume-mounted (persistent) or baked into image? | Baked into image (simpler; card data is static until a new sync) |
| 7 | `user_collections` qty: mirror physical card collection or just track "I own this card"? | Quantity (how many copies owned) |

---

## 10. Definition of Done

V0 is shippable when:

**Auth**
- [ ] User can sign in with Google and session persists across page reloads
- [ ] User can sign out
- [ ] Unauthenticated access to protected routes redirects to sign-in
- [ ] `/auth/me` returns 401 for unauthenticated requests

**Decks**
- [ ] Authenticated user can create, edit, delete their own decks
- [ ] Deck data persists to PostgreSQL (survives server restart)
- [ ] User can browse public decks from all users at `/decks/browse`
- [ ] Deck detail shows owner name and avatar
- [ ] Edit/delete controls only shown to deck owner

**Cards & Collection**
- [ ] Cards browsable with search and filter
- [ ] Card detail page loads
- [ ] Authenticated user can manage their collection (quantity per card)
- [ ] Collection persists to PostgreSQL

**Themes**
- [ ] Light mode available and functional across all pages
- [ ] Theme persists across page reloads

**Infrastructure**
- [ ] App served over HTTPS on a real domain
- [ ] Cold start (fresh EC2 reboot) returns to working state within 60 seconds
- [ ] RDS automated backups confirmed enabled
