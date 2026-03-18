# V0 Production Release — Implementation Summary

This document covers all changes implemented for the V0 production release of the Pokemon TCG Platform, organized by workstream.

---

## Workstream A — PostgreSQL + Auth Backend

Migrates deck storage from SQLite to PostgreSQL, adds Google OAuth authentication, and introduces user-owned decks and collections.

### Database Migrations

| File | Purpose |
|------|---------|
| `apps/rest-api/migrations/001_users.sql` | `users` table — Google OAuth profiles with UUID primary key |
| `apps/rest-api/migrations/002_decks.sql` | `decks` table — user-owned decks with format, visibility, indexes |
| `apps/rest-api/migrations/003_deck_cards.sql` | `deck_cards` table — junction table with quantity (1-4 constraint) |
| `apps/rest-api/migrations/004_user_collections.sql` | `user_collections` table — per-user card ownership with quantity |
| `apps/rest-api/migrations/005_migrations_tracking.sql` | `_migrations` tracking table for idempotent migration runner |

### New Services

**`apps/rest-api/src/services/postgres.ts`** — `PostgresService`

- Uses `Bun.SQL` (native Bun PostgreSQL client) for all database operations
- Runs migrations automatically on startup via `_migrations` tracking table
- Provides typed methods for:
  - User upsert and lookup (`upsertUser`, `getUserById`)
  - Deck CRUD with user ownership (`listUserDecks`, `getDeck`, `createDeck`, `updateDeck`, `deleteDeck`)
  - Deck cards management (`getDeckCards`, `setDeckCards`)
  - Public deck browsing with pagination, format filter, and name search (`browseDecks`)
  - Collection CRUD (`getUserCollection`, `upsertCollectionCard`, `removeCollectionCard`)

### Auth Middleware

**`apps/rest-api/src/middleware/auth.ts`**

- `authRequired` — Middleware that extracts JWT from `__session` HttpOnly cookie, verifies with `jsonwebtoken`, returns 401 if invalid. Attaches `AuthUser` (`{ id, email }`) to the request context.
- `authOptional` — Same extraction but does not reject unauthenticated requests. Attaches user if present.
- `extractUser(request, jwtSecret)` — Standalone function for use in handlers that need manual auth checking.
- `getUser(ctx)` / `requireUser(ctx)` — Context accessors for the attached user.
- Cookie parsing is manual (no dependencies) — splits `Cookie` header, extracts `__session` value.

### Auth Handlers

**`apps/rest-api/src/handlers/auth.ts`**

| Endpoint | Method | Auth | Behavior |
|----------|--------|------|----------|
| `/auth/google` | GET | Public | Generates PKCE code verifier/challenge, stores verifier in `__pkce_verifier` cookie, redirects to Google OAuth consent URL. Accepts `?returnTo=` for post-auth redirect. |
| `/auth/callback` | GET | Public | Exchanges authorization code for tokens using PKCE verifier from cookie, fetches Google profile via userinfo endpoint, upserts user row, issues JWT as `__session` HttpOnly cookie (7-day expiry, SameSite=Strict), redirects to `returnTo`. |
| `/auth/me` | GET | Public (returns 401 if no valid session) | Returns current user's profile (`{ id, email, name, avatarUrl }`). Used by frontend `AuthContext` to check session state. |
| `/auth/logout` | POST | Public | Clears `__session` cookie by setting `Max-Age=0`, returns 204. |

JWT payload: `{ sub: <user_uuid>, email: <email>, iat, exp }` signed with `JWT_SECRET`.

### Deck Handlers (Rewritten)

**`apps/rest-api/src/handlers/decks.ts`**

Previously used `DeckDatabaseService` (SQLite, no user ownership). Now uses `PostgresService` with full user ownership.

| Endpoint | Method | Auth | Change from previous |
|----------|--------|------|---------------------|
| `GET /api/v1/decks` | GET | Required | Returns only the authenticated user's decks (was: all decks globally) |
| `GET /api/v1/decks/browse` | GET | Optional | **New endpoint** — paginated public decks from all users with owner info, format filter, name search |
| `GET /api/v1/decks/:id` | GET | Optional | Returns deck if public OR owned by requesting user (was: always returned) |
| `POST /api/v1/decks` | POST | Required | Associates deck with `req.user.id`, stores cards in `deck_cards` table (was: SQLite with no user) |
| `PUT /api/v1/decks/:id` | PUT | Required | Verifies ownership before update, returns 403 if not owner (was: anyone could update) |
| `DELETE /api/v1/decks/:id` | DELETE | Required | Verifies ownership before delete, returns 403 if not owner (was: anyone could delete) |

Browse response shape:
```json
{
  "data": [{ "id", "name", "format", "cardCount", "updatedAt", "owner": { "name", "avatarUrl" } }],
  "pagination": { "page", "limit", "total" }
}
```

