# SPEC_01: Card Search by Use Case

## Context

Players don't think in card text — they think in intent. "I need energy acceleration" is a
completely different query from `supertype = 'Trainer' AND text LIKE '%attach%energy%'`. The
existing BrowsePage supports name/set search only. This spec adds a semantic use-case filter layer
that works on BrowsePage, in the DeckBuilder card search, and eventually as a deck gap detector.

The tagging model is rule-based: auto-generated from card text patterns in SQLite at startup,
no external ML dependencies, no new Postgres tables for v1.

---

## Prerequisites

None — this spec is standalone.

---

## Requirements

### 1. Tag Taxonomy

```typescript
// apps/web/src/types/card-tags.ts  (new)
// apps/rest-api/src/types/index.ts  (add CardFunctionalTag)

export type CardFunctionalTag =
  | 'draw'               // draw cards, shuffle-draw supporters
  | 'pokemon_search'     // search deck for Pokemon
  | 'trainer_search'     // search deck for Trainers/Items
  | 'energy_search'      // search deck for Energy
  | 'energy_acceleration'// attach extra energy per turn
  | 'energy_recovery'    // retrieve energy from discard
  | 'hand_disruption'    // discard from opponent's hand
  | 'ability_lock'       // prevents abilities
  | 'item_lock'          // prevents Items
  | 'stadium_removal'    // remove opponent's stadium
  | 'switch'             // switch active Pokemon
  | 'pivot'              // retreat/switch mechanics (energy or card)
  | 'bench_setup'        // put Pokemon onto bench from hand/deck
  | 'discard_recovery'   // retrieve cards from discard pile
  | 'spread_damage'      // damage all or multiple Pokemon
  | 'healing'            // remove damage counters
  | 'boss_gust';         // gust opponent's benched Pokemon to active
```

### 2. Tag Pattern Map (Backend)

A static map from tag → array of SQLite LIKE patterns applied to `pokemon_cards.rules` and
`pokemon_cards.abilities`. Loaded once at server startup into `DatabaseService`.

```typescript
// apps/rest-api/src/utils/card-tag-patterns.ts  (new)

export const TAG_PATTERNS: Record<string, string[]> = {
  draw: [
    '%draw % card%',
    '%draw until%',
    '%draw 2%',
    '%draw 3%'
  ],
  pokemon_search: [
    '%search your deck for a%pokemon%',
    '%look at the top%',
    '%put a pokemon from your deck%'
  ],
  energy_search: [
    '%search your deck for%energy%',
    '%basic energy card from your deck%'
  ],
  energy_acceleration: [
    '%attach%energy%from your deck%',
    '%attach%energy%from your hand%',
    '%attach an extra%energy%'
  ],
  energy_recovery: [
    '%energy%from your discard%',
    '%retrieve%energy%'
  ],
  hand_disruption: [
    '%opponent shuffles%hand%',
    '%opponent discards%',
    '%each player discards%'
  ],
  ability_lock: [
    '%abilities%are blocked%',
    "%pokemon's abilities%can't be used%"
  ],
  item_lock: [
    "%can't play any item%",
    "%player can't play item%"
  ],
  stadium_removal: [
    '%discard%stadium%',
    '%remove%stadium%'
  ],
  switch: [
    '%switch your active%',
    '%move to your bench%'
  ],
  pivot: [
    '%retreat cost%',
    '%switch to your bench%',
    '%retreat for free%'
  ],
  bench_setup: [
    '%put%pokemon%onto your bench%',
    '%put%basic pokemon%'
  ],
  discard_recovery: [
    '%from your discard pile%',
    '%recovery%discard%'
  ],
  spread_damage: [
    '%damage to each%',
    '%damage counter%on each%'
  ],
  healing: [
    '%remove%damage counter%',
    '%heal%damage%'
  ],
  boss_gust: [
    "%switch 1 of your opponent's benched%",
    "%move your opponent's active%"
  ]
};
```

### 3. DatabaseService — Tag Query Method

Add `findCardsByTags` to `apps/rest-api/src/services/database.ts`:

