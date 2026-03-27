# SPEC_02 Implementation Context
## Pokemon TCG Game Engine — Game Flow

This document gives a new session everything it needs to implement SPEC_02 without prior
conversation history. Read it completely before writing any code.

---

## 1. Project Location & Tooling

**Monorepo root:** `/home/nicks-dgx/dev/.Project-Johto/Pokemon`
**Engine package:** `packages/@engine/`
**Runtime:** Bun 1.3.5 exclusively (no Node, no npm, no yarn)
**Build system:** Turborepo + `@pokemon/build` (Bun.build wrapper)

### Engine package commands (run from monorepo root)

```bash
bun test --cwd packages/@engine             # run all tests
bun run --cwd packages/@engine check-types  # tsc --noEmit
bun run --cwd packages/@engine build        # bundle → out/, emit .d.ts
```

### Critical directory convention

Library source lives in **`lib/`**, not `src/`. The `@pokemon/build` library preset
expects `lib/index.ts` as its entrypoint. The build outputs to `out/lib/`. Do not
create or reference an `src/` directory.

### TypeScript config notes

- Extends `@pokemon/configs/typescript/base.tsconfig.json`
- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`
- `moduleResolution: "bundler"` — do NOT add `.js` extensions to imports
- `strict: true` — no `any`, no implicit returns

---

## 2. What SPEC_01 Already Delivered

All files are in `packages/@engine/lib/`. The package builds cleanly and all 45 tests pass.

### Type files (`lib/types/`)

| File | Key exports |
|------|-------------|
| `card.ts` | `EnergyType`, `ENERGY_TYPES`, `PokemonCardDefinition`, `TrainerCardDefinition`, `EnergyCardDefinition`, `CardDefinition`, `PokemonStage`, `PokemonSubtype`, `TrainerSubtype`, `AttackDefinition`, `AbilityDefinition` |
| `game.ts` | `GameState`, `PlayerState`, `InPlayPokemon`, `SpecialCondition`, `PlayerId`, `CardInstance`, `GamePhase`, `StadiumState`, `TurnFlags` |
| `action.ts` | `PlayerAction` (discriminated union, 15 variants) |
| `event.ts` | `GameEvent` (discriminated union, 25 variants), `WinReason` |
| `effect.ts` | `TemporalEffect` (stub — SPEC_04 expands it) |
| `index.ts` | Re-exports all of the above |

### Logic files

| File | Key exports |
|------|-------------|
| `rng.ts` | `RngState`, `coinFlip`, `shuffle`, `randomInt`, `createRngState` — all pure functions |
| `adapter.ts` | `loadStandardCardPool`, `adaptCardRow`, `isStandardLegal`, `getLegalRegulationMarks`, `validateAceSpec`, `SqliteCardRow` |
| `core/conditions.ts` | `applySpecialCondition`, `removeSpecialCondition`, `clearSpecialConditions` |

### Key types to understand before writing SPEC_02 code

```typescript
// GameState (lib/types/game.ts) — the complete immutable game snapshot
interface GameState {
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  readonly startingPlayer: PlayerId;       // winner of coin flip who chose to go first/second
  readonly turnNumber: number;             // increments each time activePlayer changes
  readonly phase: GamePhase;               // 'setup' | 'draw' | 'main' | 'attack' | 'checkup' | 'finished'
  readonly stadium: StadiumState | null;   // shared zone — one StadiumState for both players
  readonly cardRegistry: ReadonlyMap<string, CardInstance>;     // instanceId → CardInstance
  readonly definitionRegistry: ReadonlyMap<string, CardDefinition>; // definitionId → CardDefinition
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw' | null;
  readonly rngState: RngState;
  readonly turnFlags: TurnFlags;           // { attackUsed, isStartingPlayerFirstTurn }
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;  // SPEC_04 stub — starts empty
}

// PlayerState
interface PlayerState {
  readonly id: PlayerId;
  readonly deck: ReadonlyArray<string>;    // instanceIds, top = index 0
  readonly hand: ReadonlyArray<string>;    // instanceIds
  readonly prizes: ReadonlyArray<string>;  // instanceIds (face-down)
  readonly active: InPlayPokemon | null;   // null during setup
  readonly bench: ReadonlyArray<InPlayPokemon>;  // max 5
  readonly discard: ReadonlyArray<string>; // instanceIds
  readonly lostZone: ReadonlyArray<string>;
  readonly supporterPlayedThisTurn: boolean;
  readonly stadiumPlayedThisTurn: boolean;
  readonly energyAttachedThisTurn: boolean;
  readonly retreatedThisTurn: boolean;
}

