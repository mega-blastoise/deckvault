# SPEC_02: "From Meta → My Deck" Pipeline

## Context

The single biggest gap in the current ecosystem: players see what won tournaments but have no tool
to translate that into a deck they can actually build. This spec creates a curated meta deck database,
collection-aware filtering, and a one-click "clone to my builder" flow.

---

## Prerequisites

- SPEC_01 complete (routing restructure in place)
- User collection is backed by Postgres (`/api/v1/collection` endpoints working)

---

## Requirements

### 1. Database: Meta Decks

Two new Postgres tables. Migration file: `database/migrations/004_meta_decks.sql`.

```sql
-- Meta deck archetypes (e.g. "Charizard ex / Pidgeot ex")
CREATE TABLE meta_decks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  archetype   VARCHAR(80)  NOT NULL,      -- e.g. "charizard-pidgeot"
  format      VARCHAR(20)  NOT NULL,      -- standard | expanded | unlimited
  source_url  TEXT,                       -- tournament result link (optional)
  placement   VARCHAR(20),               -- e.g. "1st", "Top 8"
  event_name  VARCHAR(200),
  event_date  DATE,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Individual card entries for each meta deck (60 cards)
CREATE TABLE meta_deck_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_deck_id UUID NOT NULL REFERENCES meta_decks(id) ON DELETE CASCADE,
  card_id      VARCHAR(30) NOT NULL,      -- references pokemon_cards.id in SQLite
  quantity     SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 4)
);

CREATE INDEX idx_meta_deck_cards_deck ON meta_deck_cards(meta_deck_id);
CREATE INDEX idx_meta_decks_format ON meta_decks(format);
CREATE INDEX idx_meta_decks_archetype ON meta_decks(archetype);
```

Seed with a minimum of **10 current Standard-legal tournament decklists** covering the top archetypes.
Seed script: `database/seeds/meta_decks.ts` (Bun script, reads from `database/seeds/data/meta_decks.json`).

### 2. REST API: Meta Decks

New handler file: `apps/rest-api/src/handlers/meta-decks.ts`.

```typescript
// GET /api/v1/meta-decks
// Query params: format?, archetype?, collectionOnly? (bool, requires auth), page?, limit?
// Returns: { decks: MetaDeckSummary[], total: number, page: number, limit: number }

// GET /api/v1/meta-decks/:id
// Returns: MetaDeckDetail — includes full card list with card data hydrated from SQLite

// Types:
interface MetaDeckSummary {
  id: string;
  name: string;
  archetype: string;
  format: string;
  placement: string | null;
  eventName: string | null;
  eventDate: string | null;
  lastUpdated: string;
  cardCount: number;
  // collection-aware fields (only when authenticated + collectionOnly requested)
  ownedCardCount?: number;
  missingCards?: { cardId: string; name: string; quantity: number; price?: number }[];
  buildable?: boolean;   // true if user owns all 60 cards
}

interface MetaDeckDetail extends MetaDeckSummary {
  cards: { card: Pokemon.Card; quantity: number }[];
}
```

The `collectionOnly` filter logic:
1. Fetch all user collection entries for the authenticated user
2. For each meta deck, compute how many of the 60 cards the user owns (by card_id + quantity)
3. Return `ownedCardCount`, `missingCards`, `buildable` on each deck
4. When `collectionOnly=true`, filter to only decks where `buildable === true`

### 3. Collection-Aware Filter UI

`MetaDeckBrowserPage` has a filter toolbar:

```typescript
// apps/web/src/web/pages/MetaDeckBrowserPage/MetaDeckBrowserPage.tsx

interface MetaDeckFilters {
  format: string;              // 'all' | 'standard' | 'expanded' | 'unlimited'
  collectionOnly: boolean;     // authenticated only
  archetype: string;           // free text, matched against archetype field
}
```

Filter bar renders:
- Format pills (All / Standard / Expanded / Unlimited) — reuse existing format filter pattern from `DeckBrowsePage`
- Toggle: "Only show decks I can build" (hidden for unauthenticated users)
- Search input for archetype name

### 4. Meta Deck Card Component

```typescript
// apps/web/src/web/components/MetaDeckCard/MetaDeckCard.tsx

interface MetaDeckCardProps {
  deck: MetaDeckSummary;
  onClone: (deckId: string) => void;
}

// Visual layout:
// ┌─────────────────────────────────────┐
// │  [Cover card image]  Archetype Name │
// │                      Format badge   │
// │                      Event + Placement │
// │                      ─────────────── │
// │  [██████████░░░░] 48/60 owned       │  ← ownership progress bar (auth only)
// │  [Missing: 3 cards, ~$12]           │  ← budget hint (auth only)
// │  [Build This Deck ▶]               │
// └─────────────────────────────────────┘
```

