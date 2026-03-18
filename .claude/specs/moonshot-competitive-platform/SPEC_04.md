# SPEC_04: Deck Evolution Tracking

## Context

Limitless TCG shows tournament snapshots but no deck evolution — players can't see how archetypes
changed week-over-week. For personal decks, there's no version history at all. This spec adds
automatic version snapshots and a diff view that shows exactly what changed between any two versions.

---

## Prerequisites

- SPEC_01 complete (routing)
- Existing deck CRUD endpoints (`apps/rest-api/src/handlers/decks.ts`)

---

## Requirements

### 1. Database: Deck Versions

New migration: `database/migrations/005_deck_versions.sql`

```sql
-- Snapshot of a deck at a point in time
CREATE TABLE deck_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,           -- monotonically increasing per deck
  label      VARCHAR(80),               -- optional user label e.g. "Pre-Regional"
  cards      JSONB NOT NULL,            -- full card list snapshot: [{cardId, quantity}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (deck_id, version)
);

CREATE INDEX idx_deck_versions_deck ON deck_versions(deck_id);
```

The `cards` JSONB column stores the minimal snapshot: `[{ "cardId": "sv1-1", "quantity": 4 }, ...]`.
Card metadata is hydrated from SQLite at read time (same pattern as the existing `hydrateCards` function).

### 2. Auto-Snapshot on Deck Save

Every time `PUT /api/v1/decks/:id` succeeds, a new version snapshot is created automatically.
This is a background operation — it must not block the response.

```typescript
// apps/rest-api/src/handlers/decks.ts
// After the deck update succeeds:

async function createVersionSnapshot(
  db: DatabaseService,
  deckId: string,
  cards: { cardId: string; quantity: number }[]
): Promise<void> {
  const { rows } = await db.pg.query<{ max: number | null }>(
    'SELECT MAX(version) as max FROM deck_versions WHERE deck_id = $1',
    [deckId]
  );
  const nextVersion = (rows[0]?.max ?? 0) + 1;

  await db.pg.query(
    `INSERT INTO deck_versions (deck_id, version, cards)
     VALUES ($1, $2, $3)`,
    [deckId, nextVersion, JSON.stringify(cards)]
  );
}

// In updateDeck handler — after successful pg update:
// createVersionSnapshot(db, deckId, updatedCards).catch(console.error);
```

Keep at most **50 versions per deck** (rolling window). Add a cleanup query after insert:

```sql
DELETE FROM deck_versions
WHERE deck_id = $1
  AND version NOT IN (
    SELECT version FROM deck_versions
    WHERE deck_id = $1
    ORDER BY version DESC
    LIMIT 50
  );
```

### 3. REST API: Version Endpoints

```typescript
// GET /api/v1/decks/:id/versions
// Returns: { versions: VersionSummary[], total: number }
// VersionSummary: { id, version, label, createdAt, cardCount }

// GET /api/v1/decks/:id/versions/:versionId
// Returns: VersionDetail — includes full hydrated card list

// PUT /api/v1/decks/:id/versions/:versionId/label
// Body: { label: string }
// Returns: updated VersionSummary

// GET /api/v1/decks/:id/versions/diff?a=:versionIdA&b=:versionIdB
// Returns: DeckDiff
```

```typescript
interface DeckDiff {
  versionA: VersionSummary;
  versionB: VersionSummary;
  added: { card: Pokemon.Card; quantity: number; deltaQuantity: number }[];    // in B, not in A (or more quantity)
  removed: { card: Pokemon.Card; quantity: number; deltaQuantity: number }[];  // in A, not in B (or less quantity)
  unchanged: { card: Pokemon.Card; quantity: number }[];
}
```

Diff computation (pure function, compute server-side):

```typescript
function computeDiff(
  cardsA: { cardId: string; quantity: number }[],
  cardsB: { cardId: string; quantity: number }[]
): { added: ..., removed: ..., unchanged: ... } {
  const mapA = new Map(cardsA.map((c) => [c.cardId, c.quantity]));
  const mapB = new Map(cardsB.map((c) => [c.cardId, c.quantity]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const added: typeof result.added = [];
  const removed: typeof result.removed = [];
  const unchanged: typeof result.unchanged = [];

  for (const id of allIds) {
    const qA = mapA.get(id) ?? 0;
    const qB = mapB.get(id) ?? 0;
    if (qB > qA) added.push({ cardId: id, quantity: qB, deltaQuantity: qB - qA });
    else if (qB < qA) removed.push({ cardId: id, quantity: qA, deltaQuantity: qA - qB });
    else unchanged.push({ cardId: id, quantity: qA });
  }
  return { added, removed, unchanged };
}
```

### 4. Version History UI

New tab in `DeckDetailPage` — "History":

```
┌─────────────────────────────────────────────┐
│  Version History                  [Compare] │
│                                             │
│  ● v12  Today 14:32     "Pre-Regional"  [↺] │
│  ○ v11  Mar 15 09:18                    [↺] │
│  ○ v10  Mar 12 17:45                    [↺] │
│  ○ v9   Mar 10 11:02    "Post-testing"  [↺] │
│  ...                          [Load more]   │
└─────────────────────────────────────────────┘
```

