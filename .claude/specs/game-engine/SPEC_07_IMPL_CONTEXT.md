# SPEC_07 Implementation Context
## Pokemon TCG Game Engine — Simulation Runner & Metrics

This document gives a new session everything it needs to implement SPEC_07 without prior
conversation history. Read it completely before writing any code.

---

## 1. Project Location & Tooling

**Monorepo root:** `/home/nicks-dgx/dev/.Project-Johto/Pokemon`
**Engine package:** `packages/@engine/`
**Runtime:** Bun 1.3.5 exclusively (no Node, no npm, no yarn)

### Engine package commands (run from monorepo root)

```bash
bun test --cwd packages/@engine             # run all tests
bun run --cwd packages/@engine check-types  # tsc --noEmit
```

### Critical conventions

- Library source lives in **`lib/`**, not `src/`. Do not create or reference an `src/` directory.
- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`
- `moduleResolution: "bundler"` — do NOT add `.js` extensions to imports
- `strict: true` — no `any`, no implicit returns

---

## 2. What Already Exists (SPEC_01 through SPEC_06)

The engine builds cleanly with **342 tests passing, 0 type errors**.

### Current lib/ inventory

```
lib/
├── types/
│   ├── card.ts          # PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition
│   ├── game.ts          # GameState, PlayerState, InPlayPokemon, TurnFlags, PlayerId
│   ├── action.ts        # PlayerAction (14 variants)
│   ├── event.ts         # GameEvent (25+ variants), WinReason
│   ├── effect.ts        # TemporalEffect, EffectChoice, ChoiceResolver
│   └── index.ts         # barrel re-exports
├── core/
│   ├── game.ts          # createGame(GameConfig), checkWinConditions, otherPlayer, GameConfig
│   ├── setup.ts         # Mulligan, initial hands, prizes, bench selection
│   ├── turn.ts          # startTurn, endTurn, getLegalActions, applyAction
│   ├── combat.ts        # resolveAttack, calculateDamage, DamageCalculation
│   ├── checkup.ts       # performCheckup
│   ├── energy.ts        # canPayEnergyCost, canPayRetreatCost
│   ├── evolution.ts     # canEvolve, evolvePokemon
│   ├── conditions.ts    # applySpecialCondition, removeSpecialCondition
│   ├── modifiers.ts     # getEffectiveHp, getEffectiveRetreatCost, etc.
│   ├── result.ts        # GameResult<T>, ok(), err()
│   └── validation.ts    # validateDeck(cardIds, definitions, formatDate)
├── effects/
│   ├── registry.ts      # registerEffect, resolveEffect, etc.
│   ├── primitives.ts    # ~35 pure state transforms
│   ├── attacks.ts       # attack handlers
│   ├── trainers.ts      # core trainer handlers
│   ├── items.ts         # Item handlers
│   ├── supporters.ts    # Supporter handlers
│   ├── stadiums.ts      # Stadium handlers
│   └── tools.ts         # Tool registrations
├── ai/
│   ├── types.ts         # AiStrategy, AiConfig, ScoredAction
│   ├── evaluate.ts      # evaluateBoard, evalPrizeDifferential, etc.
│   ├── strategy.ts      # RandomStrategy, GreedyStrategy, scoreActions
│   ├── player.ts        # playTurn, runSetupPhase, simulateGame
│   └── index.ts         # barrel re-exports
├── adapter.ts           # SQLite → CardDefinition, loadStandardCardPool, validateAceSpec
├── rng.ts               # createRngState, coinFlip, shuffle, randomInt, RngState
└── index.ts             # Public API surface + side-effect imports
```

### Key interfaces and their shapes

```typescript
// core/game.ts
interface GameConfig {
  readonly deck1: ReadonlyArray<string>;    // flat array of cardIds (expanded from counts)
  readonly deck2: ReadonlyArray<string>;    // e.g. ["sv8-167", "sv8-167", "sv8-167", "sv8-167", ...]
  readonly seed: number;
  readonly definitions: ReadonlyMap<string, CardDefinition>;
  readonly formatDate?: Date;
}

