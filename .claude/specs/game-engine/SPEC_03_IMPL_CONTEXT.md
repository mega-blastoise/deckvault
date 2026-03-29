# SPEC_03 Implementation Context
## Pokemon TCG Game Engine — Combat System

This document gives a new session everything it needs to implement SPEC_03 without prior
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

## 2. What SPEC_01 + SPEC_02 Already Delivered

All files are in `packages/@engine/lib/`. The package builds cleanly with 128 tests passing.

### Type files (`lib/types/`)

| File | Key exports |
|------|-------------|
| `card.ts` | `EnergyType`, `ENERGY_TYPES`, `PokemonCardDefinition`, `TrainerCardDefinition`, `EnergyCardDefinition`, `CardDefinition`, `PokemonStage`, `PokemonSubtype`, `TrainerSubtype`, `AttackDefinition`, `AbilityDefinition`, `WeaknessDefinition`, `ResistanceDefinition` |
| `game.ts` | `GameState`, `PlayerState`, `InPlayPokemon`, `SpecialCondition`, `PlayerId`, `CardInstance`, `GamePhase`, `StadiumState`, `TurnFlags` |
| `action.ts` | `PlayerAction` (discriminated union, 15 variants) |
| `event.ts` | `GameEvent` (discriminated union, 25 variants), `WinReason` |
| `effect.ts` | `TemporalEffect` (stub — SPEC_04 expands it) |

### Key types to know

```typescript
// AttackDefinition (lib/types/card.ts)
interface AttackDefinition {
  readonly name: string;
  readonly cost: ReadonlyArray<EnergyType>;
  readonly damage: number;                            // base damage (0 if no damage)
  readonly damageModifier: '+' | '-' | 'x' | null;   // null = fixed damage
  readonly text: string;                              // attack effect text
  readonly effectId: string | null;                   // null = no effect
}

// InPlayPokemon (lib/types/game.ts)
interface InPlayPokemon {
  readonly instanceId: string;
  readonly evolutionStack: ReadonlyArray<string>;     // bottom=Basic → top=current; top used for HP/type/etc.
  readonly attachedEnergy: ReadonlyArray<string>;
  readonly attachedTools: ReadonlyArray<string>;      // max 1
  readonly damageCounters: number;                    // 1 counter = 10 HP of damage
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;
  readonly turnEvolved: number | null;
  readonly isNewThisTurn: boolean;
}

// TemporalEffect (lib/types/effect.ts) — relevant for pre-attack effects and damage modifiers
interface TemporalEffect {
  readonly id: string;
  readonly type: string;                              // e.g. 'damage_modifier', 'attack_prevention'
  readonly sourceInstanceId: string;
  readonly targetInstanceId: string | null;           // which Pokemon is affected
  readonly expiresOnTurn: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
```

### SPEC_02 logic files (all in `lib/core/`)

| File | Key exports | Notes for SPEC_03 |
|------|-------------|-------------------|
| `result.ts` | `GameResult<T>`, `ok`, `err`, `GameErrorCode` | Import from here, not from `game.ts` |
| `game.ts` | `createGame`, `checkWinConditions`, `handleKnockOut`, `promoteFromBench`, `otherPlayer`, `GameConfig` | `handleKnockOut` currently only searches `player.active` — you must extend it to also handle bench KOs |
| `turn.ts` | `startTurn`, `endTurn`, `getLegalActions`, `applyAction` | Contains a stub comment for `resolveAttack` — you will un-stub it |
| `checkup.ts` | `performCheckup` | Uses `placeDamageCounters` (internal helper, not exported) |
| `energy.ts` | `canPayEnergyCost`, `canPayRetreatCost` | Reuse in combat |
| `evolution.ts` | `canEvolve`, `evolvePokemon` | |
| `setup.ts` | `hasBasicPokemon` | |
| `validation.ts` | `validateDeck` | |
| `conditions.ts` | `applySpecialCondition`, `removeSpecialCondition`, `clearSpecialConditions` | |
| `lib/effects/registry.ts` | `registerEffect`, `resolveEffect`, `EffectContext`, `EffectHandler` | Registry is empty — resolveEffect returns `ok(state)` for unregistered effectIds |

### The ATTACK stub in `turn.ts` (lines ~840–870)

The current ATTACK handler in `applyMainAction` looks like this:

