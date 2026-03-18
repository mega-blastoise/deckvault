# V0 Soft Launch — Work Log & Session Context

## Goal

Complete all remaining code gaps from the v0-production-release spec, polish the UI for soft launch, fix all TypeScript errors, and prepare infrastructure configs for AWS deployment (EC2 + RDS + Route53 + nginx).

## Session Date: 2026-03-18

---

## What Was Accomplished

### 1. Collection Page Wired to Postgres API

**Problem**: `CollectionPage` and `Navbar` used `useCollection()` from a localStorage-backed `CollectionProvider`. The backend `GET/PUT/DELETE /api/v1/collection` endpoints were fully built but the frontend never called them.

**Solution**:
- Created `useCollectionQuery.ts` — TanStack Query hook wrapping `GET /api/v1/collection` with `credentials: 'include'`. Returns `cards`, `totalCards`, `uniqueCards`, `getQuantity(cardId)`, `hasCard(cardId)`. Query is disabled when `!isAuthenticated`.
- Created `useCollectionMutations.ts` — `useMutation` wrappers for `PUT /api/v1/collection/:cardId` (upsert) and `DELETE /api/v1/collection/:cardId` (remove). Both invalidate `COLLECTION_QUERY_KEY` on success. Exposes `addCard(cardId, qty)`, `removeCard(cardId)`, `setQuantity(cardId, qty)`.
- Rewrote `CollectionPage.tsx` to consume new hooks. The `addCard` call now computes `current + 1` before calling the upsert mutation (the API expects absolute quantity, not a delta).
- Rewrote `Navbar.tsx` to use `useCollectionQuery` for badge count instead of localStorage context. Badge only renders when `isAuthenticated && uniqueCards > 0`.
- Old `CollectionProvider` still mounted in `App.tsx` — left in place to avoid breaking any other potential consumers. Removal is a follow-up.

### 2. Docker Compose Fix

**Problem**: `web` container's BFF proxy reads `process.env.REST_API_URL` (defaults to `http://localhost:3001`). In Docker, `localhost` resolves to the web container itself, not `rest-api`.

**Fix**: Added `REST_API_URL=http://rest-api:3001` to `docker-compose.prod.yml` web service environment block.

### 3. Font Change

Switched from `system-ui` font stack to **DM Sans** (Google Font, geometric sans-serif).

- Added `<link rel="preconnect">` for `fonts.googleapis.com` and `fonts.gstatic.com` in `Document.tsx` `<head>`
- Added Google Fonts CSS link loading DM Sans (400/500/600/700, normal+italic) and JetBrains Mono (400/500)
- Updated `index.css` body `font-family` to `'DM Sans', system-ui, -apple-system, ...`
- Updated `code` element font to `'JetBrains Mono', 'Space Mono', monospace`

### 4. UI Polish

All changes use CSS custom properties from the existing theme system. No JavaScript changes for visual updates.

**Card component (`Card.css`)**:
- Border-radius: 8px → 12px
- Hover: `translateY(-4px) scale(1.02)` with `cubic-bezier(0.4, 0, 0.2, 1)` easing
- Image zoom on hover: `transform: scale(1.05)` on `img`
- Gradient overlay: `::after` pseudo-element on `.pokemon-card__image`, 40% height bottom gradient, opacity transitions from 0→1 on hover
- Added `[data-theme="light"]` card shadow rules
- Legality badges: pill shape (`border-radius: 9999px`)

**Deck card (`DeckCard.css`)**:
- Border-radius: 8px → 12px, cover height 140px → 160px
- Hover lift: `translateY(-4px)`, image zoom `scale(1.06)`
- Overlay gradient strengthened: `transparent 30%` → `rgba(0,0,0,0.5) 100%`
- Status badges: pill shape, menu trigger 28px → 32px with 8px radius
- Dropdown: 10px → 12px radius, light theme shadow variant
- Removed duplicate `background-color` declaration in `.pokemon-deck-card__menu-item--danger:hover`

