# Competitive Parity — Tier 2 & Tier 3 Spec

## Context

Tier 1 and Tier 2 are complete. See `TIER_PARITY_CONTEXT.md` for full implementation details.
This spec retains Tier 2 for reference and covers Tier 3 as the active workstream.

---

## Tier 2 — ✅ Complete (shipped 2026-03-26)

All three shipped and QA verified. Key implementation notes:
- TCGPlayer URL fallback: `https://prices.pokemontcg.io/tcgplayer/{cardId}` used on all cards where `tcgplayer_url` not in DB
- "💰 Price Check" on DeckDetailPage: copies PTCGL list to clipboard + opens `tcgplayer.com/massentry` — **fast-follow:** improve the paste UX/instructions on that flow
- Set cards pagination: `MAX_PAGE_SIZE=420`, `SetsService` passes `limit:500` (capped at 420 server-side)
- Legality badge `pointer-events` fix: removed `none` so native title tooltip fires

---

## Tier 2 Spec (reference) — Parity Closes

These features exist on Limitless. Users will notice their absence immediately.

---

### T2-A: Card Price Display + Total Deck Cost

**Goal:** Show TCGPlayer market price on card detail pages and total cost in the deck builder/detail view.

**Data source:** `pokemon_cards.tcgplayer_url` already populated in SQLite. Format: `https://prices.pokemontcg.io/tcgplayer/{cardId}`. We do NOT store price values in the DB — prices are fetched client-side or via a thin proxy.

**Approach — client-side price fetch:**

The TCGPlayer URL is already on each card. Surface it as a link ("Check price on TCGPlayer") rather than displaying a live dollar value (which would require a TCGPlayer API key + caching layer). This gets us 80% of the value with 0% of the complexity.

For total deck cost: add a "View Prices" link that opens a pre-filled TCGPlayer search or links each card individually. This is the same pattern Limitless uses.

**Files to change:**

```
apps/web/src/web/components/DeckBuilderList/DeckBuilderList.tsx
  → Add TCGPlayer link icon on each row (only if card.tcgplayer exists)

apps/web/src/web/pages/DeckDetailPage.tsx
  → Add "Price Check" section or link in the header actions

apps/web/src/web/pages/CardPage.tsx
  → Add "View on TCGPlayer" button if tcgplayer.url present

apps/web/src/types/deck.ts
  → Add tcgplayer?: { url: string } to DeckCard.card
```

**Backend:** `hydrateCards` in `decks.ts` needs `tcgplayer` added to the returned card shape (same pattern as `ptcgoCode` was added). Currently only `id, name, supertype, subtypes, number, regulationMark, images, set` are returned.

**Acceptance criteria:**
- [ ] `DeckCard.card` includes `tcgplayer?: { url: string }`
- [ ] Each card row in `DeckBuilderList` shows a 💰 or external link icon when `tcgplayer.url` exists
- [ ] Clicking it opens TCGPlayer in a new tab
- [ ] `DeckDetailPage` shows a "Price Check" button that opens TCGPlayer search for the deck name
- [ ] `CardPage` shows "View on TCGPlayer →" link when available

---

### T2-B: Set Browser

**Goal:** Users can browse all sets and filter the card browser by set.

**Existing API:** `GET /api/v1/sets` already returns all sets. `GET /api/v1/sets/:id/cards` returns cards for a set.

**New route:** `/sets` → `SetBrowserPage`

```
apps/web/src/web/pages/SetBrowserPage/
├── index.ts
├── SetBrowserPage.tsx        # Grid of set cards, sorted by release_date DESC
└── SetBrowserPage.css

apps/web/src/web/pages/SetDetailPage/
├── index.ts
├── SetDetailPage.tsx         # /sets/:setId → all cards in that set, reuses CardGrid
└── SetDetailPage.css
```

**SetBrowserPage layout:**
```
┌─────────────────────────────────────────────────────┐
│  Sets  [Standard ▾] [Series ▾]                      │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ [logo]   │ │ [logo]   │ │ [logo]   │             │
│  │ SV: OBF  │ │ SV: PAL  │ │ SV: MEW  │             │
│  │ 230 cards│ │ 193 cards│ │ 165 cards│             │
│  └──────────┘ └──────────┘ └──────────┘             │
└─────────────────────────────────────────────────────┘
```

