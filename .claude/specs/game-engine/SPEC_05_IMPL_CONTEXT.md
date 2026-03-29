# SPEC_05 Implementation Context
## Pokemon TCG Game Engine — Heuristic AI Player

This document gives a new session everything it needs to implement SPEC_05 without prior
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

### Critical directory convention

Library source lives in **`lib/`**, not `src/`. Do not create or reference an `src/` directory.

### TypeScript config notes

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`
- `moduleResolution: "bundler"` — do NOT add `.js` extensions to imports
- `strict: true` — no `any`, no implicit returns

---

## 2. What Already Exists (SPEC_01 through SPEC_04B)

All files are in `packages/@engine/lib/`. The package builds cleanly with **307 tests passing**.

### Current file inventory

```
lib/
├── types/
│   ├── card.ts          # PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition
│   ├── game.ts          # GameState, PlayerState, InPlayPokemon, TurnFlags
│   ├── action.ts        # PlayerAction (14 variants)
│   ├── event.ts         # GameEvent (25+ variants)
│   ├── effect.ts        # TemporalEffect, EffectChoice, ChoiceResolver
│   └── index.ts         # barrel re-exports
├── core/
│   ├── game.ts          # createGame, checkWinConditions, handleKnockOut, promoteFromBench, otherPlayer
│   ├── setup.ts         # Mulligan, initial hands, prizes, bench selection
│   ├── turn.ts          # startTurn, endTurn, getLegalActions, applyAction
│   ├── combat.ts        # resolveAttack, calculateDamage, checkKnockOuts, DamageCalculation
│   ├── checkup.ts       # performCheckup (poison, burn, sleep, paralyzed)
│   ├── energy.ts        # canPayEnergyCost, canPayRetreatCost
│   ├── evolution.ts     # canEvolve, evolvePokemon
│   ├── conditions.ts    # applySpecialCondition, removeSpecialCondition, clearSpecialConditions
│   ├── modifiers.ts     # getEffectiveHp, getEffectiveRetreatCost, getEffectiveAttackCost,
│   │                    # getDamageOutputModifiers, getDamageInputModifiers, resolveOnKOTriggers,
│   │                    # resolveOnDamageTriggers, checkSurvivalEffects, modifyPrizeCount, etc.
│   ├── result.ts        # GameResult<T>, ok(), err()
│   └── validation.ts    # validateDeck
├── effects/
│   ├── registry.ts      # typed registries (attack/ability/trainer), resolveEffect facade
│   ├── primitives.ts    # ~35 pure state transforms (draw, discard, search, heal, flip, etc.)
│   ├── attacks.ts       # ~30 generic attack pattern handlers
│   ├── trainers.ts      # 14 core trainer handlers (Nest Ball, Ultra Ball, etc.)
│   ├── items.ts         # ~80 Item handlers (all GHI Standard Items)
│   ├── supporters.ts    # ~95 Supporter handlers (all GHI Standard Supporters)
│   ├── stadiums.ts      # 35 Stadium handlers
│   └── tools.ts         # 53 Tool registrations
├── adapter.ts           # SQLite card row → engine CardDefinition
├── rng.ts               # Seeded PRNG (coinFlip, shuffle, randomInt)
└── index.ts             # Public API surface + side-effect imports
```

### Key types the AI will work with

```typescript
// types/action.ts — complete PlayerAction union (14 variants)
export type PlayerAction =
  | { readonly type: 'DRAW_CARD' }
  | { readonly type: 'PLAY_BASIC_TO_BENCH'; readonly cardInstanceId: string }
  | { readonly type: 'EVOLVE_POKEMON'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'ATTACH_ENERGY'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'PLAY_TRAINER'; readonly cardInstanceId: string; readonly targets?: ReadonlyArray<string> }
  | { readonly type: 'USE_ABILITY'; readonly pokemonInstanceId: string; readonly abilityIndex: number }
  | { readonly type: 'RETREAT'; readonly newActiveInstanceId: string; readonly energyToDiscard: ReadonlyArray<string> }
  | { readonly type: 'ATTACK'; readonly attackIndex: number }
  | { readonly type: 'PASS' }
  | { readonly type: 'SELECT_ACTIVE'; readonly cardInstanceId: string }
  | { readonly type: 'SELECT_BENCH'; readonly cardInstanceIds: ReadonlyArray<string> }
  | { readonly type: 'MULLIGAN_REDRAW' }
  | { readonly type: 'COIN_FLIP_CHOICE'; readonly choice: 'first' | 'second' }
  | { readonly type: 'ATTACH_TOOL'; readonly cardInstanceId: string; readonly targetInstanceId: string };