```typescript
if (action.type === 'ATTACK') {
  // ... legality checks ...

  let s: GameState = {
    ...state,
    phase: 'attack',
    turnFlags: { ...state.turnFlags, attackUsed: true },
    eventLog: [
      ...state.eventLog,
      { type: 'ATTACK_DECLARED', player: state.activePlayer, attackName, attackerInstanceId: active.instanceId }
    ] as GameEvent[]
  };

  // Stub: resolveAttack (SPEC_03 fills this)
  // s = resolveAttack(s, action.attackIndex);

  // End turn after attack
  s = endTurn(s);
  return ok(s);
}
```

SPEC_03 must:
1. Create `lib/core/combat.ts` with `resolveAttack`
2. Add `import { resolveAttack } from './combat'` to `turn.ts`
3. Replace the stub comment with `s = resolveAttack(s, action.attackIndex);`

### The `handleKnockOut` limitation in `game.ts`

The current implementation only searches `player.active` for the KO'd Pokemon. Bench KOs
(from spread attacks) require extending it. SPEC_03 must modify `handleKnockOut` to also
search bench positions:

```typescript
// Current (SPEC_02 — only handles active KOs):
for (const [pid, ps] of ...) {
  if (ps.active?.instanceId === knockedOutPokemonId) { koPlayer = pid; break; }
}

// SPEC_03: also check bench
for (const [pid, ps] of ...) {
  if (ps.active?.instanceId === knockedOutPokemonId) { koPlayer = pid; koZone = 'active'; break; }
  const benchIdx = ps.bench.findIndex(b => b.instanceId === knockedOutPokemonId);
  if (benchIdx !== -1) { koPlayer = pid; koZone = 'bench'; koBenchIdx = benchIdx; break; }
}
```

For bench KOs: discard the Pokemon + attachments, award prizes, NO promotion needed (bench
Pokemon are not replaced — the bench just shrinks).

### Effect registry pattern (no-op until SPEC_04)

```typescript
// From lib/effects/registry.ts:
export function resolveEffect(effectId: string, context: EffectContext): GameResult<GameState> {
  const handler = registry.get(effectId);
  if (!handler) return ok(context.state);  // ← no-op for all effects in SPEC_03
  return handler(context);
}
```

Combat will call `resolveEffect` for attack effects. All calls return `ok(state)` until
SPEC_04 registers handlers. This is correct and intentional — do not work around it.

---

## 3. SPEC_03 Files to Create / Modify

```
lib/core/combat.ts            NEW: resolveAttack, calculateDamage, resolveWeakness,
                                   resolveResistance, resolveConfusion, dealBenchDamage,
                                   dealSelfDamage, discardEnergyFromPokemon, checkKnockOuts,
                                   DamageCalculation (interface)
lib/core/turn.ts              MODIFY: import resolveAttack; un-stub the ATTACK handler
lib/core/game.ts              MODIFY: extend handleKnockOut to handle bench KOs
lib/index.ts                  MODIFY: re-export new public functions from combat.ts
__tests__/core/combat.test.ts NEW: all acceptance criteria
```

---

## 4. Design Decisions

### 4.1 Damage pipeline is pure — state mutation happens once at the end

`calculateDamage` is a **pure function** that returns a `DamageCalculation` record.
It does NOT mutate state. After calculating, `resolveAttack` places damage counters
in a single step.

```typescript
export interface DamageCalculation {
  readonly baseDamage: number;
  readonly attackModifier: number;       // from attack damageModifier field + effect
  readonly selfEffectModifier: number;   // from temporal effects on attacker
  readonly weaknessMultiplier: number;   // 1 or 2
  readonly weaknessFlat: number;         // for "+20"/"+30" weakness
  readonly resistanceReduction: number;  // 0, 20, or 30
  readonly targetEffectReduction: number;
  readonly finalDamage: number;          // max(0, calculated)
}
```

### 4.2 "Deal damage" vs "place damage counters" — two distinct paths

Both are needed. The engine uses two different functions:

```typescript
// Goes through full pipeline (Weakness/Resistance/modifiers):
function dealDamage(state: GameState, targetInstanceId: string, calc: DamageCalculation): GameState

// Bypasses pipeline entirely (Poison, Burn, Confusion, bench snipes, recoil):
function placeDamageCountersOn(state: GameState, targetInstanceId: string, counters: number, source: string): GameState
```

Events distinguish them:
- Pipeline damage → `DAMAGE_DEALT` event (with `amount: finalDamage`)
- Direct counters → `DAMAGE_COUNTERS_PLACED` event (with `counters: N`)

