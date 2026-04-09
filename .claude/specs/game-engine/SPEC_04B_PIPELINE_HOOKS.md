# SPEC_04B: Pipeline Hooks for Passive Effects (Stadiums, Tools, Abilities)

## Context

SPEC_04 established the effect registry and implemented all 288 GHI Standard-legal trainer handlers. However, ~70 of those handlers are registered as no-ops because they represent **passive/triggered effects** — modifiers that apply continuously or fire on specific game events rather than resolving once when played.

These fall into two categories:
1. **Stadiums** with passive rules (e.g., Full Metal Lab: "Metal Pokemon take 30 less damage")
2. **Pokemon Tools** with modifier/trigger effects (e.g., Choice Belt: "+30 damage to opponent's Active V")

Both require **hooks** — points in the game pipeline where the engine checks for active modifiers and applies them. Currently the pipeline has no such hooks.

---

## Prerequisites

- SPEC_01 (Core Types)
- SPEC_02 (Game Flow)
- SPEC_03 (Combat) — `calculateDamage`, `resolveAttack`, `checkKnockOuts`
- SPEC_04 (Card Effects) — registry, all handlers registered

---

## Current Pipeline State

```
┌──────────────────────────────────────────────────────────┐
│  resolveAttack (combat.ts:344)                           │
│                                                          │
│  A. attack_prevention temporal check                     │
│  B. confusion check                                      │
│  C-E. (reserved for attack choices)                      │
│  F. calculateDamage ◀── NO TOOL/STADIUM HOOKS            │
│     ├── baseDamage                                       │
│     ├── attackModifier (unused)                          │
│     ├── selfEffectModifier (temporal only)               │
│     ├── weakness                                         │
│     ├── resistance                                       │
│     └── targetEffectReduction (temporal only)            │
│  G. dealDamage                                           │
│  H. resolveEffect (attack side-effects)                  │
│  I. checkKnockOuts ◀── NO ON-KO HOOKS                   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  canPayRetreatCost (energy.ts:34)                        │
│                                                          │
│  retreatCost from card def ◀── NO RETREAT COST MODIFIERS │
│  check: attachedEnergy.length >= retreatCost             │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  getPokemonHp (combat.ts:42, checkup.ts:32)              │
│                                                          │
│  hp from card def ◀── NO HP MODIFIERS                    │
│  isKnockedOut: damageCounters * 10 >= hp                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  performCheckup (checkup.ts:40)                          │
│                                                          │
│  Poison → 1 counter ◀── NO STADIUM POISON MODIFIER      │
│  Burn → 2 counters + coin                                │
│  Sleep → coin                                            │
│  Paralyzed → remove if active player                     │
│  KO check                                                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  handleKnockOut (game.ts)                                │
│                                                          │
│  Prize award (1/2/3) ◀── NO PRIZE MODIFIERS              │
│  Move to discard                                         │
│  promoteFromBench                                        │
└──────────────────────────────────────────────────────────┘
```

---

## Requirements

### 1. Modifier Query System

A central function that collects all active modifiers from Stadiums, Tools, and TemporalEffects for a given game moment. This avoids scattering modifier logic across every pipeline touchpoint.

```typescript
// lib/core/modifiers.ts

type ModifierMoment =
  | 'damage_dealt'        // when calculating damage output (attacker's perspective)
  | 'damage_taken'        // when calculating damage received (defender's perspective)
  | 'retreat_cost'        // when computing retreat cost
  | 'attack_cost'         // when checking energy cost for attacks
  | 'hp'                  // when computing effective HP
  | 'weakness'            // when checking weakness
  | 'poison_damage'       // during checkup, poison counter count
  | 'on_damage_received'  // trigger after damage dealt to Active
  | 'on_knocked_out'      // trigger after KO
  | 'prize_count';        // when awarding prizes

interface ModifierContext {
  readonly state: GameState;
  readonly pokemon: InPlayPokemon;
  readonly pokemonDef: PokemonCardDefinition;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  // For damage moments:
  readonly attackerDef?: PokemonCardDefinition;
  readonly defenderDef?: PokemonCardDefinition;
  readonly attack?: AttackDefinition;
}

interface DamageModifierResult {
  readonly flatBonus: number;       // additive before W/R
  readonly flatReduction: number;   // subtractive after W/R
  readonly removeWeakness: boolean; // e.g., Protective Goggles on Basic
}

interface RetreatCostModifierResult {
  readonly flatReduction: number;   // e.g., Air Balloon: -2
  readonly setToZero: boolean;      // e.g., Big Air Balloon on Stage 2
}

interface HpModifierResult {
  readonly flatBonus: number;       // e.g., Hero's Cape: +100
}

// Main query functions
function getDamageOutputModifiers(ctx: ModifierContext): DamageModifierResult;
function getDamageInputModifiers(ctx: ModifierContext): DamageModifierResult;
function getRetreatCostModifiers(ctx: ModifierContext): RetreatCostModifierResult;
function getAttackCostModifiers(ctx: ModifierContext): { readonly colorlessReduction: number };
function getHpModifiers(ctx: ModifierContext): HpModifierResult;
```

