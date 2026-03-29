# SPEC_04 Implementation Context
## Pokemon TCG Game Engine — Card Effect System

This document gives a new session everything it needs to implement SPEC_04 without prior
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

## 2. What SPEC_01 + SPEC_02 + SPEC_03 Already Delivered

All files are in `packages/@engine/lib/`. The package builds cleanly with 165 tests passing.

### Type files (`lib/types/`)

| File | Key exports |
|------|-------------|
| `card.ts` | `EnergyType`, `ENERGY_TYPES`, `PokemonCardDefinition`, `TrainerCardDefinition`, `EnergyCardDefinition`, `CardDefinition`, `PokemonStage`, `PokemonSubtype`, `TrainerSubtype`, `AttackDefinition`, `AbilityDefinition`, `WeaknessDefinition`, `ResistanceDefinition` |
| `game.ts` | `GameState`, `PlayerState`, `InPlayPokemon`, `SpecialCondition`, `PlayerId`, `CardInstance`, `GamePhase`, `StadiumState`, `TurnFlags` |
| `action.ts` | `PlayerAction` (discriminated union, 13 variants — see §2a below) |
| `event.ts` | `GameEvent` (discriminated union, 25 variants), `WinReason` |
| `effect.ts` | `TemporalEffect` (minimal stub — SPEC_04 must expand it) |

### 2a. PlayerAction union (complete, 13 variants)