The ownership progress bar:
- `--progress: calc(ownedCardCount / 60 * 100%)`
- `background: linear-gradient(to right, var(--focus-ring) var(--progress), var(--surface-hover) var(--progress))`

### 5. Clone → Builder Flow

"Build This Deck" navigates to the deck builder pre-populated with the meta deck's card list:

```typescript
// In MetaDeckBrowserPage or MetaDeckCard:
function handleClone(metaDeckId: string) {
  navigate(ROUTES.DECK_NEW, {
    state: { cloneFromMetaDeck: metaDeckId }
  });
}

// In DeckBuilderPage — read state on mount:
const location = useLocation();
const { cloneFromMetaDeck } = (location.state ?? {}) as { cloneFromMetaDeck?: string };

useEffect(() => {
  if (!cloneFromMetaDeck) return;
  // Fetch meta deck detail and pre-populate cards state
  fetchMetaDeckDetail(cloneFromMetaDeck).then((detail) => {
    setDeckCards(detail.cards);
    setDeckName(`${detail.name} (Copy)`);
    setFormat(detail.format as DeckFormat);
  });
}, [cloneFromMetaDeck]);
```

### 6. Budget Substitution Display

On the meta deck detail page, for each missing card show:
- Card name
- Quantity needed
- Price estimate (use existing `mcp__pokemon-tcg__get_price_info` or a cached price field)
- Suggested substitutes (curated — stored as a JSON column on `meta_deck_cards` or a separate `card_substitutes` table)

Substitutes table:

```sql
CREATE TABLE card_substitutes (
  card_id       VARCHAR(30) NOT NULL,   -- original card
  substitute_id VARCHAR(30) NOT NULL,  -- recommended replacement
  notes         TEXT,                  -- "slightly slower but budget-friendly"
  PRIMARY KEY (card_id, substitute_id)
);
```

Substitutes are curated manually in the seed data. The UI renders them as a collapsible section
under each missing card in the detail view.

---

## File Structure

```
database/migrations/
└── 004_meta_decks.sql

database/seeds/
├── meta_decks.ts                # Bun seed script
└── data/
    └── meta_decks.json          # Curated tournament decklists

apps/rest-api/src/handlers/
└── meta-decks.ts                # GET /api/v1/meta-decks, GET /api/v1/meta-decks/:id

apps/web/src/web/pages/MetaDeckBrowserPage/
├── index.ts
├── MetaDeckBrowserPage.tsx
└── MetaDeckBrowserPage.css

apps/web/src/web/components/MetaDeckCard/
├── index.ts
├── MetaDeckCard.tsx
└── MetaDeckCard.css

apps/web/src/web/routes/
└── routes.tsx                   # MODIFIED — add /meta-decks route

apps/web/src/web/components/Navbar/
└── Navbar.tsx                   # MODIFIED — add "Meta Decks" nav link
```

---

## Acceptance Criteria

- [ ] `GET /api/v1/meta-decks` returns at least 10 seeded decklists
- [ ] `GET /api/v1/meta-decks?format=standard` filters correctly
- [ ] `GET /api/v1/meta-decks?collectionOnly=true` (authenticated) returns only fully-buildable decks
- [ ] `GET /api/v1/meta-decks/:id` returns full 60-card list with card names + set info hydrated
- [ ] `MetaDeckBrowserPage` renders at `/meta-decks`
- [ ] Format filter pills update the deck list without page reload
- [ ] "Only show decks I can build" toggle is hidden for unauthenticated users
- [ ] Ownership progress bar renders correctly for authenticated users
- [ ] "Build This Deck" navigates to `/decks/new` with cards pre-populated in the builder
- [ ] Pre-populated builder shows correct deck name `"[Archetype] (Copy)"`
- [ ] Missing card list shows card name, quantity, and price estimate
- [ ] No TypeScript errors introduced

---

## Dependencies

- SPEC_01 (routing in place)
- Postgres migration 004 applied
- Seed data file populated with ≥ 10 real decklists

---

## Verification

```bash
# Run migration
psql $DATABASE_URL -f database/migrations/004_meta_decks.sql

# Run seed
cd database/seeds && bun run meta_decks.ts

# Verify endpoint
curl http://localhost:3001/api/v1/meta-decks | jq '.total'
# Expected: >= 10

# Verify collection filter (requires auth cookie)
curl -b cookies.txt "http://localhost:3001/api/v1/meta-decks?collectionOnly=true" | jq '.decks[].buildable'

# Type check
cd apps/web && bun run check-types
cd apps/rest-api && bun run check-types
```