### Collection Handlers (New)

**`apps/rest-api/src/handlers/collection.ts`**

| Endpoint | Method | Auth | Behavior |
|----------|--------|------|----------|
| `GET /api/v1/collection` | GET | Required | Returns all cards in the authenticated user's collection as `[{ cardId, quantity }]` |
| `PUT /api/v1/collection/:cardId` | PUT | Required | Upserts a card with `{ quantity }` body (default 1). Uses PostgreSQL `ON CONFLICT DO UPDATE`. |
| `DELETE /api/v1/collection/:cardId` | DELETE | Required | Removes a card from collection. Returns 404 if not present. |

### Config Changes

**`apps/rest-api/src/config/index.ts`**

Added three new config sections to the `Config` interface and `loadConfig()`:

```
postgres.url        ← POSTGRES_URL env var
google.clientId     ← GOOGLE_CLIENT_ID
google.clientSecret ← GOOGLE_CLIENT_SECRET
google.redirectUri  ← GOOGLE_REDIRECT_URI (default: http://localhost:3001/auth/callback)
jwt.secret          ← JWT_SECRET (default: dev-jwt-secret-change-in-production)
```

### Services Type

**`apps/rest-api/src/types/services.ts`**

Added `pg: PostgresService` to the `Services` interface used for typed DI container access in all handlers.

### Application Wiring

**`apps/rest-api/src/index.ts`**

- Registered `PostgresService` in the DI container: `.register('pg', (c) => new PostgresService(c.get('config').postgres.url))`
- Added four new router groups:
  - `auth` — `/auth/google`, `/auth/callback`, `/auth/me`, `/auth/logout` (public)
  - `decksBrowse` — `GET /api/v1/decks/browse` (public)
  - `decksDetail` — `GET /api/v1/decks/:id` (auth optional via `authOptional` middleware)
  - `decksProtected` — `GET/POST /api/v1/decks`, `PUT/DELETE /api/v1/decks/:id` (auth required via `authRequired` middleware)
  - `collection` — `GET/PUT/DELETE /api/v1/collection` (auth required)
- Route registration order matters (first match wins): browse → detail → protected ensures `/browse` matches before `/:id` pattern.

### Dependencies

**`apps/rest-api/package.json`**

- Added `jsonwebtoken` (JWT sign/verify)
- Added `@types/jsonwebtoken` (dev)
- PostgreSQL client uses `Bun.SQL` (built-in, no additional dependency)

---

## Workstream B — Frontend Auth + Protected Routes

Adds authentication context, protected route wrapper, sign-in page, and auth-aware navigation.

### Auth Context

**`apps/web/src/web/contexts/Auth.tsx`**

- `AuthProvider` — Wraps the app, provides auth state via React context.
  - Uses `useQuery` to fetch `/auth/me` on mount with 5-minute `staleTime`.
  - Exposes: `user: AuthUser | null`, `isLoading`, `isAuthenticated`, `signOut()`.
  - `signOut()` calls `POST /auth/logout`, clears query cache, redirects to `/`.
- `useAuth()` — Hook to consume auth context. Throws if used outside `AuthProvider`.
- `AuthUser` type: `{ id, email, name, avatarUrl }`.

### Protected Route

**`apps/web/src/web/components/ProtectedRoute/ProtectedRoute.tsx`**

- Renders children if authenticated.
- Shows loading state while auth is being checked.
- Redirects to `/sign-in?returnTo=<current_path>` if not authenticated.
- Uses `useAuth()` and `useLocation()` from react-router.

**`apps/web/src/web/components/ProtectedRoute/index.ts`** — Barrel export.

### Sign-In Page

**`apps/web/src/web/pages/SignInPage.tsx`**

- Centered card with "Welcome Back" heading and "Continue with Google" button.
- Google button links to `/auth/google?returnTo=<returnTo>` (reads `returnTo` from URL search params).
- Redirects to `returnTo` if already authenticated.
- Includes inline Google "G" logo SVG.

### Navbar Auth State

**`apps/web/src/web/components/Navbar/Navbar.tsx`**

- **Authenticated**: Shows user avatar + name button. Clicking opens dropdown with "My Decks", "My Collection", divider, "Sign out".
- **Unauthenticated**: Shows "Sign in" button linking to `/sign-in`.
- Dropdown closes on outside click via `mousedown` event listener.
- Added imports: `useAuth`, `LogIn` icon, `useState`, `useRef`, `useEffect`.

### App Provider Tree

**`apps/web/src/web/App.tsx`**

Added `AuthProvider` between `ThemeProvider` and `CollectionProvider`:
```
QueryProvider → ThemeProvider → AuthProvider → CollectionProvider → DeckProvider → AppContent
```

### Context Exports

**`apps/web/src/web/contexts/index.ts`**