// types/game.ts
interface GameState {
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  readonly startingPlayer: PlayerId;
  readonly turnNumber: number;
  readonly phase: GamePhase;   // 'setup' | 'draw' | 'main' | 'attack' | 'checkup' | 'finished'
  readonly stadium: StadiumState | null;
  readonly cardRegistry: ReadonlyMap<string, CardInstance>;
  readonly definitionRegistry: ReadonlyMap<string, CardDefinition>;
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw' | null;
  readonly rngState: RngState;
  readonly turnFlags: TurnFlags;
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;
}

// types/event.ts
type WinReason = 'all_prizes_taken' | 'no_pokemon_in_play' | 'deck_out' | 'tiebreaker';

// ai/player.ts — the single-game runner to wrap
function simulateGame(config1: AiConfig, config2: AiConfig, gameConfig: GameConfig): GameState;
```

### What `validateDeck` already enforces

`validateDeck(cardIds, definitions, formatDate)` in `lib/core/validation.ts` handles:
- Exactly 60 cards
- Max 4 copies per card **name** (Basic Energy exempt) — aggregates by `definition.name`
- Max 1 ACE SPEC
- Standard legality (regulation marks for the given date)

The `DeckInput.cards` in SPEC_07 uses `{ cardId, count }` pairs. The runner must expand these
into a flat `ReadonlyArray<string>` before calling `validateDeck` or `createGame`.

---

## 3. New Files to Create

```
lib/simulation/
├── runner.ts       — runSimulation, runMatchupMatrix, serializeResult, serializeResultSummary
├── opening.ts      — analyzeOpeningHands
└── metrics.ts      — calculateConsistency, computeDeckStats

lib/index.ts        — MODIFY to add simulation exports (see Section 8)

__tests__/simulation/
├── runner.test.ts   — integration tests for runSimulation
├── opening.test.ts  — unit tests for analyzeOpeningHands
└── metrics.test.ts  — unit tests for calculateConsistency
```

---

## 4. Complete Type Signatures

These are the authoritative shapes. Do not deviate.

```typescript
// lib/simulation/runner.ts

interface DeckInput {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
}

interface SimulationConfig {
  readonly deck1: DeckInput;
  readonly deck2: DeckInput;
  readonly games: number;           // default: 1000
  readonly maxTurnsPerGame: number; // default: 200
  readonly ai1Config?: AIConfig;    // see Section 5 for defaults
  readonly ai2Config?: AIConfig;
  readonly seed?: number;           // default: 0
  readonly formatDate?: Date;
  readonly dbPath?: string;         // default: 'database/pokemon-data.sqlite3.db'
}

// AIConfig for the simulation layer (wraps AiConfig from lib/ai/types.ts)
interface AIConfig {
  readonly strategy: 'random' | 'greedy';
}

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

interface DeckStats {
  readonly winsByReason: Record<WinReason, number>;
  readonly averagePrizesTaken: number;
  readonly averagePrizesGiven: number;
  readonly averagePokemonKOd: number;
  readonly averagePokemonLost: number;
  readonly averageTurnsToFirstKO: number;
  readonly averageTurnsToWin: number;   // only for games won
  readonly openingHandStats: OpeningHandStats;
  readonly consistencyScore: number;    // 0.0 - 1.0
  readonly setupSuccessRate: number;    // % of games with no mulligans
}

interface SimulationResult {
  readonly config: SimulationConfig;
  readonly gamesPlayed: number;
  readonly deck1Wins: number;
  readonly deck2Wins: number;
  readonly draws: number;
  readonly deck1WinRate: number;          // 0.0 - 1.0
  readonly deck2WinRate: number;
  readonly averageTurnCount: number;
  readonly medianTurnCount: number;
  readonly averageGameDurationMs: number;
  readonly deck1Stats: DeckStats;
  readonly deck2Stats: DeckStats;
  readonly gameResults: ReadonlyArray<GameResult>;
}

interface MatchupMatrixConfig {
  readonly testDeck: DeckInput;
  readonly opponents: ReadonlyArray<DeckInput>;
  readonly gamesPerMatchup: number;
  readonly seed?: number;
}

interface MatchupMatrixResult {
  readonly testDeck: string;
  readonly matchups: ReadonlyArray<{
    readonly opponent: string;
    readonly winRate: number;
    readonly gamesPlayed: number;
    readonly favorability: 'favorable' | 'even' | 'unfavorable';
  }>;
  readonly overallWinRate: number;
}
```

```typescript
// lib/simulation/opening.ts