**BrowsePage integration:** Add a "Set" filter dropdown to `BrowsePage` that calls `GET /api/v1/cards/search?setId=sv3`. The `searchCards` handler already accepts `set` as a filter param.

**Navbar:** Add "Sets" link to the Navbar between "Browse" and "Meta Decks".

**ROUTES additions:**
```typescript
SETS: '/sets',
SET_DETAIL: (setId: string) => `/sets/${setId}`
```

**Acceptance criteria:**
- [ ] `/sets` renders grid of all sets sorted newest-first with set logo and card count
- [ ] Clicking a set navigates to `/sets/:id` showing all cards in that set via `CardGrid`
- [ ] BrowsePage has a "Set" filter that limits results to cards from that set
- [ ] "Sets" link in Navbar
- [ ] No TypeScript errors

---

### T2-C: Legality Badges on Card Browse

**Goal:** Every card in BrowsePage and CardPage shows its format legality status at a glance.

**Existing logic:** `getCardLegalityIssue` in `deck-legality.ts` covers legality per-format in the builder. For browse, we need a simpler display: what formats is this card legal in?

**New pure function** in `apps/web/src/web/lib/card-legality-display.ts`:

```typescript
export type FormatLegality = 'standard' | 'expanded' | 'unlimited' | 'rotated' | 'unknown';

export function getCardFormatBadge(card: {
  legalities?: { unlimited?: string; expanded?: string; standard?: string };
  regulationMark?: string;
}): FormatLegality {
  if (card.legalities?.standard === 'Legal') return 'standard';
  if (card.legalities?.expanded === 'Legal') return 'expanded';
  if (card.legalities?.unlimited === 'Legal') return 'unlimited';
  return 'rotated';
}
```

**Badge component** (inline in Card.tsx or extracted):
```
Standard  → green pill
Expanded  → blue pill
Unlimited → grey pill
Rotated   → dim/strikethrough
```

**Files to change:**
```
apps/web/src/web/components/Card/Card.tsx
  → Add legality badge overlay (bottom-left of card image)

apps/web/src/web/pages/CardPage.tsx
  → Add format legality section in card detail info
```

**Acceptance criteria:**
- [ ] Every card in BrowsePage grid shows a legality badge
- [ ] CardPage shows which formats the card is legal in
- [ ] `regulationMark` displayed on CardPage (already in data, just not shown)
- [ ] No TypeScript errors

---

## Tier 3 — Differentiators

Features we can build that Limitless lacks or does poorly.

---

### T3-A: Archetype Tier List

**Goal:** Meta decks show S/A/B/C tier classifications on `MetaDeckBrowserPage`.

**Migration 011:**

```sql
-- apps/rest-api/migrations/011_meta_deck_tier.sql
ALTER TABLE meta_decks ADD COLUMN tier VARCHAR(2);
-- NULL = untiered; 'S', 'A', 'B', 'C', 'D' are valid values
```

**Backend:** Update `listMetaDecks` handler to include `tier` in the response. Update `meta-decks.ts` `MetaDeckSummary` interface.

**Seed update:** Add `tier` values to `database/seeds/data/meta_decks.json` for existing decklists.

**Frontend:**

`MetaDeckCard` component gets a tier badge:
```
┌──────────────────────────────────┐
│  [S]  Charizard ex / Pidgeot ex  │   ← tier badge, color-coded
│        Standard · Top 4 NAIC     │
└──────────────────────────────────┘
```

Tier badge colors:
- S → `#f59e0b` (amber)
- A → `#22c55e` (green)
- B → `#3b82f6` (blue)
- C → `#8b5cf6` (purple)
- D → `#6b7280` (grey)

Add tier filter pills to `MetaDeckBrowserPage` filter bar: `All | S | A | B | C`.

**Acceptance criteria:**
- [ ] Migration 011 applied
- [ ] `GET /api/v1/meta-decks` returns `tier` field
- [ ] MetaDeckCard shows tier badge when tier is set
- [ ] Tier filter pills on MetaDeckBrowserPage filter correctly
- [ ] No TypeScript errors

---

### T3-B: Rotation Calendar Page

