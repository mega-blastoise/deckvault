# SPEC_01: Deck Input & Simulation Configuration

## Context

This spec establishes the `/simulate` route and the two input components that feed every downstream feature: `DeckInputPanel` (three modes of deck entry) and `SimulationConfig` (game count, key cards, format, opponent). Nothing in the Simulation Platform renders without a valid deck input and configuration.

Additionally, this spec covers seeding `decks.sqlite3.db` with meta archetype data and creating the Bun API routes that serve meta decks and set abbreviation mappings to the frontend.

---

## Prerequisites

- `packages/@engine` is complete (all 7 specs implemented)
- `database/pokemon-data.sqlite3.db` contains Standard-legal card data
- `database/decks.sqlite3.db` exists with `decks` table schema (currently empty)
- `database/seeds/data/meta_decks.json` has 5 meta decks (must expand to 8-12)
- `apps/rest-api` exposes `GET /api/v1/decks` for authenticated user decks

---

## Requirements

### 1. Route Registration

Add `/simulate` to both the React Router config and the Bun server route matcher.

```typescript
// apps/web/src/web/routes/routes.tsx — add to AppLayout children
{
  path: '/simulate',
  element: <SimulatePage />
}
```

```typescript
// apps/web/src/server/lib/routes.ts — add to WEB_ROUTE_PATTERNS
/^\/simulate$/
```

The route does NOT require authentication. Saved deck mode (Mode 1) gracefully degrades when the user is not logged in.

### 2. SimulatePage Shell