### 4.3 Attack index encoding

- `attackIndex < 100` → native attack from the attacker's `attacks[attackIndex]`
- `attackIndex >= 100` → TM attack from `active.attachedTools[attackIndex - 100]`

For TM attacks in SPEC_03: look up the TM card by instanceId, get its `effectId`,
call `resolveEffect(effectId, context)`. Since no handler is registered yet, this
is a no-op that returns 0 damage. Do not crash.

### 4.4 Auto-promotion after attack KO (limitation)

There is no `PROMOTE_FROM_BENCH` action type. SPEC_03 continues the SPEC_02 pattern
of auto-promoting the FIRST bench Pokemon. SPEC_05 (AI) will make this smarter.
Document this clearly but do not add a new action type.

### 4.5 KO processing order

`checkKnockOuts` must:
1. **Collect ALL** KO'd Pokemon (Active + Bench, both players) into a list
2. **Process all** before any promotion
3. Prizes are cumulative — if taking a prize drains the pile, `checkWinConditions` fires
   mid-processing and the game ends before the next KO is processed

```typescript
export function checkKnockOuts(state: GameState): GameState {
  // 1. Find all KO'd Pokemon across both players, both zones
  const kos: Array<{ instanceId: string }> = [];
  for (const ps of Object.values(state.players)) {
    if (ps.active && isKnockedOut(state, ps.active)) kos.push({ instanceId: ps.active.instanceId });
    for (const b of ps.bench) {
      if (isKnockedOut(state, b)) kos.push({ instanceId: b.instanceId });
    }
  }

  // 2. Process all KOs (handleKnockOut handles prizes + promotion for actives)
  let s = state;
  for (const ko of kos) {
    s = handleKnockOut(s, ko.instanceId);
    if (s.phase === 'finished') return s;  // short-circuit if game over
  }
  return checkWinConditions(s);
}

function isKnockedOut(state: GameState, pokemon: InPlayPokemon): boolean {
  const hp = getPokemonHp(state, pokemon);
  return pokemon.damageCounters * 10 >= hp;
}
```

---

## 5. Damage Pipeline — Exact Implementation

### Step order (rulebook p.20)

```
A. Pre-attack effects check (attack_prevention type temporal effects)
   → If defender's current Active instanceId ≠ effect.targetInstanceId: effect does NOT apply
     (target has moved — effect expired by zone change)
   → If applies AND condition met: attack cancelled, return state with effect removed

B. Confusion check (if attacker is Confused)
   → coinFlip()
   → Tails: placeDamageCountersOn(attacker, 3, 'confusion') → attack cancelled, return
   → Heads: attack proceeds

C. [Attack choices/requirements — SPEC_04 territory, no-op in SPEC_03]

D. Compute DamageCalculation (pure, no state mutation):
   1. baseDamage = attack.damage
   2. SINGLE STEP — combine attack modifiers and self-effects:
      a. For attacks with damageModifier '+': attackModifier += effect value (0 if no effect registered)
      b. For attacks with damageModifier 'x': treat base as base * multiplier (0 if no effect)
      c. selfEffectModifier = sum of all temporal effects of type 'damage_modifier' on attacker
      Running total after step 2 = baseDamage + attackModifier + selfEffectModifier
   3. If running total <= 0: finalDamage = 0, skip steps 3-7 (no W/R)
   4. weaknessMultiplier/weaknessFlat = resolveWeakness(runningTotal, attackerTypes, defenderWeaknesses)
   5. running total after weakness applied
   6. resistanceReduction = resolveResistance(runningTotal, attackerTypes, defenderResistances)
   7. targetEffectReduction = sum temporal effects of type 'damage_reduction' on defender
   8. finalDamage = max(0, weakened - resistanceReduction - targetEffectReduction)

E. If finalDamage > 0: dealDamage (place finalDamage/10 counters on defender's Active)
   If attack has bench damage in effect text: SPEC_04 handles this via resolveEffect

F. Attack side effects: resolveEffect(attack.effectId, context) — no-op for SPEC_03

G. checkKnockOuts(state)
```

### Weakness resolution (exact)

