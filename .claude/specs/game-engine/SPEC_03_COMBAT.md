# SPEC_03: Combat System

## Context

This spec defines the attack resolution pipeline and damage calculation system. Attack resolution is the most rules-dense part of the engine. The full attack sequence is documented on p.13-14 and p.20 of the rulebook.

---

## Prerequisites

- SPEC_01 (Core Types)
- SPEC_02 (Game Flow)

---

## Requirements

### 1. Attack Resolution Pipeline

When a player declares an attack, the engine processes it through an ordered pipeline. Each step is a pure function that transforms state:

```typescript
// src/core/combat.ts

function resolveAttack(state: GameState, attackIndex: number): GameState;
```

The pipeline steps, in order (rulebook p.20):

```
Step A: Validate energy cost is met
Step B: Apply pre-attack effects that might alter or cancel the attack
        (e.g. "If the Defending Pokemon tries to attack, flip a coin. Tails = attack fails")
        NOTE (rulebook p.20): If the Active Pokemon has changed since the opponent used the
        attack that created this effect (via retreat, KO+promote, Switch, etc.), the effect
        no longer applies. TemporalEffects of type 'attack_prevention' must store the
        original target's instanceId and compare against the current Active.
Step C: If attacker is Confused, flip coin — tails = 3 damage counters on self, attack fails
Step D: Make attack choices (e.g. "Choose 1 of your opponent's Benched Pokemon")
Step E: Execute attack requirements (e.g. "Flip a coin. If tails, this attack does nothing")
Step F: Apply pre-damage effects, then deal damage, then post-damage effects
```

### 2. Damage Calculation (Rulebook p.20)

When an attack deals damage to the opponent's Active Pokemon, damage is calculated in this order:

```
1. Start with base damage (printed number)
   ** IMPORTANT: If the attack says "place N damage counters" instead of dealing damage,
   skip this entire pipeline. Counter placement bypasses Weakness, Resistance, and all
   modifiers (rulebook p.20 step 1). Use `placeDamageCounters` directly. **
2. Figure out all damage modifiers on YOUR Active Pokemon and add them in (rulebook p.20 step 2)
   This is a SINGLE step that combines:
   a. Attack text modifiers (+, -, x):
      - "120+" means 120 + extra from effect
      - "30x" means 30 * multiplier from effect
      - "80-" means 80 - reduction from effect
   b. Temporal self-effects on your Active Pokemon:
      (e.g. "During your next turn, this Pokemon's attacks do 40 more damage")
      These come from Trainer cards, Abilities, or prior attack effects.
   Both (a) and (b) are applied BEFORE Weakness/Resistance (rulebook: "before applying
   Weakness and Resistance").
   ** After applying ALL modifiers from this step: Stop if the running damage total is 0
   (or if the attack does not do any damage at all — i.e., base 0 with no modifier and
   no self-effects that produce damage). 0-damage attacks with only non-damage effects
   (e.g. "Search your deck") skip the rest of the pipeline entirely.
   (Rulebook p.20 step 2: "Stop if the base damage is 0 or if the attack does not do any
   damage at all.") **
3. Apply Weakness of opponent's Active Pokemon
   - Most modern cards: "x2" (double the current damage total)
   - Some older cards: "+20", "+30" (add flat amount)
4. Apply Resistance of opponent's Active Pokemon
   - Typically "-20" or "-30" (subtract from current damage total)
5. Apply damage-reducing effects on opponent's Active Pokemon
   (e.g. "This Pokemon takes 20 less damage from attacks")
6. Floor at 0 (damage can never be negative)
7. Place damage counters: 1 counter per 10 damage
```

**Critical:** Weakness and Resistance only apply to the opponent's **Active** Pokemon. Benched Pokemon do not take weakness/resistance modified damage (rulebook p.14).

```typescript
interface DamageCalculation {
  readonly baseDamage: number;
  readonly attackModifier: number;          // from attack effect (+/- modifiers)
  readonly selfEffectModifier: number;      // from effects on attacker
  readonly weaknessMultiplier: number;      // 1 (no weakness), 2 (x2), or additive
  readonly weaknessFlat: number;            // for old "+20" style weakness
  readonly resistanceReduction: number;     // 0, 20, or 30
  readonly targetEffectReduction: number;   // from effects on defender
  readonly finalDamage: number;             // max(0, calculated total)
}

function calculateDamage(
  attacker: InPlayPokemon,
  defender: InPlayPokemon,
  attack: AttackDefinition,
  attackerDef: PokemonCardDefinition,
  defenderDef: PokemonCardDefinition,
  state: GameState
): DamageCalculation;
```

### 3. Weakness Resolution

```typescript
function resolveWeakness(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderWeaknesses: ReadonlyArray<WeaknessDefinition>
): number;
```

- Check if any of the attacker's types match the defender's weakness types
- If match found: apply the weakness value
  - `"x2"` → `damage * 2`
  - `"+20"` → `damage + 20`
  - `"+30"` → `damage + 30`