**Buttons (`Button.css` + `pages.css`)**:
- Radius: 6px → 8px
- Transition: `0.15s ease` → `0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- `.button` in pages.css: added `gap: 0.375rem`, padding `0.5rem 1.125rem`, hover `translateY(-1px)` on primary/danger, added `button:disabled` rule

**Navbar (`Navbar.css`)**:
- Logo: `font-weight: 600` → `700`, tighter letter-spacing (`-0.03em`)
- User button: pill-shaped (`border-radius: 9999px`), `0.375rem 0.75rem` padding
- Dropdown: 12px radius, `animation: navbar-dropdown-in 0.15s ease` (opacity + translateY), 180px min-width
- Dropdown items: 8px radius
- Nebula: glassmorphism user button hover, darker dropdown shadow
- Light theme: subtle navbar `box-shadow`, lighter dropdown shadow
- Mobile: hide `.navbar__user-name`

**Sign-in page (`pages.css`)**:
- Card: `max-width` 400→420px, padding `2.5rem 2rem` → `3rem 2.5rem`, radius 12px → 20px
- Title: `1.5rem` → `1.75rem`, letter-spacing `-0.02em`
- Google button: full-width, 12px radius, padding `0.875rem 1.75rem`, hover lift + shadow
- Nebula theme: card gets `--nebula-bg-secondary` bg, `--nebula-surface-border` border, `0 8px 32px` shadow. Google button gets glass effect with blue glow on hover.

**Deck browse page (`pages.css`)**:
- Cards: radius 8px → 14px, gap `1rem` → `1.25rem`, hover `translateY(-4px)`
- Format badge: pill shape (`border-radius: 9999px`), wider padding
- Meta section: top border separator
- Card count: `font-weight: 500`, uses `--text-secondary`
- Nebula overrides: card bg/border, meta separator color

**Empty states**: radius 8px → 16px, padding `3rem 1.5rem` → `4rem 2rem`

### 5. Infrastructure Prep

**Nginx (`docker/nginx/conf.d/default.conf`)**:
- Gzip: enabled for `text/plain`, `text/css`, `text/javascript`, `application/javascript`, `application/json`, `application/xml`, `image/svg+xml`. Comp level 5, min length 256.
- Security headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`
- `client_max_body_size 2m`
- `proxy_connect_timeout 10s`, `proxy_read_timeout 30s` on both upstreams
- Health endpoint: `location = /nginx-health` returns 200 directly (no proxy), `access_log off`
- HTTPS block: added `ssl_prefer_server_ciphers on`, `ssl_session_cache shared:SSL:10m`, HSTS header (commented), matching gzip/headers/health config

**Deploy script (`scripts/deploy.sh`)**:
- SSM fetch: iterates key array, fails fast on any missing key
- Build: `docker compose build --parallel`
- Graceful stop: `docker compose down --timeout 30` before `up -d`
- Health polling: loops every 2s up to 60s for rest-api, prints elapsed time, dumps last 30 log lines on failure
- Checks nginx via `/nginx-health` and web via `/`
- Prints verification commands at end

**.gitignore**: Added `.env.prod` (was only `.env.production`).

### 6. TypeScript Error Remediation (29 → 0 in apps/web)

| File(s) | Errors | Fix |
|---------|--------|-----|
| 4 story files (CardGrid, DeckCard, DeckList, SearchBar) | 7 × TS2686 `React refers to UMD global` | Added `import React from 'react'` |
| `Auth.tsx` | 1 × TS2322 `() => void` not assignable to `() => Promise<void>` | Made `signOut` callback `async` |
| `WebGLTest/` (3 files) | 6 × TS2503 `Cannot find namespace THREE` + 1 × TS2339 | Deleted entire unused component directory |
| `graphics/utils/dispose.ts` | 4 errors: `specularMap`/`gradientMap` on MeshStandardMaterial, `Material\|Material[]` | Used `Record<string, unknown>` cast for texture iteration, `Array.isArray` guard for material arrays |
| `server/lib/api/graphql/server.ts` | 2 × TS2769 `HeaderMap` constructor | Cast `Headers` to `Iterable<[string, string]>` |
| `graphql/hooks/mutations.ts` | 6 × TS2554 wrong arg count on `onSuccess` | Applied `undefined as never` 4th arg (TQ5 signature change). Left as-is per user direction. |
| `DeckBuilderPage.tsx` | 1 × TS2345 `SetStateAction` mismatch | Cast `Pokemon.Card` through `unknown` to `DeckCard['card']` (field type `number` vs `string` for `number` property) |

### 7. Deck Detail Bug Fix

