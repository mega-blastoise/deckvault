# Design Decisions

## DD-01: Where to Run Deck Math Calculations

### Question
Should probability calculations (opening hand, prize risk, energy curve) run server-side or client-side?

### Options

**A — Server-side endpoint** ⭐⭐
- API returns computed results
- Pros: results cacheable, backend handles heavy decks
- Cons: round-trip latency for interactive UI (slider changes); extra endpoint to maintain; all inputs already on client

**B — Client-side pure functions** ⭐⭐⭐⭐⭐
- Math runs in the browser after deck is fetched
- Pros: zero latency for interactivity (slider, combo selector); no backend changes; pure functions trivially unit-tested; works offline
- Cons: more JS bundle weight (negligible — < 2KB for all 4 modules)

### Decision
**Option B — Client-side pure functions.**

**Why**: The deck is already fetched for the builder/detail page. Running pure math on 60 cards takes <1ms. Interactive features like the opening hand slider require instant feedback that server round-trips cannot provide. The `deck-math` library is self-contained and has no side effects.

**Implementation rules**:
- All functions in `lib/deck-math/` must be pure (no imports from the rest of the app)
- Use `useMemo` to memoize results — recompute only when `deckCards` reference changes
- No `useEffect` — derive analytics synchronously in render

---

## DD-02: Meta Deck Data Source

### Question
Where does the curated tournament deck data come from and how is it kept fresh?

### Options

**A — Live scrape from Limitless TCG** ⭐⭐
- Automate ingestion from public tournament pages
- Pros: always current
- Cons: brittle (HTML scraping), potential ToS issues, build-time complexity

**B — Manual seed + staleness indicator** ⭐⭐⭐⭐
- Curate and seed 10-20 decklists by hand; surface `last_updated` in UI
- Pros: fully controlled, no external dependency, fast to ship
- Cons: requires manual update effort to stay fresh

**C — Pokemon TCG API + manual list curation** ⭐⭐⭐
- Use existing MCP `pokemon-tcg` tools to verify card legality; curate list structure manually
- Pros: card data is always accurate; hybrid approach
- Cons: still requires manual list curation

### Decision
**Option B — Manual seed with staleness indicator.**

**Why**: We need to ship fast. A manual seed of 10-20 top Standard lists takes 2-3 hours to compile and gives us a working product. The `last_updated` field and a staleness badge ("Data from March 2026") set honest expectations. Re-seeding is a low-effort maintenance operation once the pipeline is proven.

**Implementation rules**:
- Seed data lives in `database/seeds/data/meta_decks.json` as structured JSON
- Each deck must have a `source_url` pointing to the tournament result (transparency)
- UI shows `last_updated` date on every meta deck card
- Re-seed script is idempotent (upsert on `name + event_date`)

---

## DD-03: Drag-and-Drop Library vs Native HTML5 DnD API

### Question
Should the deck builder use a React DnD library (dnd-kit, react-beautiful-dnd) or native HTML5 DnD?

### Options

**A — dnd-kit** ⭐⭐⭐
- Popular, accessible, well-maintained
- Pros: keyboard accessibility, smooth animations, sortable utilities
- Cons: ~40KB gzipped bundle addition; another external dependency; overkill for a simple list sort

**B — react-beautiful-dnd** ⭐⭐
- Classic choice
- Pros: known API
- Cons: unmaintained (last release 2022); large bundle; deprecated

**C — Native HTML5 Drag and Drop API** ⭐⭐⭐⭐
- Zero dependencies
- Pros: no bundle impact; fully sufficient for simple list reorder; works in all modern browsers
- Cons: no built-in animations; keyboard accessibility requires extra work

### Decision
**Option C — Native HTML5 DnD API.**

**Why**: The use case is simple list reordering within one container. Native DnD handles this in ~30 lines. Adding 40KB of library for a non-critical UX feature violates our minimal-abstractions philosophy. If drag UX becomes a serious product investment, revisit dnd-kit.

**Implementation rules**:
- Store `dragIndex` in a `useRef` (not state — no re-render needed during drag)
- Always call `e.preventDefault()` in `onDragOver` to enable drop
- Apply visual feedback via a CSS class toggled in `onDragEnter`/`onDragLeave`
- Do NOT add keyboard DnD support in this spec (out of scope for alpha)

---

## DD-04: Landing Page — With or Without Navbar

### Question
Should `LandingPage` include the application Navbar?

### Options

**A — Include Navbar** ⭐⭐
- Consistent chrome; signed-in users see their context
- Cons: Navbar links lead to gated pages (confusing); conflicting navigation signals; Navbar is not optimized for a marketing page

**B — Standalone page, no Navbar** ⭐⭐⭐⭐⭐
- Clean marketing experience
- Pros: full visual control; no confusing links to gated pages; sign-in CTA is singular and clear
- Cons: signed-in users have no persistent navigation (acceptable — they are redirected anyway)

### Decision
**Option B — Standalone page, no Navbar.**

**Why**: The landing page is a conversion funnel. Competing navigation links dilute the CTA. Authenticated users arriving at `/` should be redirected to `/decks` (their natural home), so they won't see the landing page anyway.

**Implementation rules**:
- Route `LandingPage` outside the `AppLayout` wrapper in `routes.tsx`
- Add a redirect: if `isAuthenticated`, redirect from `/` to `/decks`
- Landing page gets its own minimal header with just the logo and a "Sign in" text link in top-right

---

## DD-05: Deck Version Storage — JSONB Snapshot vs Normalized Rows

### Question
Should `deck_versions` store card lists as a JSONB snapshot or as normalized rows (one row per card per version)?

### Options

**A — Normalized rows** ⭐⭐⭐
- `deck_version_cards (version_id, card_id, quantity)`
- Pros: queryable, joinable, consistent with existing schema
- Cons: 60 rows per save operation; diff requires a join; schema migration complexity

**B — JSONB snapshot** ⭐⭐⭐⭐
- `deck_versions.cards JSONB` — stores `[{cardId, quantity}]` array
- Pros: single row per version; fast to write; diff is computed in application code (already needed); no join for read
- Cons: not directly queryable by card_id (acceptable — we never need "find all versions containing card X" in alpha)

### Decision
**Option B — JSONB snapshot.**

**Why**: Version snapshots are write-once, read-for-display. The diff is always computed in application code (server-side `computeDiff` function). Storing 60 normalized rows per save for a feature that is mostly read as a blob is over-engineering. JSONB is a first-class type in Postgres and is trivially serializable/deserializable.

**Implementation rules**:
- Store minimal snapshot: `[{ "cardId": string, "quantity": number }]`
- Hydrate card metadata from SQLite at read time (same as existing `hydrateCards` pattern)
- Index only `deck_id` — not into the JSONB column