```typescript
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

### 2b. TemporalEffect — current minimal shape

```typescript
export interface TemporalEffect {
  readonly id: string;
  readonly type: string;
  readonly sourceInstanceId: string;
  readonly targetInstanceId: string | null;
  readonly expiresOnTurn: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
```

**This interface must be expanded for SPEC_04.** See §4.2 for the target shape.

### 2c. Effect registry (`lib/effects/registry.ts`)

```typescript
export type EffectContext = {
  readonly state: GameState;
  readonly actingPlayer: PlayerId;
  readonly targets: ReadonlyArray<string>;
};

export type EffectHandler = (context: EffectContext) => GameResult<GameState>;

const registry = new Map<string, EffectHandler>();

export function registerEffect(effectId: string, handler: EffectHandler): void;
export function resolveEffect(effectId: string, context: EffectContext): GameResult<GameState>;
// If effectId has no handler: returns ok(context.state) — no-op
```

**SPEC_04 must expand this** into typed registries (attack/ability/trainer) with richer
context types. The existing `EffectHandler` and `EffectContext` are a SPEC_02 stub —
replace them wholesale. See §4.1.

### SPEC_03 logic files (`lib/core/`)

| File | Key exports | Notes for SPEC_04 |
|------|-------------|-------------------|
| `combat.ts` | `resolveAttack`, `calculateDamage`, `resolveWeakness`, `resolveResistance`, `resolveConfusion`, `dealBenchDamage`, `dealSelfDamage`, `discardEnergyFromPokemon`, `checkKnockOuts`, `placeDamageCountersOn`, `DamageCalculation` | `resolveAttack` calls `resolveEffect(attack.effectId, ...)` for side effects — SPEC_04 handlers will fire here. `dealBenchDamage` and `dealSelfDamage` are already exported for effect handlers to use. |
| `game.ts` | `createGame`, `checkWinConditions`, `handleKnockOut`, `promoteFromBench`, `otherPlayer` | `handleKnockOut` handles both active and bench KOs. |
| `turn.ts` | `startTurn`, `endTurn`, `getLegalActions`, `applyAction` | PLAY_TRAINER handler already calls `resolveEffect(trainerDef.effectId, ...)` for Items. USE_ABILITY handler calls `resolveEffect(ability.effectId, ...)`. Both are no-ops today. |
| `checkup.ts` | `performCheckup` | Uses private `placeDamageCounters` for Poison/Burn. |
| `energy.ts` | `canPayEnergyCost`, `canPayRetreatCost` | |
| `evolution.ts` | `canEvolve(def, target, state, options?)`, `evolvePokemon` | `canEvolve` already supports `{ skipStage1: true }` for Rare Candy. |
| `conditions.ts` | `applySpecialCondition`, `removeSpecialCondition`, `clearSpecialConditions` | `applySpecialCondition` already enforces rotation-condition mutual exclusivity. |
| `result.ts` | `GameResult<T>`, `ok`, `err`, `GameErrorCode` | |
| `rng.ts` | `coinFlip`, `shuffle`, `randomInt`, `createRngState`, `RngState` | All RNG flows through seeded state. |

### Key integration points for SPEC_04

**1. `turn.ts` PLAY_TRAINER handler (Items/Supporters):**
- Items: removes card from hand → adds to discard → calls `resolveEffect(trainerDef.effectId, ...)`
- Supporters: sets `supporterPlayedThisTurn`, then same flow as Items
- Stadiums: discards old stadium, places new one, **early returns without calling resolveEffect** — stadium effects are ongoing, not immediate
- PokemonTool: attaches to Pokemon, **early returns without calling resolveEffect**

**2. `turn.ts` USE_ABILITY handler:**
- Emits `ABILITY_USED` event, then calls `resolveEffect(ability.effectId, ...)`

**3. `combat.ts` resolveAttack:**
- After dealing damage, calls `resolveEffect(attack.effectId, ...)` for attack side-effects
- TM attacks also route through `resolveEffect`

**4. Temporal effect handling locations:**
- `game.ts createGame`: initializes `temporalEffects: []`
- `turn.ts RETREAT handler`: removes ALL temporal effects targeting the retreating Pokemon
- `evolution.ts evolvePokemon`: removes ALL temporal effects targeting the evolving Pokemon
- `combat.ts calculateDamage`: reads `damage_modifier` effects on attacker, `damage_reduction` effects on defender
- `combat.ts resolveAttack`: reads `attack_prevention` effects, removes them when consumed

**5. `endTurn` does NOT clean up temporal effects today.** SPEC_04 must add expiry cleanup.

---

## 3. SPEC_04 Files to Create / Modify

```
lib/types/effect.ts                   MODIFY — expand TemporalEffect with sourceType, richer typing
lib/effects/registry.ts               MODIFY — split into typed registries (attack/ability/trainer),
                                              expand context types, add fallback behavior
lib/effects/primitives.ts             NEW — reusable state-transformation functions:
                                              drawCards, discardFromHand, searchDeck, shuffleDeck,
                                              moveToHand, discardEnergy, discardAllEnergy, moveEnergy,
                                              attachEnergyFromDeck, switchActive, putOnBench,
                                              flipCoin, flipCoins, healDamage, healAllDamage,
                                              applyCondition, removeCondition
lib/effects/trainers.ts               NEW — handlers for 15+ Trainer cards (format staples)
lib/effects/attacks.ts                NEW — generic attack effect handlers (10+ patterns)
lib/core/turn.ts                      MODIFY — temporal effect expiry in endTurn;
                                              Supporter handler calls resolveEffect
lib/index.ts                          MODIFY — re-export new primitives, context types, choice types
__tests__/effects/primitives.test.ts  NEW — unit tests for each primitive
__tests__/effects/trainers.test.ts    NEW — integration tests for each Trainer handler
__tests__/effects/attacks.test.ts     NEW — integration tests for attack patterns
```

---

## 4. Design Decisions

### 4.1 Typed registries replace the single generic registry

The existing `EffectHandler` and `EffectContext` are too generic. SPEC_04 replaces them:

```typescript
// lib/effects/registry.ts — expanded

export type AttackEffectHandler = (state: GameState, context: AttackContext) => GameState;
export type AbilityEffectHandler = (state: GameState, context: AbilityContext) => GameState;
export type TrainerEffectHandler = (state: GameState, context: TrainerContext) => GameState;

export interface AttackContext {
  readonly attacker: InPlayPokemon;
  readonly attackerDef: PokemonCardDefinition;
  readonly defender: InPlayPokemon;
  readonly defenderDef: PokemonCardDefinition;
  readonly attackIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
}

export interface AbilityContext {
  readonly pokemon: InPlayPokemon;
  readonly pokemonDef: PokemonCardDefinition;
  readonly abilityIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
}

export interface TrainerContext {
  readonly cardInstance: CardInstance;
  readonly trainerDef: TrainerCardDefinition;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly targets: ReadonlyArray<string>;
}
```

**Backwards compatibility:** The old `resolveEffect` function is called from `combat.ts`
and `turn.ts`. It must continue to work but delegate to the typed registries internally.
The approach: `resolveEffect` inspects the effectId prefix (`attack:`, `ability:`,
`trainer:`) to dispatch to the correct typed registry. If no prefix, try all registries.
If still not found, return `ok(state)` (no-op fallback).

**Alternatively:** Since SPEC_03's `resolveAttack` already calls `resolveEffect` with a
generic `EffectContext`, you can keep the old signature as a facade that adapts. The typed
handlers have richer contexts — build the full context in combat.ts/turn.ts and pass it.
See §9 for the recommended approach.

### 4.2 TemporalEffect expansion

The current `TemporalEffect` type is too loose for SPEC_04. Expand it:

```typescript
export interface TemporalEffect {
  readonly id: string;
  readonly type: 'damage_modifier' | 'damage_reduction' | 'damage_prevention'
              | 'attack_prevention' | 'ability_lock' | 'retreat_prevention'
              | 'attack_lock';
  readonly sourceInstanceId: string;
  readonly sourceType: 'attack' | 'ability' | 'trainer' | 'stadium';
  readonly targetInstanceId: string | null;
  readonly expiresOnTurn: number | null;
  readonly expiresAt: 'end_of_turn' | 'end_of_opponent_turn' | 'end_of_next_turn'
                    | 'permanent' | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
```

**Key addition: `sourceType`** — this controls cleanup rules:
- Retreat/evolution remove effects where `sourceType === 'attack'` (not ability/trainer/stadium)
- The existing code in `turn.ts` and `evolution.ts` removes ALL temporal effects on zone
  change — this must be narrowed to only `sourceType === 'attack'`

**Key addition: `expiresAt`** — explicit expiry semantics:
- `'end_of_turn'`: removed at end of current player's turn (in `endTurn`)
- `'end_of_opponent_turn'`: removed at end of opponent's next turn
- `'end_of_next_turn'`: removed at end of the creating player's next turn
- `'permanent'`: never auto-removed; only removed by card effect or zone change
- `null`: uses `expiresOnTurn` number if set, otherwise permanent

**Migration path:** The existing `type: string` field already accepts the new union values.
The existing `temporalEffects` array is empty in all games (no handlers create them yet).
So the type expansion is non-breaking — just tighten the type union.

### 4.3 Effect primitives are pure state transforms

Every function in `primitives.ts` takes `GameState` and returns `GameState`. No
side-effects. No mutation. No exceptions — errors are handled by returning state unchanged
or by using `GameResult<GameState>` where validation is needed.

These primitives are what effect handlers compose. No handler should directly manipulate
`players`, `deck`, `hand`, `discard`, etc. — always go through a primitive.

### 4.4 `drawCards` does NOT trigger deck-out

Rulebook p.21: only the mandatory start-of-turn draw triggers deck-out loss. Card-effect
draws from an empty deck simply draw 0 cards and continue. `drawCards` must draw
`Math.min(count, deck.length)` without checking win conditions.

### 4.5 `switchActive` cleanup rules

When a Pokemon moves to bench:
1. Remove ALL Special Conditions (already done by `clearSpecialConditions`)
2. Remove temporal effects where `sourceType === 'attack'` targeting that Pokemon
3. Do NOT remove effects with `sourceType` of `'ability'`, `'trainer'`, or `'stadium'`

The current retreat handler in `turn.ts` removes ALL temporal effects. SPEC_04 must
narrow this to `sourceType === 'attack'` only.

### 4.6 Trainer card effect flow

**Items:** Hand → discard → effect resolves. Already handled by `turn.ts`.
Items can be played multiple times per turn (no limit).

**Supporters:** 1 per turn. Hand → discard → effect resolves. `turn.ts` already enforces
the 1-per-turn limit and bans Supporters on starting player's turn 1.

**Stadiums:** Placed into stadium zone (not discarded). Effect is ongoing, not immediate.
`turn.ts` already handles placement with early return. Stadium effects are checked at
specific trigger points (start of turn, once-per-turn ability-like usage) — not via
`resolveEffect`. Stadium handlers need a different invocation pattern.

### 4.7 AI choice resolution — simplified for v1

SPEC_04's spec describes an `EffectChoice` interface for deferred choices. For v1
(headless simulation), the AI makes choices immediately during effect resolution.

**Recommended approach:** Pass a `choiceResolver` function into effects:

```typescript
type ChoiceResolver = (choice: EffectChoice) => ReadonlyArray<string>;
```

For simulation, the choice resolver picks randomly (or uses a heuristic). A future UI
layer would queue the choice and wait for human input. Effect handlers call the resolver
inline — no deferred/async flow needed for v1.

Store the `choiceResolver` on `GameState` or pass it through context.

### 4.8 effectId convention — use card-level IDs, not namespaced

The spec suggests `attack:{cardId}:{attackIndex}` IDs. However, the existing
`TrainerCardDefinition.effectId` and `AttackDefinition.effectId` fields already contain
the card's own ID (e.g. `sv1-181` for Nest Ball, `svp-124` for Iono). The adapter
populates these from the database.

**Decision:** Register handlers by the effectId stored in the card definition, not by a
namespaced convention. Multiple prints of the same card (e.g. Iono has IDs `svp-124`,
`sv2-185`, `sv4pt5-80`, etc.) share the same name and effect text, but have DIFFERENT
effectIds.

**Approach:** Register handlers by CARD NAME, and have the registry do a name→handler lookup.
Or: register each effectId variant. The former is cleaner. Create a helper:

```typescript
function registerTrainerByName(name: string, handler: TrainerEffectHandler): void {
  // At init time, scan all known definitions and register for every effectId matching the name
}
```

Or simpler: register by name, and at resolve time look up the card name from the effectId
via the definition registry, then find the handler by name.

### 4.9 Common attack patterns — generic handlers

Many attacks share the same structure (e.g. "Flip a coin. If heads, +N damage"). Instead
of registering a handler per card, create generic pattern handlers that read parameters
from the attack definition:

```typescript
// Register a generic "coin_flip_bonus_damage" handler
// Attack text: "Flip a coin. If heads, this attack does N more damage."
// Parameters extracted from attack: damageModifier === '+', attack.damage = base
function coinFlipBonusDamage(state: GameState, ctx: AttackContext): GameState {
  const attack = ctx.attackerDef.attacks[ctx.attackIndex]!;
  const { result, newState } = flipCoin(state);
  if (result === 'heads') {
    // Deal bonus damage = attack.damage (the "+" number)
    return dealBenchDamageOrActive(...);
  }
  return newState;
}
```

For v1, map attack effectIds to the appropriate generic handler based on attack text
pattern matching during registration.

---

## 5. Priority Trainer Cards — effectIds in the Database

These are the confirmed Standard-legal effectIds for each priority Trainer:

| Card | Example effectId | Subtype | Effect Summary |
|------|-----------------|---------|----------------|
| Nest Ball | `sv1-181` | Item | Search deck for Basic Pokemon → bench |
| Ultra Ball | `sv1-196` | Item | Discard 2 from hand → search deck for any Pokemon → hand |
| Rare Candy | `sv1-191` | Item | Evolve Basic directly to Stage2 (uses `canEvolve` with `skipStage1`) |
| Switch | `sv1-194` | Item | Switch Active with Benched |
| Super Rod | `sv2-188` | Item | Shuffle up to 3 Pokemon/Basic Energy from discard into deck |
| Energy Retrieval | `sv1-171` | Item | Put up to 2 Basic Energy from discard into hand |
| Pal Pad | `sv1-182` | Item | Shuffle up to 2 Supporters from discard into deck |
| Pokegear 3.0 | `sv1-186` | Item | Look at top 7 of deck, take a Supporter |
| Boss's Orders | `me1-114` | Supporter | Switch opponent's Active with one of their Benched |
| Iono | `svp-124` | Supporter | Both players shuffle hand to bottom of deck, draw = remaining prizes |
| Professor's Research | `sv4pt5-87` | Supporter | Discard hand, draw 7 |
| Arven | `sv1-166` | Supporter | Search deck for 1 Item + 1 Pokemon Tool → hand |
| Judge | `sv1-176` | Supporter | Both players shuffle hand into deck, draw 4 |
| Artazon | `sv2-171` | Stadium | Once per turn: search deck for non-Rule Box Basic → bench |
| Temple of Sinnoh | — | Stadium | Special Energy provides only Colorless (not in current pool) |

**Multiple prints:** Iono has effectIds `svp-124`, `sv2-185`, `sv2-254`, `sv2-269`,
`sv4pt5-80`, `sv4pt5-237`. All must resolve to the same handler. Use name-based lookup.

---

## 6. Common Attack Effect Patterns — from Real Card Data

These patterns appear across many cards. Implement as generic reusable handlers:

| Pattern | Example Card/Attack | Signature |
|---------|-------------------|-----------|
| Heal self | svp-1 Mini Drain: "Heal 10 damage from this Pokemon" | `healSelf(amount)` |
| Apply condition | svp-2 Super Singe: "Your opponent's Active Pokemon is now Burned" | `applyConditionToDefender(condition)` |
| Coin flip + bonus damage | svp-3 Water Splash 20+: "Flip a coin. If heads, this attack does 20 more damage" | `coinFlipBonusDamage(bonusAmount)` |
| Switch self after attack | svp-4 Void Return: "You may switch this Pokemon with 1 of your Benched Pokemon" | `maySwitchSelfAfterAttack()` |
| Discard all energy | svp-6 Electro Paws: "Discard all Energy from this Pokemon" | `discardAllEnergyFromSelf()` |
| Coin flip + condition | svp-9 String Truss: "Flip a coin. If heads, opponent's Active is now Paralyzed" | `coinFlipApplyCondition(condition)` |
| Bench snipe | svp-13 Lightning Laser: "Also does 30 damage to 1 of opponent's Benched Pokemon" | `sniperBench(amount)` |
| Discard N energy | svp-15 Extreme Current: "Discard an Energy from this Pokemon" | `discardEnergyFromSelf(count)` |
| Self-lock next turn | svp-18 Full Throttle: "During your next turn, this Pokemon can't attack" | `lockSelfNextTurn()` |
| Damage prevention | "During opponent's next turn, prevent all damage to this Pokemon" | `preventDamageNextTurn()` |

---

## 7. Modifying `endTurn` for Temporal Effect Expiry

Currently `endTurn` in `turn.ts` does NOT clean up temporal effects. SPEC_04 must add:

```typescript
// In endTurn, after resetting player flags and before performCheckup:
s = {
  ...s,
  temporalEffects: s.temporalEffects.filter(e => {
    // Remove end_of_turn effects for the active player
    if (e.expiresAt === 'end_of_turn') return false;
    // Remove end_of_opponent_turn effects for the opponent
    if (e.expiresAt === 'end_of_opponent_turn' && /* this is opponent's turn ending */) return false;
    // Remove by turn number
    if (e.expiresOnTurn !== null && s.turnNumber >= e.expiresOnTurn) return false;
    return true;
  })
};
```

### Narrowing retreat/evolution temporal effect cleanup

**Retreat handler in `turn.ts` (~line 1023):**
Currently: `temporalEffects: state.temporalEffects.filter(e => e.targetInstanceId !== active.instanceId)`
Must change to: `temporalEffects: state.temporalEffects.filter(e => !(e.targetInstanceId === active.instanceId && e.sourceType === 'attack'))`

**Evolution in `evolution.ts` (~line 127):**
Currently: removes ALL effects targeting the evolving Pokemon
Must change to: only remove effects where `sourceType === 'attack'`

---

## 8. Modifying the Existing `resolveEffect` Facade

The existing `resolveEffect(effectId, context)` is called from:
1. `combat.ts resolveAttack` — for attack side-effects
2. `turn.ts PLAY_TRAINER` — for Items and Supporters
3. `turn.ts USE_ABILITY` — for abilities

**Recommended approach:** Keep `resolveEffect` as a facade. Internally, it dispatches
to the correct typed handler based on where it's called from. Since the existing call
sites already know the context type, enrich the `EffectContext` to carry the typed
sub-context:

```typescript
export type EffectContext = {
  readonly state: GameState;
  readonly actingPlayer: PlayerId;
  readonly targets: ReadonlyArray<string>;
  // SPEC_04 additions:
  readonly attackContext?: AttackContext;
  readonly abilityContext?: AbilityContext;
  readonly trainerContext?: TrainerContext;
};
```

Then `resolveEffect` checks which sub-context is present and dispatches accordingly.
This avoids changing every call site in SPEC_03 code.

---

## 9. Recommended Integration Approach

### Step 1: Expand types
- Expand `TemporalEffect` in `lib/types/effect.ts`
- Add `EffectChoice` to `lib/types/effect.ts`

### Step 2: Create primitives
- Create `lib/effects/primitives.ts` with all state-transform helpers
- Each primitive emits appropriate `GameEvent`s
- Unit test each primitive independently

### Step 3: Expand the registry
- Expand `lib/effects/registry.ts` with typed registries and contexts
- Keep `resolveEffect` facade working
- Add `registerAttackEffect`, `registerTrainerEffect`, `registerAbilityEffect`

### Step 4: Implement Trainer handlers
- Create `lib/effects/trainers.ts`
- Register handlers for all 15 priority Trainers
- Use name-based registration to cover multiple print variants

### Step 5: Implement attack pattern handlers
- Create `lib/effects/attacks.ts`
- Register generic handlers for 10+ patterns
- Map specific card effectIds to generic handlers

### Step 6: Wire temporal effect expiry
- Modify `endTurn` in `turn.ts` for expiry cleanup
- Narrow retreat/evolution cleanup to `sourceType === 'attack'`

### Step 7: Wire Supporter effectId resolution
- The PLAY_TRAINER handler for Supporters already calls `resolveEffect` — verify this path
  works with the new typed handlers
- Stadiums need a separate trigger mechanism (not `resolveEffect`)

---

## 10. Acceptance Criteria to Test

Every item below must have a test:

### Primitives
- [ ] `drawCards` draws correct number; draws 0 from empty deck without triggering deck-out
- [ ] `discardFromHand` removes specified cards from hand and adds to discard
- [ ] `searchDeck` returns matching candidates based on filter
- [ ] `shuffleDeck` shuffles using seeded RNG
- [ ] `moveToHand` moves card from source zone to hand
- [ ] `discardEnergy` removes N energy of specified type from Pokemon
- [ ] `discardAllEnergy` removes all energy from Pokemon
- [ ] `moveEnergy` transfers energy between two Pokemon
- [ ] `switchActive` swaps active/bench, clears conditions, removes attack-sourced temporal effects
- [ ] `putOnBench` places a Basic Pokemon from hand onto bench
- [ ] `flipCoin` uses seeded RNG, emits COIN_FLIPPED event
- [ ] `flipCoins` returns array of results, advances RNG state correctly
- [ ] `healDamage` reduces damage counters, emits DAMAGE_HEALED
- [ ] `applyCondition` applies condition with mutual exclusivity enforced
- [ ] `attachEnergyFromDeck` searches deck for energy and attaches it

### Trainer handlers
- [ ] Nest Ball: searches deck for Basic, puts on bench, shuffles
- [ ] Ultra Ball: requires 2 discards from hand, searches for any Pokemon
- [ ] Rare Candy: evolves Basic → Stage2 using `canEvolve({ skipStage1: true })`
- [ ] Switch: swaps Active with Benched, clears conditions
- [ ] Super Rod: shuffles up to 3 Pokemon/Basic Energy from discard into deck
- [ ] Energy Retrieval: returns up to 2 Basic Energy from discard to hand
- [ ] Pal Pad: shuffles up to 2 Supporters from discard into deck
- [ ] Pokegear 3.0: looks at top 7 of deck, takes a Supporter
- [ ] Boss's Orders: switches opponent's Active with one of their Benched
- [ ] Iono: both shuffle hand to deck bottom, draw cards = remaining prizes
- [ ] Professor's Research: discard entire hand, draw 7
- [ ] Arven: search deck for 1 Item + 1 Pokemon Tool
- [ ] Judge: both shuffle hands into deck, draw 4
- [ ] Artazon: once per turn, search for non-Rule Box Basic → bench
- [ ] Fallback: unregistered Trainer effectId is a no-op (not crash)

### Attack effect handlers
- [ ] Heal self: heals specified amount from attacker
- [ ] Apply condition to defender: applies correct SpecialCondition
- [ ] Coin flip bonus damage: heads = bonus, tails = base only
- [ ] Discard all energy from self: removes all attached energy
- [ ] Discard N energy from self: removes specified count
- [ ] Bench snipe: deals damage to a bench target (no W/R, Tera immune)
- [ ] Switch self after attack: may switch attacker with Benched
- [ ] Self-lock: creates temporal effect preventing attack next turn
- [ ] Damage prevention: creates temporal effect preventing damage next turn
- [ ] Fallback: unregistered attack effectId does base damage only (not crash)

### Temporal effects
- [ ] `end_of_turn` effects removed at end of creating player's turn
- [ ] `end_of_opponent_turn` effects removed at end of opponent's turn
- [ ] Retreat removes only `sourceType === 'attack'` effects (not ability/trainer/stadium)
- [ ] Evolution removes only `sourceType === 'attack'` effects
- [ ] `attack_prevention` checks `targetInstanceId` matches current Active before applying
- [ ] `damage_modifier` and `damage_reduction` correctly read from payload

### Integration
- [ ] Full Trainer play flow: hand → discard → effect resolves → state updated
- [ ] Full attack flow with registered effect: damage + side-effect both fire
- [ ] Multiple prints of same Trainer (e.g. Iono) all resolve to same handler
- [ ] Effect primitives compose correctly in complex handlers (e.g. Ultra Ball = discard + search)

---

## 11. Non-Obvious Pitfalls

1. **`resolveEffect` is called from 3 places.** Any changes to the registry must preserve
   backwards compatibility with the existing call sites in `combat.ts` and `turn.ts`.

2. **Stadium effects are NOT immediate.** The PLAY_TRAINER handler for Stadiums early-returns
   without calling `resolveEffect`. Stadium effects (like Artazon's search) need a different
   trigger mechanism — typically checked during `getLegalActions` or as a once-per-turn ability-like
   action. Consider whether Stadiums should use the USE_ABILITY action type or a new mechanism.

3. **Iono's effect is unusual.** Both players shuffle their hands to the BOTTOM of their decks
   (not into the deck). Then each draws cards equal to remaining prizes. This is distinct from
   Judge which shuffles into the deck.

4. **Ultra Ball has a precondition.** "You can use this card only if you discard 2 other cards
   from your hand." If the player has fewer than 3 cards total in hand (Ultra Ball + 2 others),
   the card cannot be played. This must be checked in `getLegalActions`, not just in the handler.

5. **Rare Candy already has infrastructure.** `canEvolve` supports `{ skipStage1: true }` and
   validates the evolution chain. The handler just needs to present the choice and call
   `evolvePokemon`.

6. **Multiple effectIds for the same card name.** Different prints of Iono have different
   effectIds (svp-124, sv2-185, etc.). All must resolve to the same handler.

7. **The Supporter handler in `turn.ts` does NOT currently call `resolveEffect`.** Looking at the
   code: the Supporter branch sets `supporterPlayedThisTurn = true`, then falls through to the
   Item/TM branch which calls `resolveEffect`. Verify this flow works correctly. The Supporter
   branch does NOT early-return like Stadium/Tool — it falls through.

8. **Energy discard for attacks is an EFFECT, not a cost.** "Discard an Energy from this Pokemon"
   in attack text is resolved as part of the attack effect, not as an energy cost check before
   the attack. The energy cost (the icons in the top-right) is checked in `getLegalActions`.

9. **"Up to" semantics differ.** Attacks: "up to X" allows choosing 0. Trainer/Ability: "up to X"
   requires at least 1 (rulebook p.21). Set `min` on `EffectChoice` accordingly.

10. **`drawCards` from an empty deck.** Card effects that draw from an empty deck simply draw 0.
    Only the mandatory turn-start draw triggers deck-out (already handled in `startTurn`).

11. **`searchDeck` must shuffle after.** Every search effect is followed by a shuffle (rulebook).
    Make `searchDeck` NOT auto-shuffle — let the handler call `shuffleDeck` explicitly, because
    some effects search and then do something else before shuffling.

12. **`switchActive` must clear conditions AND attack-sourced temporal effects.** The existing
    retreat handler does both, but `switchActive` as a primitive must also do both so that
    Switch/Boss's Orders/effect-based switches are consistent.

---

## 12. Test File Location and DB Path

```typescript
// __tests__/effects/primitives.test.ts
// __tests__/effects/trainers.test.ts
// __tests__/effects/attacks.test.ts

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

// Reuse card IDs from SPEC_02/03 tests:
const MAREEP_ID = 'svp-107';        // Basic Lightning, 60 HP
const FLAAFFY_ID = 'svp-108';       // Stage1 Lightning, 90 HP
const AMPHAROS_ID = 'svp-109';      // Stage2 Lightning, 160 HP
const PIKACHU_EX_ID = 'svp-106';    // Basic ex Lightning, 200 HP
const PAWNIARD_ID = 'svp-111';      // Basic Darkness, 70 HP
const FIRE_ENERGY_ID = 'base1-98';
const LIGHTNING_ENERGY_ID = 'base1-100';

// Trainer card IDs:
const NEST_BALL_ID = 'sv1-181';
const ULTRA_BALL_ID = 'sv1-196';
const RARE_CANDY_ID = 'sv1-191';
const SWITCH_ID = 'sv1-194';
const SUPER_ROD_ID = 'sv2-188';
const ENERGY_RETRIEVAL_ID = 'sv1-171';
const PAL_PAD_ID = 'sv1-182';
const POKEGEAR_ID = 'sv1-186';
const BOSS_ORDERS_ID = 'me1-114';
const IONO_ID = 'svp-124';
const PROFESSORS_RESEARCH_ID = 'sv4pt5-87';
const ARVEN_ID = 'sv1-166';
const JUDGE_ID = 'sv1-176';
const ARTAZON_ID = 'sv2-171';
```

Do NOT use `import.meta.url`, `import.meta.dir`, or absolute paths in test files.
CWD-relative string literals only.

---

## 13. Session Start Verification

Before writing any new code, verify the existing foundation:

```bash
# From /home/nicks-dgx/dev/.Project-Johto/Pokemon
bun test --cwd packages/@engine    # should show 165 pass, 0 fail
bun run --cwd packages/@engine check-types  # should show no output (clean)
```

If either fails, fix it before proceeding — do not build on a broken foundation.

---

## 14. What NOT to Implement in SPEC_04

These are explicitly deferred:

- **Lost Zone mechanics** — `lostZone` array exists but is not populated. Cards referencing
  Lost Zone fall back to no-op with a warning.
- **AI decision heuristics** — SPEC_05 territory. Use random choice or first-valid for v1.
- **UI/network layer** — headless engine only. No async, no promises, no event emitters.
- **Card-specific abilities** — only common attack patterns. Individual Pokemon abilities
  (Spiritomb, Comfey, etc.) are v2 unless they are trivially composable from primitives.
- **ACE SPEC special rules** — treated as normal Items for effect resolution.