Added `AuthProvider`, `useAuth`, `AuthContextValue`, `AuthUser` exports.

### Route Updates

**`apps/web/src/web/routes/routes.tsx`**

- Added `SignInPage` import and `/sign-in` route.
- Added `DeckBrowsePage` import and `/decks/browse` route.
- Added `ProtectedRoute` import.
- Wrapped the following routes with `<ProtectedRoute>`:
  - `/decks` (personal decks list)
  - `/decks/new` (deck builder)
  - `/decks/:deckId/edit` (deck editor)
  - `/collection` and `/collection/:cardId`
- `/decks/:deckId` (deck detail) remains public — public decks are viewable by anyone.

**`apps/web/src/web/routes/index.tsx`**

Added `SIGN_IN: '/sign-in'` and `DECKS_BROWSE: '/decks/browse'` to the `ROUTES` constant.

---

## Workstream C — Frontend New Features

### Deck Browse Page (New)

**`apps/web/src/web/pages/DeckBrowsePage.tsx`**

- Fetches `GET /api/v1/decks/browse` via `useQuery` with page, format, and search params.
- Grid of public deck cards showing: name, format badge, card count, owner avatar + name.
- Format filter buttons: All, Standard, Expanded, Unlimited.
- Search input for deck name filtering.
- Pagination controls (prev/next) with "Page X of Y" display.
- Empty states for no results and loading.

### Deck Detail Page (Updated)

**`apps/web/src/web/pages/DeckDetailPage.tsx`**

