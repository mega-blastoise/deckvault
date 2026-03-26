# SPEC_02: Rapid Deck Scaffolder

## Context

Players currently copy a deck list, manually strip out cards they lack, and rebuild from scratch.
This spec builds a meta-aware scaffolding engine that produces a structured 60-card foundation in
one action — with cards classified by role (core/engine/consistency/tech) so players know exactly
what is fixed and what is flex.

The algorithm is pure in-process computation over the existing `meta_decks` + `meta_deck_cards`
Postgres tables. No new data sources required.

---

## Prerequisites

- **SPEC_01 shipped** — use case tag search powers the "deck gap → tag search" loop in the
  scaffolder UI
- `meta_decks` table populated with archetype + format data (already exists, seeded in production)

---

## Requirements

### 1. Data Types

```typescript
// apps/rest-api/src/types/index.ts  (extend)
// apps/web/src/types/scaffold.ts    (new)

export type ScaffoldTier = 'core' | 'engine' | 'consistency' | 'tech';

export interface ScaffoldCard {
  card: {
    id: string;
    name: string;
    supertype: string;
    subtypes?: string[];
    number: string;
    regulationMark?: string;
    images?: { small: string; large: string };
    set: { id: string; name: string; ptcgoCode?: string };
  };
  quantity: number;
  frequency: number;  // 0.0–1.0 — fraction of cluster decks containing this card
  tier: ScaffoldTier;
}

export interface ScaffoldDeck {
  archetype: string;
  variant: string;
  format: string;
  clusterSize: number;       // number of meta decks this scaffold is derived from
  totalCards: number;        // sum of all card quantities
  flexSlots: number;         // 60 - totalCards
  core: ScaffoldCard[];      // frequency ≥ 0.9
  engine: ScaffoldCard[];    // 0.7 ≤ frequency < 0.9
  consistency: ScaffoldCard[]; // 0.4 ≤ frequency < 0.7
  tech: ScaffoldCard[];      // 0.1 ≤ frequency < 0.4
}

export interface ScaffoldRequest {
  archetype: string;   // e.g. "dragapult"  (case-insensitive partial match)
  variant?: string;    // optional — "turbo" | "control" | undefined (picks most common)
  format?: string;     // "standard" | "expanded" — default "standard"
}
```

### 2. Scaffolding Algorithm

All computation is server-side in the handler. No pre-computed tables needed for v1.

```
Step 1 — Collect cluster
  Query meta_decks WHERE archetype ILIKE '%{archetype}%' AND format = {format}
  → rows: MetaDeckRow[]

  If variant provided:
    filter rows where name ILIKE '%{variant}%'
  If < 3 decks after filter:
    fall back to full archetype cluster

Step 2 — Aggregate card frequencies
  For each deck in cluster:
    fetch meta_deck_cards
    build cardId → total_quantity map for that deck

  Aggregate across cluster:
    cardAppearances[cardId] = count of decks containing this card
    cardAvgQuantity[cardId] = avg quantity across decks that include it

  frequency[cardId] = cardAppearances[cardId] / cluster.length

Step 3 — Classify tiers
  core         = frequency ≥ 0.90
  engine       = 0.70 ≤ frequency < 0.90
  consistency  = 0.40 ≤ frequency < 0.70
  tech         = 0.10 ≤ frequency < 0.40
  (below 0.10 excluded)

Step 4 — Compute quantities
  For each card in tier:
    quantity = Math.round(cardAvgQuantity[cardId])
    quantity = Math.min(quantity, 4)  // enforce 4-copy limit

Step 5 — Hydrate cards from SQLite
  Batch lookup cardIds in pokemon_cards + sets

Step 6 — Fill to 60
  totalCards = sum of all quantities
  flexSlots = 60 - totalCards  (exposed to frontend — user fills these)
```

### 3. PostgresService Methods

