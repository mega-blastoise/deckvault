# SPEC_06: Simulation Runner & Metrics

## Context

The simulation runner is the user-facing feature. It takes two decks, runs N games, and produces statistical analysis. This is what powers "test my deck" and "check this matchup" on the platform.

---

## Prerequisites

- SPEC_01 through SPEC_05

---

## Requirements

### 1. Simulation Runner

```typescript
// src/simulation/runner.ts

interface SimulationConfig {
  readonly deck1: DeckInput;
  readonly deck2: DeckInput;
  readonly games: number;                     // number of games to simulate (default: 1000)
  readonly maxTurnsPerGame: number;            // safety limit (default: 200)
  readonly ai1Config?: AIConfig;
  readonly ai2Config?: AIConfig;
  readonly seed?: number;                      // master seed (each game derives its own)
  readonly formatDate?: Date;                  // determines Standard rotation (defaults to current date)
  readonly dbPath?: string;                    // path to pokemon-data.sqlite3.db (defaults to database/pokemon-data.sqlite3.db)
}

interface DeckInput {
  readonly name: string;
  readonly cards: ReadonlyArray<{ cardId: string; count: number }>;
  // NOTE: `cardId` is set-specific (e.g. "sv8-167"). The 4-copy deck limit (rulebook p.22)
  // is per card NAME, not per card ID. A deck can have 4x "Nest Ball" from different sets
  // (different cardIds). Deck validation must aggregate by `definitions.get(cardId).name`
  // to enforce the 4-copy rule. Basic Energy is exempt (unlimited copies).
}

interface SimulationResult {
  readonly config: SimulationConfig;
  readonly gamesPlayed: number;
  readonly deck1Wins: number;
  readonly deck2Wins: number;
  readonly draws: number;
  readonly deck1WinRate: number;               // 0.0 - 1.0
  readonly deck2WinRate: number;
  readonly averageTurnCount: number;
  readonly medianTurnCount: number;
  readonly averageGameDurationMs: number;
  readonly deck1Stats: DeckStats;
  readonly deck2Stats: DeckStats;
  readonly gameResults: ReadonlyArray<GameResult>;
}

function runSimulation(config: SimulationConfig): SimulationResult;
```

### 2. Per-Game Results

```typescript
interface GameResult {
  readonly gameIndex: number;
  readonly seed: number;
  readonly winner: PlayerId | 'draw';
  readonly winReason: WinReason;
  readonly totalTurns: number;
  readonly durationMs: number;
  readonly player1PrizesTaken: number;
  readonly player2PrizesTaken: number;
  readonly player1PokemonKOd: number;
  readonly player2PokemonKOd: number;
}
```

### 3. Aggregate Deck Statistics

```typescript
interface DeckStats {
  readonly winsByReason: Record<WinReason, number>;
  readonly averagePrizesTaken: number;
  readonly averagePrizesGiven: number;
  readonly averagePokemonKOd: number;
  readonly averagePokemonLost: number;
  readonly averageTurnsToFirstKO: number;
  readonly averageTurnsToWin: number;          // only for games won
  readonly openingHandStats: OpeningHandStats;
  readonly consistencyScore: number;           // 0.0 - 1.0 (see below)
  readonly setupSuccessRate: number;           // % of games with no mulligans
}
```

### 4. Opening Hand Analysis

This answers "how often does my deck set up well?"

```typescript
// src/simulation/opening.ts

interface OpeningHandStats {
  readonly mulliganRate: number;               // % of games requiring mulligan
  readonly averageMulligans: number;           // mean mulligans per game
  readonly averageBasicsInOpeningHand: number;
  readonly hasSupporterTurn1Rate: number;      // % of games with Supporter in opening hand
  readonly hasEnergyTurn1Rate: number;         // % of games with Energy in opening hand
  readonly hasEvolutionTargetRate: number;     // % of games with evo target + evo card
  readonly idealOpeningRate: number;           // % with Basic + Supporter + Energy
}

function analyzeOpeningHands(
  deck: DeckInput,
  definitions: ReadonlyMap<string, CardDefinition>,
  sampleSize: number,
  seed: number
): OpeningHandStats;
```

`analyzeOpeningHands` can run independently of full game simulation — it only shuffles and draws 7 cards N times.

### 5. Consistency Score

