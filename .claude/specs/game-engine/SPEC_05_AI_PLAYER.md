# SPEC_05: AI Player

## Context

The game engine is headless — it needs an automated player to simulate matches. The AI does not need to be competitive. It needs to make reasonable plays that exercise a deck's strategy so that simulation metrics are meaningful. A bad AI that never evolves Pokemon or never attaches energy produces useless data.

The AI is a heuristic priority system, not a search algorithm. It evaluates the current state, scores available actions, and picks the highest-scoring one. This is sufficient for deck testing.

---

## Prerequisites

- SPEC_01 (Core Types)
- SPEC_02 (Game Flow)
- SPEC_03 (Combat)
- SPEC_04 (Card Effects)

---

## Requirements

### 1. AI Interface

```typescript
// src/ai/player.ts

interface AIPlayer {
  readonly chooseAction: (state: GameState, legalActions: ReadonlyArray<PlayerAction>) => PlayerAction;
  readonly chooseSetupActive: (state: GameState, basics: ReadonlyArray<string>) => string;
  readonly chooseSetupBench: (state: GameState, basics: ReadonlyArray<string>) => ReadonlyArray<string>;
  readonly choosePromoteActive: (state: GameState, benchPokemon: ReadonlyArray<InPlayPokemon>) => string;
  readonly resolveChoice: (state: GameState, choice: EffectChoice) => ReadonlyArray<string>;
}

function createAIPlayer(config?: AIConfig): AIPlayer;

interface AIConfig {
  readonly aggressiveness: number;     // 0.0 (conservative) to 1.0 (aggressive), default 0.5
  readonly evolutionPriority: number;  // how much to prioritize evolving, default 0.8
  readonly benchPriority: number;      // how much to prioritize benching basics, default 0.7
}
```

### 2. Main Phase Action Priority

During the main phase, the AI repeatedly calls `getLegalActions`, scores each action, and executes the highest-priority one until it decides to attack or pass.

**Action priority order (default weights):**

```typescript
// src/ai/priorities.ts

const ACTION_PRIORITIES: Record<PlayerAction['type'], number> = {
  // Setup actions always come first
  PLAY_BASIC_TO_BENCH: 80,    // bench basics early
  EVOLVE_POKEMON: 90,          // evolve ASAP — bigger HP, better attacks
  ATTACH_ENERGY: 85,           // accelerate toward attack costs

  // Trainers — depends on subtype
  PLAY_TRAINER: 75,            // varies by card (see trainer scoring)
  ATTACH_TOOL: 72,             // attach tools/TMs before attacking (grants attacks, defensive buffs)

  // Abilities
  USE_ABILITY: 70,             // use before attacking

  // Combat
  ATTACK: 50,                  // attack when ready
  RETREAT: 40,                 // retreat if active is in danger

  // Pass
  PASS: 10,                    // only if nothing useful to do
};
```

These are base scores. Context modifiers adjust them:

### 3. Context-Aware Scoring

```typescript
function scoreAction(state: GameState, action: PlayerAction, config: AIConfig): number;
```

| Action | Score Modifiers |
|--------|----------------|
| `PLAY_BASIC_TO_BENCH` | +20 if bench is empty; +10 per empty bench slot (want bench presence); -30 if bench is full (impossible, but defensive) |
| `EVOLVE_POKEMON` | +30 if evolving the Active Pokemon; +20 if evolution has an attack that can KO opponent's active; +10 per evolution in hand that chains further |
| `ATTACH_ENERGY` | +30 if attaching to Active and it's 1 energy away from attacking; +15 if attaching type matches attack cost; -10 if target already has more energy than any attack costs |
| `PLAY_TRAINER` (Supporter) | +40 for draw supporters when hand size < 3; +30 for Boss's Orders when opponent has damaged bench Pokemon; +20 for search cards |
| `PLAY_TRAINER` (Item) | +35 for Nest Ball when bench < 3; +30 for Ultra Ball when searching for key evolution; +25 for Switch when active is bad matchup |
| `PLAY_TRAINER` (Stadium) | +15 if no stadium in play; +25 if opponent's stadium is hurting us |
| `ATTACH_TOOL` | +30 if tool grants defensive benefit and Active is expected to take hits; +25 if TM grants an attack that can KO opponent's Active; +10 otherwise (tools are generally worth attaching) |
| `USE_ABILITY` | Score based on ability effect — draw abilities rank high, heal abilities rank when damaged |
| `ATTACK` | +40 if attack can KO opponent's Active; +20 if attack deals > 50% of opponent's remaining HP; -20 if attack costs will leave us unable to attack next turn (energy discard) |
| `RETREAT` | +50 if Active has <= 25% HP remaining; +30 if Active has weakness to opponent's Active type; -20 if retreat cost would leave bench Pokemon with no energy |
| `PASS` | +0 base (always the fallback) |