Each query function iterates over:
1. The Pokemon's attached tools (via `pokemon.attachedTools`)
2. The active stadium (via `state.stadium`)
3. Active temporal effects (via `state.temporalEffects`)
4. Checks `Jamming Tower` stadium — if active, ALL tool effects are suppressed

### 2. Damage Pipeline Hooks

Integrate modifier queries into `calculateDamage`:

```
┌──────────────────────────────────────────────────────────────┐
│  calculateDamage (revised)                                   │
│                                                              │
│  1. baseDamage (from attack.damage)                          │
│  2. + attackModifier (from attack effect, e.g., "x" attacks) │
│  3. + selfEffectModifier (temporal effects on attacker)      │
│  4. + toolDamageBonus ◀── NEW: getDamageOutputModifiers      │
│     ├── Vitality Band (+10 to Active)                        │
│     ├── Choice Belt (+30 to Active V)                        │
│     ├── Maximum Belt (+50 to Active ex)                      │
│     ├── Defiance Band (if more prizes, +30)                  │
│     ├── Brave Bangle (no Rule Box: +30 to ex)                │
│     ├── Light Ball (Pikachu ex: +50 to ex)                   │
│     ├── Binding Mochi (if Poisoned, +40)                     │
│     ├── Hop's Choice Band (Hop's Pokemon: +30)               │
│     ├── Future Booster Energy Capsule (Future: +20)          │
│     └── Stadium: Practice Studio (Stage 1: +10)              │
│  5. 0-check → skip W/R if <= 0                               │
│  6. weakness (x2 / +N)                                       │
│     └── removeWeakness? ◀── Protective Goggles (Basic)       │
│  7. - resistance                                             │
│  8. - targetEffectReduction (temporal)                        │
│  9. - toolDamageReduction ◀── NEW: getDamageInputModifiers   │
│     ├── Defiance Vest (if more prizes, -40)                  │
│     ├── Rigid Band (Stage 1: -30)                            │
│     ├── Rock Chestplate (Fighting: -30)                      │
│     ├── Sacred Charm (-30 from Pokemon with Abilities)        │
│     ├── Thick Scale (Dragon: -50 from Grass/Fire/Water/Ltn)  │
│     ├── Berry tools (-60 from specific type, discard after)  │
│     └── Stadium: Full Metal Lab (Metal: -30)                 │
│  10. floor at 0                                              │
└──────────────────────────────────────────────────────────────┘
```

**DamageCalculation type update:**

```typescript
export interface DamageCalculation {
  readonly baseDamage: number;
  readonly attackModifier: number;
  readonly selfEffectModifier: number;
  readonly toolAndStadiumOutputBonus: number;   // NEW
  readonly weaknessMultiplier: number;
  readonly weaknessFlat: number;
  readonly weaknessRemoved: boolean;            // NEW
  readonly resistanceReduction: number;
  readonly targetEffectReduction: number;
  readonly toolAndStadiumInputReduction: number; // NEW
  readonly finalDamage: number;
}
```

### 3. On-Damage Trigger Hooks

After damage is dealt to the Active Pokemon (but before KO check), fire on-damage triggers:

```
  dealDamage(...)
       │
       ▼
  resolveOnDamageTriggers ◀── NEW
  ├── Rocky Helmet: 2 counters on attacker
  ├── Punk Helmet: 4 counters on attacker (if Darkness)
  ├── Deluxe Bomb: 12 counters on attacker (ACE SPEC, discard tool)
  ├── Lucky Helmet: draw 2 cards
  ├── Handheld Fan: move Energy from attacker to opponent's Bench
  ├── Team Rocket's Hypnotizer: attacker Asleep (if Team Rocket's)
  └── (only fire if target is in Active Spot)
       │
       ▼
  checkKnockOuts(...)
```

```typescript
function resolveOnDamageTriggers(
  state: GameState,
  targetInstanceId: string,
  attackerInstanceId: string,
  damageDealt: number
): GameState;
```

**Berry discard:** Type-reduction berries (Babiri, Colbur, Haban, Occa, Passho, Payapa) must be discarded after triggering. This happens inside `getDamageInputModifiers` — the function returns a list of tools to discard, and the caller removes them.

### 4. On-KO Trigger Hooks

After a Pokemon is Knocked Out (in `handleKnockOut`), fire on-KO triggers:

```
  handleKnockOut(...)
       │
       ├── Award prizes
       │       └── modifyPrizeCount ◀── NEW
       │           ├── Lillie's Pearl: -1 prize (Lillie's Pokemon)
       │           ├── Luxurious Cape: +1 prize (non-Rule-Box)
       │           └── Briar temporal: +1 prize (if Tera KO'd Active)
       │
       ├── resolveOnKOTriggers ◀── NEW
       │   ├── Exp. Share: move Basic Energy to this Pokemon
       │   ├── Amulet of Hope: search deck for 3 cards (ACE SPEC)
       │   ├── Cursed Duster: discard random from opponent's hand
       │   ├── Heavy Baton: move up to 3 Energy to Bench (if retreat cost 4+)
       │   ├── Survival Brace: prevent KO, set HP to 10 (if full HP, ACE SPEC)
       │   └── Vengeful Punch: 4 counters on attacker
       │
       ├── Move to discard
       └── promoteFromBench
```

**Survival Brace** is special — it must be checked BEFORE the KO is finalized. It should be a pre-KO check:

```typescript
function checkSurvivalEffects(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition
): { survived: boolean; newState: GameState };
```

### 5. Retreat Cost Modifier Hooks

Integrate into the retreat flow in `turn.ts` and `energy.ts`:

```typescript
// energy.ts — revised
function getEffectiveRetreatCost(
  state: GameState,
  player: PlayerId,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition
): number {
  const baseCost = pokemonDef.retreatCost;
  const mods = getRetreatCostModifiers({ state, pokemon, pokemonDef, player, opponent: otherPlayer(player) });

  if (mods.setToZero) return 0;
  return Math.max(0, baseCost - mods.flatReduction);
}
```

**Sources:**
| Card | Effect | Condition |
|------|--------|-----------|
| Air Balloon | -2 | Always |
| Big Air Balloon | Free retreat | Stage 2 only |
| Rescue Board | -1 (free if HP <= 30 remaining) | Always |
| Counter Gain | (attack cost, not retreat) | — |
| Gravity Gemstone | +1 for both Actives | While in Active Spot |
| N's Castle (Stadium) | Free retreat | N's Pokemon only |
| Beach Court (Stadium) | -1 | Basic Pokemon only |
| Calamitous Wasteland (Stadium) | +1 | Non-Fighting Basic only |
| Paradise Resort (Stadium) | -1 | Psyduck only |
| Future Booster Energy Capsule | Free retreat | Future Pokemon only |
| Hop's Choice Band | -1 Colorless | Hop's Pokemon only |

### 6. HP Modifier Hooks

Integrate into `getPokemonHp` (used in `isKnockedOut`, `checkup`, `combat`):

```typescript
function getEffectiveHp(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  player: PlayerId
): number {
  const baseHp = pokemonDef.hp;
  const mods = getHpModifiers({ state, pokemon, pokemonDef, player, opponent: otherPlayer(player) });
  return baseHp + mods.flatBonus;
}
```

**Sources:**
| Card | Effect | Condition |
|------|--------|-----------|
| Hero's Cape (ACE SPEC) | +100 HP | Always |
| Bravery Charm | +50 HP | Basic only |
| Cynthia's Power Weight | +70 HP | Cynthia's Pokemon only |
| Luxurious Cape | +100 HP | Non-Rule-Box only |
| Ancient Booster Energy Capsule | +60 HP | Ancient only |
| Lively Stadium | +30 HP | Basic only |
| Gravity Mountain (Stadium) | -30 HP | Stage 2 only |