Container/View split. The container manages:
- Which deck is selected for player 1 (the user's deck)
- Which opponent deck(s) are selected
- Simulation configuration state
- Simulation execution state (idle, running, complete)
- The `SimulationResult` once complete

```typescript
// apps/web/src/web/pages/SimulatePage/SimulatePage.tsx

type SimulationPhase = 'input' | 'running' | 'results';

// State managed via useState:
// - phase: SimulationPhase
// - playerDeck: ResolvedDeck | null
// - opponentDeck: ResolvedDeck | null (single matchup)
// - opponentDecks: ResolvedDeck[] (matrix mode)
// - config: SimulationUserConfig
// - result: SimulationResult | null
// - matrixResults: Map<string, SimulationResult> (for SPEC_04)
```

The View renders the input panels during `input` phase, progress during `running`, and results during `results` (SPEC_02-05 consume this).

### 3. DeckInputPanel Component

Three tabs: **My Decks**, **Paste List**, **Meta Decks**.

```typescript
// apps/web/src/web/components/DeckInputPanel/types.ts

interface ResolvedDeck {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
  readonly source: 'saved' | 'paste' | 'meta';
  readonly totalCards: number;
}

type DeckInputMode = 'saved' | 'paste' | 'meta';

interface DeckInputPanelProps {
  readonly label: string;               // "Your Deck" or "Opponent"
  readonly onDeckResolved: (deck: ResolvedDeck) => void;
  readonly onDeckCleared: () => void;
  readonly resolvedDeck: ResolvedDeck | null;
  readonly showMetaOnly?: boolean;       // true for opponent selector
}
```

**BEM class prefix**: `.deck-input-panel`

#### Mode 1: Saved Decks (SavedDeckPicker)

- On mount, check auth state. If not logged in, show a disabled tab with "Sign in to use saved decks" message.
- If logged in, fetch `GET /api/v1/decks` from `rest-api`.
- Render a scrollable list of deck names. Selecting one calls `onDeckResolved`.
- Each deck row shows: name, card count, cover card thumbnail (if available).

#### Mode 2: PTCGL Paste (PtcglPasteInput)

- Textarea with placeholder showing example PTCGL format.
- On paste or input change (debounced 300ms), run `parsePtcglList` client-side.
- Requires set abbreviation data -- fetched once from `GET /api/v1/sim/set-abbreviations`.
- Show inline validation: card count (must be 60), unresolved cards (red), resolved cards (green).
- "Use This Deck" button enabled only when 60 cards resolved with 0 errors.

#### Mode 3: Meta Archetype Picker (MetaDeckPicker)

- Fetch meta decks from `GET /api/v1/sim/meta-decks`.
- Render as card grid: archetype name, tier badge (S/A/B/C), event source, cover card image.
- Selecting one calls `onDeckResolved` with the deck's card list.
- Used for both player deck and opponent deck selection.

### 4. PTCGL Parser

```typescript
// apps/web/src/web/components/DeckInputPanel/ptcgl-parser.ts

interface PtcglParseResult {
  readonly cards: ReadonlyArray<{
    readonly cardId: string;
    readonly count: number;
    readonly rawLine: string;
    readonly resolved: boolean;
    readonly error?: string;
  }>;
  readonly totalCards: number;
  readonly errors: ReadonlyArray<{ readonly line: number; readonly message: string }>;
  readonly isValid: boolean;           // totalCards === 60 && errors.length === 0
}

interface SetAbbreviationMap {
  readonly [abbreviation: string]: string;   // e.g. "OBF" -> "sv3"
}

function parsePtcglList(
  text: string,
  setAbbreviations: SetAbbreviationMap
): PtcglParseResult;
```

Parse rules:
- Lines matching `^(\d+)\s+(.+?)\s+([A-Z0-9]+)\s+(\d+)$` are card lines: count, name, set code, number.
- Map set code + number to `cardId`: e.g. `OBF 125` -> `sv3-125` (set abbreviation `OBF` maps to `sv3`, number `125` gives `sv3-125`).
- Lines like `Pokemon: 14`, `Trainer: 32`, `Energy: 14`, `Total Cards: 60` are section headers -- skip.
- Blank lines are skipped.
- Lines starting with `#` or `//` are comments -- skip.
- Energy lines may have special format: `10 Fire Energy SVE 2` -- parse the same way.
- Any line that does not match a known pattern produces an error.

### 5. SimulationConfig Component

```typescript
// apps/web/src/web/components/SimulationConfig/types.ts

interface SimulationUserConfig {
  readonly gameCount: number;                    // 100 - 10000, default 1000
  readonly keyCardIds: ReadonlyArray<string>;     // card IDs marked for detailed analytics
  readonly formatDate: string;                    // ISO date string, default today
  readonly matchupMode: 'single' | 'matrix';     // single opponent or vs all meta
}
```

UI elements:
- **Game count slider**: logarithmic scale (100, 200, 500, 1000, 2000, 5000, 10000). Slider positions are evenly spaced; values are not linear.
- **Key card selector** (`KeyCardSelector`): renders the player's deck card list. User clicks cards to toggle "key" status. Key cards are highlighted. Max 6 key cards.
- **Format date**: date input, defaults to today (`2026-04-03`). Shows a note when date is on or after `2026-04-10` that G-mark cards rotate out.
- **Matchup mode toggle**: "Single Matchup" (pick one opponent) or "Full Meta Sweep" (auto-runs vs all meta decks). Matrix mode disables the opponent DeckInputPanel and uses all meta decks.

**BEM class prefix**: `.sim-config`

### 6. Meta Deck Seed Data Expansion

`database/seeds/data/meta_decks.json` currently has 5 decks. Expand to 8-12 archetypes covering the top Standard meta. Source decklists from Limitless TCG. Each entry must have:

```typescript
interface MetaDeckSeed {
  readonly name: string;              // "Dragapult ex / Dusknoir"
  readonly archetype: string;         // "dragapult-dusknoir" (slug)
  readonly format: 'standard';
  readonly tier: 'S' | 'A' | 'B' | 'C';
  readonly placement: string;         // "1st", "Top 8", etc.
  readonly eventName: string;
  readonly eventDate: string;         // ISO date
  readonly sourceUrl: string;         // Limitless TCG link
  readonly cards: ReadonlyArray<{ cardId: string; quantity: number }>;
}
```

New archetypes to add (suggestions -- use actual recent results):
- Charizard ex (S tier)
- Lugia VSTAR / Archeops (if still Standard-legal)
- Raging Bolt ex
- Regidrago VSTAR (if legal)
- Miraidon ex
- Snorlax Stall
- Gholdengo ex

Validate every `cardId` exists in `pokemon-data.sqlite3.db` before committing.

### 7. Seed Script for decks.sqlite3.db

Create a Bun script that reads `meta_decks.json` and inserts rows into the `decks` table:

```typescript
// apps/scripts/seed-meta-decks.ts

// Reads database/seeds/data/meta_decks.json
// For each deck:
//   INSERT INTO decks (id, name, description, format, cards, cover_card_id, created_at, updated_at)
//   - id: archetype slug (e.g. "dragapult-dusknoir")
//   - name: deck name
//   - description: "{placement} at {eventName}"
//   - format: "standard"
//   - cards: JSON.stringify(cards) — same format as seed data
//   - cover_card_id: first Pokemon card ID in the list
//   - created_at / updated_at: eventDate
```

Also add `tier`, `event_name`, `event_date`, `source_url` columns to the `decks` table if they do not exist. These are needed by the meta deck picker UI.

### 8. Bun API Routes

#### GET /api/v1/sim/meta-decks

Returns all rows from `decks.sqlite3.db` `decks` table:

```typescript
interface MetaDeckResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: string;
  readonly format: string;
  readonly cards: ReadonlyArray<{ cardId: string; quantity: number }>;
  readonly coverCardId: string;
  readonly eventName: string;
  readonly eventDate: string;
  readonly sourceUrl: string;
}
```

#### GET /api/v1/sim/set-abbreviations

Returns a JSON map of PTCGL set abbreviation to set ID. Built from `pokemon-data.sqlite3.db` `sets` table. The set table has `id` (e.g. `sv3`) and `ptcgoCode` (e.g. `OBF`) columns.

```typescript
// Response shape:
// { "OBF": "sv3", "PAL": "sv2", "MEW": "sv3pt5", ... }
```

Cache this response in memory on the Bun server -- it changes only when new sets release.

### 9. "Test This Deck" CTA on Deck Detail Page

On the existing `/decks/:deckId` page (`DeckDetailPage.tsx`), add a button/link:

```typescript
// Navigate to /simulate with deck pre-loaded via URL search params
// e.g. /simulate?deckId=abc-123&source=saved
```

The `SimulatePage` reads `deckId` and `source` from URL params on mount and auto-populates the player deck.

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/web/src/web/pages/SimulatePage/index.ts` | Barrel export | New |
| `apps/web/src/web/pages/SimulatePage/SimulatePage.tsx` | Container | New |
| `apps/web/src/web/pages/SimulatePage/SimulatePageView.tsx` | View | New |
| `apps/web/src/web/pages/SimulatePage/SimulatePage.css` | Styles | New |
| `apps/web/src/web/components/DeckInputPanel/index.ts` | Barrel | New |
| `apps/web/src/web/components/DeckInputPanel/DeckInputPanel.tsx` | Container | New |
| `apps/web/src/web/components/DeckInputPanel/DeckInputPanelView.tsx` | View | New |
| `apps/web/src/web/components/DeckInputPanel/SavedDeckPicker.tsx` | Mode 1 | New |
| `apps/web/src/web/components/DeckInputPanel/PtcglPasteInput.tsx` | Mode 2 | New |
| `apps/web/src/web/components/DeckInputPanel/MetaDeckPicker.tsx` | Mode 3 | New |
| `apps/web/src/web/components/DeckInputPanel/ptcgl-parser.ts` | Parser logic | New |
| `apps/web/src/web/components/DeckInputPanel/types.ts` | Types | New |
| `apps/web/src/web/components/DeckInputPanel/DeckInputPanel.css` | Styles | New |
| `apps/web/src/web/components/SimulationConfig/index.ts` | Barrel | New |
| `apps/web/src/web/components/SimulationConfig/SimulationConfig.tsx` | Container | New |
| `apps/web/src/web/components/SimulationConfig/SimulationConfigView.tsx` | View | New |
| `apps/web/src/web/components/SimulationConfig/KeyCardSelector.tsx` | Key card UI | New |
| `apps/web/src/web/components/SimulationConfig/types.ts` | Types | New |
| `apps/web/src/web/components/SimulationConfig/SimulationConfig.css` | Styles | New |
| `apps/web/src/web/routes/routes.tsx` | Add `/simulate` route | Modify |
| `apps/web/src/server/lib/routes.ts` | Add route pattern + API routes | Modify |
| `apps/scripts/seed-meta-decks.ts` | Seed script | New |
| `database/seeds/data/meta_decks.json` | Expand to 8-12 decks | Modify |
| `apps/web/src/web/pages/DeckDetailPage.tsx` | Add "Test This Deck" CTA | Modify |

---

## Acceptance Criteria

- [ ] `/simulate` renders the SimulatePage with DeckInputPanel and SimulationConfig visible
- [ ] Tab switching between My Decks / Paste List / Meta Decks works; each tab renders its content
- [ ] My Decks tab shows "Sign in to use saved decks" when user is not authenticated
- [ ] My Decks tab fetches and displays user decks when authenticated
- [ ] PTCGL paste parser correctly resolves `4 Charizard ex OBF 125` to `{ cardId: "sv3-125", count: 4 }`
- [ ] PTCGL parser handles all section headers (Pokemon, Trainer, Energy, Total Cards) without error
- [ ] PTCGL parser produces error entries for unresolvable lines
- [ ] Paste mode shows card count validation (red if not 60, green if 60)
- [ ] `GET /api/v1/sim/set-abbreviations` returns a JSON map with at least 20 set entries
- [ ] `GET /api/v1/sim/meta-decks` returns seeded meta decks with tier, cards, and event info
- [ ] Meta Deck Picker renders all seeded archetypes with tier badges
- [ ] `database/seeds/data/meta_decks.json` contains at least 8 archetypes
- [ ] `apps/scripts/seed-meta-decks.ts` runs without error and populates `decks.sqlite3.db`
- [ ] Game count slider has 7 discrete positions (100, 200, 500, 1000, 2000, 5000, 10000)
- [ ] Key card selector allows toggling up to 6 cards, prevents selecting more than 6
- [ ] Format date input defaults to today and shows rotation warning for dates >= 2026-04-10
- [ ] Matchup mode toggle switches between single and matrix mode
- [ ] `/decks/:deckId` page has a "Test This Deck" button that navigates to `/simulate?deckId=...&source=saved`
- [ ] `SimulatePage` auto-populates player deck when `deckId` URL param is present
- [ ] `bunx tsc --noEmit` reports 0 errors for all new files
- [ ] `bun test` passes for `ptcgl-parser.ts` with at least 10 test cases

---

## Out of Scope

- Simulation execution (SPEC_02)
- Analytics rendering (SPEC_03)
- Matchup matrix grid UI (SPEC_04)
- Replay viewer (SPEC_05)
- Deck validation against Standard format (engine handles this at simulation time)
- Custom deck building (existing DeckBuilderPage covers this)
- Importing from other formats (PTCGL only for now)

---

## Verification

```bash
# Route is registered
grep -n 'simulate' apps/web/src/web/routes/routes.tsx

# Components exist
ls apps/web/src/web/pages/SimulatePage/SimulatePage.tsx
ls apps/web/src/web/components/DeckInputPanel/ptcgl-parser.ts
ls apps/web/src/web/components/SimulationConfig/SimulationConfig.tsx

# Seed script runs
bun run apps/scripts/seed-meta-decks.ts

# Meta decks seeded
sqlite3 database/decks.sqlite3.db "SELECT count(*) FROM decks;"
# Expected: >= 8

# Type check
cd apps/web && bunx tsc --noEmit

# Parser tests
bun test apps/web/src/web/components/DeckInputPanel/__tests__/ptcgl-parser.test.ts
```
