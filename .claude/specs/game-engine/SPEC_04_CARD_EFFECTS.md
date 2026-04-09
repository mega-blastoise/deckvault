 # SPEC_04: Card Effect System

## Context

Card text drives the vast majority of game complexity. Attacks do more than deal damage. Abilities modify game state. Trainers search, draw, heal, discard, and rearrange. This spec defines a typed, registry-based effect system that maps card IDs to executable functions.

**Key design decision:** We do NOT parse natural language card text at runtime. Instead, each card with a non-trivial effect has a hand-coded effect function registered by card ID. This is the only approach that guarantees rule correctness.

---

## Prerequisites

- SPEC_01 (Core Types)
- SPEC_02 (Game Flow)
- SPEC_03 (Combat)

---

## Requirements

### 1. Effect Registry

```typescript
// src/effects/registry.ts

type AttackEffectHandler = (
  state: GameState,
  context: AttackContext
) => GameState;

type AbilityEffectHandler = (
  state: GameState,
  context: AbilityContext
) => GameState;

type TrainerEffectHandler = (
  state: GameState,
  context: TrainerContext
) => GameState;

interface AttackContext {
  readonly attacker: InPlayPokemon;
  readonly attackerDef: PokemonCardDefinition;
  readonly defender: InPlayPokemon;
  readonly defenderDef: PokemonCardDefinition;
  readonly attackIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
}

interface AbilityContext {
  readonly pokemon: InPlayPokemon;
  readonly pokemonDef: PokemonCardDefinition;
  readonly abilityIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
}

interface TrainerContext {
  readonly cardInstance: CardInstance;
  readonly trainerDef: TrainerCardDefinition;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly targets: ReadonlyArray<string>;
}

// Registry maps effectId -> handler
const attackEffects: Map<string, AttackEffectHandler>;
const abilityEffects: Map<string, AbilityEffectHandler>;
const trainerEffects: Map<string, TrainerEffectHandler>;
```

### 2. Effect ID Convention

Effect IDs follow a namespaced pattern:

```
attack:{cardId}:{attackIndex}     e.g. "attack:sv8-4:0"
ability:{cardId}:{abilityIndex}   e.g. "ability:sv8-4:0"
trainer:{cardId}                  e.g. "trainer:sv8-167"
energy:{cardId}                   e.g. "energy:sv8-193"
```

### 3. Common Effect Primitives

The effect system provides reusable primitives that effect handlers compose:

```typescript
// src/effects/primitives.ts

// Damage
function dealDamageToActive(state: GameState, target: PlayerId, amount: number): GameState;
function dealDamageToBench(state: GameState, targetInstanceId: string, amount: number): GameState;
function placeDamageCounters(state: GameState, targetInstanceId: string, counters: number): GameState;

// Healing
function healDamage(state: GameState, targetInstanceId: string, amount: number): GameState;
function healAllDamage(state: GameState, targetInstanceId: string): GameState;

// Special Conditions
// applySpecialCondition enforces mutual exclusivity (see SPEC_01):
// Applying Asleep/Confused/Paralyzed removes any existing Asleep/Confused/Paralyzed.
// Applying Burned removes existing Burned. Applying Poisoned removes existing Poisoned.
function applySpecialCondition(state: GameState, targetInstanceId: string, condition: SpecialCondition): GameState;
function removeSpecialCondition(state: GameState, targetInstanceId: string, condition: SpecialCondition): GameState;
function removeAllSpecialConditions(state: GameState, targetInstanceId: string): GameState;

// Card Movement
// drawCards: if deck has fewer cards than `count`, draw whatever remains (rulebook p.21).
// This does NOT trigger deck-out loss. Only the mandatory start-of-turn draw (Phase 1)
// triggers deck-out. Card-effect draws from an empty deck simply draw 0 and continue.
function drawCards(state: GameState, player: PlayerId, count: number): GameState;
function discardFromHand(state: GameState, player: PlayerId, cardInstanceIds: ReadonlyArray<string>): GameState;
function searchDeck(state: GameState, player: PlayerId, filter: CardFilter, count: number): SearchResult;
function shuffleDeck(state: GameState, player: PlayerId): GameState;
function moveToHand(state: GameState, player: PlayerId, cardInstanceId: string, from: Zone): GameState;

// Energy
function discardEnergy(state: GameState, pokemonInstanceId: string, count: number, type?: EnergyType): GameState;
function discardAllEnergy(state: GameState, pokemonInstanceId: string): GameState;
function moveEnergy(state: GameState, fromPokemonId: string, toPokemonId: string, energyInstanceId: string): GameState;
function attachEnergyFromDeck(state: GameState, player: PlayerId, targetInstanceId: string, type: EnergyType): GameState;

// Pokemon Movement
// switchActive: moves current Active to bench and promotes newActive.
// The Pokemon moving to bench has ALL Special Conditions and attack-sourced
// TemporalEffects removed (rulebook p.12, p.15-16).
function switchActive(state: GameState, player: PlayerId, newActiveInstanceId: string): GameState;
function putOnBench(state: GameState, player: PlayerId, cardInstanceId: string): GameState;

// Coin Flips
function flipCoin(state: GameState): { result: 'heads' | 'tails'; newState: GameState };
function flipCoins(state: GameState, count: number): { results: ReadonlyArray<'heads' | 'tails'>; newState: GameState };

// Search Filter
interface CardFilter {
  readonly supertype?: 'Pokemon' | 'Trainer' | 'Energy';
  readonly stage?: PokemonStage;
  readonly type?: EnergyType;
  readonly subtypes?: ReadonlyArray<string>;
  readonly name?: string;
  readonly custom?: (def: CardDefinition) => boolean;
}

interface SearchResult {
  readonly candidates: ReadonlyArray<string>;  // matching card instance IDs
  readonly newState: GameState;
}

type Zone = 'deck' | 'hand' | 'discard' | 'bench' | 'active' | 'prizes' | 'lostZone';
```

