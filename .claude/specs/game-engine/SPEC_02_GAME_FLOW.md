# SPEC_02: Game Flow

## Context

This spec defines the complete lifecycle of a Pokemon TCG game from setup through game-over. It covers the setup procedure (rulebook p.8), turn structure (p.9-12), win conditions (p.8), mulligan rules (p.18), and Pokemon Checkup (p.15-16).

---

## Prerequisites

- SPEC_01 (Core Types)

---

## Requirements

### 1. Game Initialization

```typescript
// src/core/game.ts

interface GameConfig {
  readonly deck1: ReadonlyArray<string>;      // card definition IDs for player 1's deck
  readonly deck2: ReadonlyArray<string>;      // card definition IDs for player 2's deck
  readonly seed: number;                      // RNG seed for determinism
  readonly definitions: ReadonlyMap<string, CardDefinition>;  // all card definitions needed
  readonly formatDate?: Date;                 // determines rotation; defaults to current date
}

function createGame(config: GameConfig): GameState;
```

`createGame` must:
1. Validate both decks against Standard format rules:
   - Exactly 60 cards
   - At least 1 Basic Pokemon
   - Max 4 copies of any card name (except Basic Energy — unlimited)
   - Max 1 ACE SPEC card total (across both Trainer cards with 'AceSpec' subtype AND Energy cards with `isAceSpec: true`)
   - All cards must be Standard-legal for the given `formatDate` (regulation marks G/H/I or H/I/J)
   - No Radiant Pokemon (not Standard-legal)
2. Create `CardInstance` entries for all 120 cards (60 per player)
3. Initialize both `PlayerState` objects with full decks
4. Set `phase: 'setup'`

### 2. Setup Procedure (Rulebook p.8)

Setup is a multi-step process:

```
Step 1: Coin flip → winner DECIDES who goes first (rulebook p.8)
Step 2: Shuffle decks
Step 3: Draw 7 cards each
Step 4: Check for Basic Pokemon in hand
  - If no Basic: mulligan (rulebook p.18)
Step 5: Player selects Active Pokemon (1 Basic)
Step 6: Player selects Bench Pokemon (0-5 Basics)
Step 7: Set aside top 6 cards as Prize cards
Step 8: Reveal Active and Bench, begin game
```

```typescript
// src/core/setup.ts

function setupGame(state: GameState): GameState;
function handleMulligan(state: GameState, player: PlayerId): GameState;
function hasBasicPokemon(hand: ReadonlyArray<string>, registry: ReadonlyMap<string, CardInstance>, definitions: ReadonlyMap<string, CardDefinition>): boolean;
```

**Mulligan rules (p.18):**
- If a player has no Basic Pokemon in their opening hand, they reveal it, shuffle it back, and draw 7 new cards
- Repeat until at least 1 Basic is drawn
- If both players mulligan, both restart simultaneously — these shared mulligans don't count for extra draws
- Extra draws are based on the **differential**: if Player A took N mulligans and Player B took M, the player with fewer mulligans may draw up to `|N - M|` extra cards
- Example: Both took 2, then Player A took 3 more. Player B may draw up to 3 extra cards.
- Example: Player A took 0, Player B took 3. Player A may draw up to 3 extra cards.
- Extra cards drawn from mulligans can be placed on bench if they are Basic Pokemon

### 3. Turn Structure (Rulebook p.9-14)

Each turn has 3 phases:

```
Phase 1: Draw a card
  - If deck is empty, that player loses (win condition: deck-out)

Phase 2: Main phase — do any of these in any order:
  A. Play Basic Pokemon to Bench (unlimited)
  B. Evolve Pokemon (unlimited, subject to restrictions)
  C. Attach Energy (once per turn)
  D. Play Trainer cards:
     - Items: unlimited
     - Supporter: 1 per turn
     - Stadium: 1 per turn, replaces existing stadium
     - Pokemon Tool: attach to a Pokemon (1 tool per Pokemon)
  E. Retreat Active Pokemon (once per turn)
  F. Use Abilities (unlimited, unless ability says otherwise)

Phase 3: Attack (optional, ends turn)
  - The STARTING player (who won the flip and chose to go first) cannot attack on their
    first turn (p.13). The second player CAN attack on their first turn.
  - After attack resolves, turn ends
  - Player may choose to PASS instead of attacking
```