### 7. Attack Cost Modifier Hooks

Integrate into `canPayEnergyCost` check in `getLegalActions`:

```typescript
function getEffectiveAttackCost(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  attack: AttackDefinition,
  player: PlayerId
): ReadonlyArray<EnergyType> {
  const baseCost = [...attack.cost];
  const mods = getAttackCostModifiers({ state, pokemon, pokemonDef, player, opponent: otherPlayer(player) });

  // Remove Colorless costs first
  let toRemove = mods.colorlessReduction;
  for (let i = baseCost.length - 1; i >= 0 && toRemove > 0; i--) {
    if (baseCost[i] === 'Colorless') {
      baseCost.splice(i, 1);
      toRemove--;
    }
  }
  // If Colorless not available, remove typed costs
  for (let i = baseCost.length - 1; i >= 0 && toRemove > 0; i--) {
    baseCost.splice(i, 1);
    toRemove--;
  }
  return baseCost;
}
```

**Sources:**
| Card | Effect | Condition |
|------|--------|-----------|
| Counter Gain | -1 Colorless | If more prizes remaining |
| Sparkling Crystal (ACE SPEC) | -1 (any type) | Tera Pokemon only |
| Hop's Choice Band | -1 Colorless | Hop's Pokemon only |
| Pokemon League HQ (Stadium) | +1 Colorless | Basic Pokemon |
| Nighttime Mine (Stadium) | +1 Colorless | Tera Pokemon |

### 8. Checkup Modifier Hooks

Integrate into `performCheckup`:

```typescript
// In poison damage calculation:
const basePoisonCounters = 1;
const extraCounters = getPoisonModifiers(state, playerId);
// Perilous Jungle: +2 counters for non-Darkness Pokemon
const totalCounters = basePoisonCounters + extraCounters;
```

**Sources:**
| Card | Effect | Condition |
|------|--------|-----------|
| Perilous Jungle (Stadium) | +2 poison counters | Non-Darkness only |
| Festival Grounds (Stadium) | Immune to conditions if Energy attached | Check before applying |

### 9. Weakness Modifier Hook

Integrate into `resolveWeakness`:

```typescript
// Before applying weakness:
if (getDamageInputModifiers(ctx).removeWeakness) {
  return { multiplier: 1, flat: 0 }; // no weakness
}
```

**Source:** Protective Goggles — Basic Pokemon has no Weakness.

### 10. Jamming Tower Suppression

When Jamming Tower is the active Stadium, ALL Pokemon Tool effects are suppressed. The modifier query functions must check:

```typescript
function isJammingTowerActive(state: GameState): boolean {
  if (!state.stadium) return false;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return false;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' && def.name === 'Jamming Tower';
}
```

If `isJammingTowerActive(state)` returns true, skip all tool modifier queries.

---

## File Structure

```
packages/@engine/lib/
├── core/
│   ├── modifiers.ts       ◀── NEW: all modifier query functions
│   ├── combat.ts          ◀── MODIFY: integrate damage modifiers
│   ├── energy.ts          ◀── MODIFY: retreat cost + attack cost modifiers
│   ├── checkup.ts         ◀── MODIFY: poison modifiers, condition immunity
│   ├── game.ts            ◀── MODIFY: KO hooks, prize modifiers
│   └── turn.ts            ◀── MODIFY: use getEffectiveRetreatCost
├── effects/
│   ├── stadiums.ts        ◀── MODIFY: replace no-ops with real logic
│   └── tools.ts           ◀── MODIFY: replace no-ops with real logic
└── __tests__/
    └── core/
        └── modifiers.test.ts  ◀── NEW: modifier query tests
```

---

## Implementation Phases

### Phase 1: Modifier Query System (modifiers.ts)

Create `lib/core/modifiers.ts` with all query functions. Each function:
1. Checks if Jamming Tower is active (suppresses tools)
2. Iterates attached tools on the relevant Pokemon
3. Checks the active stadium
4. Returns a typed result struct