```typescript
function resolveWeakness(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderWeaknesses: ReadonlyArray<WeaknessDefinition>
): { multiplier: number; flat: number } {
  // Check first matching weakness type only (not cumulative for dual-type attackers)
  for (const attackerType of attackerTypes) {
    const weakness = defenderWeaknesses.find(w => w.type === attackerType);
    if (!weakness) continue;
    if (weakness.value === 'x2') return { multiplier: 2, flat: 0 };
    const flatMatch = weakness.value.match(/^\+(\d+)$/);
    if (flatMatch) return { multiplier: 1, flat: parseInt(flatMatch[1]!, 10) };
  }
  return { multiplier: 1, flat: 0 };
}
// Applied as: (damage * multiplier) + flat
```

### Resistance resolution (exact)

```typescript
function resolveResistance(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderResistances: ReadonlyArray<ResistanceDefinition>
): number {
  // Check first matching resistance type only
  for (const attackerType of attackerTypes) {
    const resistance = defenderResistances.find(r => r.type === attackerType);
    if (!resistance) continue;
    const flatMatch = resistance.value.match(/^-(\d+)$/);
    if (flatMatch) return parseInt(flatMatch[1]!, 10);
  }
  return 0;
}
// Applied as: max(0, damage - resistanceReduction)
```

### Dual-type + split W/R (rulebook Appendix 21, p.35)

If a dual-type attacker (e.g. Fire/Water) hits a defender with Weakness to Fire (x2)
and Resistance to Water (-30):
1. Find first matching weakness type in attacker's types array → apply Weakness
2. Find first matching resistance type → apply Resistance
3. Both apply because they match DIFFERENT attacker types

This is handled naturally by the algorithm above — Weakness loop finds Fire first,
Resistance loop finds Water. Both return non-zero results, both are applied.

### Bench damage

```typescript
export function dealBenchDamage(
  state: GameState,
  targetInstanceId: string,
  amount: number
): GameState {
  // Tera Pokemon ex take NO bench damage (hard-coded rule, not per-card effect)
  const def = getTopDef(state, targetInstanceId); // helper to get current evolution def
  if (def?.cardType === 'Pokemon' && def.subtypes.includes('Tera')) return state;

  // Direct counter placement — no W/R, no modifiers
  return placeDamageCountersOn(state, targetInstanceId, Math.floor(amount / 10), 'bench_damage');
}
```

### Self-damage / recoil

```typescript
export function dealSelfDamage(
  state: GameState,
  attackerInstanceId: string,
  amount: number
): GameState {
  // Direct counter placement — no W/R, no modifiers
  return placeDamageCountersOn(state, attackerInstanceId, Math.floor(amount / 10), 'self_damage');
}
```

---

## 6. Helper: Getting a Pokemon's Current Definition

A recurring need in SPEC_03 is resolving the CURRENT definition for a Pokemon in play
(i.e., the top of the evolution stack). Extract this as a shared helper:

```typescript
function getTopDef(
  state: GameState,
  instanceId: string
): import('../types/card').PokemonCardDefinition | null {
  // Search both active and bench positions
  for (const ps of Object.values(state.players)) {
    const candidates = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];
    for (const p of candidates) {
      if (p.instanceId !== instanceId) continue;
      const topId = p.evolutionStack[p.evolutionStack.length - 1] ?? p.instanceId;
      const instance = state.cardRegistry.get(topId);
      if (!instance) return null;
      const def = state.definitionRegistry.get(instance.definitionId);
      return def?.cardType === 'Pokemon' ? def : null;
    }
  }
  return null;
}
```

This helper is also needed for `isKnockedOut`, Tera checks, and HP lookups.

---

## 7. Modifying `handleKnockOut` in `game.ts`

SPEC_02's `handleKnockOut` only handles Active Pokemon. You must extend it for bench:

```typescript
// Determine zone of KO'd Pokemon
let koPlayer: PlayerId | null = null;
let koZone: 'active' | 'bench' = 'active';
let koBenchIdx = -1;

for (const [pid, ps] of Object.entries(state.players) as Array<[PlayerId, PlayerState]>) {
  if (ps.active?.instanceId === knockedOutPokemonId) {
    koPlayer = pid; koZone = 'active'; break;
  }
  const bi = ps.bench.findIndex(b => b.instanceId === knockedOutPokemonId);
  if (bi !== -1) { koPlayer = pid; koZone = 'bench'; koBenchIdx = bi; break; }
}
if (!koPlayer) return state;

// KO a bench Pokemon: remove from bench, discard all attached, award prizes, NO promotion
if (koZone === 'bench') {
  const koPlayerState = state.players[koPlayer];
  const koPokemon = koPlayerState.bench[koBenchIdx]!;
  const prize = otherPlayer(koPlayer);
  const prizePlayer = state.players[prize];
  // ... same prize logic as active KO ...
  // ... discard koPokemon + attachments ...
  // NO promoteFromBench call
}
```

