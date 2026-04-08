# SPEC_05: Replay Viewer

## Context

The replay viewer lets a player step through any individual simulated game turn-by-turn on a visual board. After running a 1000-game simulation and seeing aggregate analytics, the player wants to understand *why* specific games played out the way they did -- was it a bad opening hand, a missed KO, an unlucky coin flip?

The viewer reconstructs board state from the engine's event log. It does not re-run the game; it walks the event array and derives visual state at each step.

---

## Prerequisites

- SPEC_02 complete (`CapturedReplay` with full `eventLog` available in `SerializedSimulationResult`)
- Engine types: `GameEvent` (30+ event variants), `PlayerId`, `WinReason`, `CardDefinition`, `InPlayPokemon`

---

## Requirements

### 1. State Reconstruction from Event Log

The replay viewer does not re-simulate. It replays the event log forward, maintaining a derived board state that tracks what a spectator would see.

```typescript
// apps/web/src/web/components/ReplayViewer/replay-state.ts

interface ReplayBoardState {
  readonly player1: ReplayPlayerState;
  readonly player2: ReplayPlayerState;
  readonly stadium: { readonly cardId: string; readonly name: string } | null;
  readonly turnNumber: number;
  readonly activePlayer: PlayerId;
  readonly currentEventIndex: number;
}

interface ReplayPlayerState {
  readonly active: ReplayPokemonSlot | null;
  readonly bench: ReadonlyArray<ReplayPokemonSlot>;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
  readonly discardTopCardId: string | null;
  readonly prizesRemaining: number;
}

interface ReplayPokemonSlot {
  readonly instanceId: string;
  readonly cardId: string;              // definition ID (for image/name lookup)
  readonly name: string;
  readonly hp: number;                  // max HP
  readonly currentHp: number;           // max HP - damage counters * 10
  readonly damageCounters: number;
  readonly attachedEnergy: ReadonlyArray<{ cardId: string; type: string }>;
  readonly attachedTools: ReadonlyArray<{ cardId: string; name: string }>;
  readonly specialConditions: ReadonlyArray<string>;
  readonly evolutionStage: string;      // "Basic", "Stage 1", "Stage 2"
}
```

The state machine processes events sequentially:

```typescript
function buildInitialState(
  replay: CapturedReplay,
  definitions: Record<string, SerializedCardDefinition>
): ReplayBoardState;

function applyEvent(
  state: ReplayBoardState,
  event: GameEvent,
  definitions: Record<string, SerializedCardDefinition>
): ReplayBoardState;

function buildStateAtEvent(
  replay: CapturedReplay,
  eventIndex: number,
  definitions: Record<string, SerializedCardDefinition>
): ReplayBoardState;
```

Event handling per type:

| Event Type | Board State Update |
|-----------|-------------------|
| `GAME_STARTED` | Initialize both players with 60 deck, 0 hand, 6 prizes |
| `CARD_DRAWN` | Decrement deckCount, increment handCount |
| `BASIC_PLAYED` | Decrement handCount, add to active or bench |
| `POKEMON_EVOLVED` | Update evolution stage, name, HP on the in-play slot |
| `ENERGY_ATTACHED` | Add to target Pokemon's attachedEnergy, decrement handCount |
| `TOOL_ATTACHED` | Add to target Pokemon's attachedTools, decrement handCount |
| `TRAINER_PLAYED` | Decrement handCount |
| `ATTACK_DECLARED` | No board change (visual highlight only) |
| `DAMAGE_DEALT` | Add damage counters to target |
| `DAMAGE_COUNTERS_PLACED` | Add damage counters to target |
| `DAMAGE_HEALED` | Remove damage counters from target |
| `POKEMON_KNOCKED_OUT` | Remove from active/bench, decrement prizesRemaining for opponent |
| `PRIZE_TAKEN` | Decrement prizesRemaining, increment handCount |
| `SPECIAL_CONDITION_APPLIED` | Add to Pokemon's specialConditions |
| `SPECIAL_CONDITION_REMOVED` | Remove from Pokemon's specialConditions |
| `RETREATED` | Swap active with bench Pokemon |
| `STADIUM_PLAYED` | Set stadium |
| `STADIUM_DISCARDED` | Clear stadium |
| `CARD_DISCARDED` | Increment discardCount, update discardTopCardId |
| `CARD_SEARCHED` | Decrement deckCount or discardCount, increment handCount |
| `CARD_MOVED` | Update zone counts based on from/to |
| `MULLIGAN` | Track mulligan count (for display) |
| `TURN_STARTED` | Update turnNumber, activePlayer |
| `TURN_ENDED` | No board change |
| `GAME_OVER` | Mark winner |