**Exit criteria:**
- [ ] `modifiers.ts` exports all query functions
- [ ] Jamming Tower suppression tested
- [ ] Each tool/stadium modifier has a unit test

### Phase 2: Damage Pipeline Integration

Wire `getDamageOutputModifiers` and `getDamageInputModifiers` into `calculateDamage`. Wire `resolveOnDamageTriggers` after `dealDamage`.

**Exit criteria:**
- [ ] Choice Belt adds +30 when attacking a V Pokemon
- [ ] Vitality Band adds +10 unconditionally
- [ ] Full Metal Lab reduces damage to Metal Pokemon by 30
- [ ] Berry tools reduce then self-discard
- [ ] Rocky Helmet places counters on attacker
- [ ] Lucky Helmet draws 2 when damaged

### Phase 3: Retreat Cost & Attack Cost Integration

Wire `getEffectiveRetreatCost` into `turn.ts` retreat handler. Wire `getEffectiveAttackCost` into `getLegalActions`.

**Exit criteria:**
- [ ] Air Balloon reduces retreat cost by 2
- [ ] Beach Court reduces Basic retreat cost by 1
- [ ] Counter Gain reduces attack cost when behind on prizes
- [ ] Pokemon League HQ increases Basic attack cost by 1

### Phase 4: HP & KO Integration

Wire `getEffectiveHp` into all HP checks. Wire prize modifiers and on-KO triggers into `handleKnockOut`.

**Exit criteria:**
- [ ] Hero's Cape adds +100 HP
- [ ] Bravery Charm adds +50 to Basic only
- [ ] Gravity Mountain subtracts 30 from Stage 2
- [ ] Survival Brace prevents KO at full HP
- [ ] Exp. Share moves Energy on KO
- [ ] Lillie's Pearl reduces prize count

### Phase 5: Checkup & Stadium Passive Integration

Wire poison modifiers, condition immunity, and remaining stadium passives.

**Exit criteria:**
- [ ] Perilous Jungle adds 2 extra poison counters on non-Darkness
- [ ] Festival Grounds prevents conditions on Pokemon with Energy
- [ ] Dizzying Valley prevents Confusion removal on evolve

### Phase 6: Update No-Op Handlers

Replace all no-op handlers in `stadiums.ts` and `tools.ts` with actual implementations that hook into the modifier system, or mark them as "modifier-only" (logic lives in modifiers.ts, handler is still no-op because the modifier query handles it).

**Exit criteria:**
- [ ] Zero no-op handlers remain for stadiums/tools that have been integrated
- [ ] All passive effects documented with their integration point

---

## Acceptance Criteria

- [ ] `bun run check-types` reports 0 errors
- [ ] `bun test` passes with 0 failures
- [ ] `getDamageOutputModifiers` correctly sums tool and stadium bonuses
- [ ] `getDamageInputModifiers` correctly sums tool and stadium reductions
- [ ] Berry tools are discarded after reducing damage
- [ ] On-damage triggers fire only for Active Spot Pokemon
- [ ] On-KO triggers fire in correct order (prize mod → triggers → discard → promote)
- [ ] Survival Brace pre-empts KO when at full HP
- [ ] `getEffectiveRetreatCost` accounts for all retreat cost modifiers
- [ ] `getEffectiveAttackCost` accounts for Counter Gain, Sparkling Crystal, etc.
- [ ] `getEffectiveHp` accounts for all HP modifier tools and stadiums
- [ ] Jamming Tower suppresses ALL tool effects when active
- [ ] Poison modifier (Perilous Jungle) increases poison damage for non-Darkness
- [ ] Festival Grounds condition immunity applies when Energy is attached
- [ ] No tool modifier logic is duplicated — all flows through `modifiers.ts`
- [ ] At least 40 modifier-based tools/stadiums have tests

---

## Dependencies

This spec **must complete** before SPEC_05 (AI Player). The AI needs accurate damage calculation, retreat cost, and HP values to make meaningful decisions.

---

## Verification

```bash
# Type check
cd packages/@engine && bun run check-types

# Run full test suite
bun test

# Verify no remaining no-op handlers (should be 0 for stadiums/tools with modifier integration)
grep -c "return state;" lib/effects/stadiums.ts lib/effects/tools.ts

# Count modifier tests
grep -c "test\|it(" __tests__/core/modifiers.test.ts
```