### 4. Setup Decisions

**Choose Active:** Pick the Basic Pokemon with:
1. Highest HP (survivability)
2. Lowest retreat cost (flexibility)
3. An attack with the lowest energy cost (can threaten early)
4. Prefer non-ex/EX (don't give up 2 prizes early)

```typescript
function scoreSetupActive(pokemonDef: PokemonCardDefinition): number;
```

**Choose Bench:** Bench all remaining Basic Pokemon from hand. Prioritize:
1. Pokemon that evolve into key Stage 1/2 (get them in play for evolution)
2. Pokemon with useful Abilities
3. System Pokemon (draw engines, energy acceleration)

**Choose Promote After KO:** Pick the benched Pokemon with:
1. Highest HP
2. Best type matchup against opponent's Active
3. Enough energy to attack

### 5. Energy Attachment Target

```typescript
function chooseBestEnergyTarget(
  state: GameState,
  player: PlayerId,
  energyDef: EnergyCardDefinition
): string;  // instance ID of target Pokemon
```

Priority:
1. Active Pokemon that is 1 energy away from its best attack
2. Benched Pokemon that is being built up as next attacker
3. Active Pokemon to accelerate any attack
4. Benched Pokemon with the highest energy deficit for its attack cost

### 6. Attack Selection

When multiple attacks are available:

```typescript
function chooseBestAttack(
  state: GameState,
  attacker: InPlayPokemon,
  attackerDef: PokemonCardDefinition
): number | null;  // attack index, or null if should not attack
```

Priority:
1. Attack that KOs the opponent's Active Pokemon (minimum overkill)
2. Attack with highest effective damage (after weakness/resistance)
3. Attack with beneficial side effects (apply status, draw cards)
4. Cheapest attack if none can KO (conserve energy for bigger attack later)
5. Return null if no attack has sufficient energy

### 7. Effect Choice Resolution

When card effects require choices:

```typescript
function resolveEffectChoice(state: GameState, choice: EffectChoice, config: AIConfig): ReadonlyArray<string>;
```

| Choice Type | Strategy |
|------------|----------|
| `select_pokemon` (opponent's bench for Boss's Orders) | Pick Pokemon closest to KO, or highest prize value |
| `select_pokemon` (own bench for Switch) | Pick Pokemon with best type matchup |
| `select_cards` (discard for Ultra Ball) | Discard lowest-value cards; prefer discarding extra energy or redundant trainers |
| `select_energy` (discard for retreat) | Discard energy type not needed by remaining Pokemon |
| `coin_flip_choice` | Always choose to go first (setup coin flip) |

### 8. Simulation Driver

The AI is consumed by the simulation runner, not invoked directly:

```typescript
function runAIGame(
  state: GameState,
  ai1: AIPlayer,
  ai2: AIPlayer,
  maxTurns: number            // safety limit to prevent infinite games (default: 200)
): GameState;
```

Loop:
1. Start turn (draw)
2. While phase is `main`:
   a. Get legal actions
   b. AI scores and picks best action
   c. Apply action
   d. If action was ATTACK or PASS, exit loop
3. If attack: resolve combat
4. Pokemon Checkup
5. Check win conditions
6. Switch active player
7. Repeat until `finished` or `maxTurns` exceeded

If `maxTurns` is exceeded, the game is recorded as a draw (neither deck could close out).

---

## Acceptance Criteria

- [ ] AI plays complete games from setup to finish without crashing
- [ ] AI benches Basic Pokemon when available
- [ ] AI evolves Pokemon when possible
- [ ] AI attaches energy to the most relevant target
- [ ] AI attacks when an attack can KO
- [ ] AI retreats when Active is near KO
- [ ] AI plays Supporter draw cards when hand is low
- [ ] AI plays search Items (Nest Ball, Ultra Ball) to find key Pokemon
- [ ] AI promotes best available Pokemon after KO
- [ ] AI games complete in < 200 turns on average
- [ ] AI vs AI games produce diverse outcomes (not always same winner)
- [ ] `AIConfig.aggressiveness` measurably affects play patterns
- [ ] AI attaches Pokemon Tools and Technical Machines when available