```

```typescript
// types/game.ts — key structures
interface InPlayPokemon {
  readonly instanceId: string;
  readonly evolutionStack: ReadonlyArray<string>;   // bottom=Basic, top=current form
  readonly attachedEnergy: ReadonlyArray<string>;   // energy instance IDs
  readonly attachedTools: ReadonlyArray<string>;    // tool instance IDs (max 1)
  readonly damageCounters: number;                  // 1 counter = 10 HP damage
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;
  readonly turnEvolved: number | null;
  readonly isNewThisTurn: boolean;
}

interface PlayerState {
  readonly id: PlayerId;
  readonly deck: ReadonlyArray<string>;
  readonly hand: ReadonlyArray<string>;
  readonly prizes: ReadonlyArray<string>;           // remaining prizes to take
  readonly active: InPlayPokemon | null;
  readonly bench: ReadonlyArray<InPlayPokemon>;     // 0–5 Pokemon
  readonly discard: ReadonlyArray<string>;
  readonly lostZone: ReadonlyArray<string>;
  readonly supporterPlayedThisTurn: boolean;
  readonly stadiumPlayedThisTurn: boolean;
  readonly energyAttachedThisTurn: boolean;
  readonly retreatedThisTurn: boolean;
}

interface TurnFlags {
  readonly attackUsed: boolean;
  readonly isStartingPlayerFirstTurn: boolean;     // blocks attacks + supporters turn 1
  readonly turnEndedByEffect: boolean;
  readonly mulliganCounts: Readonly<Record<PlayerId, number>>;
  readonly extraDrawsRemaining: Readonly<Record<PlayerId, number>>;
  readonly setupBenchSelected: Readonly<Record<PlayerId, boolean>>;
}
```

### Key functions the AI needs to call

```typescript
// From lib/core/turn.ts
getLegalActions(state: GameState): PlayerAction[]
applyAction(state: GameState, action: PlayerAction): GameResult<GameState>
startTurn(state: GameState): GameState
endTurn(state: GameState): GameState

// From lib/core/game.ts
checkWinConditions(state: GameState): GameState
otherPlayer(player: PlayerId): PlayerId

// From lib/core/combat.ts
calculateDamage(attacker, defender, attack, attackerDef, defenderDef, state): DamageCalculation

// From lib/core/modifiers.ts
getEffectiveHp(state, pokemon, pokemonDef, player): number
getEffectiveHpById(state, pokemon): number   // resolves def internally
getEffectiveRetreatCost(state, player, pokemon, def): number
getEffectiveAttackCost(state, pokemon, def, attack, player): ReadonlyArray<EnergyType>
getDamageOutputModifiers(state, attacker, attackerDef, defender, defenderDef, player): DamageOutputModifierResult
getDamageInputModifiers(state, defender, defenderDef, attacker, attackerDef, player): DamageInputModifierResult
```

### How the game loop works

```
createGame(config)
   │
   ▼
[setup phase]
  SELECT_ACTIVE → SELECT_BENCH → (opponent SELECT_BENCH)
   │
   ▼
[main game loop — repeat until state.phase === 'finished']
  startTurn(state)
   │
   ▼
  getLegalActions(state)      ← returns [] only when turn is completely done
   │
   ▼ pick an action
  applyAction(state, action)  ← returns GameResult<GameState>
   │                            on ATTACK: endTurn is called internally
   │                            on PASS: turn stays open unless no better action
   ▼
  [repeat getLegalActions → applyAction until done or ATTACK used]
   │
   ▼ (endTurn is called inside applyAction after ATTACK, or explicitly)
  performCheckup(state)        ← called inside endTurn automatically
   │
   ▼
  checkWinConditions(state)
   │
   ▼ next player's turn