- If attacker is dual-type and defender has weakness to both types, apply only once (the first matching)
- **Dual-type attacker with split W/R (rulebook Appendix 21, p.35):** If a dual-type Pokemon attacks and the defender has Weakness to one of its types AND Resistance to the other, **both** apply. Weakness is applied first (step 4 in damage pipeline), then Resistance (step 5). Example: a Fire/Water attacker hits a defender with Weakness to Fire (x2) and Resistance to Water (-30). Damage is doubled first, then reduced by 30.

### 4. Resistance Resolution

```typescript
function resolveResistance(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderResistances: ReadonlyArray<ResistanceDefinition>
): number;
```

- Check if any of the attacker's types match the defender's resistance types
- If match found: apply the resistance value
  - `"-20"` → `damage - 20`
  - `"-30"` → `damage - 30`
- If attacker is dual-type and defender has resistance to both types, apply only once (the first matching) — same rule as Weakness
- Floor at 0

### 5. Special Condition Effects on Attacks

**Asleep (p.15):** Pokemon cannot attack. Attack action is illegal (enforced in `getLegalActions`, not here).

**Paralyzed (p.16):** Pokemon cannot attack. Attack action is illegal (enforced in `getLegalActions`, not here).

**Confused (p.16):** If the Active Pokemon is Confused and attacks:
1. Flip a coin before the attack
2. Heads: attack proceeds normally
3. Tails: attack does NOT happen, place 3 damage counters on the attacking Pokemon instead (direct counter placement — bypasses the damage pipeline entirely, no Weakness/Resistance/modifiers; rulebook p.16)

```typescript
function resolveConfusion(state: GameState, attacker: InPlayPokemon): {
  readonly proceed: boolean;
  readonly newState: GameState;
};
```

### 6. Bench Damage

Some attacks deal damage to Benched Pokemon. Important rules:
- Weakness does NOT apply to Benched Pokemon
- Resistance does NOT apply to Benched Pokemon
- The damage text specifies the exact amount to Benched targets
- Damage counters are placed directly (no calculation pipeline for bench damage)
- **Tera Pokemon ex are immune to ALL attack damage while on the Bench** (rulebook Appendix 6, p.27).
  This applies to attacks from both players. `dealBenchDamage` must check if the target has the
  `'Tera'` subtype and skip damage if so. This is a hard-coded rule, not a per-card effect.

```typescript
function dealBenchDamage(
  state: GameState,
  targetInstanceId: string,
  amount: number
): GameState;
// Must check: if target Pokemon has subtype 'Tera', return state unchanged (no damage dealt)
```

### 7. Self-Damage and Recoil

Some attacks deal damage to the attacking Pokemon itself. This uses direct damage counter placement (no weakness/resistance):

```typescript
function dealSelfDamage(
  state: GameState,
  attackerInstanceId: string,
  amount: number
): GameState;
```

### 8. Attack Side Effects

Attacks can have additional effects beyond damage:

| Effect Category | Examples |
|----------------|----------|
| Apply Special Condition | "The Defending Pokemon is now Poisoned" |
| Discard Energy | "Discard an Energy from this Pokemon" / "Discard all Energy from this Pokemon" |
| Draw Cards | "Draw 2 cards" |
| Heal | "Heal 30 damage from this Pokemon" |
| Search Deck | "Search your deck for a Basic Pokemon and put it onto your Bench" |
| Switch | "Switch this Pokemon with 1 of your Benched Pokemon" |
| Bench Damage | "This attack does 20 damage to 1 of your opponent's Benched Pokemon" |
| Discard from Opponent | "Discard the top card of your opponent's deck" |
| Coin Flip Modifier | "Flip a coin. If heads, this attack does 30 more damage" |
| Prevent Effects | "During your opponent's next turn, prevent all damage done to this Pokemon" |

These are handled by the effect system (SPEC_04). The combat module calls into the effect registry for attack effects.

### 9. "Deal Damage" vs "Place Damage Counters" (Rulebook p.20)

This is a critical distinction the engine must enforce:

**"Deal damage"** — goes through the full damage calculation pipeline (steps 1-8 above).
Weakness, Resistance, and modifier effects all apply. Most attacks use this path.

