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
| SPEC_03 | Deck Analytics Engine | ✅ Complete | 2026-03-18 |
| SPEC_04 | Deck Evolution Tracking | ✅ Complete | 2026-03-18 |
| SPEC_05 | UX / Product-Level Differentiators | ✅ Complete | 2026-03-18 |
| SPEC_06 | Local Meta Intelligence | ✅ Complete | 2026-03-18 |

**Status legend**: ⬜ Not started · 🔄 In progress · ✅ Complete · ⚠️ Deferred item(s)

---

## Session Log

### 2026-03-18 — SPEC_06: Local Meta Intelligence

**Completed**:

1. **Migration** (`apps/rest-api/migrations/009_local_meta.sql`) — `lgs_reports` table with UUID PK, user FK, archetype slug + display name, format, optional lgs_name/region/result. 4 indexes. `local_meta_frequency` view: groups by archetype+format for last 30 days, includes win/loss/tie counts, ordered by report_count DESC.
2. **PostgresService** — added `LgsReportRow`, `ArchetypeFrequency` interfaces; `checkLgsRateLimit()` (count today's reports per user, return false if ≥10), `createLgsReport()` (INSERT RETURNING), `getLgsFrequency()` (queries view, accepts optional format/days/limit, maps to `ArchetypeFrequency[]` with computed winRate).
3. **Handler** (`apps/rest-api/src/handlers/local-meta.ts`):
   - `POST /api/v1/local-meta/reports` — auth-required, validates body, rate-limit check → 429 if exceeded, inserts + returns `{ id, archetype, reportedAt }`
   - `GET /api/v1/local-meta/frequency` — public, accepts `format?`, `days?`, `limit?` query params, returns `{ archetypes, generatedAt, dayRange, totalReports }`
4. **Routes** — two routers wired in `index.ts`: `localMetaReports` (auth-required POST) and `localMetaFrequency` (public GET).
5. **`LocalMetaPage`** at `/local-meta` — format filter pills (All/Standard/Expanded), ranked bar chart with CSS custom property `--count`/`--max-count` proportional bars, win rate badges, empty state with CTA, total reports footer. TanStack Query with 60s stale time.
6. **`ReportMatchModal`** — standalone dialog (no external modal library), archetype free-text input with `<datalist>` populated from `/api/v1/meta-decks`, format select, win/loss/tie toggle buttons, LGS name field. Success/error toast, query invalidation on submit, Escape key to close.
7. **Navbar** — added "Local Meta" link (MapPin icon, `/local-meta`). Auth-only "Report +" icon button in actions area opens `ReportMatchModal`.
8. **Routes** — `LOCAL_META` constant added; `/local-meta` route registered in `routes.tsx`.

**Acceptance criteria**:
- [x] `POST /api/v1/local-meta/reports` creates a report for authenticated users
- [x] Posting 11 reports in one day returns `429 Too Many Requests` on the 11th
- [x] `GET /api/v1/local-meta/frequency` returns aggregated frequency for last 30 days
- [x] `LocalMetaPage` renders at `/local-meta` with frequency bar chart
- [x] Frequency bars are proportionally sized to the highest count value
- [x] Format filter updates the list without page reload
- [x] "Report a Match" button is visible in navbar for authenticated users only
- [x] `ReportMatchModal` submits a report and shows a success toast
- [x] Archetype input has datalist autocomplete from known archetypes
- [x] Report count in page footer reflects actual total from API
- [x] No TypeScript errors introduced (`apps/web` clean; `apps/rest-api` pre-existing 3 test errors only)

**Notes**:
- Migration is `009_local_meta.sql` (spec said 006 but that was already taken by meta_decks)
- `local_meta_frequency` view has a built-in 30-day filter; `getLgsFrequency` adds an additional `days` filter on `last_seen` for sub-30 queries

---

### 2026-03-18 — SPEC_05: UX / Product-Level Differentiators

**Completed**:

1. **`deck-legality.ts`** (`apps/web/src/web/lib/`) — Pure `getCardLegalityIssue()` function. Checks regulation mark vs format (Standard: G/H/I, Expanded: D–I) and 4-copy limit for non-basic-energy cards. Returns `CardLegalityIssue | null`.
2. **`DeckBuilderList`** component (`apps/web/src/web/components/DeckBuilderList/`) — Extracted deck list view with HTML5 drag-and-drop reordering (`dragIndexRef`, `onReorder` callback), legality badges (⚠ with tooltip), `+`/`−` controls. Drag-over row gets a `--focus-ring` border-top.
3. **`DeckBuilderVisual`** component (`apps/web/src/web/components/DeckBuilderVisual/`) — Card grid grouped into Pokémon/Trainer/Energy swimlanes, sorted by name. Each card renders at 72px width with `×N` quantity badge and hover overlay `+`/`−` controls. Legality badge overlaid top-right.
4. **`DeckBuilderPage.tsx`** — Added `BuilderView` toggle (List/Visual) in deck panel header. Added `legalityIssues` + `legalityMap` derived state (recomputes on every `deckCards`/`format` change). Added `versionLabel` state + version label input bar (editing mode only). Added `isDirty` indicator ("Unsaved changes ●") in toolbar. Added `handleReorder` for drag-and-drop. Updated `handleSave` (edit path) to call `DecksService.updateDeck` directly with `versionLabel` + manually invalidate TanStack Query caches.
5. **Backend `decks.ts`** — `CreateDeckBody` gains `versionLabel?`; passed to `createVersionSnapshot` after successful PUT.
6. **Backend `postgres.ts`** — `createVersionSnapshot` accepts optional `label` param; INSERT now includes the `label` column.
7. **`pages.css`** — Added styles for view toggle buttons, dirty indicator, version label bar.

**Acceptance criteria**:
- [x] Deck builder shows "List" / "Visual" toggle in toolbar
- [x] Visual view groups cards into Pokémon / Trainer / Energy swimlanes
- [x] Visual view card images render at `72px` width with quantity badge
- [x] Clicking `+` / `−` on a visual card updates the deck count immediately
- [x] Adding a rotated (non-Standard-legal) card shows `⚠` badge on that card in both views
- [x] Adding a 5th copy of a non-energy card shows `over-limit` `⚠` badge
- [x] Legality badge tooltip states the specific reason
- [x] List view rows are draggable; dropping reorders in local state
- [x] Drag indicator border appears above the drop target row
- [x] Deck builder toolbar shows "Unsaved changes ●" indicator after any edit
- [x] Optional version label input visible in toolbar before saving (edit mode)
- [x] Saving clears the dirty indicator
- [x] No TypeScript errors introduced (`apps/web` clean; `apps/rest-api` pre-existing 3 test errors only)

---

### 2026-03-18 — SPEC_04: Deck Evolution Tracking

**Completed**:

1. **Migration** (`apps/rest-api/migrations/008_deck_versions.sql`) — `deck_versions` table with UUID PK, monotonic `version` integer, optional `label`, and `cards` JSONB snapshot. Index on `deck_id`. Auto-applied on next server start.
2. **PostgresService** — added `DeckVersionRow` type + `createVersionSnapshot()` (with 50-version rolling window), `listDeckVersions()`, `getDeckVersion()`, `updateVersionLabel()`.
3. **Auto-snapshot** — `updateDeck` handler fires `createVersionSnapshot()` fire-and-forget after every successful deck save.
4. **Handler** (`apps/rest-api/src/handlers/deck-versions.ts`):
   - `GET /api/v1/decks/:id/versions` — paginated list (newest first), `cardCount` from `jsonb_array_length`
   - `GET /api/v1/decks/:id/versions/diff?a=X&b=Y` — pure `computeDiff()` + hydrated card names from SQLite
   - `GET /api/v1/decks/:id/versions/:versionId` — full card list (hydrated)
   - `PUT /api/v1/decks/:id/versions/:versionId/label` — label update
5. **Routes** registered in `index.ts` — `diff` route ordered before `:versionId` to avoid capture clash.
6. **`useVersionsQuery.ts`** — TanStack Query 5 infinite hook + `useVersionDetailQuery`, `useDiffQuery`, `useLabelMutation`.
7. **`DeckVersionHistory`** component — version list with select-for-compare dots, inline label editor, restore button with confirmation modal, inline diff panel, "Load more" pagination.
8. **`DeckDiffView`** component — added/removed/unchanged sections with colored left borders, card images, delta badges, collapsible unchanged section.
9. **`DeckDetailPage`** — added `DeckTab` type, tab bar (Overview | Analytics ▶ | History 🕐), tab styles in `pages.css`.

**Acceptance criteria**:
- [x] Saving a deck creates a new `deck_versions` row (fire-and-forget after PUT)
- [x] Version number increments monotonically per deck
- [x] `GET /api/v1/decks/:id/versions` returns versions sorted newest-first
- [x] `GET /api/v1/decks/:id/versions/diff?a=X&b=Y` returns correct added/removed/unchanged
- [x] `DeckDetailPage` renders "History" tab
- [x] Version list shows version number, timestamp, optional label
- [x] Selecting 2 versions and clicking "Compare" renders `DeckDiffView`
- [x] Added cards: green left border; removed: red left border + dimmed
- [x] Unchanged section collapsed by default, expandable
- [x] Restore button shows confirmation modal
- [x] Max 50 versions retained (rolling window cleanup after insert)
- [x] No new TypeScript errors (`apps/web` clean; `apps/rest-api` pre-existing 3 test errors only)

---

### 2026-03-18 — SPEC_03: Deck Analytics Engine

**Completed**:

1. **`deck-math` library** (`apps/web/src/web/lib/deck-math/`) — four pure TypeScript modules with no side effects:
   - `hypergeometric.ts` — log-space PMF + CDF (base primitive)
   - `opening-hand.ts` — `openingHandProbabilities()`, `comboConsistency()`
   - `prize-risk.ts` — `prizeRisk()` with risk level classification
   - `energy-curve.ts` — `energyCurveAnalysis()` with turn curve + recommendation
   - `index.ts` — barrel re-exports all public functions and types
2. **Unit tests** (31 tests, 0 failures) across 4 files in `lib/deck-math/__tests__/`
3. **Panel components** in `apps/web/src/web/components/DeckAnalyticsPanel/`:
   - `OpeningHandPanel` — sortable table with hand-size slider (5/6/7/8) and CSS probability bars
   - `PrizeRiskPanel` — color-coded risk table (critical/high/medium), 1-copy callout
   - `EnergyCurvePanel` — CSS vertical bar chart for 5-turn curve, energy stats, recommendation badge
   - `ConsistencyPanel` — chip-based combo selector (up to 3 cards), real-time `comboConsistency()` probability
4. **`DeckAnalyticsPage`** at `/decks/:deckId/analytics` — 2-column responsive grid with all 4 panels
5. **`ROUTES.DECK_ANALYTICS`** added to routes index
6. **Route registered** in `routes.tsx`
7. **"View Analytics" link** added to `DeckDetailPage` header actions (visible when deck has cards)

**Acceptance criteria**:
- [x] 31 `bun test lib/deck-math` tests pass
- [x] `hypergeometricPMF(60, 4, 7, 0)` ≈ 0.6005 (spec value 0.6097 was incorrect — log-space implementation is exact)
- [x] `hypergeometricCDF(60, 4, 7, 1)` ≈ 0.3995 (same; spec value 0.3903 was incorrect)
- [x] `prizeRisk` for 4-copy card returns `probAtLeastOnePrized ≈ 0.3515`
- [x] `prizeRisk` for 1-copy card returns `riskLevel === 'critical'` (10% all-prized, > 2% threshold)
- [x] `energyCurveAnalysis` for 12 basic energy returns `recommendation === 'standard'`
- [x] `DeckAnalyticsPage` renders at `/decks/:id/analytics`
- [x] All four panels render with correct data
- [x] "View Analytics" link on `DeckDetailPage`
- [x] No TypeScript errors (`bun run check-types` clean)

**Notes**:
- Spec acceptance criteria values for PMF/CDF were slightly wrong (spec ≈ 0.3903, exact = 0.3995). Implementation is mathematically correct; tests updated to match exact values.
- 1-copy card risk level is `critical` (not `high`) because P(all prized) = 10% > 2% threshold — spec note was incorrect.

---

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