```

Note: `endTurn` calls `performCheckup` internally. The AI does NOT need to call these
directly — they are invoked by `applyAction` when an ATTACK is submitted, and
`startTurn` handles drawing for the next player.

A turn is "done" when `getLegalActions(state)` returns only `[{ type: 'PASS' }]` or
the `attackUsed` flag is set.

---

## 3. The Problem This Spec Solves

The engine can determine legal actions and apply them, but has no decision-making system.
For the simulation runner (SPEC_07) to work, something must choose actions on behalf of each
player. That something is the AI player.

Without an AI player:
- No automated game simulation is possible
- Deck win-rate testing is blocked
- Matchup analysis is blocked

The AI does NOT need to play optimally — it needs to play **legally and reasonably**:
- Never make an illegal move
- Not loop infinitely
- Make decisions that resemble a competent player (attack when able, build up energy, etc.)

Two strategies are required:
1. **RandomStrategy** — for stress-testing and baseline measurements
2. **GreedyStrategy** — for meaningful simulation results

---

## 4. Architecture Design

```
lib/ai/
├── types.ts          # AiStrategy interface, AiConfig, ScoredAction
├── evaluate.ts       # Board state evaluation functions (pure, no side effects)
├── strategy.ts       # RandomStrategy and GreedyStrategy implementations
├── player.ts         # playTurn: drives a full turn using getLegalActions + applyAction
└── index.ts          # Public API exports
```

### Core design principle: pure functions consuming the existing API

The AI is a **pure consumer** of the existing engine API. It calls:
- `getLegalActions(state)` to discover what moves are available
- `applyAction(state, action)` to execute the chosen move

It does NOT:
- Modify any core engine files
- Add new game state fields
- Create new action types
- Bypass the legal action check

```typescript
// lib/ai/types.ts

export interface AiStrategy {
  // Choose one action from the list of legal actions.
  // Called once per action opportunity during a turn.
  chooseAction(state: GameState, legalActions: ReadonlyArray<PlayerAction>, playerId: PlayerId): PlayerAction;
}

export interface AiConfig {
  readonly strategy: AiStrategy;
  readonly playerId: PlayerId;
  // Optional: max iterations guard to prevent infinite loops in degenerate states
  readonly maxActionsPerTurn?: number;
}