A composite metric (0.0 - 1.0) measuring how reliably a deck executes its game plan:

```typescript
// src/simulation/metrics.ts

function calculateConsistency(results: ReadonlyArray<GameResult>, stats: DeckStats): number;
```

Factors:
- **Setup rate** (25%): How often does the deck avoid mulligans?
- **Turn-1 Supporter access** (25%): How often can the deck draw/search on turn 1?
- **Prize pace variance** (25%): How consistent is the turn-to-first-KO? (low std dev = high score)
- **Win rate stability** (25%): Is the win rate stable across the simulation? (not high-variance coin-flip dependent)

### 6. Matchup Matrix (Stretch Goal)

For testing a deck against multiple opponents:

```typescript
interface MatchupMatrixConfig {
  readonly testDeck: DeckInput;
  readonly opponents: ReadonlyArray<DeckInput>;
  readonly gamesPerMatchup: number;
  readonly seed?: number;
}

interface MatchupMatrixResult {
  readonly testDeck: string;                   // deck name
  readonly matchups: ReadonlyArray<{
    readonly opponent: string;
    readonly winRate: number;
    readonly gamesPlayed: number;
    readonly favorability: 'favorable' | 'even' | 'unfavorable';  // >55%, 45-55%, <45%
  }>;
  readonly overallWinRate: number;
}

function runMatchupMatrix(config: MatchupMatrixConfig): MatchupMatrixResult;
```

### 7. Performance Requirements

| Metric | Target |
|--------|--------|
| Single game (AI vs AI) | < 50ms |
| 1000-game simulation | < 30 seconds |
| Opening hand analysis (10,000 samples) | < 1 second |
| Memory per game | < 5MB (state + event log) |

These targets are for Bun runtime on modern hardware. The engine must not block the event loop for extended periods. For web API integration, simulations > 100 games should run in a worker.

### 8. Output Format

Simulation results serialize to JSON for API consumption:

```typescript
function serializeResult(result: SimulationResult): string;
function serializeResultSummary(result: SimulationResult): SimulationSummary;

interface SimulationSummary {
  readonly deck1: { name: string; winRate: number; consistency: number };
  readonly deck2: { name: string; winRate: number; consistency: number };
  readonly gamesPlayed: number;
  readonly averageTurns: number;
  readonly deck1OpeningHand: OpeningHandStats;
  readonly deck2OpeningHand: OpeningHandStats;
}
```

### 9. Public API Surface

```typescript
// src/index.ts — the package's public exports

export { runSimulation, type SimulationConfig, type SimulationResult } from './simulation/runner';
export { runMatchupMatrix, type MatchupMatrixConfig, type MatchupMatrixResult } from './simulation/runner';
export { analyzeOpeningHands, type OpeningHandStats } from './simulation/opening';
export { createGame, type GameConfig } from './core/game';
export { createAIPlayer, type AIPlayer, type AIConfig } from './ai/player';
export { adaptCard, type CardDefinition } from './adapter';
export type { GameState, PlayerState, InPlayPokemon } from './types/game';
export type { PlayerAction } from './types/action';
export type { GameEvent, WinReason } from './types/event';
```

### 10. REST API Integration (Sketch)

Not implemented in this spec, but the engine is designed for this endpoint shape:

```
POST /api/simulate
Body: { deck1: DeckInput, deck2: DeckInput, games: number }
Response: SimulationSummary

POST /api/simulate/opening-hand
Body: { deck: DeckInput, samples: number }
Response: OpeningHandStats
```

---

## Acceptance Criteria

- [ ] `runSimulation` completes 1000 games in < 30 seconds
- [ ] Results include correct win/loss/draw tallies that sum to `gamesPlayed`
- [ ] `OpeningHandStats` mulliganRate matches expected probability for a given deck composition
- [ ] Consistency score is between 0.0 and 1.0 and correlates with deck quality
- [ ] Different seeds produce different game outcomes
- [ ] Same seed produces identical results (determinism)
- [ ] `GameResult` records correct winner, reason, and prize counts
- [ ] Results serialize to valid JSON
- [ ] Engine handles edge cases: both players deck-out, both players take last prize simultaneously
- [ ] Memory usage stays under 5MB per game
- [ ] `runMatchupMatrix` produces win rates for each opponent