```typescript
// src/core/turn.ts

function startTurn(state: GameState): GameState;                    // Phase 1: draw
function applyAction(state: GameState, action: PlayerAction): GameState;  // Phase 2: validate + apply
function getLegalActions(state: GameState): ReadonlyArray<PlayerAction>;   // enumerate all legal actions
function endTurn(state: GameState): GameState;                      // transition to checkup
```

**`getLegalActions` is critical.** It must enumerate every legal action the current player can take given the current state. This is what the AI consumes, and it enforces rule legality.

### 4. Action Validation

Each action type has specific legality rules:

| Action | Legality Check |
|--------|---------------|
| `PLAY_BASIC_TO_BENCH` | Card is Basic Pokemon in hand; bench has < 5 Pokemon |
| `EVOLVE_POKEMON` | Evolution card in hand matches `evolvesFrom` of target; target has been in play since before this turn; this is not the current player's first turn (neither player can evolve on THEIR first turn — P1 can't evolve on turn 1, P2 can't evolve on turn 2); target not already evolved this turn. **Exception:** Rare Candy allows evolving a Basic directly to Stage 2 (skipping Stage 1), but all other evolution restrictions still apply (timing, first-turn block, etc.) |
| `ATTACH_ENERGY` | Energy card in hand; `energyAttachedThisTurn` is false; target is a Pokemon in play (active or bench) |
| `PLAY_TRAINER` (Item) | Item card in hand |
| `PLAY_TRAINER` (Supporter) | Supporter in hand; `supporterPlayedThisTurn` is false; starting player cannot play Supporter on their first turn (p.12). Second player CAN play Supporters on their first turn. Check: `turnFlags.isStartingPlayerFirstTurn` |
| `PLAY_TRAINER` (Stadium) | Stadium in hand; `stadiumPlayedThisTurn` is false; no stadium with same name already in play |
| `PLAY_TRAINER` (Tool) | Tool in hand; target Pokemon has no tool attached |
| `RETREAT` | Active Pokemon is not Asleep or Paralyzed; `retreatedThisTurn` is false; active has enough attached energy to pay retreat cost (or cost is 0). **On retreat: remove ALL Special Conditions and attack effects from the retreating Pokemon** (rulebook p.12, p.15-16). This also applies when a Pokemon moves to bench via Switch or any other effect. **Preserve:** all damage counters and all attached cards (Energy, Tools) stay with the Pokemon when it moves to bench (rulebook p.12: "Keep all damage counters and all attached cards with each Pokémon when they switch"). |
| `USE_ABILITY` | Pokemon has ability; ability conditions are met (per effect); Pokemon is not affected by blocking conditions |
| `ATTACK` | Active Pokemon has attack at given index; attached energy meets attack cost; Active is not Asleep or Paralyzed; not `turnFlags.isStartingPlayerFirstTurn`. Also check for attacks granted by attached Technical Machines. |
| `PASS` | Always legal during main phase |

### 5. Energy Cost Validation

An attack cost like `[Fire, Colorless, Colorless]` means 1 Fire energy + 2 of any type. Colorless in a cost is satisfied by any energy type.

```typescript
// src/core/energy.ts

function canPayEnergyCost(
  cost: ReadonlyArray<EnergyType>,
  attachedEnergy: ReadonlyArray<{ provides: ReadonlyArray<EnergyType> }>
): boolean;

function canPayRetreatCost(
  retreatCost: number,  // number of Colorless
  attachedEnergy: ReadonlyArray<{ provides: ReadonlyArray<EnergyType> }>
): boolean;
```

Energy cost matching is a constraint satisfaction problem:
1. First satisfy all typed (non-Colorless) requirements
2. Then satisfy remaining Colorless requirements with any remaining energy
3. Special Energy may provide multiple types or specific types — respect `provides` array

### 6. Evolution Rules (Rulebook p.11)