### 4. AI Choice Resolution

Many effects require choices (which Pokemon to target, which cards to discard, etc.). During simulation, the AI makes these choices. The effect system must support deferred choices:

```typescript
interface EffectChoice {
  readonly type: 'select_pokemon' | 'select_cards' | 'select_energy' | 'select_attack' | 'coin_flip_choice';
  readonly player: PlayerId;
  readonly options: ReadonlyArray<string>;     // valid option IDs
  readonly min: number;
  readonly max: number;
  readonly reason: string;
}
```

When an effect requires a choice, it returns the choice request. The game loop hands it to the AI (or queues it for a human player in a future UI). The AI returns the selection, and the effect continues.

**"Up to" vs "any amount" semantics (rulebook p.21):**
- For **attacks**: "up to X" = choose between **0** and X (can choose 0)
- For **Trainer/Ability effects**: "up to X" = choose between **1** and X (must choose at least 1)
- "Any amount" / "any number" = can choose **0**
- **Exception**: Search effects that say "search for a card" without specifying a kind require at least 1 selection
- Effect handlers must set `min` on `EffectChoice` accordingly based on these semantics

### 5. Temporal Effects

Some effects persist across turns:

```typescript
interface TemporalEffect {
  readonly id: string;
  readonly source: string;                    // card instance that created this effect
  readonly sourceType: 'attack' | 'ability' | 'trainer' | 'stadium';  // what created this effect
  readonly type: 'damage_modifier' | 'damage_prevention' | 'attack_prevention' | 'ability_lock' | 'retreat_prevention';
  readonly value: number;                     // modifier amount
  readonly expiresAt: 'end_of_turn' | 'end_of_opponent_turn' | 'end_of_next_turn' | 'permanent';
  readonly target: string;                    // affected pokemon instance ID or player ID
  readonly originalTarget: string | null;     // for attack_prevention: the specific pokemon instanceId
                                              // that was Active when this effect was created (rulebook p.20:
                                              // if Active has changed, the effect no longer applies)
}

// CLEANUP RULES for TemporalEffects:
// 1. When a Pokemon moves to bench (retreat, Switch, any effect): remove all TemporalEffects
//    with sourceType === 'attack' that target that Pokemon (rulebook p.12).
//    Effects from abilities, trainers, and stadiums are NOT removed on bench movement.
// 2. When a Pokemon evolves: remove all TemporalEffects with sourceType === 'attack'
//    that target that Pokemon (rulebook p.11).
// 3. Effects with expiresAt === 'end_of_turn' are removed at end of current player's turn.
// 4. Effects with expiresAt === 'end_of_opponent_turn' are removed at end of opponent's turn.
// 5. attack_prevention effects: check originalTarget matches current Active before applying.
```

Temporal effects are stored in `GameState` and cleaned up at the appropriate time:

