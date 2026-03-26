# Competitive Parity Workstream — Session Context
**Last updated:** 2026-03-27
**Session goal:** Feature parity with Limitless TCG + RK9.gg, starting from Tier 1

---

## What Was Accomplished This Session

### Infrastructure
- **Self-host migration complete** — off AWS (EC2/RDS/CloudFront), running on DGX Spark via Docker Compose + Cloudflare Tunnel. Prod stack lives at `/opt/deckvault/` under systemd, project name `pokemon`.
- **Local dev isolated** — `docker-compose.dev.yml` now has `name: pokemon-dev`, dev postgres on `localhost:5433`. `bun run db:dev` can no longer orphan-remove prod containers. Full workflow in `.claude/guides/LOCAL_DEV_SETUP.md`.
- **CSR navigation** — switched raw HREFs to React Router NavLink post-hydration for low-latency page transitions.

### Tier 1 — All three shipped, QA verified

#### PTCGL Export ✅
- `apps/web/src/web/lib/ptcgl-codec.ts` — pure `exportToPtcgl(cards: DeckCard[]): string`
  - Groups by Pokémon → Trainer → Energy
  - Extracts card number from `card.id` string (e.g. `sv3-TG01` → `TG01`) — safe for non-numeric numbers
  - Uses `card.set.ptcgoCode` (e.g. `OBF`) with fallback to `set.id.toUpperCase()`
  - Appends `Total Cards: N`
- `apps/rest-api/src/handlers/decks.ts` — `hydrateCards` now includes `ptcgoCode` in set object
- `apps/web/src/types/deck.ts` — `DeckCard.card.set` now has `ptcgoCode?: string`
- Export button on `DeckBuilderPage` toolbar + `DeckDetailPage` header, clipboard + 2s "✓ Copied!" feedback

#### PTCGL Import ✅
- `apps/rest-api/src/handlers/ptcgl.ts` — `POST /api/v1/decks/ptcgl/resolve`
  - Parses PTCGL text: skips section headers, matches `{qty} {name} {setCode} {number}` lines
  - Primary lookup: `JOIN pokemon_card_sets WHERE ptcgo_code = ? AND number = ?`
  - Fallback: exact name match, picks most recent set by `release_date DESC`
  - Returns `{ resolved: DeckCard[], unresolved: string[] }`
- Registered at `decksBrowse` router (public, no auth required)
- `apps/web/src/web/components/PtcglImportModal/` — paste textarea → resolve → import flow
- `apps/web/src/web/services/PtcglService.ts` — wraps the resolve endpoint
- "↓ Import" button on `DeckBuilderPage`

#### Deck Sharing ✅
- No backend changes — `is_public` already defaults to `true`, `getDeck` already serves public decks without auth
- "🔗 Share" button on `DeckDetailPage` copies `window.location.href` to clipboard
- `DeckDetailPage` is not behind `ProtectedRoute` — URLs work in incognito

### Tier 2 — All three shipped (2026-03-25)

#### T2-A: Card Price Display ✅
- `apps/rest-api/src/handlers/decks.ts` — `hydrateCards` now includes `tcgplayer?: { url: string }` from `transformCardRow`
- `apps/web/src/types/deck.ts` — `DeckCard.card` has `tcgplayer?: { url: string }`
- `DeckBuilderList.tsx` — `$` pill on every row; URL from `tcgplayer.url` or fallback `https://prices.pokemontcg.io/tcgplayer/{cardId}`
- `DeckDetailPage.tsx` — "💰 Price Check" button: copies PTCGL deck list to clipboard + opens `tcgplayer.com/massentry` in new tab; feedback label "✓ List copied — paste on TCGPlayer!"
- `CardPage.tsx` — "View on TCGPlayer →" always rendered; same fallback URL pattern
- **Fast-follow noted**: TCGPlayer mass entry flow (paste UX) needs polish in a future session

#### T2-B: Set Browser ✅
- `apps/web/src/web/hooks/useSetCards.ts` — new hook; wraps `SetsService.getCardsInSet`
- `apps/web/src/web/pages/SetBrowserPage/` — grid of all sets sorted newest-first with logo + card count
- `apps/web/src/web/pages/SetDetailPage/` — `/sets/:setId` showing all cards via `CardGrid`
- `apps/web/src/web/routes/index.tsx` — `ROUTES.SETS`, `ROUTES.SET_DETAIL(setId)`
- `apps/web/src/web/routes/routes.tsx` — `/sets` and `/sets/:setId` routes registered
- `Navbar.tsx` — "Sets" link (Grid3x3 icon) added between Browse and Decks
- `BrowsePage.tsx` — "Set" dropdown filter; when selected, uses `useSetCards` + client-side name filter
- `SetsService.getCardsInSet` passes `limit: 500`; `MAX_PAGE_SIZE` raised to 420 (covers largest set: 304 cards)
- Pagination test updated: "caps pageSize at 420"; `health.ts` API docs updated to match