interface OpeningHandStats {
  readonly mulliganRate: number;
  readonly averageMulligans: number;
  readonly averageBasicsInOpeningHand: number;
  readonly hasSupporterTurn1Rate: number;
  readonly hasEnergyTurn1Rate: number;
  readonly hasEvolutionTargetRate: number;  // Basic + Evolution card both present
  readonly idealOpeningRate: number;        // Basic + Supporter + Energy all present
}

function analyzeOpeningHands(
  deck: DeckInput,
  definitions: ReadonlyMap<string, CardDefinition>,
  sampleSize: number,
  seed: number
): OpeningHandStats;
```

```typescript
// lib/simulation/metrics.ts

function calculateConsistency(results: ReadonlyArray<GameResult>, stats: DeckStats): number;
function computeDeckStats(
  results: ReadonlyArray<GameResult>,
  playerId: 'player1' | 'player2',
  openingHandStats: OpeningHandStats
): DeckStats;
```

---

## 5. Implementation Design

### 5.1 AIConfig → AiConfig Mapping

`SimulationConfig` takes a simplified `AIConfig` (`strategy: 'random' | 'greedy'`). Map to
the engine's `AiConfig` (from `lib/ai/types.ts`) at the start of `runSimulation`:

```typescript
import { RandomStrategy, GreedyStrategy } from '../ai/strategy';
import type { AiConfig } from '../ai/types';

function resolveAiConfig(ai: AIConfig | undefined, playerId: PlayerId): AiConfig {
  const strategy = ai?.strategy ?? 'greedy';
  return {
    playerId,
    strategy: strategy === 'random' ? new RandomStrategy() : new GreedyStrategy()
  };
}
```

Default when `ai1Config` / `ai2Config` are omitted: `GreedyStrategy`.

### 5.2 DeckInput → flat cardId array

```typescript
function expandDeck(deck: DeckInput): ReadonlyArray<string> {
  return deck.cards.flatMap(({ cardId, count }) => Array(count).fill(cardId));
}
```

The expanded array is what `validateDeck` and `GameConfig.deck1/deck2` expect.

### 5.3 Per-game seed derivation

```typescript
const gameSeed = (config.seed ?? 0) + gameIndex;
```

This ensures determinism (same master seed + same index = same game) and variety across games.

### 5.4 Running a single game

```typescript
import { simulateGame } from '../ai/player';
import type { GameConfig } from '../core/game';

const gameConfig: GameConfig = {
  deck1: expandDeck(config.deck1),
  deck2: expandDeck(config.deck2),
  seed: gameSeed,
  definitions,
  formatDate: config.formatDate
};

const start = performance.now();
const finalState = simulateGame(ai1Config, ai2Config, gameConfig);
const durationMs = performance.now() - start;
```

### 5.5 Extracting stats from GameState

**Winner / reason** — scan `eventLog` for the `GAME_OVER` event:
```typescript
const gameOverEvent = finalState.eventLog.find(e => e.type === 'GAME_OVER');
const winner = gameOverEvent?.winner ?? 'draw';
const winReason = gameOverEvent?.reason ?? 'tiebreaker';
```

**Prize counts** — count `PRIZE_TAKEN` events by player:
```typescript
const p1Prizes = finalState.eventLog.filter(
  e => e.type === 'PRIZE_TAKEN' && e.player === 'player1'
).length;
```

**Pokemon KO'd** — count `POKEMON_KNOCKED_OUT` events. The `player` field is the **owner**
of the KO'd Pokemon (the one who lost it), not the attacker:
```typescript
const p1KOd = finalState.eventLog.filter(
  e => e.type === 'POKEMON_KNOCKED_OUT' && e.player === 'player1'
).length;
```

**Turn count** — `finalState.turnNumber`. Note: this is a global turn counter incremented
on each `startTurn`, not per-player turns.

**First KO turn** — find the turn of the first `POKEMON_KNOCKED_OUT` event:
```typescript
// TURN_STARTED events carry turnNumber, but the log is sequential —
// track turn number alongside events by counting TURN_STARTED events
let currentTurn = 0;
let firstKOTurn = 0;
for (const event of finalState.eventLog) {
  if (event.type === 'TURN_STARTED') currentTurn = event.turnNumber;
  if (event.type === 'POKEMON_KNOCKED_OUT' && firstKOTurn === 0) {
    firstKOTurn = currentTurn;
    break;
  }
}
```

### 5.6 analyzeOpeningHands — pure simulation, no game engine

This function runs independently of full game simulation. It only shuffles and draws 7 cards
N times from the deck. Use `shuffle` and `createRngState` from `lib/rng.ts`.

```typescript
import { createRngState, shuffle } from '../rng';