// InPlayPokemon
interface InPlayPokemon {
  readonly instanceId: string;
  readonly evolutionStack: ReadonlyArray<string>;  // instanceIds bottom=Basic → top=current
  readonly attachedEnergy: ReadonlyArray<string>;  // instanceIds
  readonly attachedTools: ReadonlyArray<string>;   // instanceIds — max 1 (Tool OR TM)
  readonly damageCounters: number;
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;    // turnNumber when Pokemon entered play
  readonly turnEvolved: number | null;
  readonly isNewThisTurn: boolean;
}
```

### Existing conditions helpers (already implemented, use them)

```typescript
// lib/core/conditions.ts
applySpecialCondition(pokemon: InPlayPokemon, condition: SpecialCondition): InPlayPokemon
  // enforces: Asleep/Confused/Paralyzed are mutually exclusive (applying one removes the others)
  // Burned and Poisoned use markers, can coexist with each other and rotation conditions

removeSpecialCondition(pokemon: InPlayPokemon, condition: SpecialCondition): InPlayPokemon

clearSpecialConditions(pokemon: InPlayPokemon): InPlayPokemon
  // call this on zone change (retreat/Switch → bench) and on evolution
```

---

## 3. SPEC_02 Files to Create

All files go in `packages/@engine/lib/core/`. Tests go in `packages/@engine/__tests__/core/`.

```
lib/core/
├── conditions.ts     ← already exists (SPEC_01)
├── game.ts           ← NEW: createGame, checkWinConditions, handleKnockOut, promoteFromBench
├── setup.ts          ← NEW: setupGame (action-driven), hasBasicPokemon
├── turn.ts           ← NEW: startTurn, applyAction, getLegalActions, endTurn
├── energy.ts         ← NEW: canPayEnergyCost, canPayRetreatCost
├── evolution.ts      ← NEW: canEvolve, evolvePokemon
├── checkup.ts        ← NEW: performCheckup
└── validation.ts     ← NEW: validateDeck (full 60-card rules)

__tests__/core/
└── game-flow.test.ts ← NEW: covers all acceptance criteria
```

`lib/index.ts` must be updated to re-export all new public functions.

---

## 4. Design Decisions (Confirmed by Project Owner)

### 4.1 Result<T, E> error pattern

Do NOT use `throw` for game logic errors. Use an explicit Result type throughout.

```typescript
// Define in lib/core/game.ts (or lib/types/result.ts and re-export)

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

export type GameErrorCode =
  | 'INVALID_DECK'      // deck validation failure
  | 'ILLEGAL_ACTION'    // action not in getLegalActions result
  | 'INVALID_STATE'     // state machine violation
  | 'UNKNOWN_CARD'      // instanceId or definitionId not found in registry;

export type GameResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GameError };

// Helpers
export function ok<T>(value: T): GameResult<T> { return { ok: true, value }; }
export function err(code: GameErrorCode, message: string): GameResult<never> {
  return { ok: false, error: { code, message } };
}
```

`createGame` returns `GameResult<GameState>`.
`applyAction` returns `GameResult<GameState>`.
`getLegalActions` returns `ReadonlyArray<PlayerAction>` (no error — empty array if no legal actions).

### 4.2 Setup is action-driven (not autonomous)

The game loop is uniform across ALL phases including setup:

```
createGame(config) → GameResult<GameState>  [phase: 'setup']
  ↓
while state.phase !== 'finished':
  actions = getLegalActions(state)
  chosen  = player/AI picks from actions
  state   = applyAction(state, chosen)