```typescript
interface GameState {
  // ... existing fields ...
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;
}
```

### 6. Initial Effect Coverage (v1)

For v1, we implement effects for the most common Standard-legal cards. The engine gracefully handles cards without registered effects by executing only their base damage (for attacks) or skipping (for abilities/trainers) and logging a warning.

**Priority cards for effect implementation:**

**Trainer Items (high impact, format staples):**
- Nest Ball — Search deck for Basic Pokemon, put on bench
- Ultra Ball — Discard 2 cards, search deck for any Pokemon
- Rare Candy — Evolve Basic directly to Stage 2 (skipping Stage 1)
- Switch / Switch Cart — Switch Active with Benched
- Super Rod — Shuffle up to 3 Pokemon/Basic Energy from discard into deck
- Energy Retrieval — Return 2 Basic Energy from discard to hand
- Battle VIP Pass — Search deck for up to 2 Basic Pokemon, bench them (only on first turn)
- Pal Pad — Shuffle 2 Supporters from discard into deck
- Pokegear 3.0 — Look at top 7, take a Supporter

**Trainer Supporters:**
- Boss's Orders — Switch opponent's Active with one of their Benched
- Iono — Each player shuffles hand into deck, draws cards equal to remaining prizes
- Professor's Research — Discard hand, draw 7
- Arven — Search deck for 1 Item and 1 Pokemon Tool
- Judge — Both players shuffle hands into deck, draw 4

**Stadiums:**
- Artazon — Once per turn, search deck for Basic Pokemon (non-ex/EX), put in hand
- Temple of Sinnoh — Special Energy provides only Colorless

**Common Attack Patterns (implemented as generic handlers):**
- Vanilla damage (no effect) — default handler
- "Flip a coin. If heads, +N damage"
- "Flip a coin. If tails, this attack does nothing"
- "Discard N Energy from this Pokemon"
- "Discard all Energy from this Pokemon"
- "The Defending Pokemon is now [Condition]"
- "Heal N damage from this Pokemon"
- "Draw N cards"
- "This attack does N damage to 1 of your opponent's Benched Pokemon"
- "During your opponent's next turn, prevent all damage done to this Pokemon by attacks"

### 7. Fallback Behavior

```typescript
function resolveAttackEffect(state: GameState, context: AttackContext): GameState {
  const handler = attackEffects.get(context.attackerDef.attacks[context.attackIndex].effectId);
  if (handler) {
    return handler(state, context);
  }
  // Fallback: just deal base damage, no additional effects
  return dealBaseDamage(state, context);
}
```

This ensures the engine can simulate games even with incomplete effect coverage — attacks without registered effects simply deal their printed damage.

**Lost Zone note:** Some Standard-legal cards (regulation mark G, e.g. Comfey, Sableye, Colress's Experiment)
reference the Lost Zone. Since Lost Zone mechanics are deferred to v2, these cards' effects will fall back
to no-op / base damage. The `lostZone` array on `PlayerState` exists for forward compatibility but is
not populated in v1. These cards should be flagged in the adapter with a warning if included in a deck.

---

## Acceptance Criteria

- [ ] Effect registry resolves handlers by effectId
- [ ] Unregistered effects fall back to base damage (attacks) or no-op (abilities/trainers)
- [ ] All primitive functions are pure (state in, state out)
- [ ] Coin flip effects use seeded RNG through the state
- [ ] Search effects correctly filter deck contents
- [ ] Temporal effects expire at the correct time
- [ ] At least 15 Trainer cards fully implemented (the format staples listed above)
- [ ] At least 10 common attack patterns implemented as generic reusable handlers
- [ ] AI choices are deferred correctly through `EffectChoice` interface
- [ ] Effect handlers compose primitives — no duplicated card movement logic
- [ ] `drawCards` draws remaining cards if deck has fewer than requested (no deck-out trigger)
- [ ] `applySpecialCondition` enforces Asleep/Confused/Paralyzed mutual exclusivity
- [ ] `switchActive` removes all Special Conditions and attack-sourced TemporalEffects from benched Pokemon
- [ ] TemporalEffect `sourceType` correctly distinguishes attack vs ability vs trainer vs stadium
- [ ] attack_prevention TemporalEffects check `originalTarget` against current Active before applying
- [ ] "Up to" min values are correctly set (0 for attacks, 1 for Trainer/Ability effects)
- [ ] Lost Zone cards gracefully fall back with warning (not crash)
