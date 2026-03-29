# SPEC_04B Implementation Context
## Pokemon TCG Game Engine — Pipeline Hooks for Passive Effects

This document gives a new session everything it needs to implement SPEC_04B without prior
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

## 2. What Already Exists (SPEC_01 through SPEC_04)

All files are in `packages/@engine/lib/`. The package builds cleanly with **230 tests passing**.

### Current file inventory

```
lib/
├── types/
│   ├── card.ts          # PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition
│   ├── game.ts          # GameState, PlayerState, InPlayPokemon, TurnFlags
│   ├── action.ts        # PlayerAction (13 variants)
│   ├── event.ts         # GameEvent (25 variants)
│   ├── effect.ts        # TemporalEffect, EffectChoice, ChoiceResolver
│   └── index.ts         # barrel re-exports
├── core/
│   ├── game.ts          # createGame, checkWinConditions, handleKnockOut, promoteFromBench
│   ├── setup.ts         # Mulligan, initial hands, prizes, bench selection
│   ├── turn.ts          # startTurn, endTurn, getLegalActions, applyAction
│   ├── combat.ts        # resolveAttack, calculateDamage, checkKnockOuts
│   ├── checkup.ts       # performCheckup (poison, burn, sleep, paralyzed)
│   ├── energy.ts        # canPayEnergyCost, canPayRetreatCost
│   ├── evolution.ts     # canEvolve, evolvePokemon
│   ├── conditions.ts    # applySpecialCondition, removeSpecialCondition, clearSpecialConditions
│   ├── result.ts        # GameResult<T>, ok(), err()
│   └── validation.ts    # validateDeck
├── effects/
│   ├── registry.ts      # typed registries (attack/ability/trainer), resolveEffect facade
│   ├── primitives.ts    # ~35 pure state transforms (draw, discard, search, heal, flip, etc.)
│   ├── attacks.ts       # ~30 generic attack pattern handlers
│   ├── trainers.ts      # 14 core trainer handlers (Nest Ball, Ultra Ball, etc.)
│   ├── items.ts         # ~80 Item handlers (all GHI Standard Items)
│   ├── supporters.ts    # ~95 Supporter handlers (all GHI Standard Supporters)
│   ├── stadiums.ts      # 35 Stadium handlers (~10 active, ~25 NO-OPS needing hooks)
│   └── tools.ts         # 53 Tool registrations (ALL NO-OPS needing hooks)
├── adapter.ts           # SQLite card row → engine CardDefinition
├── rng.ts               # Seeded PRNG (coinFlip, shuffle, randomInt)
└── index.ts             # Public API surface + side-effect imports
```

### Key types you will work with

```typescript
// types/game.ts
interface InPlayPokemon {
  readonly instanceId: string;
  readonly evolutionStack: ReadonlyArray<string>;
  readonly attachedEnergy: ReadonlyArray<string>;
  readonly attachedTools: ReadonlyArray<string>;   // ← tool instance IDs
  readonly damageCounters: number;
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;
  readonly turnEvolved: number | null;
  readonly isNewThisTurn: boolean;
}

interface GameState {
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  readonly stadium: StadiumState | null;           // ← current stadium in play
  readonly cardRegistry: ReadonlyMap<string, CardInstance>;
  readonly definitionRegistry: ReadonlyMap<string, CardDefinition>;
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;
  readonly turnFlags: TurnFlags;
  // ... other fields
}

interface StadiumState {
  readonly cardInstanceId: string;
  readonly playedBy: PlayerId;
}
```

```typescript
// types/card.ts
type PokemonSubtype = 'ex' | 'MegaEvolutionEx' | 'Tera' | 'Ancient' | 'Future';

interface PokemonCardDefinition {
  readonly cardType: 'Pokemon';
  readonly name: string;
  readonly stage: PokemonStage;        // 'Basic' | 'Stage1' | 'Stage2'
  readonly subtypes: ReadonlyArray<PokemonSubtype>;
  readonly hp: number;
  readonly types: ReadonlyArray<EnergyType>;
  readonly attacks: ReadonlyArray<AttackDefinition>;
  readonly abilities: ReadonlyArray<AbilityDefinition>;
  readonly weaknesses: ReadonlyArray<WeaknessDefinition>;
  readonly resistances: ReadonlyArray<ResistanceDefinition>;
  readonly retreatCost: number;
  readonly prizeValue: 1 | 2 | 3;
  // ...
}
```