```typescript
// In DatabaseService class:

findCardsByTags(tags: string[], limit = 60, offset = 0): CardRow[] {
  if (tags.length === 0) return [];

  const patterns = tags.flatMap((tag) => TAG_PATTERNS[tag] ?? []);
  if (patterns.length === 0) return [];

  // OR across all patterns — any match qualifies
  const clauses = patterns.map(() =>
    "(LOWER(COALESCE(rules, '')) LIKE ? OR LOWER(COALESCE(abilities, '')) LIKE ?)"
  ).join(' OR ');

  const bindings = patterns.flatMap((p) => [p.toLowerCase(), p.toLowerCase()]);

  return this.query<CardRow>(
    `SELECT DISTINCT * FROM pokemon_cards WHERE ${clauses} LIMIT ? OFFSET ?`,
    ...bindings,
    limit,
    offset
  );
}
```

### 4. Meta Usage Enrichment

The endpoint enriches tag results with a `metaUsageCount` — how many meta deck slots reference
each card across all meta decks. This drives ranking. Query is cross-DB (SQLite card IDs →
Postgres meta_deck_cards count).

```typescript
// apps/rest-api/src/handlers/cards.ts — new handler

export const getCardsByUseCase: Handler<Services> = async (ctx) => {
  const tagsParam = ctx.query.get('tags') ?? '';
  const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);

  if (tags.length === 0) {
    return ctx.badRequest('At least one tag is required');
  }

  const limitParam = Number(ctx.query.get('limit') ?? '48');
  const limit = Math.min(100, Math.max(1, limitParam));

  const cardRows = ctx.services.db.findCardsByTags(tags, limit) as CardRow[];
  if (cardRows.length === 0) {
    return ctx.json({ data: [], tags });
  }

  // Enrich with meta usage from Postgres
  const cardIds = cardRows.map((r) => r.id);
  const usageMap = await ctx.services.pg.getMetaUsageCounts(cardIds);

  const cards = cardRows
    .map((row) => {
      const setRow = ctx.services.db.findSetById(row.set_id) as SetRow | null;
      const card = setRow
        ? transformCardRowWithSet(row, setRow)
        : transformCardRow(row);
      return {
        ...card,
        metaUsageCount: usageMap.get(row.id) ?? 0
      };
    })
    // Sort: highest meta usage first, then alphabetical
    .sort((a, b) => b.metaUsageCount - a.metaUsageCount || a.name.localeCompare(b.name));

  return ctx.json({ data: cards, tags });
};
```

### 5. PostgresService — getMetaUsageCounts

```typescript
// apps/rest-api/src/services/postgres.ts — new method

async getMetaUsageCounts(cardIds: string[]): Promise<Map<string, number>> {
  if (cardIds.length === 0) return new Map();

  const rows = await this.sql<{ card_id: string; usage_count: string }[]>`
    SELECT card_id, COUNT(*)::text AS usage_count
    FROM meta_deck_cards
    WHERE card_id = ANY(${cardIds})
    GROUP BY card_id
  `;

  return new Map(rows.map((r) => [r.card_id, Number(r.usage_count)]));
}
```

### 6. Route Registration

```typescript
// apps/rest-api/src/index.ts
// Add to cards router (public, no auth):
cardsBrowse.get('/use-case', getCardsByUseCase);
```

Endpoint: `GET /api/v1/cards/use-case?tags=energy_acceleration&limit=48`

Multi-tag: `GET /api/v1/cards/use-case?tags=draw,bench_setup`

### 7. Frontend Service

```typescript
// apps/web/src/web/services/CardsService.ts — add method

static async getByUseCases(
  tags: CardFunctionalTag[],
  limit = 48
): Promise<APIResponse<UseCaseCardResult[]>> {
  const params = new URLSearchParams({
    tags: tags.join(','),
    limit: String(limit)
  });
  return apiFetch<UseCaseCardResult[]>(`/api/v1/cards/use-case?${params}`);
}
```

### 8. Frontend Hook