---

## 8. Acceptance Criteria to Test

Every item below must have a test in `__tests__/core/combat.test.ts`:

### Damage pipeline
- [ ] Base damage flows through pipeline correctly (no modifiers → finalDamage = base)
- [ ] Step 2 is a single step: selfEffectModifier applied before 0-check
- [ ] 0-damage attack skips Weakness/Resistance entirely (no double-dipping)
- [ ] A 0-base attack with a +40 temporal modifier results in 40 damage (not 0)
- [ ] Weakness x2 doubles the step-2 total
- [ ] Weakness +20 (flat) adds 20 to the step-2 total
- [ ] Resistance -30 subtracts from post-weakness total, floor at 0
- [ ] Dual-type attacker: weakness to type A AND resistance to type B both apply (W first, then R)

### Bench damage
- [ ] Bench damage bypasses Weakness/Resistance
- [ ] Bench damage places counters directly
- [ ] Tera Pokemon ex take 0 bench damage

### Confusion
- [ ] Confused + tails: places 3 damage counters on attacker (not pipeline), attack cancelled
- [ ] Confused + heads: attack proceeds normally
- [ ] Confused self-damage uses DAMAGE_COUNTERS_PLACED, not DAMAGE_DEALT

### KO processing
- [ ] KO check: damageCounters * 10 >= hp triggers KO
- [ ] Prize cards match prizeValue (1 for basic, 2 for ex, 3 for Mega ex)
- [ ] Multiple KOs (Active + bench snipe) all processed; prizes cumulative
- [ ] All KOs collected before promotion
- [ ] Bench KO: Pokemon removed from bench, attached cards discarded, prizes awarded, no promotion
- [ ] Active KO: Pokemon removed from active, bench auto-promoted, prizes awarded

### Event emission
- [ ] `DAMAGE_DEALT` emitted for pipeline damage
- [ ] `DAMAGE_COUNTERS_PLACED` emitted for direct counter placement
- [ ] Events are distinct (not interchangeable)

### Pre-attack effects
- [ ] Pre-attack prevention effect applies when targetInstanceId matches current Active
- [ ] Pre-attack prevention effect does NOT apply when Active has changed (zone change)

### Energy discard
- [ ] `discardEnergyFromPokemon` removes energy from Pokemon and moves to discard pile

### Self-damage
- [ ] Recoil (`dealSelfDamage`) places counters on attacker, bypasses pipeline

### Full attack flow (integration)
- [ ] ATTACK action goes through resolveAttack, checkKnockOuts, endTurn
- [ ] Attack with 0 damage does not emit DAMAGE_DEALT
- [ ] Game ends correctly when attack KO drains prize pile

---

## 9. Non-Obvious Pitfalls

1. **Step 2 is a SINGLE step, not two.** Attack text modifiers (`damageModifier` field) and
   temporal self-effects are both applied before the 0-check. A 0-base attack with a temporal
   +40 modifier must produce 40 damage, not 0. Do not apply the 0-check between (a) and (b).

2. **The 0-check fires AFTER the combined step 2**, not before Weakness. If the total after
   all modifiers is still 0 (or the base is 0 with no modifiers at all), skip W/R. Apply W/R
   to non-zero totals only.

3. **Weakness applies to the POST-step-2 total**, not to base damage. Order: base → step2 → W → R.

4. **Dual-type Weakness: first match only.** If both of a dual-type attacker's types match
   the defender's weaknesses, only the FIRST one in `attackerTypes` array applies. Same for
   resistance. However, if one type hits Weakness and a different type hits Resistance, BOTH apply.

5. **Bench damage = direct counter placement always.** Even if the bench target would normally
   have Weakness or Resistance, neither applies to bench. `dealBenchDamage` always uses
   `placeDamageCountersOn`, never `calculateDamage`.

6. **Tera immunity is hard-coded, not an effect.** Check `subtypes.includes('Tera')` directly
   in `dealBenchDamage`. Do not route through the effect registry.

7. **Confused self-damage is 3 counters** (30 HP), not 30 damage through the pipeline. No
   Weakness or Resistance. Emits `DAMAGE_COUNTERS_PLACED`. The attack itself does NOT fire —
   return immediately after placing counters.