```

During setup, `getLegalActions` returns setup-specific actions:
- Initial state: `[{ type: 'COIN_FLIP_CHOICE', choice: 'first' | 'second' }]`
  — But wait: the coin is flipped automatically by `createGame` (or `setupGame`).
  — The WINNER of the flip then must submit a COIN_FLIP_CHOICE action.
  — Internally: createGame flips the coin, emits COIN_FLIPPED event, sets phase to await choice.
- After choice: if there are mulligans needed, `[{ type: 'MULLIGAN_REDRAW' }]`
- After both hands are valid: `[{ type: 'SELECT_ACTIVE', cardInstanceId: ... }, ...]`
  — one action per valid Basic in hand
- After active selected: `[{ type: 'SELECT_BENCH', cardInstanceIds: [...] }, ...]`
  — multiple valid combinations, or an explicit "bench nothing" option
- After bench selected: setup auto-completes (set prizes, advance to draw phase, begin turn 1)

### 4.3 Simulation default: prefer going second

When the simulation AI receives a COIN_FLIP_CHOICE action, it should default to choosing
`'second'` (going second is strictly better: can play Supporters and attack on turn 1).
This default may be overridden by a deck strategy parameter (SPEC_05 concern).

The `applyAction` handler for `COIN_FLIP_CHOICE` simply records who is going first/second —
it does not make the decision. The AI layer (SPEC_05) or the test harness provides the choice.

### 4.4 Effect registry stub (SPEC_04 dependency)

`applyAction` for `PLAY_TRAINER` and `USE_ABILITY` must dispatch to effect handlers that
do not exist until SPEC_04. Resolve this with a minimal stub:

```typescript
// lib/effects/registry.ts (create this stub now, SPEC_04 fills it)

export type EffectContext = {
  readonly state: GameState;
  readonly actingPlayer: PlayerId;
  readonly targets: ReadonlyArray<string>;
};

export type EffectHandler = (context: EffectContext) => GameResult<GameState>;

// Starts empty. SPEC_04 registers handlers here.
const registry = new Map<string, EffectHandler>();

export function registerEffect(effectId: string, handler: EffectHandler): void {
  registry.set(effectId, handler);
}

export function resolveEffect(effectId: string, context: EffectContext): GameResult<GameState> {
  const handler = registry.get(effectId);
  if (!handler) {
    // No handler registered yet (SPEC_04 pending) — structural action still applies
    // (card goes to discard, state flags update). Return state unchanged by effects.
    return ok(context.state);
  }
  return handler(context);
}
```

When processing `PLAY_TRAINER`:
1. Validate legality (subtype rules, flags, targets)
2. Remove card from hand, add to discard (structural)
3. Update state flags (`supporterPlayedThisTurn`, `stadiumPlayedThisTurn`, etc.)
4. Call `resolveEffect(card.effectId, context)` — no-op until SPEC_04

This is architecturally correct, not a workaround.

---

## 5. Mulligan Logic — Critical Detail

The spec's phrasing was audited and corrected. The rulebook (p.18) says:

> "the player who did not have to start over may draw a card for each **extra mulligan** their
> opponent took"

**Example from rulebook:** Both players took 2 mulligans together, then Player A took 3 more.
Player B may draw up to **3** extra cards (the differential).

### Implementation requirement

Track mulligan counts separately during setup:

```typescript
// Internal to setup state (can be local variables in setupGame or fields on GameState during setup)
// mulliganCount: Record<PlayerId, number>

// Algorithm:
// Phase 1 — simultaneous mulligans:
//   While BOTH players lack a Basic: both redraw. These rounds do NOT count for either player.
// Phase 2 — individual mulligans:
//   While only P1 lacks a Basic: P1 redraws. p1_individual_mulligans++
//   While only P2 lacks a Basic: P2 redraws. p2_individual_mulligans++
// Extra draws:
//   if p1_individual_mulligans > p2_individual_mulligans:
//     player2 may draw up to (p1 - p2) extra cards
//   else if p2_individual_mulligans > p1_individual_mulligans:
//     player1 may draw up to (p2 - p1) extra cards

