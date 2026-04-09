# SPEC_04: Meta Matchup Matrix

## Context

The matchup matrix answers the question every competitive player asks: "How does my deck perform across the meta?" It runs the player's deck against every meta archetype simultaneously using parallel Web Workers, then renders a color-coded grid showing win rates per matchup.

This is distinct from SPEC_03's single-matchup analytics. The matrix is a high-level overview; clicking a cell drills into the full analytics for that specific matchup.

---

## Prerequisites

- SPEC_01 complete (meta decks available via `GET /api/v1/sim/meta-decks`, `SimulationUserConfig.matchupMode` supports `'matrix'`)
- SPEC_02 complete (`useSimulation` hook, Worker protocol, card definition resolution)
- SPEC_03 complete or in progress (analytics dashboard renders when a cell is clicked -- but the matrix itself does not depend on SPEC_03 code)

---

## Requirements

### 1. useMatchupMatrix Hook

Orchestrates parallel Web Workers -- one per matchup. Up to 8 Workers run simultaneously.

```typescript
// apps/web/src/web/hooks/useMatchupMatrix.ts

interface MatchupProgress {
  readonly opponentId: string;
  readonly opponentName: string;
  readonly status: 'pending' | 'running' | 'complete' | 'error';
  readonly progress: number;            // 0-100
  readonly gamesCompleted: number;
}

interface MatchupResult {
  readonly opponentId: string;
  readonly opponentName: string;
  readonly opponentTier: string;
  readonly winRate: number;
  readonly gamesPlayed: number;
  readonly favorability: 'favorable' | 'even' | 'unfavorable';
  readonly result: SerializedSimulationResult;    // full result for drill-down
}

interface UseMatchupMatrixReturn {
  readonly run: (
    playerDeck: ResolvedDeck,
    opponents: ReadonlyArray<MetaDeck>,
    config: SimulationUserConfig
  ) => Promise<void>;
  readonly cancel: () => void;
  readonly status: 'idle' | 'resolving' | 'running' | 'complete' | 'error';
  readonly progress: ReadonlyArray<MatchupProgress>;
  readonly results: ReadonlyArray<MatchupResult>;
  readonly overallWinRate: number | null;
  readonly error: string | null;
}

function useMatchupMatrix(): UseMatchupMatrixReturn;
```

Implementation:
1. Fetch card definitions once (for all decks combined -- the full Standard pool).
2. Create up to 8 Workers. If there are more than 8 matchups, queue them.
3. Each Worker runs independently with its own `deck1` (player) vs `deck2` (opponent) pair.
4. Track per-matchup progress via `PROGRESS` messages.
5. As each Worker completes, store its result and start the next queued matchup (if any).
6. On cancel, terminate all active Workers and clear the queue.

```typescript
// Worker pool management:
const MAX_CONCURRENT_WORKERS = 8;

// Queue structure:
interface QueuedMatchup {
  readonly opponent: MetaDeck;
  readonly seed: number;
}

// Worker lifecycle per matchup:
// 1. Dequeue next matchup
// 2. Create Worker
// 3. Post RUN_SIMULATION with player deck + opponent deck + shared definitions
// 4. Listen for PROGRESS -> update matchupProgress[opponentId]
// 5. Listen for COMPLETE -> store result, terminate Worker, dequeue next
// 6. Listen for ERROR -> store error, terminate Worker, dequeue next
```

### 2. MatchupMatrix Component

```typescript
// apps/web/src/web/components/MatchupMatrix/types.ts

interface MetaDeck {
  readonly id: string;
  readonly name: string;
  readonly tier: 'S' | 'A' | 'B' | 'C';
  readonly cards: ReadonlyArray<{ cardId: string; count: number }>;
  readonly coverCardId: string;
  readonly eventName: string;
}

interface MatchupMatrixProps {
  readonly playerDeckName: string;
  readonly progress: ReadonlyArray<MatchupProgress>;
  readonly results: ReadonlyArray<MatchupResult>;
  readonly overallWinRate: number | null;
  readonly onCellClick: (opponentId: string) => void;
  readonly status: 'idle' | 'resolving' | 'running' | 'complete' | 'error';
}
```

**BEM class prefix**: `.matchup-matrix`

### 3. Matrix Grid Layout

```txt
┌──────────────────────────────────────────────────────────┐
│  Your Deck: Charizard ex                                  │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│          │ Dragapult│ Gardevoir│ Raging   │ ...          │
│          │   (A)    │   (A)    │ Bolt (B) │              │
├──────────┼──────────┼──────────┼──────────┼──────────────┤
│ Win Rate │  62.3%   │  48.1%   │  71.5%   │              │
│          │ ████████ │ ████     │ █████████│              │
├──────────┴──────────┴──────────┴──────────┴──────────────┤
│  Overall: 58.4% (weighted by tier)                        │
└──────────────────────────────────────────────────────────┘
```

Each cell is a `MatchupCell` component:

```typescript
// apps/web/src/web/components/MatchupMatrix/MatchupCell.tsx

interface MatchupCellProps {
  readonly opponentName: string;
  readonly opponentTier: string;
  readonly status: 'pending' | 'running' | 'complete' | 'error';
  readonly progress: number;
  readonly winRate?: number;
  readonly favorability?: 'favorable' | 'even' | 'unfavorable';
  readonly onClick: () => void;
}
```

Cell states:
- **Pending**: grayed out, no data
- **Running**: mini progress bar inside the cell
- **Complete**: background color-coded by win rate, win rate % displayed
- **Error**: red background with error icon

### 4. Color Gradient for Win Rates