8. **Pre-attack effect expiry:** `TemporalEffect.targetInstanceId` stores the opponent's Active
   instanceId at the time the effect was created. If the opponent switched (retreat, KO+promote,
   Switch card), their new Active has a different instanceId. The effect must be checked against
   the CURRENT Active's instanceId. If different → effect has expired → does not apply.
   Do NOT expire the effect from state — only skip its application. SPEC_04 handles cleanup.

9. **`handleKnockOut` currently breaks for bench KOs.** The SPEC_02 implementation returns
   `state` unchanged if the instanceId isn't found in `active`. You must extend it before
   `checkKnockOuts` calls it for bench Pokemon.

10. **TM attack index encoding:** `attackIndex >= 100` means TM. The TM instanceId is
    `active.attachedTools[attackIndex - 100]`. Look up its definition to get the `effectId`.
    Call `resolveEffect` with it — the registry is empty so it's a no-op for SPEC_03.
    Do not crash if `attackIndex - 100` is out of bounds; return state unchanged.

11. **`discardEnergyFromPokemon` must update both the Pokemon and the player's discard pile.**
    Energy is stored as instanceIds in `InPlayPokemon.attachedEnergy`. Removing them means
    filtering the array AND adding the instanceIds to `player.discard`.

12. **`prizeValue` uses the TOP of the evolution stack**, not `instanceId`. The SPEC_02
    `handleKnockOut` already correctly reads from `evolutionStack[last]`. Do not change this.

13. **No `resolveAttack` export from SPEC_02.** It was a stub comment in `turn.ts`, never
    exported. SPEC_03 creates the real function in `combat.ts` and `turn.ts` imports it.

14. **`placeDamageCountersOn` vs `placeDamageCounters` naming.** SPEC_02's `checkup.ts` has a
    private `placeDamageCounters` helper. Create a SEPARATE exported version in `combat.ts`
    called `placeDamageCountersOn` (or re-export the logic) rather than importing the private
    checkup helper. They share the same logic but combat needs the function accessible.

---

## 10. Test File Location and DB Path

```typescript
// __tests__/core/combat.test.ts

// DB path is CWD-relative (bun test runs from packages/@engine/)
const DB_PATH = '../../database/pokemon-data.sqlite3.db';

// Use real card IDs — these are confirmed in the DB and used by SPEC_02 tests:
const MAREEP_ID = 'svp-107';        // Basic Lightning, 60 HP, probably Fighting weakness
const FLAAFFY_ID = 'svp-108';       // Stage1, evolvesFrom "Mareep", 90 HP
const PIKACHU_EX_ID = 'svp-106';    // Basic ex Lightning, 200 HP, H mark
const PAWNIARD_ID = 'svp-111';      // Basic Darkness, H mark
const FIRE_ENERGY_ID = 'base1-98';  // Fire Energy (Basic)
const LIGHTNING_ENERGY_ID = 'base1-100'; // Lightning Energy (Basic)

// For Weakness/Resistance tests, load the pool and inspect actual definitions.
// Use pool.get(id)?.weaknesses to find what types each card is weak to.
```

Do NOT use `import.meta.url`, `import.meta.dir`, or absolute paths in test files.
CWD-relative string literals only.

---

## 11. What NOT to Implement in SPEC_03

These are explicitly SPEC_04 territory:

- Specific card effects in attack text (draw cards, search deck, discard energy by effect, etc.)
- Coin flip requirements in attack text ("Flip a coin. If heads, this attack does...")
- Spread/multi-target attack selection ("Choose 1 of your opponent's Benched Pokemon")
- Ability interactions with damage calculation
- Trainer/Item effects that modify damage
- Stadium effects on damage
- Tool effects on damage
- The Confused attack "flip coin for attack text" (distinct from the Confusion self-hit which IS SPEC_03)

The Confusion self-hit rule IS SPEC_03 (3 counters on tails, attack cancelled). The "flip a coin
for heads/tails in attack text" mechanic is SPEC_04.

---

## 12. Session Start Verification

Before writing any new code, verify the existing foundation:

```bash
# From /home/nicks-dgx/dev/.Project-Johto/Pokemon
bun test --cwd packages/@engine    # should show 128 pass, 0 fail
bun run --cwd packages/@engine check-types  # should show no output (clean)
```

If either fails, fix it before proceeding — do not build on a broken foundation.