```typescript
// types/effect.ts
type TemporalEffectType =
  | 'damage_modifier' | 'damage_reduction' | 'damage_prevention'
  | 'attack_prevention' | 'ability_lock' | 'retreat_prevention'
  | 'attack_lock' | 'prize_modifier';

interface TemporalEffect {
  readonly id: string;
  readonly type: TemporalEffectType;
  readonly sourceInstanceId: string;
  readonly sourceType: 'attack' | 'ability' | 'trainer' | 'stadium';
  readonly targetInstanceId: string | null;  // null = global effect
  readonly expiresOnTurn: number | null;
  readonly expiresAt: EffectExpiry | null;   // 'end_of_turn' | 'end_of_opponent_turn' | ...
  readonly payload: Readonly<Record<string, unknown>>;
}
```

### Primitives available (lib/effects/primitives.ts)

Key functions you will use or call from modifiers:
- `getTopDef(state, pokemon)` → `PokemonCardDefinition | null`
- `hasRuleBox(def)` → `boolean` (checks 'ex' | 'MegaEvolutionEx')
- `healDamage(state, player, targetId, amount)` → `GameState`
- `drawCards(state, player, count)` → `GameState`
- `applyCondition(state, player, targetId, condition)` → `GameState`
- `discardEnergy(state, player, pokemonId, count, type?)` → `GameState`
- `moveEnergy(state, player, fromId, toId, energyId)` → `GameState`
- `flipCoin(state, reason)` → `{ result, newState }`

### How card definitions are accessed

```typescript
// Get a card's definition from an instance ID
const instance = state.cardRegistry.get(instanceId);
const def = state.definitionRegistry.get(instance.definitionId);

// Get the definition of a Stadium in play
function getStadiumDef(state: GameState): TrainerCardDefinition | null {
  if (!state.stadium) return null;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' ? def : null;
}

// Get the top definition of an InPlayPokemon
function getTopDef(state: GameState, pokemon: InPlayPokemon): PokemonCardDefinition | null {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const inst = state.cardRegistry.get(topId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

// Get tool definitions from attached tools
function getToolDefs(state: GameState, pokemon: InPlayPokemon): TrainerCardDefinition[] {
  return pokemon.attachedTools
    .map(toolId => {
      const inst = state.cardRegistry.get(toolId);
      if (!inst) return null;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' ? def : null;
    })
    .filter((d): d is TrainerCardDefinition => d !== null);
}
```

---

## 3. The Problem This Spec Solves

~70 registered handlers in `stadiums.ts` and `tools.ts` are **no-ops** because they represent
passive/triggered effects that need pipeline hooks. There is currently no mechanism for:

1. **Tool damage modifiers** — Choice Belt (+30 vs V), Vitality Band (+10), etc.
2. **Tool damage reduction** — Defiance Vest (-40 when behind), Rock Chestplate (-30 Fighting), etc.
3. **Berry type-reduction** — Babiri Berry (-60 from Metal, discard self), etc.
4. **Retreat cost modifiers** — Air Balloon (-2), Beach Court (-1 for Basic), etc.
5. **HP modifiers** — Hero's Cape (+100), Bravery Charm (+50 Basic), etc.
6. **Attack cost modifiers** — Counter Gain (-1C when behind), Sparkling Crystal (Tera -1), etc.
7. **On-damage triggers** — Rocky Helmet (2 counters on attacker), Lucky Helmet (draw 2), etc.
8. **On-KO triggers** — Exp. Share (move Energy), Survival Brace (prevent KO), etc.
9. **Prize modifiers** — Lillie's Pearl (-1 prize), Luxurious Cape (+1 prize), etc.
10. **Checkup modifiers** — Perilous Jungle (+2 poison), Festival Grounds (condition immunity), etc.
11. **Weakness removal** — Protective Goggles (Basic has no Weakness)

