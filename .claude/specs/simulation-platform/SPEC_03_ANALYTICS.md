# SPEC_03: Analytics Visualization Suite

## Context

This spec implements the six analytics panels that render after a simulation completes. These are the core value proposition of the Simulation Platform -- a Pokemon TCG player uses these visualizations to understand their deck's consistency, prize pacing, opening hand quality, and card utilization before entering a tournament.

All panels consume data from `SerializedSimulationResult` (produced by SPEC_02's Web Worker). Each panel transforms the raw engine data into visualization-ready formats and renders using Canvas API or vanilla DOM -- no charting libraries.

---

## Prerequisites

- SPEC_01 complete (deck input + config provide `keyCardIds`)
- SPEC_02 complete (`SerializedSimulationResult` available with `gameResults`, `deckStats`, `capturedReplays`)
- `@pokemon/engine` types: `GameResult`, `DeckStats`, `OpeningHandStats`, `GameEvent`, `WinReason`

---

## Requirements

### 1. AnalyticsDashboard Container

```typescript
// apps/web/src/web/components/AnalyticsDashboard/AnalyticsDashboard.tsx

interface AnalyticsDashboardProps {
  readonly result: SerializedSimulationResult;
  readonly keyCardIds: ReadonlyArray<string>;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly perspective: 'player1' | 'player2';   // which deck's stats to show
}
```

The dashboard is a responsive CSS grid that arranges the 6 panels. Two-column layout on wide screens, single column on narrow. Each panel is an independent component receiving its slice of data.

**BEM class prefix**: `.analytics-dashboard`

### 2. Panel 1: Win Condition Breakdown

Proportional visualization of how games ended. Three categories per player: prizes exhausted, deck-out, no-Pokemon-in-play. Plus draws.

**Data source**: `result.deck1Stats.winsByReason` and `result.deck2Stats.winsByReason`

```typescript
// Data transform:
interface WinConditionData {
  readonly total: number;
  readonly segments: ReadonlyArray<{
    readonly label: string;        // "Prizes (You)", "Deck-out (Opp)", etc.
    readonly count: number;
    readonly percent: number;
    readonly color: string;
  }>;
}

function transformWinConditions(result: SerializedSimulationResult): WinConditionData;
```

Render as a **horizontal stacked bar** with labeled segments. Each segment shows percentage on hover/focus. Colors: green shades for player wins, red shades for opponent wins, gray for draws.

**BEM class prefix**: `.win-breakdown`

### 3. Panel 2: Prize Race Timeline

Turn-by-turn line chart of average prize differential across all N games. Shows whether the player's deck typically leads or trails in prize count.

**Data source**: `result.capturedReplays` event logs. For each captured game, extract `PRIZE_TAKEN` events per turn to build a prize curve. Average across all captured games.

```typescript
interface PrizeRacePoint {
  readonly turn: number;
  readonly meanDifferential: number;     // positive = player ahead, negative = behind
  readonly stdDev: number;
}

interface PrizeRaceData {
  readonly points: ReadonlyArray<PrizeRacePoint>;
  readonly maxTurn: number;
}

function transformPrizeRace(
  replays: ReadonlyArray<CapturedReplay>,
  perspective: 'player1' | 'player2'
): PrizeRaceData;
```

Render on **Canvas**: X-axis = turn number (0 to maxTurn), Y-axis = prize differential (-6 to +6). Main line is the mean. Confidence band (shaded area) at +/- 1 standard deviation. Zero line drawn prominently. Colors: blue for the mean line, light blue for the confidence band.

Label X-axis ticks at every 5 turns. Label Y-axis: "+3 prizes ahead", "Even", "-3 prizes behind".

**BEM class prefix**: `.prize-race`

### 4. Panel 3: Opening Hand Quality

Visualization of mulligan rate, T1 playability, and common opening hand configurations.

**Data source**: `result.deck1Stats.openingHandStats` (or deck2 depending on perspective)

```typescript
interface OpeningHandData {
  readonly mulliganRate: number;
  readonly hasSupporterRate: number;
  readonly hasEnergyRate: number;
  readonly idealOpeningRate: number;
  readonly averageBasicsInHand: number;
  // Top 5-6 common hand archetypes derived from replays
  readonly handArchetypes: ReadonlyArray<{
    readonly label: string;          // "2 Basic + Supporter + 2 Energy + 2 Item"
    readonly frequency: number;      // 0-1
    readonly isIdeal: boolean;
  }>;
}
```

Hand archetype analysis: group opening hands by composition pattern (count of Basics, Supporters, Items, Energy, Evolution cards). The top 5-6 most frequent patterns are shown.

```typescript
function classifyHand(
  cardInstanceIds: ReadonlyArray<string>,
  definitions: Record<string, SerializedCardDefinition>
): string;
// Returns a pattern string like "2B-1S-2I-2E" (2 basics, 1 supporter, 2 items, 2 energy)
```

To extract opening hands from replays: for each captured game, collect the first 7 `CARD_DRAWN` events for each player (the initial draw before mulligans). Look up each card's type via definitions.

Render as:
- **Stat row**: mulligan rate, Supporter T1 rate, Energy T1 rate, ideal opening rate -- each as a circular progress indicator (ring chart)
- **Hand archetype list**: horizontal bar chart of top patterns, sorted by frequency

**BEM class prefix**: `.opening-hand`

### 5. Panel 4: Key Card Consistency Curves

For each card marked as a "key card": a cumulative probability curve showing the percentage of games where that card has been drawn/seen by turn 1, 2, 3... up to turn 10. Multiple cards overlaid on the same chart.

**Data source**: `result.capturedReplays` + `keyCardIds`

```typescript
interface KeyCardCurvePoint {
  readonly turn: number;
  readonly probability: number;          // 0-1
}

interface KeyCardCurve {
  readonly cardId: string;
  readonly cardName: string;
  readonly copiesInDeck: number;
  readonly curve: ReadonlyArray<KeyCardCurvePoint>;
}

function transformKeyCardCurves(
  replays: ReadonlyArray<CapturedReplay>,
  keyCardIds: ReadonlyArray<string>,
  definitions: Record<string, SerializedCardDefinition>,
  perspective: 'player1' | 'player2'
): ReadonlyArray<KeyCardCurve>;
```

Logic: For each key card and each captured game, scan the event log for `CARD_DRAWN` events matching that card's definition ID. Track the earliest turn the card appeared in hand (drawn or searched via `CARD_SEARCHED`). At each turn T, the probability is (games where card seen by turn T) / total captured games.

Render on **Canvas**: X-axis = turn (1-10), Y-axis = probability (0%-100%). One colored line per key card. Legend with card names and colors. Grid lines at 25%, 50%, 75%. Tooltip on hover showing exact percentage.

If no key cards are selected, show a placeholder: "Mark cards as key cards in the configuration panel to see consistency curves."

**BEM class prefix**: `.key-card-curves`

### 6. Panel 5: Trainer Utilization

For every Trainer card in the deck: average copies played per game, percentage of games where it was played at least once, average turn first played. Helps identify dead-weight cards.

**Data source**: `result.capturedReplays` event logs, filtered to `TRAINER_PLAYED` events.

```typescript
interface TrainerUtilizationEntry {
  readonly cardId: string;
  readonly cardName: string;
  readonly copiesInDeck: number;
  readonly avgCopiesPlayed: number;
  readonly playRate: number;              // % of games played at least once
  readonly avgTurnFirstPlayed: number;    // average turn of first play (NaN if never played)
  readonly utilizationScore: number;      // copiesPlayed / copiesInDeck, 0-1
}

function transformTrainerUtilization(
  replays: ReadonlyArray<CapturedReplay>,
  deck: ResolvedDeck,
  definitions: Record<string, SerializedCardDefinition>,
  perspective: 'player1' | 'player2'
): ReadonlyArray<TrainerUtilizationEntry>;
```

Render as a **sorted list** (not a table -- styled cards). Sorted by play rate descending. Each entry shows:
- Card name
- Horizontal bar showing utilization score (0-100%)
- Stats: "Played in 87% of games | Avg 2.3 copies | First played T3"
- Color coding: green (>70% play rate), yellow (30-70%), red (<30%)

**BEM class prefix**: `.trainer-util`

### 7. Panel 6: Turn Length Distribution

Histogram of game lengths (in turns). Shows the distribution of short/average/long games.

**Data source**: `result.gameResults` (all games, not just captured replays)

```typescript
interface TurnLengthBucket {
  readonly minTurn: number;
  readonly maxTurn: number;
  readonly label: string;               // "1-5", "6-10", etc.
  readonly player1Wins: number;
  readonly player2Wins: number;
  readonly draws: number;
  readonly total: number;
}

function transformTurnDistribution(
  gameResults: ReadonlyArray<GameResult>
): ReadonlyArray<TurnLengthBucket>;
```

Bucket games into 5-turn ranges (1-5, 6-10, 11-15, ..., up to the max turn seen). Each bucket has stacked bars: player 1 wins (green), player 2 wins (red), draws (gray).

Render on **Canvas**: X-axis = turn ranges, Y-axis = game count. Stacked vertical bars. Label the median turn count and the mode (most common range).

**BEM class prefix**: `.turn-distribution`

### 8. Data Transform Module

All transform functions live in a shared module:

```typescript
// apps/web/src/web/components/AnalyticsDashboard/transforms.ts

// All functions listed above, plus:
// - Memoization for expensive transforms (key card curves scan many events)
// - Input validation (handle empty replays gracefully)
// - Perspective-aware: swap player1/player2 based on which deck the user is analyzing
```

### 9. Canvas Rendering Utilities

Shared drawing helpers for the Canvas-based panels:

```typescript
// apps/web/src/web/components/AnalyticsDashboard/canvas-utils.ts

function drawLineChart(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ x: number; y: number }>,
  options: LineChartOptions
): void;

function drawBarChart(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ label: string; values: number[] }>,
  options: BarChartOptions
): void;

function drawConfidenceBand(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ x: number; yMean: number; yStdDev: number }>,
  options: BandOptions
): void;

// Shared options types for consistent styling across panels:
interface ChartTheme {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly gridColor: string;
  readonly textColor: string;
  readonly backgroundColor: string;
}
```

Charts must respect the current theme (Nebula/Catppuccin) by reading CSS custom properties for colors. Use `getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')` etc.

### 10. Responsive Layout

```css
/* apps/web/src/web/components/AnalyticsDashboard/AnalyticsDashboard.css */

.analytics-dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
  padding: var(--space-lg);
}

.analytics-dashboard__panel {
  min-height: 300px;
  background: var(--bg-sunken);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

/* Win Breakdown spans full width */
.analytics-dashboard__panel--win-breakdown {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .analytics-dashboard {
    grid-template-columns: 1fr;
  }
}
```

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/web/src/web/components/AnalyticsDashboard/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/AnalyticsDashboard.tsx` | Container | New |
| `apps/web/src/web/components/AnalyticsDashboard/AnalyticsDashboardView.tsx` | View/layout | New |
| `apps/web/src/web/components/AnalyticsDashboard/AnalyticsDashboard.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/transforms.ts` | Data transforms | New |
| `apps/web/src/web/components/AnalyticsDashboard/canvas-utils.ts` | Canvas helpers | New |
| `apps/web/src/web/components/AnalyticsDashboard/types.ts` | Shared types | New |
| `apps/web/src/web/components/AnalyticsDashboard/WinConditionBreakdown/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/WinConditionBreakdown/WinConditionBreakdown.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/WinConditionBreakdown/WinConditionBreakdown.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/PrizeRaceTimeline/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/PrizeRaceTimeline/PrizeRaceTimeline.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/PrizeRaceTimeline/PrizeRaceTimeline.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/OpeningHandQuality/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/OpeningHandQuality/OpeningHandQuality.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/OpeningHandQuality/OpeningHandQuality.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/KeyCardCurves/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/KeyCardCurves/KeyCardCurves.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/KeyCardCurves/KeyCardCurves.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/TrainerUtilization/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/TrainerUtilization/TrainerUtilization.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/TrainerUtilization/TrainerUtilization.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/TurnLengthDistribution/index.ts` | Barrel | New |
| `apps/web/src/web/components/AnalyticsDashboard/TurnLengthDistribution/TurnLengthDistribution.tsx` | Component | New |
| `apps/web/src/web/components/AnalyticsDashboard/TurnLengthDistribution/TurnLengthDistribution.css` | Styles | New |
| `apps/web/src/web/components/AnalyticsDashboard/__tests__/transforms.test.ts` | Transform tests | New |

---

## Acceptance Criteria

- [ ] AnalyticsDashboard renders all 6 panels in a responsive grid layout
- [ ] Win Condition Breakdown shows correct percentages that sum to 100%
- [ ] Prize Race Timeline renders a Canvas line chart with confidence band
- [ ] Prize Race Y-axis correctly maps -6 to +6 prize differential
- [ ] Opening Hand Quality shows mulligan rate, Supporter T1 rate, Energy T1 rate as ring charts
- [ ] Opening Hand archetypes are extracted from replay data and top 5-6 shown
- [ ] Key Card Curves render one line per key card with turns 1-10 on X-axis
- [ ] Key Card Curves show placeholder text when no key cards are selected
- [ ] Trainer Utilization lists all Trainer cards sorted by play rate
- [ ] Trainer Utilization color-codes entries: green >70%, yellow 30-70%, red <30%
- [ ] Turn Length Distribution renders a Canvas stacked bar chart with 5-turn buckets
- [ ] All Canvas charts read theme colors from CSS custom properties
- [ ] All Canvas charts have accessible alt text on the `<canvas>` element
- [ ] `transforms.ts` handles empty replays gracefully (0 captured replays shows "insufficient data")
- [ ] Perspective toggle works: switching player1/player2 updates all panels
- [ ] `bun test` passes for `transforms.test.ts` with at least 15 test cases
- [ ] `bunx tsc --noEmit` reports 0 errors for all new files
- [ ] Layout is single-column on screens narrower than 900px

---

## Out of Scope

- Export/download analytics as image or PDF (future enhancement)
- Comparing two simulation runs side-by-side
- Real-time analytics during simulation (panels render only after completion)
- Energy type distribution analysis
- Pokemon-specific KO tracking (which Pokemon took/gave KOs)

---

## Verification

```bash
# All panel component files exist
ls apps/web/src/web/components/AnalyticsDashboard/WinConditionBreakdown/WinConditionBreakdown.tsx
ls apps/web/src/web/components/AnalyticsDashboard/PrizeRaceTimeline/PrizeRaceTimeline.tsx
ls apps/web/src/web/components/AnalyticsDashboard/OpeningHandQuality/OpeningHandQuality.tsx
ls apps/web/src/web/components/AnalyticsDashboard/KeyCardCurves/KeyCardCurves.tsx
ls apps/web/src/web/components/AnalyticsDashboard/TrainerUtilization/TrainerUtilization.tsx
ls apps/web/src/web/components/AnalyticsDashboard/TurnLengthDistribution/TurnLengthDistribution.tsx

# Transform tests pass
bun test apps/web/src/web/components/AnalyticsDashboard/__tests__/transforms.test.ts

# Type check
cd apps/web && bunx tsc --noEmit
```