```typescript
// apps/web/src/web/hooks/useUseCaseCards.ts  (new)

import { useQuery } from '@tanstack/react-query';
import { CardsService } from '../services/CardsService';
import type { CardFunctionalTag } from '../../types/card-tags';

export function useUseCaseCards(tags: CardFunctionalTag[], enabled = true) {
  return useQuery({
    queryKey: ['cards', 'use-case', tags],
    queryFn: () => CardsService.getByUseCases(tags),
    enabled: enabled && tags.length > 0,
    staleTime: 5 * 60 * 1000 // 5 min — tag results don't change often
  });
}
```

### 9. BrowsePage Integration

BrowsePage gets a new search mode toggle: **Name Search** (existing) | **Use Case** (new).

When Use Case mode is active, a tag pill selector replaces the text input. Selected tags are
reflected in URL params (`?mode=use-case&tags=draw,bench_setup`) for shareability.

```
┌──────────────────────────────────────────────────────────┐
│  [ Name Search ]  [ Use Case ]   ← mode toggle           │
│                                                           │
│  Use Case active:                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [draw ×]  [energy acceleration ×]  [+ Add tag]   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Results sorted by meta usage count                       │
└──────────────────────────────────────────────────────────┘
```

Tag pill selector shows all 16 tags grouped by category. Selecting a tag adds it to the active set.

### 10. DeckBuilder Integration (Deck-Aware Mode)

When accessed from `DeckBuilderPage`, the use case search gains context: the current deck's
archetype (inferred from the highest-count Pokemon card). Cards already in the deck appear with a
checkmark badge. Cards used frequently in the same archetype (from meta decks) are ranked first.

This is the "deck lacks mobility" detection surface. When a deck has no `switch` or `pivot` tagged
cards, the builder can show a passive hint chip:

```
⚠ Your deck has no switch/pivot cards — add one?  [Search mobility →]
```

Clicking the chip opens a tag search scoped to `['switch', 'pivot']`.

---

## File Structure

```
apps/rest-api/src/
├── handlers/cards.ts             MODIFIED — add getCardsByUseCase
├── services/postgres.ts          MODIFIED — add getMetaUsageCounts
├── services/database.ts          MODIFIED — add findCardsByTags
└── utils/card-tag-patterns.ts    NEW — TAG_PATTERNS map

apps/web/src/
├── types/card-tags.ts            NEW — CardFunctionalTag union type
├── web/hooks/useUseCaseCards.ts  NEW
├── web/services/CardsService.ts  MODIFIED — add getByUseCases
└── web/pages/BrowsePage.tsx      MODIFIED — mode toggle + tag pill UI
```

---

## Acceptance Criteria

- [ ] `GET /api/v1/cards/use-case?tags=energy_acceleration` returns Electric Generator, Baxcalibur, Mirage Gate (among others)
- [ ] Results are sorted by metaUsageCount descending
- [ ] Multi-tag query (`tags=draw,bench_setup`) returns cards matching either tag (OR)
- [ ] BrowsePage has "Use Case" mode toggle, tag pill selector, and renders tag results in CardGrid
- [ ] URL params `?mode=use-case&tags=draw` are reflected in browser URL and bookmarkable
- [ ] DeckBuilderPage card search panel has a "Use Case" tab
- [ ] Gap detection hint chip renders when deck has 0 switch/pivot cards
- [ ] `bun run check-types` clean, no `any` introduced
- [ ] Invalid tag param returns 400 with message listing valid tags
- [ ] Empty result set returns `{ data: [], tags }` not 404

---

## Dependencies

None — no new Postgres migrations required. Tag computation is runtime SQLite text matching.

---

## Verification

```bash
# Type check
cd apps/web && bun run check-types
cd apps/rest-api && bun run check-types

# Smoke test endpoint
curl "http://localhost:8080/api/v1/cards/use-case?tags=energy_acceleration" \
  | jq '.data[0:3] | map(.name)'
# Expected: cards like Electric Generator, Baxcalibur, Mirage Gate

# Multi-tag
curl "http://localhost:8080/api/v1/cards/use-case?tags=draw,bench_setup" \
  | jq '.data | length'
# Expected: > 0

# Invalid tag
curl "http://localhost:8080/api/v1/cards/use-case?tags=not_a_tag" -i | head -1
# Expected: HTTP 400
```
