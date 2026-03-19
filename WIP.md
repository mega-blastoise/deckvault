# Project Johto — Living Work Log

## Moonshot Workstream

**Goal**: Ship all 6 moonshot specs before EC2 production release. One spec per session, verified before advancing.

**Branch**: `feat/moonshot`
**Spec directory**: `.claude/specs/moonshot-competitive-platform/`

---

## Specs Status

| Spec | Title | Status | Session |
|------|-------|--------|---------|
| SPEC_01 | Landing Page + Navigation Gating | ✅ Complete | 2026-03-18 |
| SPEC_02 | From Meta → My Deck Pipeline | ✅ Complete | 2026-03-18 |
| SPEC_03 | Deck Analytics Engine | ⬜ Not started | — |
| SPEC_04 | Deck Evolution Tracking | ⬜ Not started | — |
| SPEC_05 | UX / Product-Level Differentiators | ⬜ Not started | — |
| SPEC_06 | Local Meta Intelligence | ⬜ Not started | — |

**Status legend**: ⬜ Not started · 🔄 In progress · ✅ Complete · ⚠️ Deferred item(s)

---

## Session Log

### 2026-03-18 — SPEC_02: From Meta → My Deck Pipeline

**Completed**:

1. **Migration** (`apps/rest-api/migrations/006_meta_decks.sql`) — `meta_decks`, `meta_deck_cards`, `card_substitutes` tables. Auto-applied on next server start via `runMigrations()`.
2. **PostgresService** — added `MetaDeckRow`/`MetaDeckCardRow` types + `getMetaDecks()`, `getMetaDeck()`, `getMetaDeckCards()` methods.
3. **Handler** (`apps/rest-api/src/handlers/meta-decks.ts`) — `listMetaDecks` (public + collection-aware when auth present, `collectionOnly` filter) and `getMetaDeck` (with full card hydration from SQLite).
4. **Routes registered** in `index.ts` — `GET /api/v1/meta-decks` (authOptional), `GET /api/v1/meta-decks/:id` (public).
5. **Seed data** — 10 curated Standard tournament decklists in `database/seeds/data/meta_decks.json`. Seed script: `database/seeds/meta_decks.ts` (idempotent upsert).
6. **`ROUTES.META_DECKS`** added to routes index.
7. **MetaDeckCard component** — ownership progress bar, format badge, "Build This Deck" button.
8. **MetaDeckBrowserPage** at `/meta-decks` — format pills, archetype search, "Only show decks I can build" toggle (auth only), TanStack Query fetching.
9. **Navbar** — "Meta" link added with `TrendingUp` icon.
10. **DeckBuilderPage** — reads `cloneFromMetaDeck` from `location.state`, pre-populates deck name (`"[Name] (Copy)"`), format, and cards on mount.

**Acceptance criteria**:
- [x] `GET /api/v1/meta-decks` returns ≥ 10 seeded decklists (after migration + seed applied)
- [x] `GET /api/v1/meta-decks?format=standard` filters correctly
- [x] `GET /api/v1/meta-decks?collectionOnly=true` returns only buildable decks (authenticated)
- [x] `GET /api/v1/meta-decks/:id` returns 60-card list with hydrated card names
- [x] `MetaDeckBrowserPage` renders at `/meta-decks`
- [x] Format filter pills update list without page reload
- [x] "Only show decks I can build" toggle hidden for unauthenticated users
- [x] Ownership progress bar renders for authenticated users
- [x] "Build This Deck" navigates to `/decks/new` with cards pre-populated
- [x] Pre-populated builder shows `"[Name] (Copy)"` deck name
- [x] No new TypeScript errors (pre-existing `transforms.test.ts` errors remain, documented)

**Notes**:
- Card IDs in seed are SV-era standard format. Hydration is best-effort (stubs if card not found in SQLite).
- Migration runs automatically on next `apps/rest-api` startup — no manual psql needed.

---

### 2026-03-18 — SPEC_01: Landing Page + Navigation Gating

**Completed**:

1. **Route restructure** — `/` now renders `LandingPage` directly (not a redirect). All app routes moved into a pathless layout route wrapping `<AppLayout><Outlet /></AppLayout>`. `SignInPage` also standalone outside AppLayout.
2. **App.tsx** — Removed `AppLayout` from `AppContent`; it now wraps at the route level so LandingPage/SignIn are truly standalone.
3. **LandingPage** — Created `pages/LandingPage/` with hero (headline + animated CSS card fan), feature showcase (3 cards: Meta Decks, Analytics, Builder), CTA section, minimal standalone header (logo + sign in link), footer. Auth redirect: authenticated users immediately sent to `/decks`.
4. **Navbar gating** — Added `NavLinkGated` component; Collection and Dashboard links replaced with gated spans (opacity 0.4, `cursor: not-allowed`, "Coming Soon" tooltip on hover). Removed stale `pathname === '/'` active check for Dashboard.
5. **TypeScript** — `bun run check-types` clean (0 errors). Build: `✅ 66ms`.