export interface ScoredAction {
  readonly action: PlayerAction;
  readonly score: number;
}
```

### The turn loop in player.ts

```typescript
// lib/ai/player.ts
export function playTurn(state: GameState, config: AiConfig): GameState {
  let s = state;
  const maxActions = config.maxActionsPerTurn ?? 100;
  let iterations = 0;

  while (s.phase !== 'finished' && iterations < maxActions) {
    iterations++;
    const legal = getLegalActions(s);

    // Turn is done when only PASS remains or no actions exist
    if (legal.length === 0) break;
    if (legal.length === 1 && legal[0]!.type === 'PASS') break;

    const chosen = config.strategy.chooseAction(s, legal, config.playerId);
    const result = applyAction(s, chosen);
    if (!result.ok) break; // Should not happen with legal actions
    s = result.value;

    // After an attack, the turn ends automatically inside applyAction
    if (s.phase === 'checkup' || s.phase === 'finished') break;
  }

  return s;
}
```

### Full game simulation

```typescript
// lib/ai/player.ts (continued)
export function simulateGame(
  config1: AiConfig,
  config2: AiConfig,
  gameConfig: GameConfig
): GameState {
  const result = createGame(gameConfig);
  if (!result.ok) throw new Error(result.error.message);
  let state = result.value;

  // Run setup phase: both players select active and bench
  state = runSetupPhase(state, config1, config2);

  let iterations = 0;
  const maxTurns = 200; // guard against infinite games

  while (state.phase !== 'finished' && iterations < maxTurns) {
    iterations++;
    state = startTurn(state);
    const activeConfig = state.activePlayer === 'player1' ? config1 : config2;
    state = playTurn(state, activeConfig);
  }

  return state;
}
```

---

## 5. Board State Evaluation (evaluate.ts)

All evaluation functions are **pure**: `(state: GameState, playerId: PlayerId) => number`.
Higher scores are always better for `playerId`.

### Prize differential

```typescript
// Positive = you are ahead (fewer prizes remaining = closer to win)
function evalPrizeDifferential(state: GameState, playerId: PlayerId): number {
  const mine = state.players[playerId].prizes.length;
  const theirs = state.players[otherPlayer(playerId)].prizes.length;
  return (theirs - mine) * 20; // 20 points per prize lead
}
```

### Active Pokemon health

```typescript
// Positive = our active is healthy relative to theirs
function evalActiveHealth(state: GameState, playerId: PlayerId): number {
  const myActive = state.players[playerId].active;
  const oppActive = state.players[otherPlayer(playerId)].active;
  if (!myActive || !oppActive) return 0;

  const myHp = getEffectiveHpById(state, myActive);
  const myRemaining = myHp - myActive.damageCounters * 10;
  const myPct = myRemaining / myHp;

  const oppHp = getEffectiveHpById(state, oppActive);
  const oppRemaining = oppHp - oppActive.damageCounters * 10;
  const oppPct = oppRemaining / oppHp;

  return (myPct - oppPct) * 50;
}
```

### Damage potential (KO threat)

Compute expected damage for each legal attack against the opponent's Active. If we can
one-shot their Active, add a large bonus (taking a prize is very high value).

```typescript
function evalKOPotential(
  state: GameState,
  playerId: PlayerId,
  defState: GameState   // same state, just for clarity
): number {
  const attacker = state.players[playerId].active;
  const defender = state.players[otherPlayer(playerId)].active;
  if (!attacker || !defender) return 0;

  // resolve attacker def and defender def via registry...
  // for each attack, compute calculateDamage and compare to defender remaining HP
  // if KO possible: +100 bonus
  // if nearly KO (>= 50% of remaining HP): +30 bonus
  return score;
}
```

### Bench strength

```typescript
// More bench Pokemon + higher stage = better position
function evalBenchStrength(state: GameState, playerId: PlayerId): number {
  const bench = state.players[playerId].bench;
  let score = 0;
  for (const p of bench) {
    score += 5; // any benched Pokemon is good
    const topDef = resolveTopDef(state, p); // helper
    if (topDef?.stage === 'Stage1') score += 5;
    if (topDef?.stage === 'Stage2') score += 10;
  }
  return score;
}
```

### Energy advantage

Count energy attached to your Active vs opponent's Active:

```typescript
function evalEnergyAdvantage(state: GameState, playerId: PlayerId): number {
  const myActive = state.players[playerId].active;
  const oppActive = state.players[otherPlayer(playerId)].active;
  const myEnergy = myActive?.attachedEnergy.length ?? 0;
  const oppEnergy = oppActive?.attachedEnergy.length ?? 0;
  return (myEnergy - oppEnergy) * 5;
}
```

### Type advantage (weakness check)

```typescript
function evalTypeAdvantage(state: GameState, playerId: PlayerId): number {
  const attacker = state.players[playerId].active;
  const defender = state.players[otherPlayer(playerId)].active;
  if (!attacker || !defender) return 0;

  const attackerDef = resolveTopDef(state, attacker);
  const defenderDef = resolveTopDef(state, defender);
  if (!attackerDef || !defenderDef) return 0;

  // Check if attacker's type hits defender's weakness
  let score = 0;
  for (const attackType of attackerDef.types) {
    if (defenderDef.weaknesses.some(w => w.type === attackType)) {
      score += 30; // we hit their weakness
    }
    if (defenderDef.resistances.some(r => r.type === attackType)) {
      score -= 10; // they resist us
    }
  }
  return score;
}
```

### Combined board score

```typescript
export function evaluateBoard(state: GameState, playerId: PlayerId): number {
  return (
    evalPrizeDifferential(state, playerId) +
    evalActiveHealth(state, playerId) +
    evalKOPotential(state, playerId) +
    evalBenchStrength(state, playerId) +
    evalEnergyAdvantage(state, playerId) +
    evalTypeAdvantage(state, playerId)
  );
}
```

---

## 6. Action Scoring (strategy.ts — GreedyStrategy)

For each legal action, the GreedyStrategy simulates applying it and scores the resulting
state. The action with the highest resulting board score is chosen.

However, calling `applyAction` for every legal action on every choice is expensive when
many actions exist. Use a hybrid approach: **direct scoring for cheap decisions, simulation
for expensive ones (attacks)**.

### Action-type scoring heuristics

| Action Type | Score approach |
|-------------|---------------|
| `ATTACK` | Simulate: apply action, evaluate resulting state |
| `EVOLVE_POKEMON` | High base score (+80) — always good, increases HP |
| `PLAY_TRAINER` | Depends on subtype (see below) |
| `ATTACH_ENERGY` | Score based on target: Active toward attack cost (+30), Bench (+10) |
| `RETREAT` | Score by simulating resulting board: bench Pokemon HP + type advantage |
| `PLAY_BASIC_TO_BENCH` | Bench safety (+20 per Basic, higher if bench is empty) |
| `USE_ABILITY` | Simulate: apply and evaluate |
| `ATTACH_TOOL` | +25 if tool provides damage bonus, +20 if HP bonus |
| `PASS` | 0 — always last resort |
| Setup actions | Deterministic (see §7) |

### Trainer subtype scoring

```typescript
function scoreTrainer(
  state: GameState,
  cardInstanceId: string,
  playerId: PlayerId
): number {
  const inst = state.cardRegistry.get(cardInstanceId);
  const def = inst ? state.definitionRegistry.get(inst.definitionId) : null;
  if (!def || def.cardType !== 'Trainer') return 0;

  const subtypes = def.subtypes;

  // Draw supporters (Prof Research, Iono, Judge) — very high priority when hand is small
  if (subtypes.includes('Supporter')) {
    const handSize = state.players[playerId].hand.length;
    if (handSize <= 3) return 90;  // desperately need cards
    if (handSize <= 5) return 60;
    return 30;
  }

  // Search items (Nest Ball, Ultra Ball) — high value, bench Pokemon
  if (subtypes.includes('Item')) {
    // Rough heuristic: Items are generally good
    return 50;
  }

  // Stadiums — moderate value
  if (subtypes.includes('Stadium')) return 35;

  return 25;
}
```

### Energy attachment scoring

Attach energy to Active if it brings us closer to attacking, otherwise bench:

```typescript
function scoreEnergyAttach(
  state: GameState,
  cardInstanceId: string,
  targetInstanceId: string,
  playerId: PlayerId
): number {
  const player = state.players[playerId];
  const isActive = player.active?.instanceId === targetInstanceId;

  if (!isActive) return 10; // bench attachment is generally weak

  const active = player.active!;
  const activeDef = resolveTopDef(state, active);
  if (!activeDef) return 10;

  // Count attacks that become payable after this attachment
  const energyAfter = active.attachedEnergy.length + 1;
  for (const attack of activeDef.attacks) {
    if (attack.cost.length <= energyAfter) return 40; // enables an attack
  }

  return 25; // helpful but doesn't unlock attack yet
}
```

### Retreat scoring

Only retreat when the bench has a better matchup or the Active is near KO:

```typescript
function scoreRetreat(
  state: GameState,
  newActiveInstanceId: string,
  playerId: PlayerId
): number {
  const myActive = state.players[playerId].active!;
  const myHp = getEffectiveHpById(state, myActive);
  const myRemaining = myHp - myActive.damageCounters * 10;
  const myHpPct = myRemaining / myHp;

  // Retreating from a healthy active loses tempo
  if (myHpPct > 0.6) return -30;

  // Check if new active has better matchup
  const oppActive = state.players[otherPlayer(playerId)].active;
  if (!oppActive) return 0;

  const newActive = state.players[playerId].bench.find(
    b => b.instanceId === newActiveInstanceId
  );
  if (!newActive) return 0;

  const newActiveDef = resolveTopDef(state, newActive);
  const oppActiveDef = resolveTopDef(state, oppActive);
  if (!newActiveDef || !oppActiveDef) return 0;

  let score = 0;
  // New active hits opponent's weakness
  for (const t of newActiveDef.types) {
    if (oppActiveDef.weaknesses.some(w => w.type === t)) score += 40;
  }
  // New active is not weak to opponent
  for (const t of (oppActiveDef.types ?? [])) {
    if (newActiveDef.weaknesses.some(w => w.type === t)) score -= 20;
  }

  return score;
}
```

---

## 7. Setup Phase Handling

The setup phase uses different action types than the main game. The AI must handle:

1. **`COIN_FLIP_CHOICE`** — always choose `'first'` (go first is generally advantageous)
2. **`SELECT_ACTIVE`** — pick the Basic Pokemon with highest HP from hand
3. **`SELECT_BENCH`** — fill the bench with as many Basics as possible (up to 5)
4. **`MULLIGAN_REDRAW`** — always accept (no choice; forced if no Basic in hand)

```typescript
function handleSetupAction(
  state: GameState,
  legal: ReadonlyArray<PlayerAction>,
  playerId: PlayerId
): PlayerAction {
  // COIN_FLIP_CHOICE: always go first
  const coinFlip = legal.find(a => a.type === 'COIN_FLIP_CHOICE');
  if (coinFlip) return { type: 'COIN_FLIP_CHOICE', choice: 'first' };

  // MULLIGAN_REDRAW: forced action, just do it
  const mulligan = legal.find(a => a.type === 'MULLIGAN_REDRAW');
  if (mulligan) return mulligan;

  // SELECT_ACTIVE: pick highest-HP Basic from available options
  const selectActives = legal.filter((a): a is { type: 'SELECT_ACTIVE'; cardInstanceId: string } =>
    a.type === 'SELECT_ACTIVE'
  );
  if (selectActives.length > 0) {
    return selectBestActive(state, selectActives, playerId);
  }

  // SELECT_BENCH: fill bench maximally
  const selectBench = legal.find(a => a.type === 'SELECT_BENCH');
  if (selectBench && selectBench.type === 'SELECT_BENCH') {
    return selectBench; // engine provides the full set; just confirm
  }

  // Fallback: first legal action
  return legal[0]!;
}
```

---

## 8. Strategy Implementations

### RandomStrategy

For stress testing: simply picks a random legal action, never PASS unless it is the only option.

```typescript
export class RandomStrategy implements AiStrategy {
  chooseAction(
    state: GameState,
    legalActions: ReadonlyArray<PlayerAction>,
    playerId: PlayerId
  ): PlayerAction {
    if (state.phase === 'setup') {
      return handleSetupAction(state, legalActions, playerId);
    }

    // Avoid PASS unless it's the only choice
    const nonPass = legalActions.filter(a => a.type !== 'PASS');
    const pool = nonPass.length > 0 ? nonPass : legalActions;

    const { result: idx } = randomInt(0, pool.length - 1, state.rngState);
    return pool[idx]!;
  }
}
```

Note: `randomInt` from `lib/rng.ts` requires an `RngState` and returns a new state.
Since the strategy is stateless and pure, use `state.rngState` as the seed — the
result will vary by game state naturally. The strategy does NOT advance the game's
`rngState` (only `applyAction` does that); using it as a read-only seed for action
selection is acceptable since action selection is not game-state-altering.

### GreedyStrategy

Scores each action and picks the highest-scoring one:

```typescript
export class GreedyStrategy implements AiStrategy {
  chooseAction(
    state: GameState,
    legalActions: ReadonlyArray<PlayerAction>,
    playerId: PlayerId
  ): PlayerAction {
    if (state.phase === 'setup') {
      return handleSetupAction(state, legalActions, playerId);
    }

    const scored = scoreActions(state, legalActions, playerId);
    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored[0]!.action;
  }
}