**Critical**: The state machine must handle the `instanceId` -> `definitionId` mapping. The engine's `cardRegistry` is not available in the replay; the event log uses `cardInstanceId` which encodes the definition ID. Parse it: instance IDs follow the pattern `{definitionId}_{index}` (e.g. `sv3-125_0`, `sv3-125_1`).

### 2. ReplayViewer Container

```typescript
// apps/web/src/web/components/ReplayViewer/ReplayViewer.tsx

interface ReplayViewerProps {
  readonly replays: ReadonlyArray<CapturedReplay>;
  readonly gameResults: ReadonlyArray<GameResult>;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
}
```

State:
- `selectedGameIndex: number` (which game from the batch)
- `currentEventIndex: number` (position in the event log)
- `boardState: ReplayBoardState` (derived from events up to currentEventIndex)

**BEM class prefix**: `.replay-viewer`

### 3. GameBoard Component

Visual representation of both players' board state.

```txt
┌───────────────────────────────────────────────────────┐
│  Player 2 (Opponent)                     Prizes: 4    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  │Bench│ │Bench│ │Bench│ │     │ │     │  Deck: 32  │
│  │  1  │ │  2  │ │  3  │ │     │ │     │  Hand: 5   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  Disc: 8   │
│                                                        │
│              ┌───────────────┐                         │
│              │   ACTIVE      │       ┌──────────────┐ │
│              │  Dragapult ex │       │   STADIUM    │ │
│              │  HP: 320/320  │       │  Iono's...   │ │
│              │  [Fire][Fire] │       └──────────────┘ │
│              └───────────────┘                         │
│                                                        │
│              ┌───────────────┐                         │
│              │   ACTIVE      │                         │
│              │  Charizard ex │                         │
│              │  HP: 180/330  │                         │
│              │  [Fire][Fire] │                         │
│              │  [Fire]       │                         │
│              │  BURNED       │                         │
│              └───────────────┘                         │
│                                                        │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  │Bench│ │Bench│ │Bench│ │     │ │     │  Deck: 28  │
│  │  1  │ │  2  │ │  3  │ │     │ │     │  Hand: 4   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  Disc: 12  │
│  Player 1 (You)                          Prizes: 3    │
└───────────────────────────────────────────────────────┘
```

```typescript
// apps/web/src/web/components/ReplayViewer/GameBoard/GameBoard.tsx

interface GameBoardProps {
  readonly boardState: ReplayBoardState;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
  readonly highlightedInstanceId?: string;     // from current event
}
```

Each Pokemon slot (`PokemonSlot`) shows:
- Pokemon name (from definition)
- HP bar: `currentHp / maxHp` with color (green > 50%, yellow 25-50%, red < 25%)
- Damage counters as a number
- Attached energy as colored circles (type-colored: fire=red, water=blue, etc.)
- Attached tools as small icons/labels
- Special conditions as badges (Burned, Poisoned, etc.)

Empty bench slots are shown as outlined placeholders.

Zone indicators (deck, hand, discard, prizes) are numbers with small icons.

**BEM class prefix**: `.game-board`

### 4. EventLogPanel Component

Scrollable list of narrated game events. Each event is rendered as a human-readable sentence.

```typescript
// apps/web/src/web/components/ReplayViewer/EventLogPanel/EventRenderer.tsx

function renderEventText(
  event: GameEvent,
  definitions: Record<string, SerializedCardDefinition>,
  deck1Name: string,
  deck2Name: string
): string;
```

Event narration examples:

| Event Type | Narration |
|-----------|-----------|
| `CARD_DRAWN` | "Player 1 drew a card" |
| `BASIC_PLAYED` | "Player 1 played Charmander to the bench" |
| `POKEMON_EVOLVED` | "Player 1 evolved Charmander into Charizard ex" |
| `ENERGY_ATTACHED` | "Player 1 attached Fire Energy to Charizard ex" |
| `TRAINER_PLAYED` | "Player 1 played Professor Turo's Scenario" |
| `ATTACK_DECLARED` | "Charizard ex used Burning Dark (180 damage)" |
| `DAMAGE_DEALT` | "Dragapult ex took 180 damage" |
| `POKEMON_KNOCKED_OUT` | "Dragapult ex was knocked out! Player 1 takes 2 prizes" |
| `SPECIAL_CONDITION_APPLIED` | "Charizard ex is now Burned" |
| `RETREATED` | "Player 2 retreated Dragapult ex, sent in Dusknoir" |
| `TURN_STARTED` | "--- Turn 5 (Player 2) ---" |
| `GAME_OVER` | "Game Over! Player 1 wins by taking all prizes" |

The current event is highlighted. The log auto-scrolls to keep the current event visible.