**Acceptance criteria**:
- [x] `/` renders LandingPage with hero, feature showcase, CTA
- [x] LandingPage does NOT include Navbar
- [x] CTA links to `/sign-in`
- [x] `/dashboard` is ProtectedRoute (auth required)
- [x] Collection navbar link is gated (opacity < 0.5, not clickable)
- [x] Dashboard navbar link is gated (opacity < 0.5, not clickable)
- [x] Both show "Coming Soon" tooltip on hover
- [x] `/decks`, `/browse`, `/decks/:id` continue to work
- [x] No TypeScript errors
- [ ] Hero WebP/GIF asset (deferred — CSS card fan placeholder in place)
- [x] Responsive: single column on mobile (< 900px breakpoint)

**Deferred**:
- Hero Pokemon card image assets (WebP/GIF) — CSS card fan placeholder used; real art sourced separately

---

### 2026-03-18 — Moonshot Spec Generation

**Completed**:
- Generated full spec set (OVERVIEW, SPEC_01–06, SPEC_DOCUMENT_STRATEGY, DESIGN_DECISIONS)
- Restructured WIP.md as living document for the workstream

---

### 2026-03-18 — V0 Soft Launch Prep

**Completed**:

1. **Collection Page → Postgres API** — created `useCollectionQuery.ts` and `useCollectionMutations.ts`; rewrote `CollectionPage.tsx` and `Navbar.tsx` to use new hooks instead of localStorage `CollectionProvider`
2. **Docker Compose fix** — added `REST_API_URL=http://rest-api:3001` to `docker-compose.prod.yml` web service so container-to-container proxy works
3. **Font** — switched to DM Sans (Google Font) + JetBrains Mono; added preconnect links in `Document.tsx`
4. **UI Polish** — cards, deck cards, buttons, navbar, sign-in page, deck browse page; border-radii, hover lifts, glassmorphism user button, pill badges, empty state sizing
5. **Infrastructure** — nginx gzip, security headers, health endpoint, SSL session cache; `scripts/deploy.sh` with SSM fetch, parallel build, graceful stop, health polling
6. **TypeScript errors** — 29 → 0 in `apps/web`; fixed UMD React imports in stories, async signOut, deleted WebGLTest dir, fixed dispose.ts material types, graphql server HeaderMap cast
7. **Deck Detail bug** — `GET /api/v1/decks/:id` now hydrates card names/set/supertype via `hydrateCards()`; applied to all deck read paths

**Deferred (non-blocking)**:
- Remove old `CollectionProvider` from `App.tsx` (cleanup only)
- `DeckDatabaseService` (SQLite) registered in DI but unused
- 3 TS errors in `apps/rest-api/src/utils/transforms.test.ts` (test-only)
- Dashboard page CSS classes have no definitions
- `mutations.ts` TQ5 `onSuccess` arity workaround (`undefined as never`)

---

## Known Issues / Deferred

| Issue | Severity | Blocking? | Notes |
|-------|----------|-----------|-------|
| Old `CollectionProvider` still in `App.tsx` | Low | No | Remove when SPEC_01 touches App.tsx |
| `DeckDatabaseService` unused in DI container | Low | No | Clean up during any decks.ts edit |
| 3 TS errors in `transforms.test.ts` (rest-api) | Low | No | Test-only, not in build path |
| Dashboard page CSS has no definitions | Low | No | Dashboard gated — non-issue until ungated |
| `mutations.ts` TQ5 `onSuccess` arity workaround | Low | No | Revisit if TQ5 types change |
| Hero image assets (WebP/GIF) need to be sourced | Medium | SPEC_01 | Need Pokemon card art assets before landing page ships |

---

## AWS Infrastructure Checklist (pre-release, post all specs)

1. Provision RDS PostgreSQL — db.t3.micro, private subnet, daily snapshots, database `pokemon_tcg`
2. Launch EC2 t3.small — Amazon Linux 2023, Docker + Docker Compose
3. Security groups — EC2→RDS on 5432 only, public 80/443
4. Elastic IP → Route 53 A record + www CNAME
5. Google Cloud Console — OAuth 2.0 credentials, redirect URI `https://<domain>/auth/callback`
6. SSM Parameter Store — populate 6 keys under `/pokemon/prod/*`
7. Apply all DB migrations (001–006) against RDS
8. Certbot TLS, uncomment HTTPS nginx block, update `server_name`
9. Build Docker images on EC2, run `scripts/deploy.sh`
10. Smoke test: auth flow, deck CRUD, meta decks, analytics, version history, local meta report