```typescript
// apps/web/src/web/components/DeckVersionHistory/DeckVersionHistory.tsx

interface DeckVersionHistoryProps {
  deckId: string;
}

export function DeckVersionHistory({ deckId }: DeckVersionHistoryProps) {
  const { data, fetchNextPage, hasNextPage } = useInfiniteVersionsQuery(deckId);
  const [selected, setSelected] = useState<[string?, string?]>([]);

  // ... render version list with checkboxes for comparison
  // "Compare" button enabled when exactly 2 are selected
}
```

The `[↺]` restore button shows a confirmation dialog before restoring a version as the current deck state.

### 5. Diff View Component

```typescript
// apps/web/src/web/components/DeckDiffView/DeckDiffView.tsx

interface DeckDiffViewProps {
  diff: DeckDiff;
}

// Visual layout:
// ┌──────────────────────────────────────────────────────────┐
// │  v10 (Mar 12)         vs         v12 (Today)            │
// │  ──────────────────────────────────────────────────────  │
// │  ➕ Added (3 cards)                                      │
// │    Iono                ×4     (+2)  [card image]        │
// │    Arven               ×3     (+1)  [card image]        │
// │  ➖ Removed (2 cards)                                    │
// │    Professor's Research ×2   (-2)  [card image] dimmed  │
// │    Ultra Ball           ×1   (-1)  [card image] dimmed  │
// │  ✓ Unchanged (55 cards)   [toggle to show]              │
// └──────────────────────────────────────────────────────────┘

export function DeckDiffView({ diff }: DeckDiffViewProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  // render added (green highlight), removed (red/dim), unchanged (collapsible)
}
```

CSS:
- `.deck-diff__added` — left border `4px solid var(--success-color, #22c55e)`
- `.deck-diff__removed` — left border `4px solid var(--danger-color, #ef4444)`, opacity `0.6`

### 6. Deck Detail Page Integration

Add "History" tab to `DeckDetailPage`:

```typescript
// DeckDetailPage.tsx — add tabs:
type DeckTab = 'overview' | 'history' | 'analytics';

const [activeTab, setActiveTab] = useState<DeckTab>('overview');

// Tab bar:
// [Overview] [Analytics ▶] [History 🕐]
```

The "Analytics ▶" tab navigates away to `DeckAnalyticsPage` (SPEC_03).
The "History 🕐" tab renders `DeckVersionHistory` inline.

---

## File Structure

```
database/migrations/
└── 005_deck_versions.sql

apps/rest-api/src/handlers/
└── decks.ts                             # MODIFIED — add snapshot on update, version endpoints

apps/web/src/web/hooks/
└── useVersionsQuery.ts                  # NEW — TanStack Query infinite hook for versions

apps/web/src/web/components/DeckVersionHistory/
├── index.ts
├── DeckVersionHistory.tsx
└── DeckVersionHistory.css

apps/web/src/web/components/DeckDiffView/
├── index.ts
├── DeckDiffView.tsx
└── DeckDiffView.css

apps/web/src/web/pages/DeckDetailPage.tsx  # MODIFIED — add tab system, History tab
```

---

## Acceptance Criteria

- [ ] Saving a deck (PUT `/api/v1/decks/:id`) creates a new row in `deck_versions`
- [ ] Version number increments monotonically per deck
- [ ] `GET /api/v1/decks/:id/versions` returns all versions sorted newest-first
- [ ] `GET /api/v1/decks/:id/versions/diff?a=X&b=Y` returns correct added/removed/unchanged
- [ ] Adding 2 cards and removing 1 in a save shows `added.length === 1`, `removed.length === 1` in diff
- [ ] `DeckDetailPage` renders "History" tab
- [ ] Version list shows version number, timestamp, and optional label
- [ ] Selecting 2 versions and clicking "Compare" renders `DeckDiffView`
- [ ] Added cards are highlighted green; removed cards are dimmed with red left border
- [ ] Unchanged cards section is collapsed by default, expandable
- [ ] Restore button shows confirmation dialog before overwriting current deck
- [ ] Max 50 versions are retained per deck (older are pruned automatically)
- [ ] No TypeScript errors introduced

---

## Dependencies

- SPEC_01 (routing)
- SPEC_03 is independent — History tab coexists with Analytics tab

---

## Verification

```bash
# Apply migration
psql $DATABASE_URL -f database/migrations/005_deck_versions.sql

# Save a deck twice, check version count
curl -b cookies.txt -X PUT http://localhost:3001/api/v1/decks/$DECK_ID \
  -H "Content-Type: application/json" -d '{"cards":[...]}'
curl -b cookies.txt http://localhost:3001/api/v1/decks/$DECK_ID/versions | jq '.total'
# Expected: 2 (or N+1 from prior count)

# Diff two versions
curl -b cookies.txt "http://localhost:3001/api/v1/decks/$DECK_ID/versions/diff?a=$V1&b=$V2" | jq '.'

# Type check
cd apps/web && bun run check-types
cd apps/rest-api && bun run check-types
```