Key changes from previous version:
- **Data fetching**: Switched from `useDecks()` context (which only has user's decks) to `useDeckQuery(deckId)` hook (fetches individual deck by ID from API). This enables viewing public decks you don't own.
- **Ownership gating**: Edit, Delete, and Print buttons only render when `user.id === deck.userId`.
- **Uses `useDeckMutations`** directly for delete instead of context's `deleteDeck`.
- **Auth integration**: Imports `useAuth()` to get current user for ownership check.
- **Not found link**: Changed from "Back to Decks" → "Browse Decks" (links to `/decks/browse`).

### CSS Additions

**`apps/web/public/css/pages.css`**

Added styles for:
- `.sign-in-page__*` — Centered sign-in card, Google button with icon.
- `.decks-browse-page__*` — Grid layout, deck cards, search bar, pagination, owner info.
- `.deck-detail-page__owner*` — Owner avatar and name display.
- `.navbar__user-*` — User menu button, dropdown, dropdown items, divider, avatar.

---

## Workstream D — Light Mode

### CSS Variables

**`apps/web/public/css/index.css`**

Added `[data-theme="light"]` block (inserted between Catppuccin block and global styles) with:

- Background tokens: `--light-bg-primary` (#ffffff), `--light-bg-secondary` (#f8f9fa), `--light-bg-tertiary` (#f0f1f3), `--light-bg-elevated` (#ffffff)
- Surface tokens: glass, glass-hover, border, border-hover (rgba black variants)
- Text tokens: primary (#1a1a2e), secondary (0.7 opacity), tertiary (0.5), muted (0.35)
- Accent: Same blue (#2081e2) as Nebula for brand consistency, darker hover
- Semantic: Success (#22a352), warning (#e5a100), error (#e5383b) — darker variants for light backgrounds
- All `--pico-*` compatibility variables mapped
- All semantic tokens mapped: `--bg-sunken`, `--text-secondary`, `--surface-hover`, `--surface-active`, `--contrast-text` (#ffffff for light), `--focus-ring`, `--card-shadow`, `--card-shadow-hover`
- Pokemon rarity colors adjusted for light background readability

### Theme Types

**`apps/web/src/web/themes/types.ts`**

- `ThemeName` changed from `'nebula' | 'catppuccin'` to `'nebula' | 'light' | 'catppuccin'`
- `THEME_STORAGE_KEY` changed from `'pokemon-tcg-theme'` to `'__theme'` (per spec)
- `DEFAULT_THEME` remains `'nebula'`

### Theme Provider

**`apps/web/src/web/themes/ThemeProvider.tsx`**

- Added `getSystemTheme()` — reads `prefers-color-scheme: light` media query, returns `'light'` or `'nebula'`.
- Added `isValidTheme()` — type guard for all three theme names.
- On mount: checks `localStorage` first, falls back to system preference (was: only checked localStorage, fell back to default).
- `toggleTheme()` now toggles between `'nebula'` and `'light'` (was: nebula ↔ catppuccin).

### Theme Toggle

**`apps/web/src/web/components/ThemeToggle/ThemeToggle.tsx`**

- Toggle now switches between Nebula (Sparkles icon) and Light (Sun icon).
- Catppuccin removed from the toggle UI (CSS retained for backwards compatibility).
- Labels: "Nebula" / "Light" (was: "Nebula" / "Catppuccin").
- Added `Sun` import from lucide-react.

---

## Workstream E — Infrastructure

### Production Docker Compose

**`docker-compose.prod.yml`**

Three services on the `pika` network:

| Service | Image | Ports | Notes |
|---------|-------|-------|-------|
| `nginx` | `nginx:1.27-alpine` | 80, 443 | Reverse proxy, mounts nginx config and Let's Encrypt certs |
| `web` | `pokemon-web:latest` | 3000 (internal) | SSR frontend, `API_URL=http://rest-api:3001/api/v1` |
| `rest-api` | `pokemon-rest-api:latest` | 3001 (internal) | REST API, mounts SQLite read-only, reads `.env.prod` for secrets |

- `rest-api` has a healthcheck (`curl /health` every 30s)
- `web` depends on `rest-api` healthy
- `nginx` depends on both
- SQLite card data mounted read-only from `./database:/data:ro`
- No `graphql-api`, `tcg-api`, `neo4j`, or `distributed-ledger` (per spec — out of scope for v0)

### Nginx Configuration

**`docker/nginx/nginx.conf`** — Base worker config, gzip, log format.

**`docker/nginx/conf.d/default.conf`** — Reverse proxy rules:

```
/auth/*  → rest-api:3001  (passes Cookie header for session)
/api/*   → rest-api:3001  (passes Cookie header for session)
/*       → web:3000       (SSR frontend)
```

HTTPS server block included but commented out — uncomment after Certbot TLS setup.

### Deploy Script

**`scripts/deploy.sh`**

Executable bash script that:

1. Fetches secrets from AWS SSM Parameter Store (`/pokemon/prod/*`) → writes `.env.prod`
2. Falls back to existing `.env.prod` if AWS CLI not available
3. Runs `docker compose -f docker-compose.prod.yml build`
4. Runs `docker compose -f docker-compose.prod.yml up -d`
5. Waits 5 seconds, then health-checks `rest-api` and `nginx`
6. Reports status

---

## Environment Variables (New)

Required for production (stored in AWS SSM, fetched by deploy script):

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g., `https://yourdomain.com/auth/callback`) |
| `JWT_SECRET` | Min 256-bit random string for signing session JWTs |
| `POSTGRES_URL` | PostgreSQL connection string (e.g., `postgres://user:pass@host:5432/pokemon_tcg`) |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g., `https://yourdomain.com`) |

---

## File Inventory

### New Files (24)

```
apps/rest-api/migrations/001_users.sql
apps/rest-api/migrations/002_decks.sql
apps/rest-api/migrations/003_deck_cards.sql
apps/rest-api/migrations/004_user_collections.sql
apps/rest-api/migrations/005_migrations_tracking.sql
apps/rest-api/src/services/postgres.ts
apps/rest-api/src/middleware/auth.ts
apps/rest-api/src/handlers/auth.ts
apps/rest-api/src/handlers/collection.ts
apps/web/src/web/contexts/Auth.tsx
apps/web/src/web/components/ProtectedRoute/ProtectedRoute.tsx
apps/web/src/web/components/ProtectedRoute/index.ts
apps/web/src/web/pages/SignInPage.tsx
apps/web/src/web/pages/DeckBrowsePage.tsx
docker-compose.prod.yml
docker/nginx/nginx.conf
docker/nginx/conf.d/default.conf
scripts/deploy.sh
```

### Modified Files (16)

```
apps/rest-api/package.json
apps/rest-api/src/config/index.ts
apps/rest-api/src/types/services.ts
apps/rest-api/src/index.ts
apps/rest-api/src/handlers/decks.ts
apps/web/src/web/App.tsx
apps/web/src/web/contexts/index.ts
apps/web/src/web/components/Navbar/Navbar.tsx
apps/web/src/web/components/ThemeToggle/ThemeToggle.tsx
apps/web/src/web/pages/DeckDetailPage.tsx
apps/web/src/web/routes/routes.tsx
apps/web/src/web/routes/index.tsx
apps/web/src/web/themes/types.ts
apps/web/src/web/themes/ThemeProvider.tsx
apps/web/public/css/index.css
apps/web/public/css/pages.css
```

### Unchanged (retained as-is)

- `apps/rest-api/src/services/database.ts` — SQLite service for cards/sets (still used)
- `apps/rest-api/src/services/deckDatabase.ts` — SQLite deck service (still registered in container for backwards compat, but no longer used by handlers)
- `apps/rest-api/src/handlers/cards.ts` — Card handlers unchanged, still read from SQLite
- `apps/rest-api/src/handlers/sets.ts` — Set handlers unchanged
- `apps/web/src/web/contexts/Collection.tsx` — Still uses localStorage (wiring to API is a follow-up)
- `apps/web/src/web/contexts/Theme.tsx` — Legacy Catppuccin context retained, not actively used by app