- **Neither player can evolve a Pokemon on that player's first turn** (rulebook p.11: "neither player can evolve a Pokémon on that player's first turn"). This means:
  - Turn 1 (P1's first turn): P1 cannot evolve
  - Turn 2 (P2's first turn): P2 cannot evolve
  - Turn 3+: both players can evolve (subject to other restrictions)
  - Implementation: track each player's first turn separately. A Pokemon is blocked from evolving if `turnNumber <= 1` for P1 or `turnNumber <= 2` for P2 (i.e., if the active player has not yet completed a prior turn).
- Cannot evolve a Pokemon the same turn it was played
- Cannot evolve a Pokemon the same turn it was already evolved
- Basic -> Stage 1 -> Stage 2 (must follow chain)
  - **Exception — Rare Candy:** The Trainer Item "Rare Candy" allows evolving a Basic Pokemon directly to its Stage 2 form, skipping Stage 1 entirely. All other evolution restrictions still apply (first-turn block, same-turn-played block, same-turn-evolved block). Rare Candy's effect is implemented in the effect registry; the evolution validation function accepts an optional `skipStage1: boolean` flag that Rare Candy's handler sets to `true`.
- `evolvesFrom` field must **exactly** match the `name` of the Pokemon being evolved (case-sensitive)
  - Regional variants are distinct names: "Paldean Wooper" ≠ "Wooper" (rulebook Appendix 14, p.31)
  - Trainer's Pokemon are distinct names: "Iono's Tadbulb" ≠ "Tadbulb" (rulebook Appendix 2, p.24)
  - Do NOT use fuzzy or substring matching
- Evolution clears all Special Conditions and all attack effects on the Pokemon (rulebook p.11)
- Evolution keeps all attached cards (Energy, Tools) and damage counters

```typescript
// src/core/evolution.ts

function canEvolve(
  evolutionCard: PokemonCardDefinition,
  target: InPlayPokemon,
  state: GameState,
  options?: { readonly skipStage1?: boolean }  // set by Rare Candy effect handler
): boolean;

function evolvePokemon(
  state: GameState,
  evolutionInstanceId: string,
  targetInstanceId: string
): GameState;
```

### 7. Win Condition Checks (Rulebook p.8, p.21)

Three win conditions, checked at specific times:

```typescript
// src/core/game.ts

function checkWinConditions(state: GameState): GameState;
```

| Condition | When Checked |
|-----------|-------------|
| All 6 Prize cards taken | After a KO (when prizes are awarded) |
| Opponent has no Pokemon in play | After a KO (if opponent has no bench to promote) |
| Opponent cannot draw at start of turn | At the start of draw phase |

**Simultaneous win (p.21):** If both players meet win conditions at the same time, count how many conditions each player satisfies (out of: all prizes taken, opponent has no Pokemon in play, opponent can't draw). The player who meets MORE conditions wins outright (p.21: "if you win in both ways and your opponent wins in only one way, you are the victor!"). Only if both players meet the same number of conditions is it a tiebreaker game. For simulation purposes, tiebreakers are recorded as `'draw'`.

### 8. Pokemon Checkup (Rulebook p.15-16)

Occurs between turns, in this exact order:

```
1. Poisoned: Place 1 damage counter (10 damage) — uses direct counter placement, NOT the damage pipeline
2. Burned: Place 2 damage counters (20 damage), then flip coin — heads removes Burn
   (counter placement, NOT the damage pipeline)
3. Asleep: Flip coin — heads removes Asleep
4. Paralyzed: Remove Paralyzed if the Paralyzed Pokemon's OWNER just completed their turn
   (rulebook p.16: "After its owner's next turn, it recovers during Pokémon Checkup")
   This means a Pokemon Paralyzed on your opponent's turn stays Paralyzed through YOUR
   turn (can't attack/retreat), then is removed in the Checkup after your turn ends.
5. Other between-turn effects (abilities, trainer effects that trigger between turns)
6. Check for KOs from damage dealt during checkup
   - If Poison/Burn damage KOs one or both Active Pokemon, process KOs using the same
     simultaneous-KO rules as attack KOs (§10 in SPEC_03): collect all KOs, process all
     before promotion, cumulative prizes. If both players' Active Pokemon are KO'd during
     Checkup and neither has a bench to promote from, this is a simultaneous win → draw.
```

**Note on Poison/Burn damage:** These use `placeDamageCounters` (direct counter placement),
NOT `dealDamage`. They bypass Weakness, Resistance, and all damage modification effects
(rulebook p.20 step 1: "damage counters aren't affected by Weakness, Resistance, or any
other effects on a Pokémon").

```typescript
// src/core/checkup.ts

function performCheckup(state: GameState): GameState;
```

Important: Checkup applies to BOTH players' Active Pokemon. Process player 1's Active, then player 2's Active, then check KOs. Checkup KOs follow the same simultaneous-win rules as attack KOs (rulebook p.21): count each player's satisfied win conditions; more conditions = that player wins; equal = draw.

**Note on Checkup ordering (rulebook p.15):** The rulebook allows processing Special Conditions first then other between-turn effects, OR other effects first then Special Conditions — but you cannot interleave them. The engine uses SC-first ordering for determinism. This is one of the two valid orderings.

### 9. Promoting After KO

When a player's Active Pokemon is Knocked Out:
1. Pokemon + all attached cards go to discard pile
2. Opponent takes Prize card(s) based on `prizeValue`
3. The player whose Pokemon was KO'd must choose a Benched Pokemon to become the new Active
4. If no Benched Pokemon exist, that player loses

```typescript
function handleKnockOut(state: GameState, knockedOutPokemonId: string): GameState;
function promoteFromBench(state: GameState, player: PlayerId, newActiveId: string): GameState;
```

---

## State Transition Diagram

```
createGame() → [setup]
  │
  ├── mulligan loop
  ├── select active
  ├── select bench
  ├── set prizes
  │
  ▼
[draw] ← ─ ─ ─ ─ ─ ─ ─ ┐
  │                       │
  │ draw 1 card           │
  │ (deck-out check)      │
  ▼                       │
[main]                    │
  │                       │
  │ actions in any order  │
  │ (PASS or ATTACK)      │
  ▼                       │
[attack]                  │
  │                       │
  │ resolve attack        │
  │ check KOs             │
  │ award prizes          │
  │ promote if needed     │
  ▼                       │
[checkup]                 │
  │                       │
  │ special conditions    │
  │ between-turn effects  │
  │ check KOs             │
  │                       │
  └── switch activePlayer ┘
         (if not finished)

[finished] ← (any win condition met)
```

---

## Acceptance Criteria

- [ ] `createGame` rejects invalid decks (wrong count, no basics, >4 copies, >1 ACE SPEC, non-Standard cards, Radiant Pokemon)
- [ ] Mulligan loop correctly reshuffles and redraws until Basic found
- [ ] Extra mulligan draws awarded correctly per rulebook
- [ ] First player cannot attack on turn 1
- [ ] First player cannot play Supporter on turn 1
- [ ] Evolution blocked on each player's first turn (P1 can't evolve turn 1, P2 can't evolve turn 2) and on turn Pokemon was played
- [ ] Rare Candy allows Basic → Stage 2 evolution (skipping Stage 1) while respecting all other evolution restrictions
- [ ] Retreat preserves all damage counters and attached cards on the retreating Pokemon
- [ ] Energy attachment limited to once per turn
- [ ] Supporter limited to once per turn
- [ ] Stadium replaces existing and blocked if same name
- [ ] Retreat blocked when Asleep or Paralyzed
- [ ] All 3 win conditions detected correctly
- [ ] Pokemon Checkup processes conditions in correct order (Poison, Burn, Asleep, Paralyzed)
- [ ] KO'd Pokemon + attached cards moved to discard
- [ ] Prize cards awarded match KO'd Pokemon's `prizeValue`
- [ ] Game ends when prizes exhausted, no Pokemon in play, or deck-out
- [ ] Retreat removes all Special Conditions and attack effects from retreating Pokemon
- [ ] Switch effects (e.g. Switch card) also remove Special Conditions from Pokemon moved to bench
- [ ] Evolution removes all Special Conditions and attack effects from evolved Pokemon
- [ ] Paralyzed removed during Checkup only after the Paralyzed Pokemon's owner completes their turn
- [ ] Mulligan extra draws computed as differential between player mulligan counts
- [ ] Deck validation catches ACE SPEC Energy cards (not just ACE SPEC Trainers)
- [ ] `evolvesFrom` matching is exact string equality (regional variants, Trainer's Pokemon are distinct names)
- [ ] Coin flip winner chooses first/second (not auto-assigned)
- [ ] Checkup KOs follow simultaneous-win rules (both Active KO'd during Checkup with no bench = draw)