```typescript
// apps/rest-api/src/services/postgres.ts — new methods

// Get all decks for an archetype cluster
async getArchetypeCluster(
  archetype: string,
  format: string,
  variant?: string
): Promise<MetaDeckRow[]> {
  let rows = await this.sql<MetaDeckRow[]>`
    SELECT * FROM meta_decks
    WHERE LOWER(archetype) LIKE ${'%' + archetype.toLowerCase() + '%'}
    AND format = ${format}
    ORDER BY event_date DESC
  `;

  if (variant) {
    const filtered = rows.filter((r) =>
      r.name.toLowerCase().includes(variant.toLowerCase())
    );
    if (filtered.length >= 3) rows = filtered;
  }

  return rows;
}

// Get all card rows for multiple meta deck IDs in one query
async getMetaDeckCardsBatch(
  deckIds: string[]
): Promise<{ deck_id: string; card_id: string; quantity: number }[]> {
  if (deckIds.length === 0) return [];
  return this.sql`
    SELECT deck_id, card_id, quantity
    FROM meta_deck_cards
    WHERE deck_id = ANY(${deckIds})
  `;
}
```

### 4. Scaffold Handler

```typescript
// apps/rest-api/src/handlers/scaffold.ts  (new)

import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import type { ScaffoldDeck, ScaffoldCard, ScaffoldTier } from '../types';
import { transformCardRowWithSet, transformCardRow } from '../utils/transforms';

function classifyTier(frequency: number): ScaffoldTier | null {
  if (frequency >= 0.9) return 'core';
  if (frequency >= 0.7) return 'engine';
  if (frequency >= 0.4) return 'consistency';
  if (frequency >= 0.1) return 'tech';
  return null;
}

export const generateScaffold: Handler<Services> = async (ctx) => {
  const body = await ctx.request.json() as {
    archetype?: string;
    variant?: string;
    format?: string;
  };

  const archetype = body.archetype?.trim();
  if (!archetype) return ctx.badRequest('archetype is required');

  const format = body.format ?? 'standard';
  const variant = body.variant?.trim();

  const cluster = await ctx.services.pg.getArchetypeCluster(archetype, format, variant);
  if (cluster.length === 0) {
    return ctx.notFound(`No meta decks found for archetype: ${archetype}`);
  }

  const deckIds = cluster.map((d) => d.id);
  const allCards = await ctx.services.pg.getMetaDeckCardsBatch(deckIds);

  // Build per-deck card maps
  const deckCardMaps = new Map<string, Map<string, number>>();
  for (const row of allCards) {
    if (!deckCardMaps.has(row.deck_id)) {
      deckCardMaps.set(row.deck_id, new Map());
    }
    deckCardMaps.get(row.deck_id)!.set(row.card_id, row.quantity);
  }

  // Aggregate frequencies
  const appearances = new Map<string, number>();
  const totalQty = new Map<string, number>();

  for (const deck of cluster) {
    const cardMap = deckCardMaps.get(deck.id) ?? new Map();
    for (const [cardId, qty] of cardMap) {
      appearances.set(cardId, (appearances.get(cardId) ?? 0) + 1);
      totalQty.set(cardId, (totalQty.get(cardId) ?? 0) + qty);
    }
  }

  const clusterSize = cluster.length;

  // Classify and build scaffold cards
  const classified: { cardId: string; frequency: number; quantity: number; tier: ScaffoldTier }[] = [];
  for (const [cardId, count] of appearances) {
    const frequency = count / clusterSize;
    const tier = classifyTier(frequency);
    if (!tier) continue;
    const avgQty = totalQty.get(cardId)! / count;
    classified.push({ cardId, frequency, quantity: Math.min(4, Math.round(avgQty)), tier });
  }

  // Hydrate from SQLite
  const uniqueIds = classified.map((c) => c.cardId);
  const placeholders = uniqueIds.map(() => '?').join(',');
  const cardRows = ctx.services.db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE id IN (${placeholders})`,
    ...uniqueIds
  );
  const cardMap = new Map(cardRows.map((r) => [r.id, r]));

  function hydrateScaffoldCard(
    c: { cardId: string; frequency: number; quantity: number; tier: ScaffoldTier }
  ): ScaffoldCard | null {
    const row = cardMap.get(c.cardId);
    if (!row) return null;
    const setRow = ctx.services.db.findSetById(row.set_id) as SetRow | null;
    const card = setRow ? transformCardRowWithSet(row, setRow) : transformCardRow(row);
    return { card, quantity: c.quantity, frequency: c.frequency, tier: c.tier };
  }

  const grouped: Record<ScaffoldTier, ScaffoldCard[]> = {
    core: [], engine: [], consistency: [], tech: []
  };

  for (const c of classified) {
    const hydrated = hydrateScaffoldCard(c);
    if (hydrated) grouped[c.tier].push(hydrated);
  }

  // Sort each tier by frequency desc
  for (const tier of Object.values(grouped)) {
    tier.sort((a, b) => b.frequency - a.frequency);
  }

  const totalCards = Object.values(grouped)
    .flat()
    .reduce((sum, c) => sum + c.quantity, 0);

  const result: ScaffoldDeck = {
    archetype: cluster[0]?.archetype ?? archetype,
    variant: variant ?? 'default',
    format,
    clusterSize,
    totalCards,
    flexSlots: Math.max(0, 60 - totalCards),
    ...grouped
  };

  return ctx.json({ data: result });
};
```

### 5. Route Registration

```typescript
// apps/rest-api/src/index.ts
// New public router:
import { generateScaffold } from './handlers/scaffold';