// Extra draw cards may include Basics that can go directly to bench.
// These are separate from the normal "SELECT_BENCH" phase — present as additional
// PLAY_BASIC_TO_BENCH actions after the extra draw.
```

Since setup is action-driven, the mulligan flow becomes:
- After drawing 7 cards, if no Basic → `getLegalActions` returns `[MULLIGAN_REDRAW]`
- Player submits MULLIGAN_REDRAW → hand shuffled back, 7 redrawn, counter incremented
- Continue until Basic found
- After both players have valid hands, compute differential and issue extra draw actions

Storing the mulligan counts during setup requires adding transient fields to GameState OR
passing them through setup-phase turn flags. Recommended: add to `TurnFlags`:

```typescript
// Extend TurnFlags in lib/types/game.ts:
interface TurnFlags {
  readonly attackUsed: boolean;
  readonly isStartingPlayerFirstTurn: boolean;
  // Setup-phase only (zeroed at turn 1):
  readonly mulliganCounts: Readonly<Record<PlayerId, number>>;
  readonly extraDrawsRemaining: Readonly<Record<PlayerId, number>>;
}
```

---

## 6. Turn Structure — getLegalActions Details

This is the most critical function. It is called by the AI on every tick. It must be
complete and correct.

### During setup phase

Return setup-specific actions depending on sub-state:
- Awaiting coin flip choice → `COIN_FLIP_CHOICE` actions
- Awaiting mulligan → `MULLIGAN_REDRAW`
- Awaiting extra draw → `DRAW_CARD` (limited by `extraDrawsRemaining`)
- Awaiting active selection → one `SELECT_ACTIVE` per Basic in hand
- Awaiting bench selection → `SELECT_BENCH` combinations (including empty bench)

### During draw phase

- `DRAW_CARD` (mandatory — the only legal action; startTurn auto-executes this)

### During main phase

Enumerate ALL of these simultaneously:

```
PLAY_BASIC_TO_BENCH  — for each Basic Pokemon in hand, if bench.length < 5
EVOLVE_POKEMON       — for each evolution card in hand × each valid target in play
ATTACH_ENERGY        — for each energy card in hand × each Pokemon in play, if !energyAttachedThisTurn
PLAY_TRAINER(Item)   — for each Item in hand (unlimited)
PLAY_TRAINER(Supporter) — for each Supporter in hand, if !supporterPlayedThisTurn
                          AND NOT turnFlags.isStartingPlayerFirstTurn
PLAY_TRAINER(Stadium) — for each Stadium in hand, if !stadiumPlayedThisTurn
                         AND no same-name stadium currently in play
PLAY_TRAINER(Tool)   — for each Tool in hand × each Pokemon in play with no tool attached
RETREAT             — if active is not Asleep/Paralyzed AND !retreatedThisTurn
                       AND canPayRetreatCost(...), one action per bench Pokemon to promote
USE_ABILITY         — for each Pokemon in play with an ability (subject to effect conditions)
ATTACK              — if active is not Asleep/Paralyzed AND !turnFlags.isStartingPlayerFirstTurn
                       AND !attackUsed, one per valid attack (energy check)
                       ALSO enumerate TM-granted attacks (see §6.1 below)
PASS                — always available during main phase
```

### 6.1 TM-granted attacks

When the active Pokemon has an attached card whose definition is a Trainer with subtype
`TechnicalMachine`, that Pokemon gains access to the TM's attack. For SPEC_02:

- Detect: iterate `active.attachedTools`, look up definition, check `subtypes.includes('TechnicalMachine')`
- The TM's attack is accessed via `resolveEffect(tm.effectId, context)` in SPEC_04
- For `getLegalActions` in SPEC_02: include the TM attack as a legal ATTACK option IF the
  Pokemon has enough energy to pay that attack's cost
- Use a sentinel `attackIndex` value (e.g., `100 + toolSlotIndex`) to distinguish TM attacks
  from native attacks. This is a forward-compatible stub that SPEC_04 refines.
- If you cannot know the TM's attack cost without the effect registry, conservatively include
  the TM attack as legal and let SPEC_04 handle the cost check during resolution.

### 6.2 First-turn restrictions (exact rules)

```
isStartingPlayerFirstTurn = activePlayer === startingPlayer && turnNumber === 1

Blocked when isStartingPlayerFirstTurn is true:
  - ATTACK
  - PLAY_TRAINER(Supporter)