function scoreActions(
  state: GameState,
  actions: ReadonlyArray<PlayerAction>,
  playerId: PlayerId
): ScoredAction[] {
  return actions.map(action => ({
    action,
    score: scoreAction(state, action, playerId)
  }));
}

function scoreAction(
  state: GameState,
  action: PlayerAction,
  playerId: PlayerId
): number {
  switch (action.type) {
    case 'ATTACK': {
      // Simulate and evaluate resulting state
      const result = applyAction(state, action);
      if (!result.ok) return -1000;
      return evaluateBoard(result.value, playerId);
    }
    case 'EVOLVE_POKEMON': return 80;
    case 'PLAY_TRAINER': return scoreTrainer(state, action.cardInstanceId, playerId);
    case 'ATTACH_ENERGY': return scoreEnergyAttach(state, action.cardInstanceId, action.targetInstanceId, playerId);
    case 'RETREAT': return scoreRetreat(state, action.newActiveInstanceId, playerId);
    case 'PLAY_BASIC_TO_BENCH': return 20;
    case 'USE_ABILITY': {
      const result = applyAction(state, action);
      if (!result.ok) return -1000;
      return evaluateBoard(result.value, playerId) + 5;
    }
    case 'ATTACH_TOOL': return scoreTool(state, action.cardInstanceId);
    case 'PASS': return 0;
    default: return 5;
  }
}
```

---

## 9. Implementation Order

### Phase 1: types.ts

Create `lib/ai/types.ts` with:
- `AiStrategy` interface
- `AiConfig` interface
- `ScoredAction` interface

No dependencies on evaluate.ts or strategy.ts yet.

### Phase 2: evaluate.ts

Create `lib/ai/evaluate.ts` with pure board evaluation functions:
- `resolveTopDef(state, pokemon)` — helper to get current PokemonCardDefinition
- `evalPrizeDifferential`
- `evalActiveHealth`
- `evalKOPotential`
- `evalBenchStrength`
- `evalEnergyAdvantage`
- `evalTypeAdvantage`
- `evaluateBoard` — aggregate of all above

All functions take `(state: GameState, playerId: PlayerId): number`.

### Phase 3: strategy.ts

Create `lib/ai/strategy.ts` with:
- `handleSetupAction(state, legal, playerId)` — handles all setup phase actions
- `selectBestActive(state, candidates, playerId)` — picks highest-HP Basic for active
- `scoreTrainer`, `scoreEnergyAttach`, `scoreRetreat`, `scoreTool` — helpers
- `scoreAction`, `scoreActions` — dispatcher
- `RandomStrategy` class
- `GreedyStrategy` class

### Phase 4: player.ts

Create `lib/ai/player.ts` with:
- `playTurn(state, config)` — drives a single turn
- `runSetupPhase(state, config1, config2)` — handles the setup phase for both players
- `simulateGame(config1, config2, gameConfig)` — plays a full game

### Phase 5: index.ts + public API

Create `lib/ai/index.ts` exporting the public surface.
Update `lib/index.ts` to re-export from `lib/ai/index.ts`.

### Phase 6: Tests

Create `packages/@engine/__tests__/ai/` with:
- `evaluate.test.ts` — unit tests for each evaluation function
- `strategy.test.ts` — unit tests for action scoring
- `player.test.ts` — integration test: AI vs AI full game completes

---

## 10. Pitfalls & Edge Cases

### 1. The setup phase has a distinct flow

During `state.phase === 'setup'`, `getLegalActions` returns setup-only action types
(`SELECT_ACTIVE`, `SELECT_BENCH`, `COIN_FLIP_CHOICE`, `MULLIGAN_REDRAW`). The main-game
scoring logic should not be applied to these. Always gate on `state.phase === 'setup'`
first.

### 2. Forced promotion after KO

When the Active is knocked out, the engine auto-promotes the first bench Pokemon
(SPEC_03 behavior, no `PROMOTE_FROM_BENCH` action type yet). The AI does NOT need to
handle this — the engine does it automatically inside `handleKnockOut`. The AI simply
calls `getLegalActions` on the next state.

### 3. getLegalActions returning only PASS

When the only legal action is `PASS`, the turn is effectively done (no attack was used,
no more beneficial actions). The AI should call `applyAction(state, { type: 'PASS' })` to
formally end the turn rather than looping. Do not omit the PASS call — `endTurn` fires
inside the PASS handler in some cases.

Actually: after using ATTACK, the ATTACK handler inside `applyAction` calls `endTurn`
internally, advancing the phase. After that, `getLegalActions` returns `[]` (empty array)
because the phase has moved. The `playTurn` loop must check for `legal.length === 0`.

### 4. isStartingPlayerFirstTurn blocks attacks + supporters

`TurnFlags.isStartingPlayerFirstTurn` is true for the first player's very first turn. In
this state, `getLegalActions` will NOT include ATTACK or PLAY_TRAINER (Supporter) actions.
The AI should still be able to attach energy, play basics, evolve, etc. This is handled
naturally because `getLegalActions` already filters these out — the AI just picks from what
it gets.

### 5. Special conditions block attack and retreat

A Paralyzed Pokemon cannot attack or retreat. An Asleep Pokemon cannot attack or retreat.
These conditions cause `getLegalActions` to exclude ATTACK and RETREAT. The AI does not
need to check conditions manually.

### 6. Infinite loop guard in playTurn

The `maxActionsPerTurn` cap (default 100) prevents degenerate loops. This can happen if:
- An ability or trainer modifies state in a way that keeps generating new legal actions
- A bug in the AI selects the same non-advancing action repeatedly

If the cap is hit, stop the turn and return the current state. Log a warning if possible
(but do not throw — the simulation runner may continue).

### 7. USE_ABILITY duplication

`getLegalActions` includes a USE_ABILITY action for every ability on every Pokemon in play.
Many abilities are once-per-turn; the engine enforces this by checking if the ability has
already been used (via temporal effects). The AI may see the same ability listed if it has
multiple copies of the same Pokemon — this is normal.

### 8. RETREAT energyToDiscard field

The RETREAT action has an `energyToDiscard` field. `getLegalActions` returns `energyToDiscard: []`
(empty array). The engine's retreat handler defaults to discarding the first N energy from
the Active's attached energy. The AI should pass `energyToDiscard: []` and let the engine
pick — do not try to optimize which energy to discard in v1.

### 9. RandomStrategy must use state.rngState read-only

`randomInt(min, max, state.rngState)` returns `{ result, nextState }`. The AI strategy
does NOT thread the new `nextState` back — it only uses `result`. The actual RNG state
progression happens inside `applyAction` (coin flips, shuffles). Using `state.rngState`
as an ad-hoc seed for action selection does not affect determinism because the exact same
sequence of `applyAction` calls produces the exact same game regardless of which action
was selected by the AI.

### 10. evaluateBoard after ATTACK may see phase === 'finished'

If an ATTACK KOs the opponent's last Pokemon (or drains their prizes), `applyAction` may
return a state with `phase === 'finished'`. `evaluateBoard` must handle this gracefully:
return a very large positive score if `state.winner === playerId`, very large negative if
`state.winner === otherPlayer(playerId)`, and 0 for a draw.

```typescript
export function evaluateBoard(state: GameState, playerId: PlayerId): number {
  if (state.phase === 'finished') {
    if (state.winner === playerId) return 10000;
    if (state.winner === otherPlayer(playerId)) return -10000;
    return 0; // draw
  }
  return (
    evalPrizeDifferential(state, playerId) +
    evalActiveHealth(state, playerId) +
    evalKOPotential(state, playerId) +
    evalBenchStrength(state, playerId) +
    evalEnergyAdvantage(state, playerId) +
    evalTypeAdvantage(state, playerId)
  );
}
```

---

## 11. Test Strategy

### Test file location

```
packages/@engine/__tests__/ai/
├── evaluate.test.ts   # unit tests for each evaluation function
├── strategy.test.ts   # action scoring and selection tests
└── player.test.ts     # integration tests (full game, turn loop)
```

DB path (CWD-relative, run from `packages/@engine/`):

```typescript
const DB_PATH = '../../database/pokemon-data.sqlite3.db';
```

Do NOT use `import.meta.url` or absolute paths.

### Use the same test helpers as combat.test.ts

The existing `__tests__/core/combat.test.ts` has `makeInPlayPokemon`, `makeCardInstance`,
and `makeBaseState` helpers. Read that file for the pattern and replicate it in AI tests.
Do not import from combat.test.ts — copy the helpers.

### evaluate.test.ts — unit tests

For each evaluation function, build a minimal `GameState` and verify the score direction:

- `evalPrizeDifferential`: player with fewer prizes should score higher
- `evalActiveHealth`: player with more HP% remaining should score higher
- `evalKOPotential`: should score highest when attack can KO opponent's Active
- `evalBenchStrength`: more bench Pokemon = higher score
- `evalEnergyAdvantage`: more energy on Active = higher score
- `evalTypeAdvantage`: hitting weakness should add positive score
- `evaluateBoard` with `phase === 'finished'` and `winner === playerId` returns 10000

### strategy.test.ts — action scoring tests

```typescript
it('GreedyStrategy prefers ATTACK over PASS when attack can KO', () => {
  // build state where opponent's Active has low HP and we can KO
  // verify scoreAction('ATTACK', ...) > scoreAction('PASS', ...)
});