const scaffoldRouter = createRouter('/api/v1/scaffold');
scaffoldRouter.post('/', generateScaffold);
app.use(scaffoldRouter.routes());
```

Endpoint: `POST /api/v1/scaffold`

Body: `{ "archetype": "dragapult", "variant": "turbo", "format": "standard" }`

### 6. Frontend Service

```typescript
// apps/web/src/web/services/ScaffoldService.ts  (new)

import type { ScaffoldDeck, ScaffoldRequest } from '../../types/scaffold';
import { apiFetch } from './index';

export const ScaffoldService = {
  generate(req: ScaffoldRequest): Promise<APIResponse<ScaffoldDeck>> {
    return apiFetch<ScaffoldDeck>('/api/v1/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  }
};
```

### 7. Frontend Hook

```typescript
// apps/web/src/web/hooks/useScaffold.ts  (new)

import { useMutation } from '@tanstack/react-query';
import { ScaffoldService } from '../services/ScaffoldService';
import type { ScaffoldRequest } from '../../types/scaffold';

export function useScaffold() {
  return useMutation({
    mutationFn: (req: ScaffoldRequest) => ScaffoldService.generate(req)
  });
}
```

### 8. ScaffolderPage

New page at `/scaffold`. Accessible from:
- **MetaDeckBrowserPage**: "Scaffold this archetype" button on each MetaDeckCard
- **DeckBuilderPage** header: "Start from scaffold" CTA (shown when deck is empty)
- **Navbar** (optional fast-follow — omit for v1 to keep nav clean)

```
Route: /scaffold
Route: /scaffold?archetype=dragapult&format=standard   (deep-linkable from MetaDeckCard)
```

#### Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Scaffold a Deck                                               │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Archetype: [dragapult        ]  Format: [Standard ▼]    │ │
│  │  Variant:   [turbo (optional) ]                           │ │
│  │                                [Generate Scaffold →]      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ─── Generated from 12 meta decks ───────────────────────── │
│                                                                │
│  CORE  (always include)              ████████████ 100%        │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Dragapult ex ×3   Phantump ×4   Drakloak ×2  ...     │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  ENGINE  (strongly recommended)      ████████     80%         │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Iono ×4   Professor's Research ×3   ...              │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  CONSISTENCY  (recommended)          ███████      60%         │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Switch ×2   Nest Ball ×4   ...                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  TECH  (meta-dependent)              ████         30%         │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Counter Catcher ×1   Lost Vacuum ×2  ...             │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  FLEX SLOTS: 4  [Search use cases to fill →]                  │
│                                                                │
│  [Clone to Deck Builder]                                       │
└────────────────────────────────────────────────────────────────┘
```

#### Key Interactions

**"Search use cases to fill →"** (flex slots CTA):
Opens BrowsePage in use-case mode, scoped to cards not already in the scaffold.
URL: `/browse?mode=use-case&exclude=<comma-separated-cardIds-in-scaffold>`

**"Clone to Deck Builder"**:
Calls `POST /api/v1/decks` with the scaffold's flat card list (core + engine + consistency + tech),
then redirects to `/decks/:newId/edit`. Requires auth — shows sign-in prompt if unauthenticated.

**Frequency bar** on each tier header:
A horizontal bar showing the frequency threshold for that tier. Visual only — uses existing
Nebula CSS vars (`--focus-ring` for core, descending opacity for lower tiers).

### 9. MetaDeckCard Integration

Add a "Scaffold →" button to `MetaDeckCard.tsx` that navigates to:
`/scaffold?archetype={deck.archetype}&format={deck.format}`

```typescript
// apps/web/src/web/components/MetaDeckCard/MetaDeckCard.tsx
// Add to card footer alongside existing "Clone to Builder" button:
<Link
  to={`${ROUTES.SCAFFOLD}?archetype=${encodeURIComponent(deck.archetype)}&format=${deck.format}`}
  className="pokemon-meta-deck-card__scaffold-btn"
>
  Scaffold →
</Link>
```

---

## File Structure

```
apps/rest-api/src/
├── handlers/scaffold.ts            NEW
├── services/postgres.ts            MODIFIED — getArchetypeCluster, getMetaDeckCardsBatch
└── types/index.ts                  MODIFIED — ScaffoldDeck, ScaffoldCard, ScaffoldTier, ScaffoldRequest

apps/web/src/
├── types/scaffold.ts               NEW — ScaffoldDeck, ScaffoldCard, ScaffoldTier, ScaffoldRequest
├── web/hooks/useScaffold.ts        NEW
├── web/services/ScaffoldService.ts NEW
├── web/pages/ScaffolderPage/
│   ├── index.ts                    NEW
│   ├── ScaffolderPage.tsx          NEW
│   └── ScaffolderPage.css          NEW
├── web/components/MetaDeckCard/
│   └── MetaDeckCard.tsx            MODIFIED — Scaffold → button
└── web/routes/
    ├── index.tsx                   MODIFIED — ROUTES.SCAFFOLD = '/scaffold'
    └── routes.tsx                  MODIFIED — /scaffold route
```

---

## Acceptance Criteria

- [ ] `POST /api/v1/scaffold` with `{ archetype: "dragapult", format: "standard" }` returns a valid `ScaffoldDeck` with at least one card in `core`
- [ ] Scaffold `totalCards + flexSlots = 60`
- [ ] Each card's `frequency` matches its tier threshold (core ≥ 0.9, etc.)
- [ ] `clusterSize` in the response reflects actual number of meta decks used
- [ ] ScaffolderPage renders all four tiers with card names and quantities
- [ ] Flex slots count renders and "Search use cases to fill" navigates to BrowsePage in use-case mode
- [ ] "Clone to Deck Builder" creates a deck and redirects to the editor (requires auth)
- [ ] MetaDeckCard has a "Scaffold →" link to `/scaffold?archetype=...`
- [ ] `?archetype=` and `?format=` URL params pre-populate the form on page load
- [ ] Archetype not found returns 404 with helpful message
- [ ] `bun run check-types` clean, no `any` introduced
- [ ] No new Postgres migrations required (uses existing meta_decks + meta_deck_cards)

---

## Dependencies

- **SPEC_01** must be shipped for the "Search use cases to fill" deep-link to work
- `meta_decks` table must have ≥ 1 row with `meta_deck_cards` to produce a non-empty scaffold
  (already true in production — seeded data exists)

---

## Verification

```bash
# Type check
cd apps/rest-api && bun run check-types
cd apps/web && bun run check-types

# Scaffold endpoint
curl -X POST http://localhost:8080/api/v1/scaffold \
  -H "Content-Type: application/json" \
  -d '{"archetype":"dragapult","format":"standard"}' \
  | jq '{archetype:.data.archetype, clusterSize:.data.clusterSize, coreCount:(.data.core | length), flex:.data.flexSlots}'

# Expected: clusterSize > 0, coreCount > 0, flex ≥ 0

# Not found
curl -X POST http://localhost:8080/api/v1/scaffold \
  -H "Content-Type: application/json" \
  -d '{"archetype":"doesnotexist","format":"standard"}' -i | head -1
# Expected: HTTP 404
```
