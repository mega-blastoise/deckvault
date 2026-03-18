# SPEC_05: UX / Product-Level Differentiators

## Context

Competitors' deck builders are functionally adequate but visually poor and frustrating to use.
This spec upgrades the deck builder with four concrete UX wins: a visual card layout view,
real-time legality overlays, drag-and-drop reordering, and version control UI wiring. These
are the features players will screenshot and share — they are the product-level moat.

---

## Prerequisites

- SPEC_01 complete (routing)
- SPEC_04 complete (version history exists to wire into the UI)

---

## Requirements

### 1. Visual Deck Layout View

The deck builder gains a view toggle: **List** (current behavior) and **Visual** (new).

#### Toggle

```typescript
// DeckBuilderPage.tsx
type BuilderView = 'list' | 'visual';
const [view, setView] = useState<BuilderView>('list');

// Render toggle in the deck builder toolbar:
// [≡ List]  [⊞ Visual]
```

#### Visual View Layout

Cards grouped into three swimlanes by supertype. Within each lane, cards are sorted by name.
Each card is rendered as a mini card image with a quantity badge overlay.

```
┌───────────────────────────────────────────────────────────────┐
│  Pokémon (18)                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│  │[img] │ │[img] │ │[img] │ │[img] │ │[img] │ │[img] │    │
│  │  ×4  │ │  ×2  │ │  ×3  │ │  ×1  │ │  ×4  │ │  ×4  │    │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │
│                                                               │
│  Trainer (32)                                                 │
│  ┌──────┐ ...                                                │
│                                                               │
│  Energy (10)                                                  │
│  ┌──────┐ ...                                                │
└───────────────────────────────────────────────────────────────┘
```

```typescript
// apps/web/src/web/components/DeckBuilderVisual/DeckBuilderVisual.tsx

interface DeckBuilderVisualProps {
  cards: DeckCard[];
  onAddOne: (cardId: string) => void;
  onRemoveOne: (cardId: string) => void;
}

const SUPERTYPE_ORDER = ['Pokémon', 'Trainer', 'Energy'] as const;

export function DeckBuilderVisual({ cards, onAddOne, onRemoveOne }: DeckBuilderVisualProps) {
  const grouped = SUPERTYPE_ORDER.reduce<Record<string, DeckCard[]>>(
    (acc, type) => ({
      ...acc,
      [type]: cards
        .filter((dc) => dc.card.supertype === type)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    }),
    {}
  );

  return (
    <div className="deck-builder-visual">
      {SUPERTYPE_ORDER.map((type) => (
        <div key={type} className="deck-builder-visual__lane">
          <h3 className="deck-builder-visual__lane-title">
            {type} ({grouped[type].reduce((s, c) => s + c.quantity, 0)})
          </h3>
          <div className="deck-builder-visual__cards">
            {grouped[type].map((dc) => (
              <VisualCard
                key={dc.card.id}
                deckCard={dc}
                onAddOne={() => onAddOne(dc.card.id)}
                onRemoveOne={() => onRemoveOne(dc.card.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Each `VisualCard` renders:
- Card image (small, `width: 72px`)
- Quantity badge `×N` in bottom-right corner
- `+` / `−` controls on hover

### 2. Real-Time Legality Overlay

Currently, `DeckValidation` is rendered as a static summary. This spec makes legality validation
**reactive** — it re-runs on every card add/remove and shows inline warnings on the card itself.

#### Inline Warning Badge

In both List View and Visual View, each card with a legality issue shows a warning badge:

```typescript
// Card-level legality check:
interface CardLegalityIssue {
  cardId: string;
  reason: 'rotated' | 'banned' | 'format-illegal' | 'over-limit';
}

function getCardLegalityIssue(
  card: Pokemon.Card,
  format: DeckFormat,
  allDeckCards: DeckCard[]
): CardLegalityIssue | null {
  // 1. Check regulation mark vs format
  // Standard: regulation mark G or later (update as rotation changes)
  // Expanded: regulation mark D or later
  if (format === 'standard' && card.regulationMark) {
    const STANDARD_LEGAL_MARKS = ['G', 'H', 'I']; // update per rotation
    if (!STANDARD_LEGAL_MARKS.includes(card.regulationMark)) {
      return { cardId: card.id, reason: 'rotated' };
    }
  }

  // 2. Check copy count (max 4 per deck except basic energy)
  const quantity = allDeckCards.find((dc) => dc.card.id === card.id)?.quantity ?? 0;
  const isBasicEnergy = card.supertype === 'Energy' && !card.subtypes?.includes('Special');
  if (quantity > 4 && !isBasicEnergy) {
    return { cardId: card.id, reason: 'over-limit' };
  }

  return null;
}
```

The legality badge is a small `⚠` icon with tooltip showing the reason. It replaces the current
static DeckValidation component for per-card feedback (the global summary can remain).

#### Instant Validation Effect

```typescript
// DeckBuilderPage.tsx
// Derived state — recomputes on every render when deckCards changes:
const legalityIssues = useMemo(
  () =>
    deckCards
      .map((dc) => getCardLegalityIssue(dc.card, format, deckCards))
      .filter((issue): issue is CardLegalityIssue => issue !== null),
  [deckCards, format]
);