function analyzeOpeningHands(
  deck: DeckInput,
  definitions: ReadonlyMap<string, CardDefinition>,
  sampleSize: number,
  seed: number
): OpeningHandStats {
  const expanded = expandDeck(deck);  // same helper as runner.ts
  let rng = createRngState(seed);

  let totalMulligans = 0;
  let samplesMulliganed = 0;
  let totalBasics = 0;
  let supporterTurn1 = 0;
  let energyTurn1 = 0;
  let evolutionPairPresent = 0;
  let idealOpening = 0;

  for (let i = 0; i < sampleSize; i++) {
    // Each sample: fresh shuffle from the same deck
    const [shuffled, nextRng] = shuffle([...expanded], rng);
    rng = nextRng;
    const hand = shuffled.slice(0, 7);

    // Count mulligans (no Basic in opening hand → reshuffle until Basic found)
    let mulligans = 0;
    let finalHand = hand;
    let redrawRng = rng;
    while (!hasBasicInHand(finalHand, definitions)) {
      mulligans++;
      const [reshuffled, nextR] = shuffle([...expanded], redrawRng);
      redrawRng = nextR;
      finalHand = reshuffled.slice(0, 7);
    }
    rng = redrawRng;
    if (mulligans > 0) samplesMulliganed++;
    totalMulligans += mulligans;

    // Analyze finalHand (the hand the player actually keeps)
    const handDefs = finalHand.map(id => definitions.get(id)).filter(Boolean) as CardDefinition[];
    const basics = handDefs.filter(d => d.cardType === 'Pokemon' && d.stage === 'Basic');
    const supporters = handDefs.filter(d => d.cardType === 'Trainer' && d.subtype === 'Supporter');
    const energies = handDefs.filter(d => d.cardType === 'Energy');
    const hasEvo = hasEvolutionPair(handDefs);

    totalBasics += basics.length;
    if (supporters.length > 0) supporterTurn1++;
    if (energies.length > 0) energyTurn1++;
    if (hasEvo) evolutionPairPresent++;
    if (basics.length > 0 && supporters.length > 0 && energies.length > 0) idealOpening++;
  }

  return {
    mulliganRate: samplesMulliganed / sampleSize,
    averageMulligans: totalMulligans / sampleSize,
    averageBasicsInOpeningHand: totalBasics / sampleSize,
    hasSupporterTurn1Rate: supporterTurn1 / sampleSize,
    hasEnergyTurn1Rate: energyTurn1 / sampleSize,
    hasEvolutionTargetRate: evolutionPairPresent / sampleSize,
    idealOpeningRate: idealOpening / sampleSize
  };
}
```

**`hasBasicInHand`** — check if any card in the hand is a Basic Pokemon:
```typescript
function hasBasicInHand(
  hand: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, CardDefinition>
): boolean {
  return hand.some(id => {
    const d = definitions.get(id);
    return d?.cardType === 'Pokemon' && d.stage === 'Basic';
  });
}
```

**`hasEvolutionPair`** — check if the hand contains at least one Basic + its Evolution:
```typescript
function hasEvolutionPair(hand: ReadonlyArray<CardDefinition>): boolean {
  const basicNames = new Set(
    hand
      .filter(d => d.cardType === 'Pokemon' && d.stage === 'Basic')
      .map(d => d.name)
  );
  return hand.some(
    d =>
      d.cardType === 'Pokemon' &&
      d.stage !== 'Basic' &&
      d.evolvesFrom !== null &&
      basicNames.has(d.evolvesFrom)
  );
}
```

Note: `PokemonCardDefinition.evolvesFrom` is `string | null`. Access it directly — it's set
by `adaptPokemonRow` in `lib/adapter.ts`.

### 5.7 calculateConsistency — composite 0.0–1.0 metric

Four equal 25% components:

```typescript
function calculateConsistency(
  results: ReadonlyArray<GameResult>,
  stats: DeckStats
): number {
  // 1. Setup rate (no mulligan in opening hand)
  const setupScore = stats.openingHandStats.mulliganRate === 0
    ? 1.0
    : Math.max(0, 1 - stats.openingHandStats.mulliganRate * 2);

  // 2. Turn-1 Supporter access
  const supporterScore = stats.openingHandStats.hasSupporterTurn1Rate;

  // 3. Prize pace variance (low variance in turns-to-first-KO = high consistency)
  // Use coefficient of variation: stdDev / mean, capped at 1.0, inverted
  const firstKOTurns = results
    .filter(r => r.player1PokemonKOd > 0 || r.player2PokemonKOd > 0)
    .map(r => r.totalTurns);  // proxy: use totalTurns as a variance signal
  const prizeVarianceScore = firstKOTurns.length > 1
    ? Math.max(0, 1 - coefficientOfVariation(firstKOTurns))
    : 0.5;

  // 4. Win rate stability (stability = not all wins clustered or all losses — penalize extremes)
  // Score is highest around 0.5 win rate, lowest at 0.0 or 1.0 (pure coin flip or totally dominated)
  const wins = results.filter(r => r.winner === 'player1').length;
  const winRate = wins / results.length;
  const stabilityScore = 1 - Math.abs(winRate - 0.5) * 2;  // 1.0 at 50%, 0.0 at 0% or 100%

  return (setupScore + supporterScore + prizeVarianceScore + stabilityScore) / 4;
}