```typescript
function winRateToColor(winRate: number): string {
  // 0.0  -> deep red   (hsl(0, 70%, 40%))
  // 0.45 -> light red  (hsl(0, 50%, 55%))
  // 0.50 -> yellow     (hsl(50, 70%, 50%))
  // 0.55 -> light green(hsl(120, 50%, 55%))
  // 1.0  -> deep green (hsl(120, 70%, 40%))
  //
  // Use HSL interpolation: hue from 0 (red) to 120 (green)
  // Map 0.0-1.0 win rate to 0-120 hue, with 50% at hue 50 (yellow)
}
```

The gradient should use CSS custom properties for the base colors so it adapts to theme:
- `--matchup-favorable` (green)
- `--matchup-even` (yellow)
- `--matchup-unfavorable` (red)

### 5. Tier-Weighted Overall Win Rate

The summary row shows an overall win rate weighted by tier:

```typescript
const TIER_WEIGHTS: Record<string, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1
};

function computeWeightedWinRate(results: ReadonlyArray<MatchupResult>): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of results) {
    const weight = TIER_WEIGHTS[r.opponentTier] ?? 1;
    weightedSum += r.winRate * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
```

Display: "Overall: 58.4% (tier-weighted)" with the same color gradient applied.

### 6. Cell Drill-Down

Clicking a completed cell calls `onCellClick(opponentId)`. The `SimulatePage` handles this by:
1. Setting the active view to the AnalyticsDashboard (SPEC_03)
2. Passing the specific `MatchupResult.result` as the data source
3. Showing a breadcrumb: "Matrix > Dragapult ex / Dusknoir" with a back button

This integration point does not require SPEC_03 to be complete -- the `SimulatePage` can render a placeholder until SPEC_03 is implemented.

### 7. Archetype Selector

Before running the matrix, the user can select/deselect which meta archetypes to include:

```typescript
// Rendered as a checklist above the matrix grid
interface ArchetypeSelectorProps {
  readonly archetypes: ReadonlyArray<MetaDeck>;
  readonly selected: ReadonlySet<string>;          // archetype IDs
  readonly onToggle: (id: string) => void;
  readonly onSelectAll: () => void;
  readonly onDeselectAll: () => void;
}
```

Default: all archetypes selected. Minimum: 1 must be selected to run.

### 8. Progress Display During Execution

During matrix execution, the grid is visible with cells transitioning from pending to running to complete. Each running cell shows its own mini progress bar. A global summary bar at the top shows: "Matchup 3/8 complete (42%)".

```css
.matchup-matrix__cell--running {
  position: relative;
}

.matchup-matrix__cell-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 4px;
  background: var(--focus-ring);
  transition: width 200ms ease;
}
```

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/web/src/web/hooks/useMatchupMatrix.ts` | Multi-Worker orchestration hook | New |
| `apps/web/src/web/components/MatchupMatrix/index.ts` | Barrel | New |
| `apps/web/src/web/components/MatchupMatrix/MatchupMatrix.tsx` | Container | New |
| `apps/web/src/web/components/MatchupMatrix/MatchupMatrixView.tsx` | View/grid layout | New |
| `apps/web/src/web/components/MatchupMatrix/MatchupCell.tsx` | Individual cell | New |
| `apps/web/src/web/components/MatchupMatrix/ArchetypeSelector.tsx` | Pre-run checklist | New |
| `apps/web/src/web/components/MatchupMatrix/types.ts` | Types | New |
| `apps/web/src/web/components/MatchupMatrix/MatchupMatrix.css` | Styles | New |
| `apps/web/src/web/pages/SimulatePage/SimulatePage.tsx` | Wire matrix mode + drill-down | Modify |

---

## Acceptance Criteria

- [ ] `useMatchupMatrix` creates up to 8 parallel Web Workers
- [ ] If more than 8 opponents are selected, excess matchups are queued and processed as Workers free up
- [ ] Per-matchup progress is tracked independently: each cell shows its own progress
- [ ] Global progress summary shows "Matchup X/Y complete" during execution
- [ ] Cancel terminates all active Workers and clears the queue
- [ ] Completed cells are color-coded: green (>55%), yellow (45-55%), red (<45%)
- [ ] Win rate percentage is displayed in each completed cell
- [ ] Tier badges (S/A/B/C) are shown on opponent column headers
- [ ] Overall win rate at bottom is weighted by tier using weights S=4, A=3, B=2, C=1
- [ ] Clicking a completed cell navigates to the analytics dashboard for that matchup
- [ ] Archetype selector allows toggling individual meta decks before execution
- [ ] Matrix cannot be started with 0 archetypes selected
- [ ] All Workers are terminated on component unmount (no memory leaks)
- [ ] Card definitions are fetched once and shared across all Workers
- [ ] Matrix of 8 matchups x 1000 games each completes in under 5 minutes (client dependent)
- [ ] `bunx tsc --noEmit` reports 0 errors for all new files
- [ ] `bun test` passes for `useMatchupMatrix` (mock Worker tests)

---

## Out of Scope

- Server-side matchup matrix computation
- Matchup history (saving matrix results between sessions)
- Custom opponent decklists in matrix mode (meta archetypes only)
- Comparing two different player decks in the same matrix view
- Head-to-head overlay (e.g. showing both decks' analytics side-by-side)

---

## Verification

```bash
# Hook exists
ls apps/web/src/web/hooks/useMatchupMatrix.ts

# Component files exist
ls apps/web/src/web/components/MatchupMatrix/MatchupMatrix.tsx
ls apps/web/src/web/components/MatchupMatrix/MatchupCell.tsx
ls apps/web/src/web/components/MatchupMatrix/ArchetypeSelector.tsx

# Type check
cd apps/web && bunx tsc --noEmit
```