```typescript
interface EventLogPanelProps {
  readonly events: ReadonlyArray<GameEvent>;
  readonly currentEventIndex: number;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
  readonly onEventClick: (index: number) => void;   // jump to event
}
```

Clicking an event in the log jumps the board state to that event.

**BEM class prefix**: `.event-log`

### 5. ReplayControls Component

```typescript
// apps/web/src/web/components/ReplayViewer/ReplayControls/ReplayControls.tsx

interface ReplayControlsProps {
  readonly currentEventIndex: number;
  readonly totalEvents: number;
  readonly currentTurn: number;
  readonly totalTurns: number;
  readonly onPrevEvent: () => void;
  readonly onNextEvent: () => void;
  readonly onPrevTurn: () => void;
  readonly onNextTurn: () => void;
  readonly onJumpToStart: () => void;
  readonly onJumpToEnd: () => void;
  readonly keyMoments: ReadonlyArray<KeyMoment>;
  readonly onJumpToMoment: (eventIndex: number) => void;
}

interface KeyMoment {
  readonly label: string;             // "First KO", "Prize 3 taken", "Final turn"
  readonly eventIndex: number;
  readonly type: 'ko' | 'prize' | 'turn_start' | 'game_over';
}
```

Controls layout:
- Row 1: `|<<` `<Turn` `<Event` `Event>` `Turn>` `>>|`
- Row 2: Key moments as quick-jump buttons

Turn navigation: `onPrevTurn` jumps to the previous `TURN_STARTED` event. `onNextTurn` jumps to the next `TURN_STARTED` event.

Key moments are computed from the event log:
- First `POKEMON_KNOCKED_OUT` event
- Each `PRIZE_TAKEN` event (grouped by turn)
- The `GAME_OVER` event

Keyboard shortcuts:
- Left arrow: previous event
- Right arrow: next event
- Shift+Left: previous turn
- Shift+Right: next turn
- Home: jump to start
- End: jump to end

**BEM class prefix**: `.replay-controls`

### 6. GamePicker Component

Select which game from the simulation batch to view.

```typescript
// apps/web/src/web/components/ReplayViewer/GamePicker.tsx

interface GamePickerProps {
  readonly games: ReadonlyArray<{
    readonly gameIndex: number;
    readonly winner: PlayerId | 'draw';
    readonly winReason: WinReason;
    readonly totalTurns: number;
    readonly hasCapturedReplay: boolean;
  }>;
  readonly selectedIndex: number;
  readonly onSelect: (gameIndex: number) => void;
}
```