---

## 4. Architecture: Centralized Modifier Query System

**ALL passive modifier logic lives in a single new file: `lib/core/modifiers.ts`.**

The tool/stadium handlers in `tools.ts` and `stadiums.ts` do NOT contain the modifier logic.
Instead, `modifiers.ts` queries the game state (attached tools, active stadium, temporal effects)
and returns typed modifier results. The pipeline integration points (`calculateDamage`,
`canPayRetreatCost`, `getPokemonHp`, etc.) call into `modifiers.ts`.

This design means:
- Tool handlers remain no-ops (their "effect" is being attached, not being played)
- Stadium passive handlers remain no-ops (their "effect" is being in play)
- All modifier logic is testable in one place
- Jamming Tower suppression is checked once per query

### Jamming Tower Suppression

When Jamming Tower is the active Stadium, **all Pokemon Tool effects are suppressed**. Every
modifier query function checks this first:

```typescript
function isJammingTowerActive(state: GameState): boolean {
  const def = getStadiumDef(state);
  return def?.name === 'Jamming Tower';
}
```

If true, skip all tool-based modifier queries.

---

## 5. Complete Tool Modifier Reference

### Damage Output Modifiers (getDamageOutputModifiers)

These add flat damage BEFORE weakness/resistance, from the ATTACKER's perspective:

| Tool | Bonus | Condition |
|------|-------|-----------|
| Vitality Band | +10 | Always (to opponent's Active) |
| Defiance Band | +30 | If you have more prizes remaining |
| Brave Bangle | +30 | Attached Pokemon has no Rule Box, target is ex |
| Choice Belt | +30 | Target is V (not in GHI, but card exists) |
| Maximum Belt (ACE SPEC) | +50 | Target is ex |
| Light Ball | +50 | Attached to Pikachu ex, target is ex |
| Binding Mochi | +40 | Attached Pokemon is Poisoned |
| Hop's Choice Band | +30 | Attached to Hop's Pokemon |
| Future Booster Energy Capsule | +20 | Attached to Future Pokemon |

### Damage Input Modifiers (getDamageInputModifiers)

These reduce damage AFTER weakness/resistance, from the DEFENDER's perspective:

| Tool | Reduction | Condition |
|------|-----------|-----------|
| Defiance Vest | -40 | If you have more prizes remaining |
| Rigid Band | -30 | Attached to Stage 1 |
| Rock Chestplate | -30 | Attached to Fighting Pokemon |
| Sacred Charm | -30 | Attacker has Abilities |
| Thick Scale | -50 | Attached to Dragon, attacker is Grass/Fire/Water/Lightning |
| Babiri Berry | -60 | Attacker is Metal type (DISCARD tool after) |
| Colbur Berry | -60 | Attacker is Darkness type (DISCARD tool after) |
| Haban Berry | -60 | Attacker is Dragon type (DISCARD tool after) |
| Occa Berry | -60 | Attacker is Fire type (DISCARD tool after) |
| Passho Berry | -60 | Attacker is Water type (DISCARD tool after) |
| Payapa Berry | -60 | Attacker is Psychic type (DISCARD tool after) |

### Retreat Cost Modifiers (getRetreatCostModifiers)

| Tool | Effect | Condition |
|------|--------|-----------|
| Air Balloon | -2 | Always |
| Big Air Balloon | Free | Stage 2 only |
| Rescue Board | -1 (free if remaining HP <= 30) | Always |
| Gravity Gemstone | +1 for BOTH Actives | While in Active Spot |
| Future Booster Energy Capsule | Free | Future Pokemon |
| Hop's Choice Band | -1 | Hop's Pokemon |

### Attack Cost Modifiers (getAttackCostModifiers)

| Tool | Effect | Condition |
|------|--------|-----------|
| Counter Gain | -1 Colorless | If more prizes remaining |
| Sparkling Crystal (ACE SPEC) | -1 any type | Tera Pokemon |
| Hop's Choice Band | -1 Colorless | Hop's Pokemon |

### HP Modifiers (getHpModifiers)

| Tool | Effect | Condition |
|------|--------|-----------|
| Hero's Cape (ACE SPEC) | +100 HP | Always |
| Bravery Charm | +50 HP | Basic only |
| Cynthia's Power Weight | +70 HP | Cynthia's Pokemon |
| Luxurious Cape | +100 HP | Non-Rule-Box only |
| Ancient Booster Energy Capsule | +60 HP | Ancient only |

### Weakness Removal (in getDamageInputModifiers)

| Tool | Effect | Condition |
|------|--------|-----------|
| Protective Goggles | No Weakness | Basic only |

### On-Damage Triggers (resolveOnDamageTriggers)

Only fire if the damaged Pokemon is in the **Active Spot**:

| Tool | Effect | Condition |
|------|--------|-----------|
| Rocky Helmet | 2 damage counters on attacker | Always |
| Punk Helmet | 4 damage counters on attacker | Darkness Pokemon only |
| Deluxe Bomb (ACE SPEC) | 12 damage counters on attacker, discard tool | Always |
| Lucky Helmet | Owner draws 2 cards | Always |
| Handheld Fan | Move 1 Energy from attacker to opponent's Bench | Always |
| Team Rocket's Hypnotizer | Attacker is now Asleep | Team Rocket's Pokemon only |

### On-KO Triggers (resolveOnKOTriggers)

| Tool | Effect | Condition |
|------|--------|-----------|
| Exp. Share | Move 1 Basic Energy from KO'd Active to this Pokemon | Attached to Benched Pokemon |
| Amulet of Hope (ACE SPEC) | Owner searches deck for 3 cards | Always |
| Cursed Duster | Discard random card from opponent's hand | Always |
| Heavy Baton | Move up to 3 Basic Energy to Bench | Retreat cost of KO'd Pokemon >= 4 |
| Vengeful Punch | 4 damage counters on attacker | Always |

### Pre-KO Survival (checkSurvivalEffects — checked BEFORE KO finalized)

| Tool | Effect | Condition |
|------|--------|-----------|
| Survival Brace (ACE SPEC) | Prevent KO, set remaining HP to 10, discard tool | Must be at full HP before damage |

### Prize Modifiers (modifyPrizeCount)

| Tool | Effect | Condition |
|------|--------|-----------|
| Lillie's Pearl | -1 prize | Lillie's Pokemon only |
| Luxurious Cape | +1 prize | Non-Rule-Box only |

---

## 6. Complete Stadium Modifier Reference

### Damage Modifiers

| Stadium | Effect | Condition |
|---------|--------|-----------|
| Full Metal Lab | -30 damage taken | Metal Pokemon |
| Granite Cave | -30 damage taken | Steven's Pokemon |
| Practice Studio | +10 damage dealt | Stage 1 Pokemon |
| Postwick | +30 damage dealt | Hop's Pokemon |

### Retreat Cost Modifiers

| Stadium | Effect | Condition |
|---------|--------|-----------|
| Beach Court | -1 | Basic Pokemon |
| Calamitous Wasteland | +1 | Non-Fighting Basic Pokemon |
| N's Castle | Free retreat | N's Pokemon |
| Paradise Resort | -1 | Psyduck only |

### HP Modifiers

| Stadium | Effect | Condition |
|---------|--------|-----------|
| Lively Stadium | +30 HP | Basic Pokemon |
| Gravity Mountain | -30 HP | Stage 2 Pokemon |

### Attack Cost Modifiers

| Stadium | Effect | Condition |
|---------|--------|-----------|
| Pokemon League Headquarters | +1 Colorless | Basic Pokemon |
| Nighttime Mine | +1 Colorless | Tera Pokemon |

### Checkup Modifiers

| Stadium | Effect | Condition |
|---------|--------|-----------|
| Perilous Jungle | +2 poison counters | Non-Darkness Pokemon |
| Festival Grounds | Immune to Special Conditions | Pokemon with Energy attached |
| Dizzying Valley | Confused Pokemon don't recover on evolve | All Confused Pokemon |

### Other Passive Effects (need specific hooks)

| Stadium | Effect | Integration Point |
|---------|--------|-------------------|
| Jamming Tower | All tools have no effect | Checked at top of every modifier query |
| Battle Cage | Prevent damage counters on Bench from attacks/abilities | Bench damage path |
| Team Rocket's Watchtower | Colorless Pokemon have no Abilities | Ability resolution |
| Risky Ruins | 2 counters on non-Darkness Basic placed on Bench | putOnBench event |
| Calamitous Snowy Mountain | 2 counters on non-Water Basic when Energy attached | Energy attach event |
| Area Zero Underdepths | Up to 8 Bench if Tera in play | Bench size check |
| Forest of Vitality | Grass can evolve same turn | Evolution timing check |
| Neutralization Zone (ACE SPEC) | Non-Rule-Box immune to ex/V damage | Damage pipeline |

---

## 7. Integration Points — Exactly Where to Hook

### 7a. calculateDamage (combat.ts:165)

Current flow:
```
baseDamage → selfEffectModifier (temporal) → weakness → resistance → targetEffectReduction (temporal) → floor 0
```

New flow (additions marked with ◀):
```
baseDamage
  + attackModifier
  + selfEffectModifier (temporal)
  + toolAndStadiumOutputBonus     ◀ getDamageOutputModifiers(attacker context)
  → 0-check
  → weakness (skip if removeWeakness) ◀ getDamageInputModifiers(defender context).removeWeakness
  - resistance
  - targetEffectReduction (temporal)
  - toolAndStadiumInputReduction  ◀ getDamageInputModifiers(defender context).flatReduction
  → floor 0
```

Update DamageCalculation type to add:
- `toolAndStadiumOutputBonus: number`
- `toolAndStadiumInputReduction: number`
- `weaknessRemoved: boolean`

### 7b. resolveAttack (combat.ts:344)

After dealDamage, before checkKnockOuts:
```typescript
// After dealing damage to defender:
if (calc.finalDamage > 0) {
  s = dealDamage(s, defenderPokemon.instanceId, calc, attack.name);
  s = resolveOnDamageTriggers(s, defenderPokemon.instanceId, attackerPokemon.instanceId, calc.finalDamage);
}
```

Also handle berry discard (returned from getDamageInputModifiers).

### 7c. handleKnockOut (game.ts)

Before finalizing KO:
1. Check `checkSurvivalEffects` (Survival Brace) — if survived, return early
2. Check `modifyPrizeCount` — adjust prize award
3. After awarding prizes, call `resolveOnKOTriggers`

### 7d. canPayRetreatCost (energy.ts) + turn.ts retreat handler

Replace direct `pokemonDef.retreatCost` with `getEffectiveRetreatCost(state, player, pokemon, def)`.
The retreat handler in turn.ts (line ~989) also reads retreatCost — both must use the modifier.

### 7e. getPokemonHp (combat.ts:42, checkup.ts:32)

Both files have a local `getPokemonHp`. Consolidate into a single exported `getEffectiveHp`
in modifiers.ts that includes HP modifier tools/stadiums.

### 7f. canPayEnergyCost check in getLegalActions (turn.ts)

When checking if an attack is affordable, use `getEffectiveAttackCost` instead of raw `attack.cost`.

### 7g. performCheckup (checkup.ts:40)

Before poison damage: check Festival Grounds immunity (skip poison if Energy attached).
During poison damage: add Perilous Jungle extra counters for non-Darkness.

---

## 8. Implementation Order

**Phase 1: Create modifiers.ts with all query functions**
- `getStadiumDef`, `isJammingTowerActive`
- `getDamageOutputModifiers`, `getDamageInputModifiers`
- `getRetreatCostModifiers`, `getAttackCostModifiers`
- `getHpModifiers`, `getEffectiveHp`
- `getEffectiveRetreatCost`, `getEffectiveAttackCost`
- `getPoisonModifiers`, `checkConditionImmunity`
- `resolveOnDamageTriggers`, `resolveOnKOTriggers`
- `checkSurvivalEffects`, `modifyPrizeCount`
- Tests for each function

**Phase 2: Wire damage pipeline**
- Update `calculateDamage` in combat.ts
- Update `resolveAttack` to call `resolveOnDamageTriggers` after damage
- Handle berry discard
- Tests with tool-equipped Pokemon

**Phase 3: Wire retreat cost + attack cost**
- Create `getEffectiveRetreatCost` calls in turn.ts and energy.ts
- Create `getEffectiveAttackCost` calls in getLegalActions
- Tests for Air Balloon, Beach Court, Counter Gain, etc.

**Phase 4: Wire HP + KO**
- Replace all `getPokemonHp` calls with `getEffectiveHp`
- Wire `checkSurvivalEffects` into handleKnockOut
- Wire `modifyPrizeCount` into handleKnockOut
- Wire `resolveOnKOTriggers` into handleKnockOut
- Tests for Hero's Cape, Survival Brace, Exp. Share, etc.

**Phase 5: Wire checkup + remaining stadium passives**
- Poison modifiers in performCheckup
- Festival Grounds condition immunity
- Tests

**Phase 6: Clean up no-ops**
- Update comments in tools.ts and stadiums.ts to indicate "modifier-only" vs "no-op (needs hook)"
- Verify all tools/stadiums from sections 5-6 are covered

---

## 9. Pitfalls & Edge Cases

### Berry discard timing
Berry tools (-60 from type) must be discarded AFTER applying the reduction. The modifier
query should return a `toolsToDiscard: string[]` alongside the flat reduction. The caller
(calculateDamage integration) must then discard those tools from the Pokemon.

### Survival Brace must check BEFORE KO
Survival Brace says "if full HP before damage." This means we need to know the Pokemon's HP
before the damage was dealt. The `handleKnockOut` function is called after damage is already
on the Pokemon. Solution: check `pokemon.damageCounters === countersFromThisHit` (i.e., all
damage counters came from this single hit, meaning it was at full HP before).

Actually, the cleaner approach: in `resolveAttack`, after calculating damage but BEFORE placing
damage counters, check if the damage would KO a full-HP Pokemon with Survival Brace. If so,
set damage to (maxHP - 10) instead.

### getEffectiveHp must be used everywhere
There are multiple places that compute HP:
- `combat.ts:42` (getPokemonHp — local)
- `combat.ts:50` (isKnockedOut)
- `checkup.ts:32` (getPokemonHp — local)
- `checkup.ts:106` (KO check inline)

All must be updated to use the centralized `getEffectiveHp` from modifiers.ts.

### Named Pokemon ownership detection
Many tools/stadiums apply only to named Pokemon (Hop's, N's, Cynthia's, etc.).
Detection: `def.name.startsWith("Hop's ")`, `def.name.startsWith("N's ")`, etc.

### Gravity Gemstone affects BOTH Actives
Unlike other retreat cost tools, Gravity Gemstone adds +1 to both the owner's Active AND the
opponent's Active. When querying retreat cost for a Pokemon, also check opponent's Active tools.

### Luxurious Cape dual effect
Luxurious Cape gives +100 HP (HP modifier) AND +1 prize on KO (prize modifier). Both must be
registered in their respective query functions.

### Stadium passives that need event hooks (defer if needed)
Some stadiums trigger on events (Risky Ruins on bench placement, Calamitous Snowy Mountain on
energy attach). These need event listener hooks that don't exist yet. If implementing these
is too complex, register them with a comment noting they need an event system. Prioritize
the modifier-based passives first.

### DamageCalculation backward compatibility
The `DamageCalculation` interface is exported and used in tests. Adding new fields is
non-breaking (tests that destructure will still work), but update the interface and ensure
all callers of `calculateDamage` handle the new fields.

---

## 10. Test Strategy

Create `packages/@engine/__tests__/core/modifiers.test.ts`.

For each modifier query function, test:
1. Tool modifier applies when conditions are met
2. Tool modifier does NOT apply when conditions aren't met (wrong stage, wrong type, etc.)
3. Jamming Tower suppresses the tool modifier
4. Stadium modifier applies/doesn't apply
5. Multiple modifiers stack correctly

For pipeline integration tests, create scenarios with actual GameState objects containing
tool-equipped Pokemon and verify end-to-end damage calculation, retreat cost, HP, etc.

Use the existing test helpers pattern from `__tests__/core/combat.test.ts` for building
test game states.