#### T2-C: Legality Badges on Card Browse ✅
- `apps/web/src/web/lib/card-legality-display.ts` — `getCardFormatBadge()` pure function + label/title maps
- `Card.tsx` — legality badge overlay (bottom-left of card image) in grid variant; STD=green, EXP=blue, UNL=grey, ROT=dim
- `Card.css` — `.pokemon-card__legality-badge--{standard,expanded,unlimited,rotated}` styles; `pointer-events: none` removed so native `title` tooltip fires on hover

---

## Current App Surface (All Pages Exist)

| Route | Component | Auth | Notes |
|---|---|---|---|
| `/` | LandingPage | public | Hero, feature showcase, CTA |
| `/browse` | BrowsePage | public | Card search/filter |
| `/cards/:id` | CardPage | public | Card detail |
| `/decks/browse` | DeckBrowsePage | public | Community decks |
| `/decks/new` | DeckBuilderPage | required | + Import/Export buttons |
| `/decks/:id/edit` | DeckBuilderPage | required | + Import/Export buttons |
| `/decks/:id` | DeckDetailPage | public | + Share/Export, tabs: Overview/History |
| `/decks/:id/analytics` | DeckAnalyticsPage | public | 4-panel probability engine |
| `/meta-decks` | MetaDeckBrowserPage | public | Collection-aware filter, clone-to-builder |
| `/local-meta` | LocalMetaPage | public | Archetype frequency, report modal |
| `/dashboard` | DashboardPage | required | Gated "Coming Soon" |
| `/collection` | CollectionPage | required | Gated "Coming Soon" |
| `/sets` | SetBrowserPage | public | All sets grid, sorted newest-first |
| `/sets/:id` | SetDetailPage | public | Cards in a set via CardGrid |
| `/rotation` | RotationPage | public | Static rotation calendar, season selector |
| `/cp` | CpTrackerPage | required | CP log, running total, Add Event form |
| `/sign-in` | SignInPage | public | Google OAuth + Magic email link |

---

## Parity Gap — Remaining Tiers

### Tier 2 — ✅ All Complete

### Tier 3 — ✅ All Complete (2026-03-27)

| Feature | Status | Notes |
|---|---|---|
| **Archetype tier list** | ✅ | Migration 011, tier badges + filter pills on MetaDeckBrowserPage |
| **Rotation calendar page** | ✅ | Static `/rotation`, `rotation-data.ts`, Navbar CalendarDays |
| **CP personal tracker** | ✅ | Migration 012, `/api/v1/cp` CRUD, `/cp` page (auth-gated) |

---

## Key Technical Facts

### Stack
- **Frontend**: React 19 SSR, Bun, TanStack Query 5, React Router 7, Vanilla CSS + BEM
- **Backend**: TypeScript REST API (`@pokemon/framework` custom router), Bun.serve(), `bun:sql` for Postgres
- **Databases**: PostgreSQL 15 (users/decks/meta — Postgres), SQLite (card data — read-only)
- **Prod**: DGX Spark, `/opt/deckvault/`, `systemd` + Docker Compose project `pokemon`, Cloudflare Tunnel
- **Dev**: `bun run db:dev` → postgres on `localhost:5433`, `bun run dev` → turbo hot-reload

### File Locations
- Web pages: `apps/web/src/web/pages/`
- Web components: `apps/web/src/web/components/`
- Web lib (pure functions): `apps/web/src/web/lib/`
- Web services (API clients): `apps/web/src/web/services/`
- REST handlers: `apps/rest-api/src/handlers/`
- Migrations: `apps/rest-api/migrations/` (auto-run on startup by `PostgresService`)
- Routes registration: `apps/rest-api/src/index.ts`
- Frontend routes: `apps/web/src/web/routes/routes.tsx` + `index.tsx`
- CSS public: `apps/web/public/css/` (pages.css, index.css, themes/)

### Patterns
- New REST handler → create in `handlers/`, import + register router in `index.ts`
- New page → `pages/ComponentName/` with `index.ts` barrel, add route to `routes.tsx` + `ROUTES` const in `routes/index.tsx`
- New migration → `migrations/NNN_name.sql`, auto-applied on next restart
- CSS: BEM `.component__element--modifier`, Nebula theme vars: `--bg-sunken`, `--text-secondary`, `--surface-hover`, `--focus-ring`, `--card-shadow`
- No default exports in new files. No `any` types. No `npm`/`yarn`.