const legalityMap = useMemo(
  () => new Map(legalityIssues.map((i) => [i.cardId, i])),
  [legalityIssues]
);
```

Pass `legalityMap` down to both list and visual view components.

### 3. Drag-and-Drop Reordering (List View)

Use the native HTML5 Drag and Drop API — no external library. Reordering only affects display
order in the builder; the deck's card list is reordered in local state only (not persisted
as a separate sort field).

```typescript
// apps/web/src/web/components/DeckBuilderList/DeckBuilderList.tsx

export function DeckBuilderList({ cards, onReorder, ... }: DeckBuilderListProps) {
  const dragIndexRef = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDrop(dropIndex: number) {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    onReorder(dragIndex, dropIndex);
    dragIndexRef.current = null;
  }

  return (
    <ul className="deck-builder-list">
      {cards.map((dc, index) => (
        <li
          key={dc.card.id}
          className="deck-builder-list__item"
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
        >
          {/* card row content */}
        </li>
      ))}
    </ul>
  );
}
```

```typescript
// In DeckBuilderPage.tsx — reorder handler:
function handleReorder(fromIndex: number, toIndex: number) {
  setDeckCards((prev) => {
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}
```

CSS for drag state:
- `.deck-builder-list__item[draggable="true"]:active` → `opacity: 0.5; cursor: grabbing`
- `.deck-builder-list__item--drag-over` → `border-top: 2px solid var(--focus-ring)`

### 4. Version Control UI Wiring

Add a save state indicator and version label input to the deck builder toolbar.

```
┌──────────────────────────────────────────────────────────────┐
│  [≡ List]  [⊞ Visual]          [Unsaved changes ●]          │
│  60 cards  Standard  ✅ Legal   [Label: "Pre-Regional"]      │
│                                 [Save Deck ▶]                │
└──────────────────────────────────────────────────────────────┘
```

```typescript
// DeckBuilderPage.tsx additions:

const [versionLabel, setVersionLabel] = useState('');
const [isDirty, setIsDirty] = useState(false);

// Mark dirty whenever deckCards changes after initial load:
useEffect(() => {
  setIsDirty(true);
}, [deckCards]);

// On save: pass versionLabel to the mutation, reset dirty state on success:
function handleSave() {
  updateDeckMutation.mutate(
    { ...deckData, versionLabel: versionLabel || undefined },
    { onSuccess: () => { setIsDirty(false); setVersionLabel(''); } }
  );
}
```

The backend `PUT /api/v1/decks/:id` accepts an optional `versionLabel` body field and passes it
to `createVersionSnapshot` when saving.

---

## File Structure

```
apps/web/src/web/components/DeckBuilderVisual/
├── index.ts
├── DeckBuilderVisual.tsx
└── DeckBuilderVisual.css

apps/web/src/web/components/DeckBuilderList/
├── index.ts
├── DeckBuilderList.tsx          # Extracted from DeckBuilderPage — drag-and-drop enabled
└── DeckBuilderList.css

apps/web/src/web/lib/
└── deck-legality.ts             # getCardLegalityIssue — pure function

apps/web/src/web/pages/DeckBuilderPage.tsx  # MODIFIED — view toggle, legalityMap, dirty state
```

---

## Acceptance Criteria

- [ ] Deck builder shows "List" / "Visual" toggle in toolbar
- [ ] Visual view groups cards into Pokémon / Trainer / Energy swimlanes
- [ ] Visual view card images render at `72px` width with quantity badge
- [ ] Clicking `+` / `−` on a visual card updates the deck count immediately
- [ ] Adding a rotated (non-Standard-legal) card shows `⚠` badge on that card in both views
- [ ] Adding a 5th copy of a non-energy card shows `over-limit` `⚠` badge
- [ ] Legality badge tooltip states the specific reason
- [ ] List view rows are draggable; dropping reorders in local state
- [ ] Drag indicator border appears above the drop target row
- [ ] Deck builder toolbar shows "Unsaved changes ●" indicator after any edit
- [ ] Optional version label input visible in toolbar before saving
- [ ] Saving clears the dirty indicator
- [ ] No TypeScript errors introduced

---

## Dependencies

- SPEC_04 (version snapshots — the label flows into `createVersionSnapshot`)

---

## Verification

```bash
# Type check
cd apps/web && bun run check-types

# Manual test checklist (visual verification):
# 1. Open /decks/new
# 2. Add 4x Charizard ex → switch to Visual view → confirm swimlane grouping
# 3. Add a non-Standard card → confirm ⚠ badge appears
# 4. Drag a card in list view → confirm reorder
# 5. Edit deck → confirm "Unsaved changes" indicator
# 6. Enter a label and save → confirm label appears in version history (SPEC_04 tab)
```