**Goal:** A static `/rotation` page that tells players exactly what rotates and when.

**No backend required.** Data is curated in a TypeScript constant.

```typescript
// apps/web/src/web/lib/rotation-data.ts
export interface RotationEntry {
  seasonYear: string;          // e.g. "2025-2026"
  rotationDate: string;        // ISO date: "2025-09-05"
  legalMarks: string[];        // e.g. ["G", "H", "I"]
  rotatedMarks: string[];      // e.g. ["D", "E", "F"]
  legalSets: string[];         // e.g. ["Scarlet & Violet Base", ...]
  notes?: string;
}

export const ROTATION_HISTORY: RotationEntry[] = [ ... ];
export const CURRENT_ROTATION: RotationEntry = ROTATION_HISTORY[0];
```

**Page layout:**
```
/rotation

  Current Format: Standard 2025-2026
  Legal Regulation Marks: G, H, I
  Rotated: D, E, F (as of September 5, 2025)

  ┌──────────────────────────────────────────┐
  │  Legal Sets (Regulation Mark G+)         │
  │  • Scarlet & Violet Base (SVI) — G       │
  │  • Paldea Evolved (PAL) — G              │
  │  • ...                                   │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │  Rotated Sets                            │
  │  • Crown Zenith (CRZ) — F (rotated 9/25) │
  │  • ...                                   │
  └──────────────────────────────────────────┘
```

**Navbar:** Add "Rotation" link (or fold into "Meta" section).
**ROUTES addition:** `ROTATION: '/rotation'`

**Acceptance criteria:**
- [ ] `/rotation` renders current format info, legal marks, rotated marks
- [ ] Legal and rotated sets listed with their regulation mark
- [ ] Page is static (no API call)
- [ ] Mobile responsive

---

### T3-C: Championship Points Personal Tracker

**Goal:** Players can log CP earned from events they attended. Lightweight personal tracker — no TPCi integration.

**Migration 012:**

```sql
-- apps/rest-api/migrations/012_cp_tracker.sql
CREATE TABLE cp_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name   VARCHAR(200) NOT NULL,
  event_date   DATE NOT NULL,
  placement    VARCHAR(20),              -- e.g. "Top 8", "1st"
  cp_earned    SMALLINT NOT NULL CHECK (cp_earned >= 0 AND cp_earned <= 500),
  format       VARCHAR(20) NOT NULL DEFAULT 'standard',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cp_entries_user ON cp_entries(user_id);
CREATE INDEX idx_cp_entries_date ON cp_entries(event_date);
```

**REST endpoints:**
```typescript
// GET /api/v1/cp     → { entries: CpEntry[], totalCp: number, season: string }
// POST /api/v1/cp    → create entry
// DELETE /api/v1/cp/:id → remove entry
// All auth-required
```

**Frontend:**
- New page `/cp` → `CpTrackerPage` (auth-gated)
- Simple table of events + CP earned
- Running total at top: `Total CP: 312 / 500 (Day 2 threshold)`
- "Add Event" button → inline form or modal
- Season selector (CP resets yearly)

**Acceptance criteria:**
- [ ] Migration 012 applied
- [ ] CRUD endpoints working for authenticated users
- [ ] `CpTrackerPage` renders at `/cp` with total and entry list
- [ ] "Add Event" form submits correctly
- [ ] Total CP shown prominently with progress toward common thresholds (Day 2: 500, Worlds invite varies by region)

---

## Execution Order

```
Week 1 (Tier 2 — Parity):
  T2-A: Card Price Display    (~4h)
  T2-B: Set Browser           (~4h)
  T2-C: Legality Badges       (~3h)

Week 2 (Tier 3 — Differentiators):
  T3-A: Tier List             (~3h)
  T3-B: Rotation Calendar     (~3h)
  T3-C: CP Tracker            (~6h)
```

Each item is self-contained. T2-A, T2-B, T2-C can be done in any order.
T3 items have no dependencies on each other.

---

## Non-Goals (Explicitly Out of Scope)

- RK9.gg tournament registration, live pairings, sanctioned event management
- Live price feeds (requires TCGPlayer API key + caching)
- Bulk collection import/export
- Mobile app
- Multiplayer / trading features