### Migrations Applied (Postgres)
001 users, 002 decks, 003 deck_cards, 004 user_collections, 005 migrations_tracking, 006 meta_decks, 007 fix_meta_deck_cards_quantity, 008 deck_versions, 009 local_meta, 010 relax_deck_cards_quantity, 011 meta_deck_tier, 012 cp_tracker, 013 magic_link_tokens, 014 magic_link_nullable_user_id
**Applied in dev. 013+014 pending prod deploy — next would be 015**

---

## QA Notes From This Session
- PTCGL export verified: set codes correct (e.g. "OBF"), non-numeric numbers (TG01) handled via ID extraction
- Import resolve endpoint verified via curl: 3 card types resolved correctly
- Deck sharing verified: unauthenticated access confirmed in incognito
- 133/133 tests pass, 13/13 check-types clean after all Tier 1 changes
- Tier 2 complete + QA remediation (2026-03-26): 133/133 tests pass, 13/13 check-types clean
- Tier 3 complete (2026-03-27): 133/133 tests pass, 13/13 check-types clean — pending QA on dev stack

## UI Polish Session (2026-03-26)

### What shipped
- **Favicon** — pokéball SVG at `apps/web/public/assets/favicon.svg`, linked in `Document.tsx`
- **Navbar logo icon** — pokéball SVG inline left of "DeckVault" text; uses `currentColor`, adapts to both themes
- **Navbar cleanup** — removed `NavLinkGated` for "Collection" and "Dashboard" (pre-release clutter); nav is now: Browse · Sets · Decks · Meta · Local Meta · Rotation · CP (auth-only)
- **Glassmorphism push** — deeper glass on Navbar (blur 20px + saturate), Cards, MetaDeckCard, sign-in card (all Nebula theme)
- **Card height standardization** — `CardGrid` items now `display:flex; flex-direction:column`; inner `pokemon-card--grid` gets `flex:1; height:100%` — cards in a row are always equal height
- **Magic email link auth** — full stack implementation:
  - Migration 013: `google_id` nullable, `magic_link_tokens` table (user_id nullable — account not created until link clicked)
  - Migration 014: hotfix — drops NOT NULL on `user_id` after 013 was applied before the security fix
  - `POST /auth/magic-link` — generates token, emails via Resend, returns 200. No user created yet.
  - `GET /auth/magic-link/verify` — consumes token, calls `upsertEmailUser`, issues JWT, redirects
  - `UserRow.google_id` typed as `string | null`
  - Sign-in page: pokéball logo, Google button, OR divider, email form with loading/sent/error states
  - Email provider: Resend via fetch (no SDK). Config: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`. Falls back to console.log in dev when key absent.
  - Domain `deckvault.gg` verified in Resend (Cloudflare auto-configure used for DNS records)
  - Dev: set `APP_URL=http://localhost:3000` in `apps/rest-api/.env` to get links pointing at localhost

### Key files changed
- `apps/web/public/assets/favicon.svg` — NEW
- `apps/web/src/web/components/Document/Document.tsx` — favicon link
- `apps/web/src/web/components/Navbar/Navbar.tsx` — logo icon, removed gated links
- `apps/web/src/web/components/Navbar/Navbar.css` — glass, icon styles, removed gated CSS
- `apps/web/src/web/components/Card/Card.css` — nebula glass
- `apps/web/src/web/components/CardGrid/CardGrid.css` — height stretch
- `apps/web/src/web/components/MetaDeckCard/MetaDeckCard.css` — nebula glass
- `apps/web/src/web/pages/SignInPage.tsx` — magic link UI
- `apps/web/public/css/pages.css` — magic link styles
- `apps/rest-api/migrations/013_magic_link_tokens.sql` — NEW
- `apps/rest-api/migrations/014_magic_link_nullable_user_id.sql` — NEW
- `apps/rest-api/src/config/index.ts` — email config block
- `apps/rest-api/src/services/postgres.ts` — `MagicLinkTokenRow`, `getUserByEmail`, `upsertEmailUser`, `createMagicLinkToken`, `consumeMagicLinkToken`
- `apps/rest-api/src/handlers/auth.ts` — `sendMagicLink`, `verifyMagicLink`
- `apps/rest-api/src/index.ts` — routes registered

### Key Data-Shape Note (double-wrap)
Services like `useSets()`, `useSet()`, `useSetCards()` return `APIResponse<T>` where `.data` is the raw API body `{ data: T[] }`. Consumers must do `(result.data?.data as unknown as { data: T[] }).data` to get the actual array. Consistent with how `CardPage` handles `useCard`.