The SECOND player (turnNumber === 2, activePlayer !== startingPlayer) has NO restrictions.
They can attack and play Supporters freely on their first turn.
```

---

## 7. Evolution Rules — Exact Implementation

### canEvolve checks (in order)

1. `evolutionCard.cardType === 'Pokemon'` (must be a Pokemon card)
2. `evolutionCard.evolvesFrom !== null` (must have a pre-evolution)
3. `evolutionCard.evolvesFrom === currentPokemonName` — EXACT STRING EQUALITY on the name of
   the Pokemon at the top of `target.evolutionStack`
   - "Paldean Wooper" ≠ "Wooper" — do not use substring or fuzzy matching
   - "Iono's Tadbulb" ≠ "Tadbulb"
4. Stage chain check (unless `options.skipStage1 === true` for Rare Candy):
   - Basic evolving to Stage 1: ok
   - Stage 1 evolving to Stage 2: ok
   - Basic evolving to Stage 2: blocked UNLESS `skipStage1 === true`
5. `!target.isNewThisTurn` — cannot evolve a Pokemon played this turn
6. `target.turnEvolved === null || target.turnEvolved !== state.turnNumber` — cannot evolve
   a Pokemon already evolved this turn
7. First-turn per-player block:
   - If `activePlayer === startingPlayer` and `turnNumber === 1`: BLOCKED (P1's first turn)
   - If `activePlayer !== startingPlayer` and `turnNumber === 2`: BLOCKED (P2's first turn)
   - Turn 3+: allowed (subject to checks 1-6)

### evolvePokemon side effects

1. Remove evolution card from hand
2. Push evolution card's instanceId onto `target.evolutionStack`
3. Update `target.instanceId` to the evolution card's instanceId (the "active" card is now the evolved form)
4. Set `target.turnEvolved = state.turnNumber`
5. Set `target.isNewThisTurn = false` (evolution doesn't re-set this; card was already in play)
6. **Clear all Special Conditions** on the evolved Pokemon (call `clearSpecialConditions`)
7. **Clear all temporal effects** targeting this Pokemon (filter `state.temporalEffects`)
8. Preserve: `damageCounters`, `attachedEnergy`, `attachedTools`
9. Emit `POKEMON_EVOLVED` event

---

## 8. Retreat Rules — Exact Implementation

### canRetreat checks

1. `state.phase === 'main'`
2. `!player.retreatedThisTurn`
3. Active Pokemon is not Asleep or Paralyzed
4. `canPayRetreatCost(pokemon.retreatCost, attachedEnergyProvides)`
5. At least 1 Pokemon on bench to promote (cannot retreat to empty bench)

### onRetreat side effects

1. Discard energy cards from active (matching the retreat cost paid)
2. Move current active to bench in the target slot (or push to bench)
3. Promote chosen bench Pokemon to active
4. On the RETREATING Pokemon (now on bench):
   - **Clear all Special Conditions** (call `clearSpecialConditions`)
   - **Clear all attack-origin temporal effects** targeting it
   - PRESERVE: `damageCounters`, `attachedEnergy` (remaining after cost paid), `attachedTools`
5. Set `player.retreatedThisTurn = true`
6. Emit `RETREATED` event

---

## 9. Pokemon Checkup — Exact Order

`performCheckup` is called after the active player's turn ends, before switching `activePlayer`.
It processes BOTH players' Active Pokemon.

```
For each player P in [player1, player2]:
  pokemon = state.players[P].active
  if pokemon === null: continue

  1. POISONED → place 1 damage counter (10 HP). Emit DAMAGE_COUNTERS_PLACED.
     This is NOT dealDamage — bypasses Weakness/Resistance/all effects.

  2. BURNED →
     a. Place 2 damage counters (20 HP). Emit DAMAGE_COUNTERS_PLACED.
     b. Flip coin. If HEADS: remove BURNED. Emit COIN_FLIPPED, SPECIAL_CONDITION_REMOVED.

  3. ASLEEP → Flip coin. If HEADS: remove ASLEEP. Emit COIN_FLIPPED, SPECIAL_CONDITION_REMOVED.

  4. PARALYZED → Remove PARALYZED if and only if P === state.activePlayer
     (i.e., the Pokemon's owner just completed their turn).
     Emit SPECIAL_CONDITION_REMOVED.

5. Process between-turn temporal effects (stub for SPEC_04 — iterate state.temporalEffects,
   call resolveEffect for any with expiresOnTurn === state.turnNumber or trigger === 'BETWEEN_TURNS').
   For SPEC_02, this is a no-op since temporalEffects is always empty.

After processing both players, check for KOs:
6. For each player P: if active.damageCounters * 10 >= pokemon.hp → KO
7. Collect all KOs. Process all before any promotion (prizes are cumulative).
8. Apply simultaneous-win rules (see §10 below).
```

Emit `CHECKUP_COMPLETED` at the end.

---

## 10. Win Condition & Simultaneous Win Logic

### checkWinConditions(state) — called after prizes are awarded and after each KO

Three conditions (check all three for each player):

| # | Condition | When to check |
|---|-----------|---------------|
| A | Player's prize pile is empty (all 6 taken) | After any prize is taken |
| B | Opponent has no Pokemon in play (Active + Bench all empty) | After any KO + after promotion phase |
| C | Player cannot draw at start of their turn (deck is empty) | At the start of draw phase |

### Simultaneous win resolution (rulebook p.21)

```typescript
const p1Conditions = countSatisfiedConditions(state, 'player1');
const p2Conditions = countSatisfiedConditions(state, 'player2');

if (p1Conditions === 0 && p2Conditions === 0) return state; // no winner
if (p1Conditions > p2Conditions) → winner = 'player1'
if (p2Conditions > p1Conditions) → winner = 'player2'
if (p1Conditions === p2Conditions && both > 0) → winner = 'draw'
```

This applies to:
- Attack KOs (SPEC_03 calls checkWinConditions)
- Checkup KOs (performCheckup calls checkWinConditions after processing all Poison/Burn damage)

---

## 11. Deck Validation (Full Rules)

```typescript
// lib/core/validation.ts

function validateDeck(
  cardIds: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, CardDefinition>,
  formatDate: Date
): GameResult<void>
```

Rules to enforce (all must pass):

1. **Exactly 60 cards**
2. **At least 1 Basic Pokemon** in the deck
3. **Max 4 copies of any card name** — aggregate by `name`, not by ID.
   Different-set printings of the same card name count together.
   Example: "Nest Ball" sv1-255 + "Nest Ball" sv4-165 = 2 copies of "Nest Ball".
   Basic Energy is exempt (unlimited copies).
4. **Max 1 ACE SPEC card total** across both:
   - Trainer cards where `subtypes.includes('AceSpec')`
   - Energy cards where `isAceSpec === true`
5. **All cards Standard-legal** for the given `formatDate` — call `isStandardLegal` from adapter
6. **No Radiant Pokemon** — check `subtypes.includes('Radiant')` on Pokemon cards
   (Radiant cards have regulation mark F which already fails the legal marks check,
   but be explicit)

Return `ok(undefined)` on success, `err('INVALID_DECK', '...')` with specific message on failure.

---

## 12. createGame Signature

```typescript
// lib/core/game.ts

interface GameConfig {
  readonly deck1: ReadonlyArray<string>;   // definition IDs for player 1
  readonly deck2: ReadonlyArray<string>;   // definition IDs for player 2
  readonly seed: number;
  readonly definitions: ReadonlyMap<string, CardDefinition>;
  readonly formatDate?: Date;              // defaults to new Date()
}

function createGame(config: GameConfig): GameResult<GameState>
```

`createGame` must:
1. Validate both decks via `validateDeck`. Fail fast with `err('INVALID_DECK', ...)` if invalid.
2. Create 120 `CardInstance` objects (60 per player) with unique `instanceId`s
   — convention: `p1-{definitionId}-{index}` and `p2-{definitionId}-{index}`
3. Build `cardRegistry` (instanceId → CardInstance) and `definitionRegistry` (pass-through of `config.definitions`)
4. Initialize both `PlayerState` objects with full decks (unshuffled — setup phase shuffles)
5. Set initial `TurnFlags` with zeroed mulligan counts
6. Set `phase: 'setup'`
7. Flip initial coin (using `coinFlip(rngState)`) to determine who WON the toss
   — emit `COIN_FLIPPED` event
   — the winner of the toss is recorded but `startingPlayer` is NOT set yet
   — `startingPlayer` is set when the winner submits their `COIN_FLIP_CHOICE` action
8. `getLegalActions` on the resulting state returns `[COIN_FLIP_CHOICE 'first', COIN_FLIP_CHOICE 'second']`
   presented to the coin flip winner

---

## 13. Energy Cost Validation Algorithm

```typescript
// lib/core/energy.ts

function canPayEnergyCost(
  cost: ReadonlyArray<EnergyType>,
  attachedEnergy: ReadonlyArray<{ provides: ReadonlyArray<EnergyType> }>
): boolean
```

Energy cost is a constraint satisfaction problem. Use a greedy matching approach:

```
1. Separate cost into typed requirements (non-Colorless) and Colorless wildcard slots.
2. For each typed requirement (e.g., 'Fire'):
   - Find an unused energy that provides 'Fire'. Mark it used.
   - If none found: return false.
3. For each remaining Colorless slot:
   - Find any unused energy (any type satisfies Colorless). Mark it used.
   - If none found: return false.
4. Return true.
```

Special Energy cards may provide multiple types (`provides: ['Fire', 'Water']`). A single
such energy satisfies ONE typed requirement (not both simultaneously). The greedy algorithm
handles this correctly — assign it to the first matching typed requirement it can satisfy.

Retreat cost is `n` Colorless — all slots are wildcard. `canPayRetreatCost(n, energy)` is
equivalent to `energy.length >= n`.

---

## 14. Acceptance Criteria to Test

Every item below must have a corresponding test in `__tests__/core/game-flow.test.ts`:

### Deck validation
- [ ] Rejects deck with ≠ 60 cards
- [ ] Rejects deck with no Basic Pokemon
- [ ] Rejects deck with >4 copies of the same card name
- [ ] Accepts deck with 4 copies same-name different-set
- [ ] Rejects deck with >1 ACE SPEC (Trainer)
- [ ] Rejects deck with >1 ACE SPEC (Trainer + Energy combined)
- [ ] Rejects non-Standard-legal cards
- [ ] Rejects Radiant Pokemon

### Setup
- [ ] Mulligan loop redraws until Basic found
- [ ] Extra draws = differential of INDIVIDUAL (non-shared) mulligans
- [ ] Coin flip winner can choose first or second
- [ ] Both players get 6 prize cards after setup completes

### First-turn restrictions
- [ ] Starting player (P1) cannot attack on turn 1
- [ ] Starting player (P1) cannot play Supporter on turn 1
- [ ] Second player (P2) CAN attack on turn 1
- [ ] Second player (P2) CAN play Supporter on turn 1

### Evolution
- [ ] Cannot evolve on the turn a Pokemon was played (`isNewThisTurn`)
- [ ] P1 cannot evolve on turn 1 (their first turn)
- [ ] P2 cannot evolve on turn 2 (their first turn)
- [ ] P3+ both players can evolve (normal turns)
- [ ] Evolution requires exact `evolvesFrom` name match
- [ ] "Paldean Wooper" evolves from "Paldean Wooper" only — not "Wooper"
- [ ] Rare Candy: Basic → Stage 2 allowed when `skipStage1: true`
- [ ] Evolution clears Special Conditions
- [ ] Evolution preserves damage counters and attached cards

### Retreat
- [ ] Cannot retreat when Asleep
- [ ] Cannot retreat when Paralyzed
- [ ] Cannot retreat twice in one turn
- [ ] Energy cost paid correctly
- [ ] Damage counters preserved on retreated Pokemon
- [ ] Attached Energy and Tools preserved on retreated Pokemon
- [ ] Special Conditions cleared on retreat

### Per-turn limits
- [ ] Energy attachment: once per turn
- [ ] Supporter: once per turn
- [ ] Stadium: once per turn, blocks same-name

### Win conditions
- [ ] Prize exhaustion: first to take all 6 prizes wins
- [ ] No Pokemon in play: losing Active with empty bench loses
- [ ] Deck-out: cannot draw at turn start → lose
- [ ] Simultaneous win: P1 satisfies 2 conditions, P2 satisfies 1 → P1 wins
- [ ] Simultaneous win: both satisfy 1 condition → draw

### Pokemon Checkup
- [ ] Poison places 1 damage counter (not pipeline damage)
- [ ] Burn places 2 damage counters then flips for removal
- [ ] Asleep flips for removal
- [ ] Paralyzed removed only in Checkup after owner's turn (not opponent's)
- [ ] Checkup KO with no bench on either side → draw
- [ ] Order: Poison before Burn before Asleep before Paralyzed

---

## 15. Non-Obvious Pitfalls

1. **turnNumber vs player turns:** `turnNumber` increments every time `activePlayer` changes.
   Turn 1 = P1's first turn, Turn 2 = P2's first turn. Keep this mental model.

2. **startingPlayer vs activePlayer:** `startingPlayer` is set once at setup and never changes.
   It identifies the player who chose to go first. Use it to compute `isStartingPlayerFirstTurn`.

3. **Paralyzed timing trap:** The `activePlayer` at the time `performCheckup` runs is the player
   whose turn JUST ended. So checking `pokemon.owner === state.activePlayer` correctly identifies
   whose turn it was. The `activePlayer` switch happens AFTER checkup completes.

4. **StadiumState.playedBy:** Needed to enforce "you can't discard your own Stadium by playing
   a new one with the same name." A player can play a Stadium of the same name as the opponent's.
   Rule: `stadiumPlayedThisTurn` prevents playing a second stadium in same turn (regardless of name).
   Separately: cannot play if current stadium has same name AND same player would be affected by
   the "A Stadium with the same name can't be played" rule → simplest: block if
   `state.stadium?.cardDefinition.name === newStadiumCard.name`.

5. **KO processing order:** When an attack KOs both Active Pokemon simultaneously (e.g., recoil
   damage), process ALL KOs before ANY promotion. Prizes are cumulative — if taking 2 prizes
   drains the prize pile, checkWinConditions fires mid-processing and the game ends before the
   opponent promotes. Do not short-circuit.

6. **Prize value 3 for Mega Evolution ex:** When a Mega Evolution ex (`prizeValue: 3`) is KO'd,
   the opponent takes 3 Prize cards. This is already encoded on `PokemonCardDefinition.prizeValue`.

7. **isNewThisTurn reset:** At the start of each turn (`startTurn`), set `isNewThisTurn = false`
   for ALL Pokemon in play for both players. This is how evolution restrictions relax.

8. **Extra mulligan draws and bench:** Cards drawn from extra mulligan draws CAN include Basics
   that go directly to bench during the SELECT_BENCH phase. They are added to hand first and then
   the player selects what to bench alongside their original hand Basics.

9. **Empty bench at SELECT_ACTIVE:** It is legal to select an Active and bench nothing. Do not
   force bench placement if the player has no other Basics.

10. **`SELECT_BENCH` action shape:** The action takes `cardInstanceIds: ReadonlyArray<string>` —
    a list of 0–5 Basic Pokemon from hand to place on bench simultaneously. getLegalActions must
    enumerate valid subsets OR expose a simpler "place one at a time" flow. Recommended: generate
    all valid subsets up to 5 Basics from hand. For the AI, scoring is simpler if it can place
    all available Basics at once.

---

## 16. Test File Location and DB Path

```typescript
// __tests__/core/game-flow.test.ts

// DB path is CWD-relative (bun test runs from packages/@engine/)
const DB_PATH = '../../database/pokemon-data.sqlite3.db';

// Load a small slice of the card pool for test fixtures — don't load 4k+ cards
// in every test. Pick a handful of real card IDs from the DB.
```

Do NOT use `import.meta.url`, `import.meta.dir`, or absolute paths in test files.
CWD-relative string literals only.

---

## 17. What NOT to Implement in SPEC_02

These are explicitly SPEC_03, SPEC_04, or SPEC_05 territory:

- Attack resolution and damage calculation (SPEC_03)
- Weakness, Resistance calculation (SPEC_03)
- Specific card effects for any Trainer, Ability, or Attack (SPEC_04)
- AI decision scoring and heuristics (SPEC_05)
- Confused self-damage (SPEC_03 — it uses counter placement during attack resolution)
- Bench damage from spread attacks (SPEC_03)

The `applyAction` handler for `ATTACK` in SPEC_02 should:
1. Validate legality (energy, conditions, first-turn block)
2. Emit `ATTACK_DECLARED` event
3. Set `turnFlags.attackUsed = true`
4. Call a stub `resolveAttack(state, attackIndex)` → returns unchanged state (SPEC_03 fills this)
5. Transition to 'checkup' phase after the stub resolves

This keeps the game loop intact end-to-end without depending on SPEC_03.

---

## 18. Session Start Verification

Before writing any new code, verify the existing foundation:

```bash
# From /home/nicks-dgx/dev/.Project-Johto/Pokemon
bun test --cwd packages/@engine    # should show 45 pass, 0 fail
bun run --cwd packages/@engine check-types  # should show no output (clean)
```

If either fails, fix it before proceeding — do not build on a broken foundation.