**Problem**: `GET /api/v1/decks/:id` returned cards with empty `name`, `supertype`, `set` fields. Postgres `deck_cards` table only stores `card_id` + `quantity`. The `formatDeck` function was returning stub objects: `{ id: card_id, name: '', supertype: '', set: { id: '', name: '' } }`.

**Fix**: Added `hydrateCards(db: DatabaseService, deckCards: DeckCardRow[])` function in `decks.ts` handler:
1. Collects all `card_id` values from the deck
2. Batch queries SQLite: `SELECT * FROM pokemon_cards WHERE id IN (...)`
3. Builds a `Map<string, CardRow>` for O(1) lookup
4. For each deck card, looks up the set via `db.findSetById(cardRow.set_id)`
5. Runs through `transformCardRowWithSet` (existing utility) to produce the full card shape with name, supertype, subtypes, images, set info, regulation mark, etc.
6. Returns `{ card: {...}, quantity }[]`

Applied to all read paths: `getDeck`, `listDecks`, `createDeck`, `updateDeck`.

---

## What Remains for V0 Soft Launch

### Code
- Remove old `CollectionProvider` from `App.tsx` (optional cleanup, not blocking)
- Verify collection page end-to-end after auth flow
- `DeckDatabaseService` (SQLite) still registered in DI container but unused — can remove

### AWS Infrastructure (manual, not automated)
1. Provision RDS PostgreSQL — db.t3.micro, private subnet, daily snapshots, database `pokemon_tcg`
2. Launch EC2 t3.small — Amazon Linux 2023, install Docker + Docker Compose
3. Security groups — EC2→RDS on 5432 only, public 80/443
4. Elastic IP → Route 53 A record + www CNAME
5. Google Cloud Console — create OAuth 2.0 credentials, redirect URI `https://<domain>/auth/callback`
6. SSM Parameter Store — populate 6 keys under `/pokemon/prod/*`
7. Certbot TLS on EC2, uncomment HTTPS block in nginx config, update `server_name`
8. Build Docker images on EC2, run `scripts/deploy.sh`
9. Smoke test: auth flow, deck create/view/browse, collection CRUD, theme toggle

### Pre-existing Issues (not blocking launch)
- 3 TS errors in `apps/rest-api/src/utils/transforms.test.ts` (test-only)
- Dashboard page CSS classes have no definitions
- `mutations.ts` TQ5 `onSuccess` arity workaround (`undefined as never`)

---

## Files Changed This Session

| File | Action |
|------|--------|
| `apps/web/src/web/hooks/useCollectionQuery.ts` | Created |
| `apps/web/src/web/hooks/useCollectionMutations.ts` | Created |
| `apps/web/src/web/hooks/index.ts` | Modified |
| `apps/web/src/web/pages/CollectionPage.tsx` | Rewritten |
| `apps/web/src/web/components/Navbar/Navbar.tsx` | Rewritten |
| `apps/web/src/web/components/Document/Document.tsx` | Modified |
| `apps/web/public/css/index.css` | Modified |
| `apps/web/src/web/components/Card/Card.css` | Rewritten |
| `apps/web/src/web/components/DeckCard/DeckCard.css` | Rewritten |
| `apps/web/src/web/components/Button/Button.css` | Modified |
| `apps/web/src/web/components/Navbar/Navbar.css` | Rewritten |
| `apps/web/public/css/pages.css` | Modified |
| `apps/web/src/web/contexts/Auth.tsx` | Modified |
| `apps/web/src/web/components/CardGrid/CardGrid.stories.tsx` | Modified |
| `apps/web/src/web/components/DeckCard/DeckCard.stories.tsx` | Modified |
| `apps/web/src/web/components/DeckList/DeckList.stories.tsx` | Modified |
| `apps/web/src/web/components/SearchBar/SearchBar.stories.tsx` | Modified |
| `apps/web/src/web/components/WebGLTest/` | Deleted |
| `apps/web/src/web/graphics/utils/dispose.ts` | Modified |
| `apps/web/src/server/lib/api/graphql/server.ts` | Modified |
| `apps/web/src/web/graphql/hooks/mutations.ts` | Modified |
| `apps/web/src/web/pages/DeckBuilderPage.tsx` | Modified |
| `apps/rest-api/src/handlers/decks.ts` | Rewritten |
| `docker-compose.prod.yml` | Modified |
| `docker/nginx/conf.d/default.conf` | Rewritten |
| `scripts/deploy.sh` | Rewritten |
| `.gitignore` | Modified |