it('GreedyStrategy prefers EVOLVE over ATTACH_ENERGY', () => {
  // 80 > 25, so EVOLVE should score higher
});

it('RandomStrategy never returns PASS when other actions exist', () => {
  // verify multiple times with different rng seeds
});
```

### player.test.ts — integration tests

```typescript
it('playTurn completes without error for main phase', () => {
  // Start a state in main phase, run playTurn, assert phase advanced
});

it('simulateGame between two RandomStrategy AIs completes', () => {
  // Run a full game, assert state.phase === 'finished' and state.winner !== null
});

it('simulateGame terminates within 200 turns', () => {
  // Assert iterations guard works
});

it('GreedyStrategy AI vs RandomStrategy AI game completes', () => {
  // Mix strategies, assert game completes cleanly
});
```

---

## 12. Public API Surface

After implementation, `lib/index.ts` should export:

```typescript
// AI
export type { AiStrategy, AiConfig, ScoredAction } from './ai/types';
export { RandomStrategy, GreedyStrategy } from './ai/strategy';
export { playTurn, simulateGame, runSetupPhase } from './ai/player';
export { evaluateBoard } from './ai/evaluate';
```

---

## 13. Session Start Verification

Before writing any new code, verify the existing foundation:

```bash
# From /home/nicks-dgx/dev/.Project-Johto/Pokemon
bun test --cwd packages/@engine          # must show 307 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output (clean)
```

If either fails, do not proceed — fix the foundation first.