Renders as a scrollable list or dropdown. Each entry shows:
- Game number (#1, #2, ...)
- Outcome badge: "P1 Win" (green), "P2 Win" (red), "Draw" (gray)
- Win reason: "Prizes", "Deck-out", "No Pokemon"
- Turn count
- Disabled state if `hasCapturedReplay` is false (only first 50 games have replay data)

Filter controls: "All", "Wins", "Losses", "Draws"

**BEM class prefix**: `.game-picker`

### 7. ReplayViewer Layout

```css
.replay-viewer {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-md);
  height: 100%;
}

.replay-viewer__game-picker {
  grid-column: 1 / -1;
}

.replay-viewer__board {
  grid-column: 1;
  grid-row: 2;
}

.replay-viewer__event-log {
  grid-column: 2;
  grid-row: 2;
  overflow-y: auto;
  max-height: 600px;
}

.replay-viewer__controls {
  grid-column: 1 / -1;
  grid-row: 3;
}

@media (max-width: 900px) {
  .replay-viewer {
    grid-template-columns: 1fr;
  }
  .replay-viewer__event-log {
    grid-column: 1;
    max-height: 300px;
  }
}
```

### 8. Performance: Incremental State vs Full Rebuild

For small event logs (< 500 events), `buildStateAtEvent` can rebuild from scratch on each navigation. For larger logs, use an incremental approach:

```typescript
// Cache board states at turn boundaries
interface ReplayStateCache {
  readonly turnStates: Map<number, ReplayBoardState>;   // turn number -> state at turn start
}

function buildStateCache(
  replay: CapturedReplay,
  definitions: Record<string, SerializedCardDefinition>
): ReplayStateCache;
```

When navigating to event N, find the nearest cached turn boundary before N, then apply events forward from there. This limits max forward-scan to ~50 events (one turn's worth).

Build the cache lazily: compute turn-boundary states on first navigation, store for reuse.

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/web/src/web/components/ReplayViewer/index.ts` | Barrel | New |
| `apps/web/src/web/components/ReplayViewer/ReplayViewer.tsx` | Container | New |
| `apps/web/src/web/components/ReplayViewer/ReplayViewerView.tsx` | View/layout | New |
| `apps/web/src/web/components/ReplayViewer/ReplayViewer.css` | Styles | New |
| `apps/web/src/web/components/ReplayViewer/replay-state.ts` | State machine | New |
| `apps/web/src/web/components/ReplayViewer/types.ts` | Types | New |
| `apps/web/src/web/components/ReplayViewer/GameBoard/index.ts` | Barrel | New |
| `apps/web/src/web/components/ReplayViewer/GameBoard/GameBoard.tsx` | Board layout | New |
| `apps/web/src/web/components/ReplayViewer/GameBoard/PokemonSlot.tsx` | Pokemon card display | New |
| `apps/web/src/web/components/ReplayViewer/GameBoard/ZoneIndicator.tsx` | Deck/hand/discard counts | New |
| `apps/web/src/web/components/ReplayViewer/GameBoard/GameBoard.css` | Styles | New |
| `apps/web/src/web/components/ReplayViewer/EventLogPanel/index.ts` | Barrel | New |
| `apps/web/src/web/components/ReplayViewer/EventLogPanel/EventLogPanel.tsx` | Scrollable log | New |
| `apps/web/src/web/components/ReplayViewer/EventLogPanel/EventRenderer.tsx` | Event narration | New |
| `apps/web/src/web/components/ReplayViewer/EventLogPanel/EventLogPanel.css` | Styles | New |
| `apps/web/src/web/components/ReplayViewer/ReplayControls/index.ts` | Barrel | New |
| `apps/web/src/web/components/ReplayViewer/ReplayControls/ReplayControls.tsx` | Controls | New |
| `apps/web/src/web/components/ReplayViewer/ReplayControls/ReplayControls.css` | Styles | New |
| `apps/web/src/web/components/ReplayViewer/GamePicker.tsx` | Game selection | New |
| `apps/web/src/web/components/ReplayViewer/__tests__/replay-state.test.ts` | State machine tests | New |
| `apps/web/src/web/components/ReplayViewer/__tests__/event-renderer.test.ts` | Narration tests | New |

---

## Acceptance Criteria

- [ ] `buildStateAtEvent` correctly reconstructs board state from event index 0 to any index N
- [ ] Board state shows correct hand count, deck count, discard count, and prize count at each event
- [ ] Pokemon slots display name, HP bar, damage counters, attached energy, and special conditions
- [ ] Active Pokemon slot is visually distinct from bench slots
- [ ] Empty bench slots render as outlined placeholders
- [ ] Event log renders all 30+ event types as human-readable sentences
- [ ] Current event is highlighted in the event log
- [ ] Event log auto-scrolls to keep current event visible
- [ ] Clicking an event in the log jumps the board state to that event
- [ ] Step controls: Previous/Next Event and Previous/Next Turn navigate correctly
- [ ] Jump to Start goes to event index 0; Jump to End goes to the last event
- [ ] Key moments navigation: First KO, each prize taken, and final turn are computed correctly
- [ ] Keyboard shortcuts work: Arrow keys for events, Shift+Arrow for turns, Home/End for jump
- [ ] Game picker shows all games with outcome badges and turn counts
- [ ] Games without captured replays are disabled in the picker
- [ ] Game picker filter (All/Wins/Losses/Draws) works correctly
- [ ] Turn-boundary state cache is built, and navigation between distant events is < 16ms (60fps)
- [ ] Instance ID to definition ID mapping correctly parses `sv3-125_0` -> `sv3-125`
- [ ] Layout is responsive: event log stacks below board on screens < 900px
- [ ] `bun test` passes for `replay-state.test.ts` with at least 20 test cases
- [ ] `bun test` passes for `event-renderer.test.ts` with at least 15 test cases
- [ ] `bunx tsc --noEmit` reports 0 errors for all new files

---

## Out of Scope

- Animated transitions between board states (events apply instantly)
- Card artwork images in Pokemon slots (use text/name only for v1; images are a polish pass)
- Auto-play mode (step through events on a timer)
- Replay sharing via URL
- Exporting replay data
- Sound effects

---

## Verification

```bash
# State machine module exists
ls apps/web/src/web/components/ReplayViewer/replay-state.ts

# Board component exists
ls apps/web/src/web/components/ReplayViewer/GameBoard/GameBoard.tsx

# Event renderer exists
ls apps/web/src/web/components/ReplayViewer/EventLogPanel/EventRenderer.tsx

# Tests pass
bun test apps/web/src/web/components/ReplayViewer/__tests__/replay-state.test.ts
bun test apps/web/src/web/components/ReplayViewer/__tests__/event-renderer.test.ts

# Type check
cd apps/web && bunx tsc --noEmit
```