function coefficientOfVariation(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
```

### 5.8 computeDeckStats — aggregation helper

`computeDeckStats` is called after all games complete. It must aggregate `GameResult[]` from
the perspective of one player:

```typescript
function computeDeckStats(
  results: ReadonlyArray<GameResult>,
  playerId: 'player1' | 'player2',
  openingHandStats: OpeningHandStats
): DeckStats {
  const opponent: PlayerId = playerId === 'player1' ? 'player2' : 'player1';

  const winsByReason: Record<WinReason, number> = {
    all_prizes_taken: 0,
    no_pokemon_in_play: 0,
    deck_out: 0,
    tiebreaker: 0
  };

  let totalPrizesTaken = 0;
  let totalPrizesGiven = 0;
  let totalKOd = 0;
  let totalLost = 0;
  let totalTurnsToFirstKO = 0;
  let firstKOCount = 0;
  let totalTurnsToWin = 0;
  let winCount = 0;

  for (const r of results) {
    if (r.winner === playerId) {
      winsByReason[r.winReason]++;
      totalTurnsToWin += r.totalTurns;
      winCount++;
    }
    const prizesTaken = playerId === 'player1' ? r.player1PrizesTaken : r.player2PrizesTaken;
    const prizesGiven = playerId === 'player1' ? r.player2PrizesTaken : r.player1PrizesTaken;
    const kOd = playerId === 'player1' ? r.player1PokemonKOd : r.player2PokemonKOd;
    const lost = playerId === 'player1' ? r.player2PokemonKOd : r.player1PokemonKOd;

    totalPrizesTaken += prizesTaken;
    totalPrizesGiven += prizesGiven;
    totalKOd += kOd;
    totalLost += lost;

    // First KO proxy: if any KO happened, note the turn count
    if (kOd > 0 || lost > 0) {
      totalTurnsToFirstKO += r.totalTurns;
      firstKOCount++;
    }
  }

  const n = results.length;
  const mulliganRate = openingHandStats.mulliganRate;

  const prelimStats: Omit<DeckStats, 'consistencyScore'> = {
    winsByReason,
    averagePrizesTaken: totalPrizesTaken / n,
    averagePrizesGiven: totalPrizesGiven / n,
    averagePokemonKOd: totalKOd / n,
    averagePokemonLost: totalLost / n,
    averageTurnsToFirstKO: firstKOCount > 0 ? totalTurnsToFirstKO / firstKOCount : 0,
    averageTurnsToWin: winCount > 0 ? totalTurnsToWin / winCount : 0,
    openingHandStats,
    setupSuccessRate: 1 - mulliganRate,
    consistencyScore: 0  // placeholder — filled after calculateConsistency
  };

  const consistencyScore = calculateConsistency(results, { ...prelimStats, consistencyScore: 0 });
  return { ...prelimStats, consistencyScore };
}
```

### 5.9 medianTurnCount helper

```typescript
function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
```

### 5.10 Loading definitions

```typescript
import { loadStandardCardPool } from '../adapter';

const DEFAULT_DB_PATH = 'database/pokemon-data.sqlite3.db';

// In runSimulation:
const formatDate = config.formatDate ?? new Date();
const dbPath = config.dbPath ?? DEFAULT_DB_PATH;
const definitions = loadStandardCardPool(dbPath, formatDate);
```

### 5.11 runMatchupMatrix

Simply iterate over opponents, running `runSimulation` for each matchup:

```typescript
function runMatchupMatrix(config: MatchupMatrixConfig): MatchupMatrixResult {
  const matchups = config.opponents.map((opponent, i) => {
    const result = runSimulation({
      deck1: config.testDeck,
      deck2: opponent,
      games: config.gamesPerMatchup,
      maxTurnsPerGame: 200,
      seed: (config.seed ?? 0) + i * 10000
    });
    const winRate = result.deck1WinRate;
    return {
      opponent: opponent.name,
      winRate,
      gamesPlayed: result.gamesPlayed,
      favorability:
        winRate > 0.55 ? 'favorable' as const
        : winRate < 0.45 ? 'unfavorable' as const
        : 'even' as const
    };
  });

  const overallWinRate = matchups.length > 0
    ? matchups.reduce((sum, m) => sum + m.winRate, 0) / matchups.length
    : 0;

  return {
    testDeck: config.testDeck.name,
    matchups,
    overallWinRate
  };
}
```

### 5.12 serializeResult / serializeResultSummary

```typescript
function serializeResult(result: SimulationResult): string {
  return JSON.stringify(result);
}

function serializeResultSummary(result: SimulationResult): SimulationSummary {
  return {
    deck1: {
      name: result.config.deck1.name,
      winRate: result.deck1WinRate,
      consistency: result.deck1Stats.consistencyScore
    },
    deck2: {
      name: result.config.deck2.name,
      winRate: result.deck2WinRate,
      consistency: result.deck2Stats.consistencyScore
    },
    gamesPlayed: result.gamesPlayed,
    averageTurns: result.averageTurnCount,
    deck1OpeningHand: result.deck1Stats.openingHandStats,
    deck2OpeningHand: result.deck2Stats.openingHandStats
  };
}

interface SimulationSummary {
  readonly deck1: { name: string; winRate: number; consistency: number };
  readonly deck2: { name: string; winRate: number; consistency: number };
  readonly gamesPlayed: number;
  readonly averageTurns: number;
  readonly deck1OpeningHand: OpeningHandStats;
  readonly deck2OpeningHand: OpeningHandStats;
}
```

---

## 6. Test Strategy

### runner.test.ts

Tests require two valid 60-card decks. The test suite uses a `makeMinimalDeck()` helper that
constructs 60-card decks from whatever is in the real SQLite database. Example approach:

```typescript
// Load definitions once at the top of the test file
import { loadStandardCardPool } from '../../lib/adapter';
const DB_PATH = 'database/pokemon-data.sqlite3.db';
const definitions = loadStandardCardPool(DB_PATH, new Date('2025-01-01'));

// Build a legal 60-card deck from available cards
function makeMinimalDeck(name: string): DeckInput {
  // Pick 1 Basic Pokemon (4 copies), rest is Basic Energy (56 copies)
  const basicPokemon = [...definitions.values()].find(
    d => d.cardType === 'Pokemon' && d.stage === 'Basic'
  )!;
  const fireEnergy = [...definitions.values()].find(
    d => d.cardType === 'Energy' && d.subtype === 'Basic'
  )!;
  return {
    name,
    cards: [
      { cardId: basicPokemon.id, count: 4 },
      { cardId: fireEnergy.id, count: 56 }
    ]
  };
}
```

Required tests:
1. `runSimulation` with N=10 games completes without error; `gamesPlayed === 10`
2. `deck1Wins + deck2Wins + draws === gamesPlayed`
3. `deck1WinRate + deck2WinRate` is approximately `1.0` (ignoring draws edge case)
4. Same seed produces identical `gameResults` (determinism check)
5. Different seeds produce different outcomes
6. `GameResult` fields are present and non-negative for each game
7. `averageTurnCount` is positive

### opening.test.ts

Tests that are fully self-contained (no SQLite needed — construct `definitions` map directly):

1. Deck with no Basics → `mulliganRate > 0` (all draws require mulligan)
2. Deck with all Basics → `mulliganRate === 0`
3. Deck with 4 Supporters → `hasSupporterTurn1Rate > 0`
4. `averageBasicsInOpeningHand` is within [0, 7]
5. All rate fields are in [0, 1]
6. Same seed, same deck → identical result (determinism)

Use in-memory `CardDefinition` objects (not SQLite) for opening hand tests. Construct minimal
`PokemonCardDefinition` objects with `cardType: 'Pokemon'`, `stage: 'Basic'`, etc. The test
file for combat (referenced in SPEC_05) shows the pattern for building `CardDefinition` test
fixtures.

### metrics.test.ts

1. `calculateConsistency` returns value in [0, 1]
2. Perfect setup deck (0 mulligans, Supporters always in hand) scores higher than chaotic deck
3. `computeDeckStats` correctly aggregates wins/losses/prizes from a fixed `GameResult[]`

---

## 7. Known Pitfalls

### P1: `GameConfig.deck1/deck2` must be flat expanded arrays

`createGame` (and `validateDeck`) expect `ReadonlyArray<string>` where each entry is a
cardId repeated `count` times. Do NOT pass `DeckInput.cards` directly.

### P2: `simulateGame` may return a non-`'finished'` state

If the game hits the 200-turn guard, `state.phase` may be `'checkup'` or `'main'`, and
`state.winner` may be `null`. Guard against this:

```typescript
const winner = finalState.winner ?? 'draw';
const gameOverEvent = finalState.eventLog.findLast(e => e.type === 'GAME_OVER');
const winReason: WinReason = (gameOverEvent as { reason: WinReason } | undefined)?.reason
  ?? 'tiebreaker';
```

### P3: `loadStandardCardPool` opens and closes a SQLite connection

Call it **once** before the simulation loop. Do not call it inside the per-game loop.

### P4: `shuffle` signature

`shuffle` from `lib/rng.ts` returns `[shuffledArray, nextRngState]`. Always thread the
returned `nextRngState` forward for the next shuffle call.

### P5: `evolvesFrom` field name

`PokemonCardDefinition.evolvesFrom` is `string | null`. The database column is `evolves_from`
but after adaptation via `adaptPokemonRow`, the TypeScript field is camelCase `evolvesFrom`.

### P6: `PRIZE_TAKEN` vs prizes remaining in state

Use eventLog events — do NOT try to infer prizes taken from `state.players.player1.prizes.length`
(initial prize count varies by game). The event log is the authoritative record.

### P7: `performance.now()` availability

Bun supports `performance.now()` natively. Use it directly.

---

## 8. Public API Additions to lib/index.ts

Append to the existing `lib/index.ts` (do NOT rewrite the file — it has many existing exports):

```typescript
// Simulation
export type {
  DeckInput,
  SimulationConfig,
  SimulationResult,
  GameResult as SimGameResult,
  DeckStats,
  MatchupMatrixConfig,
  MatchupMatrixResult,
  SimulationSummary
} from './simulation/runner';
export {
  runSimulation,
  runMatchupMatrix,
  serializeResult,
  serializeResultSummary
} from './simulation/runner';
export type { OpeningHandStats } from './simulation/opening';
export { analyzeOpeningHands } from './simulation/opening';
```

Note: `GameResult` from the simulation layer clashes with `GameResult<T>` from `core/result.ts`
(already exported as `GameResult`). Export the simulation one as `SimGameResult`.

---

## 9. Acceptance Criteria Checklist

Before closing the session:

- [ ] `bun test --cwd packages/@engine` passes (342 + new tests, 0 fail)
- [ ] `bun run --cwd packages/@engine check-types` shows no output
- [ ] `runSimulation({ games: 10, ... })` completes in < 30s
- [ ] `gamesPlayed === config.games` for all results
- [ ] `deck1Wins + deck2Wins + draws === gamesPlayed`
- [ ] Same seed → same `gameResults` (run twice, compare)
- [ ] `OpeningHandStats` all fields in [0, 1]
- [ ] `consistencyScore` in [0, 1]
- [ ] `serializeResult` produces valid JSON
- [ ] `runMatchupMatrix` produces one matchup entry per opponent
- [ ] `lib/index.ts` exports all simulation types listed in Section 8