**"Place damage counters"** — bypasses the pipeline entirely. Counters are placed directly.
No Weakness, Resistance, or any modifier applies. Used by:
- Poison (1 counter during Checkup)
- Burn (2 counters during Checkup)
- Confusion self-hit (3 counters on tails)
- Attacks that explicitly say "place N damage counters" (e.g. Spiritomb's ability)
- Bench snipe damage from attack effects (direct placement, no W/R)
- Self-damage / recoil

The engine emits `DAMAGE_DEALT` events for pipeline damage and `DAMAGE_COUNTERS_PLACED` events
for direct counter placement so that replay analysis can distinguish the two.

### 10. KO Check After Attack

After damage is dealt and all effects resolve:

```typescript
function checkKnockOuts(state: GameState): GameState;
```

1. Check **ALL** Pokemon in play (both players, Active + Bench) for `damageCounters * 10 >= hp`
2. Collect all KO'd Pokemon before processing any of them
3. Process all KOs simultaneously:
   a. Move each KO'd Pokemon + all attached cards to owner's discard pile
   b. Award prize cards to opponent based on each KO'd Pokemon's `prizeValue` (1, 2, or 3)
   c. Emit `POKEMON_KNOCKED_OUT` and `PRIZE_TAKEN` events for each
4. After ALL KOs are processed (not between them), check win conditions:
   - Did a player take their last prize? → They win
   - Does opponent have no Pokemon in play (no bench to promote)? → Current player wins
   - Both players meet win conditions simultaneously? Count each player's satisfied conditions.
     Player who satisfies MORE conditions wins outright (rulebook p.21: "if you win in both
     ways and your opponent wins in only one way, you are the victor!"). If both satisfy the
     same number of conditions → tiebreaker → recorded as `'draw'` for simulation.
5. If the defending player's Active was KO'd AND they still have bench, they must promote

**Important ordering:** All KOs from a single attack are processed before any promotion.
Prize cards from multiple KOs (e.g. Active KO + bench snipe KO) are cumulative and may
cause a player to win mid-processing.

### 11. Attack Cost Payment

Some attacks require discarding energy as part of their cost (stated in attack text, not the energy cost icons). This is handled by the effect system, but the combat module coordinates:

```typescript
function discardEnergyFromPokemon(
  state: GameState,
  pokemonInstanceId: string,
  energyInstanceIds: ReadonlyArray<string>
): GameState;
```

---

## Damage Pipeline Visualization

```
Attack Declared
    │
    ▼
Pre-Attack Effects (Sand Attack, etc.)
    │ (may cancel attack — only if originalTarget matches current Active)
    ▼
Confusion Check
    │ (tails = place 3 damage counters on self, attack cancelled)
    ▼
Attack Choices (target selection)
    │
    ▼
Attack Requirements (coin flips for "if heads" attacks)
    │
    ▼
Pre-Damage Effects
    │
    ▼
┌─── "Place damage counters"? ───┐
│ YES                            │ NO
│                                │
▼                                ▼
Place counters directly    Calculate Base Damage ────────────────┐
(skip entire pipeline)         │                                  │
│                              ▼                                  │ (only for Active
│                     ┌─ Step 2 (single step) ─┐                  │  target — bench
│                     │ Apply Attack Mods (+,-,x)│                 │  damage is direct
│                     │ Apply Self-Effects       │                 │  counter placement,
│                     │ (+40 next turn, etc)     │                 │  check Tera immunity)
│                     └──────────┬───────────────┘                │
│                              ▼                                  │
│                         Damage > 0? ──NO──▶ Stop (no W/R)      │
│                              │                                  │
│                              ▼                                  │
│                         Apply Weakness (x2 / +N)                │
│                              │                                  │
│                              ▼                                  │
│                         Apply Resistance (-N)                   │
│                              │                                  │
│                              ▼                                  │
│                         Apply Target Effects (-20 from attacks) │
│                              │                                  │
│                              ▼                                  │
│                         Floor at 0 ─────────────────────────────┘
│                              │
└──────────────┬───────────────┘
               ▼
Place Damage Counters (1 per 10)
               │
               ▼
Bench Damage (if any — direct counter placement, Tera ex immune)
               │
               ▼
Post-Damage Effects (discard energy, heal, etc.)
               │
               ▼
KO Check (ALL KOs collected first) → Prize Award (cumulative) → Promote
```

---

## Acceptance Criteria

- [ ] Attack resolution follows the exact 6-step sequence from rulebook p.20
- [ ] Damage calculation applies modifiers in correct order: base → attack mod + self effects (single step) → 0-check → weakness → resistance → target effects → floor 0
- [ ] Weakness x2 doubles damage correctly
- [ ] Resistance -30 subtracts correctly, floors at 0
- [ ] Weakness/Resistance NOT applied to bench damage
- [ ] Confused Pokemon: tails = 30 self-damage, attack cancelled
- [ ] KO check triggers when damage counters >= HP
- [ ] Prize cards awarded match KO'd Pokemon's prizeValue
- [ ] Multiple KOs in a single attack handled correctly (e.g. bench snipe + active KO)
- [ ] Self-damage attacks resolve correctly (recoil)
- [ ] Energy discard costs executed as part of attack effect
- [ ] Tera Pokemon ex take zero bench damage from attacks (both players' attacks)
- [ ] "Place damage counters" attacks bypass entire damage pipeline (no W/R/modifiers)
- [ ] 0-damage attacks skip damage pipeline entirely (don't apply W/R to 0)
- [ ] Self-effects (temporal damage modifiers) are applied in the SAME step as attack modifiers, BEFORE the 0-check — a 0-base-damage attack with a +40 temporal bonus results in 40 damage, not 0
- [ ] Pre-attack effects (Sand Attack etc.) expire if the target Active has changed since creation
- [ ] All KOs from single attack processed before promotion; prizes are cumulative
- [ ] `DAMAGE_COUNTERS_PLACED` events emitted for direct counter placement (distinct from `DAMAGE_DEALT`)
- [ ] Dual-type attacker: Weakness to type A + Resistance to type B both apply (W first, then R per rulebook Appendix 21)
- [ ] Confused self-damage uses direct counter placement (3 counters), not the damage pipeline
