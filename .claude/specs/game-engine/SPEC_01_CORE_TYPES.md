# SPEC_01: Core Types

## Context

Every module in the engine operates on a shared type system. This spec defines the foundational types: card representations, game state, player state, zones, actions, and events. All subsequent specs depend on these types.

---

## Prerequisites

None — this is the root spec.

---

## Requirements

### 1. Energy Types

11 energy types matching the TCG (rulebook p.4), plus a Colorless wildcard:

```typescript
// src/types/card.ts

const ENERGY_TYPES = [
  'Grass', 'Fire', 'Water', 'Lightning', 'Psychic',
  'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'
] as const;

type EnergyType = typeof ENERGY_TYPES[number];
```

### 2. Card Representations

Three card supertypes, each with engine-specific fields derived from (but not identical to) the `@pokemon/data` JSON:

```typescript
// --- Pokemon Card ---

// Standard-legal stages only
// NOTE: Mega Evolution ex cards print a real stage (Basic, Stage 1, or Stage 2).
// MegaEvolutionEx is a subtype, NOT a stage. E.g. Mega Kangaskhan ex is Basic,
// Mega Lucario ex is Stage 1, Mega Gardevoir ex is Stage 2. (Rulebook Appendix 1, p.23)
type PokemonStage = 'Basic' | 'Stage1' | 'Stage2';

// Standard-legal subtypes only
type PokemonSubtype = 'ex' | 'MegaEvolutionEx' | 'Tera' | 'Ancient' | 'Future';

interface AttackDefinition {
  readonly name: string;
  readonly cost: ReadonlyArray<EnergyType>;
  readonly damage: number;                    // base numeric damage (0 if no base)
  readonly damageModifier: '+' | '-' | 'x' | null;  // modifier symbol if any (e.g. "120+" -> 120, '+')
  readonly text: string;                      // raw effect text (for display)
  readonly effectId: string | null;           // key into effect registry, null if vanilla damage
}

interface AbilityDefinition {
  readonly name: string;
  readonly text: string;
  readonly type: 'Ability';                   // Standard-legal cards only use 'Ability'
  readonly effectId: string;                  // key into effect registry
}

interface WeaknessDefinition {
  readonly type: EnergyType;
  readonly value: string;                     // "x2", "+20", etc. — adapter normalizes "×2" (U+00D7) to "x2"
}

interface ResistanceDefinition {
  readonly type: EnergyType;
  readonly value: string;                     // "-20", "-30", etc.
}

interface PokemonCardDefinition {
  readonly cardType: 'Pokemon';
  readonly id: string;                        // e.g. "sv8-4"
  readonly name: string;                      // e.g. "Durant ex"
  readonly stage: PokemonStage;
  readonly subtypes: ReadonlyArray<PokemonSubtype>;
  readonly hp: number;
  readonly types: ReadonlyArray<EnergyType>;  // Pokemon's type(s), usually 1, sometimes 2 (dual-type)
  readonly evolvesFrom: string | null;        // name of pre-evolution
  readonly attacks: ReadonlyArray<AttackDefinition>;
  readonly abilities: ReadonlyArray<AbilityDefinition>;
  readonly weaknesses: ReadonlyArray<WeaknessDefinition>;
  readonly resistances: ReadonlyArray<ResistanceDefinition>;
  readonly retreatCost: number;               // number of Colorless energy
  readonly rules: ReadonlyArray<string>;      // rule box text (e.g. "Pokemon ex rule: ...")
  readonly prizeValue: 1 | 2 | 3;            // 1 = regular, 2 = ex, 3 = Mega Evolution ex
  readonly regulationMark: string | null;
}

// --- Trainer Card ---

type TrainerSubtype = 'Item' | 'Supporter' | 'Stadium' | 'PokemonTool' | 'TechnicalMachine' | 'AceSpec';

// TECHNICAL MACHINE RULES (rulebook glossary p.44):
// Technical Machines (TMs) are a Trainer subtype that attach to a Pokemon like a Tool.
// While attached, the Pokemon gains access to the attack printed on the TM in addition
// to its own attacks. TMs are played like Items (unlimited per turn) but attach rather
// than going to discard. A Pokemon can have at most 1 Tool OR 1 TM attached (they share
// the tool slot).
// IMPORTANT: TMs remain attached unless the card text says otherwise (glossary: "Technical
// Machine cards remain attached unless the card text says otherwise"). Auto-discard after
// use is NOT a universal rule — it is a per-card effect. Most Standard TMs include discard
// text (e.g., "Discard this card at the end of your turn"), but the engine must NOT
// hard-code auto-discard. Each TM's discard behavior is implemented in its effect handler.
// For v1: TMs are recognized in the type system and adapter. Their attack-granting effect
// is implemented per-card in the effect registry. The combat system checks attached TMs
// when enumerating available attacks.

interface TrainerCardDefinition {
  readonly cardType: 'Trainer';
  readonly id: string;
  readonly name: string;
  readonly subtypes: ReadonlyArray<TrainerSubtype>;
  readonly rules: ReadonlyArray<string>;
  readonly effectId: string;                  // key into effect registry
}

// --- Energy Card ---

type EnergySubtype = 'Basic' | 'Special';

interface EnergyCardDefinition {
  readonly cardType: 'Energy';
  readonly id: string;
  readonly name: string;
  readonly subtype: EnergySubtype;
  readonly provides: ReadonlyArray<EnergyType>;  // what energy this provides
  readonly rules: ReadonlyArray<string>;
  readonly effectId: string | null;           // null for basic energy
  readonly isAceSpec: boolean;                // true if this is an ACE SPEC energy (e.g. Neo Upper Energy)
}

// NOTE: ACE SPEC cards can be either Trainer cards or Special Energy cards (rulebook Appendix 3, p.25).
// Deck validation must enforce max 1 ACE SPEC total across both Trainer (subtypes includes 'AceSpec')
// and Energy (isAceSpec === true) cards.

type CardDefinition = PokemonCardDefinition | TrainerCardDefinition | EnergyCardDefinition;
```

### 3. Game Instance Cards

A `CardDefinition` is the template. A `CardInstance` is a specific copy in a game, with a unique instance ID:

```typescript
// src/types/game.ts

interface CardInstance {
  readonly instanceId: string;                // unique per game, e.g. "p1-card-042"
  readonly definitionId: string;              // references CardDefinition.id
  readonly owner: PlayerId;                   // which player owns this card
}

type PlayerId = 'player1' | 'player2';
```

### 4. In-Play Pokemon State

A Pokemon in play has attached cards, damage, and status:

```typescript
interface InPlayPokemon {
  readonly instanceId: string;                // the Pokemon card instance
  readonly evolutionStack: ReadonlyArray<string>;  // instance IDs from Basic up (bottom = Basic)
  readonly attachedEnergy: ReadonlyArray<string>;  // instance IDs of attached energy cards
  readonly attachedTools: ReadonlyArray<string>;   // instance IDs of attached Pokemon Tools (max 1)
  readonly damageCounters: number;            // each counter = 10 HP damage
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;                // turn number when this Pokemon entered play (for evolution timing)
  readonly turnEvolved: number | null;        // turn number when last evolved (null if not evolved)
  readonly isNewThisTurn: boolean;            // true if just played/evolved this turn
}

type SpecialCondition = 'Asleep' | 'Burned' | 'Confused' | 'Paralyzed' | 'Poisoned';

// SPECIAL CONDITION MUTUAL EXCLUSIVITY (rulebook p.16):
// Asleep, Confused, and Paralyzed are mutually exclusive — they all rotate the card,
// so applying one removes any other of these three. Burned and Poisoned use markers
// and do NOT conflict with each other or the rotation-based conditions.
// A Pokemon can therefore be in at most: 1 of {Asleep, Confused, Paralyzed} + Burned + Poisoned.
//
// The `applySpecialCondition` function MUST enforce this:
//   - If applying Asleep, Confused, or Paralyzed: remove any existing Asleep/Confused/Paralyzed first
//   - If applying Burned: remove any existing Burned (cannot stack, rulebook p.15)
//   - If applying Poisoned: remove any existing Poisoned (cannot stack, rulebook p.16)
//
// REMOVAL ON ZONE CHANGE (rulebook p.15-16):
// When a Pokemon moves to the Bench (retreat, Switch, or any other effect), ALL Special Conditions
// and attack effects on it are removed. When a Pokemon evolves, ALL Special Conditions are removed.
```

### 5. Player State

```typescript
interface PlayerState {
  readonly id: PlayerId;
  readonly deck: ReadonlyArray<string>;       // instance IDs, top of deck = index 0
  readonly hand: ReadonlyArray<string>;       // instance IDs
  readonly prizes: ReadonlyArray<string>;     // instance IDs, face down
  readonly active: InPlayPokemon | null;      // null only during setup
  readonly bench: ReadonlyArray<InPlayPokemon>;  // max 5
  readonly discard: ReadonlyArray<string>;    // instance IDs
  readonly lostZone: ReadonlyArray<string>;   // instance IDs (v2, included in type for forward compat)
  readonly supporterPlayedThisTurn: boolean;
  readonly stadiumPlayedThisTurn: boolean;
  readonly energyAttachedThisTurn: boolean;
  readonly retreatedThisTurn: boolean;
}
```

### 6. Game State

```typescript
type GamePhase =
  | 'setup'              // initial setup (mulligan, place active/bench, set prizes)
  | 'draw'               // mandatory draw at start of turn
  | 'main'               // main phase (play cards, evolve, attach energy, retreat, abilities)
  | 'attack'             // attack declaration and resolution
  | 'checkup'            // Pokemon Checkup (between turns)
  | 'finished';          // game over

// Stadium is a shared zone — only one can be in play at a time (rulebook p.12).
// Tracked on GameState (not PlayerState) with a playedBy field for ownership.
interface StadiumState {
  readonly cardInstanceId: string;            // instance ID of the stadium card
  readonly playedBy: PlayerId;                // which player played this stadium
}

interface GameState {
  readonly players: Record<PlayerId, PlayerState>;
  readonly activePlayer: PlayerId;
  readonly startingPlayer: PlayerId;          // who won the coin flip and chose to go first
  readonly turnNumber: number;                // increments each time activePlayer changes
  readonly phase: GamePhase;
  readonly stadium: StadiumState | null;      // shared zone — at most 1 stadium in play
  readonly cardRegistry: ReadonlyMap<string, CardInstance>;      // instanceId -> CardInstance
  readonly definitionRegistry: ReadonlyMap<string, CardDefinition>;  // definitionId -> CardDefinition
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw' | null;
  readonly rngState: RngState;                // seeded PRNG state
  readonly turnFlags: TurnFlags;              // per-turn ephemeral state
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;  // persistent effects (defined in SPEC_04)
}

interface TurnFlags {
  readonly attackUsed: boolean;
  // First-turn restrictions (rulebook p.12-13):
  // The starting player cannot attack or play a Supporter on their first turn.
  // The second player has NO restrictions on their first turn.
  // Computed as: activePlayer === startingPlayer && turnNumber === 1
  readonly isStartingPlayerFirstTurn: boolean;
}
```

### 7. Player Actions

All legal actions a player can take, as a discriminated union:

```typescript
// src/types/action.ts

type PlayerAction =
  | { readonly type: 'DRAW_CARD' }
  | { readonly type: 'PLAY_BASIC_TO_BENCH'; readonly cardInstanceId: string }
  | { readonly type: 'EVOLVE_POKEMON'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'ATTACH_ENERGY'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'PLAY_TRAINER'; readonly cardInstanceId: string; readonly targets?: ReadonlyArray<string> }
  | { readonly type: 'USE_ABILITY'; readonly pokemonInstanceId: string; readonly abilityIndex: number }
  | { readonly type: 'RETREAT'; readonly newActiveInstanceId: string; readonly energyToDiscard: ReadonlyArray<string> }
  | { readonly type: 'ATTACK'; readonly attackIndex: number }
  | { readonly type: 'PASS' }                // end main phase without attacking
  | { readonly type: 'SELECT_ACTIVE'; readonly cardInstanceId: string }        // during setup or after KO
  | { readonly type: 'SELECT_BENCH'; readonly cardInstanceIds: ReadonlyArray<string> }  // during setup
  | { readonly type: 'MULLIGAN_REDRAW' }
  | { readonly type: 'COIN_FLIP_CHOICE'; readonly choice: 'first' | 'second' } // winner of setup coin flip DECIDES who goes first (rulebook p.8)
  | { readonly type: 'ATTACH_TOOL'; readonly cardInstanceId: string; readonly targetInstanceId: string } // attach Pokemon Tool or Technical Machine
```

### 8. Game Events

Events emitted for every state transition:

```typescript
// src/types/event.ts

type GameEvent =
  | { readonly type: 'GAME_STARTED'; readonly seed: number }
  | { readonly type: 'COIN_FLIPPED'; readonly result: 'heads' | 'tails'; readonly reason: string }
  | { readonly type: 'CARD_DRAWN'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'BASIC_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string; readonly zone: 'active' | 'bench' }
  | { readonly type: 'POKEMON_EVOLVED'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly evolutionInstanceId: string }
  | { readonly type: 'ENERGY_ATTACHED'; readonly player: PlayerId; readonly energyInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'TOOL_ATTACHED'; readonly player: PlayerId; readonly toolInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'TRAINER_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'ABILITY_USED'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly abilityName: string }
  | { readonly type: 'ATTACK_DECLARED'; readonly player: PlayerId; readonly attackName: string; readonly attackerInstanceId: string }
  | { readonly type: 'DAMAGE_DEALT'; readonly targetInstanceId: string; readonly amount: number; readonly source: string }
  | { readonly type: 'DAMAGE_COUNTERS_PLACED'; readonly targetInstanceId: string; readonly counters: number; readonly source: string }  // direct counter placement — bypasses damage pipeline (Poison, Burn, Confusion self-hit, "place N damage counters" attacks)
  | { readonly type: 'DAMAGE_HEALED'; readonly targetInstanceId: string; readonly amount: number }
  | { readonly type: 'POKEMON_KNOCKED_OUT'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly prizesAwarded: number }
  | { readonly type: 'PRIZE_TAKEN'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'SPECIAL_CONDITION_APPLIED'; readonly pokemonInstanceId: string; readonly condition: SpecialCondition }
  | { readonly type: 'SPECIAL_CONDITION_REMOVED'; readonly pokemonInstanceId: string; readonly condition: SpecialCondition }
  | { readonly type: 'RETREATED'; readonly player: PlayerId; readonly oldActiveId: string; readonly newActiveId: string }
  | { readonly type: 'STADIUM_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'STADIUM_DISCARDED'; readonly cardInstanceId: string }
  | { readonly type: 'CARD_DISCARDED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'DECK_SHUFFLED'; readonly player: PlayerId }
  | { readonly type: 'CARD_SEARCHED'; readonly player: PlayerId; readonly cardInstanceId: string; readonly from: 'deck' | 'discard' }
  | { readonly type: 'CARD_MOVED'; readonly cardInstanceId: string; readonly from: string; readonly to: string }
  | { readonly type: 'MULLIGAN'; readonly player: PlayerId; readonly mulliganCount: number }
  | { readonly type: 'TURN_STARTED'; readonly player: PlayerId; readonly turnNumber: number }
  | { readonly type: 'TURN_ENDED'; readonly player: PlayerId }
  | { readonly type: 'CHECKUP_COMPLETED' }
  | { readonly type: 'GAME_OVER'; readonly winner: PlayerId | 'draw'; readonly reason: WinReason };

type WinReason = 'all_prizes_taken' | 'no_pokemon_in_play' | 'deck_out' | 'tiebreaker';
```

### 9. Seeded RNG

```typescript
// src/rng.ts

interface RngState {
  readonly seed: number;
  readonly counter: number;
}

// Pure: returns new state + result
function coinFlip(state: RngState): { result: 'heads' | 'tails'; nextState: RngState };
function shuffle<T>(array: ReadonlyArray<T>, state: RngState): { result: ReadonlyArray<T>; nextState: RngState };
function randomInt(min: number, max: number, state: RngState): { result: number; nextState: RngState };
```

Use a simple xorshift128 or mulberry32 PRNG. No need for crypto-strength randomness.

### 10. Card Adapter

Transform SQLite card rows from `pokemon-data.sqlite3.db` into `CardDefinition`. The card data lives in the readonly SQLite database at `database/pokemon-data.sqlite3.db`, accessed via `@pokemon/database` (`bun:sqlite`). JSON columns (`attacks`, `abilities`, `weaknesses`, `retreat_cost`, `types`, `subtypes`, `rules`) are stored as stringified JSON arrays and must be parsed.

```typescript
// src/adapter.ts

// Raw row shape from SQLite (JSON columns are strings)
interface SqliteCardRow {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;          // "Pokémon" | "Trainer" | "Energy"
  readonly subtypes: string;           // JSON: '["Basic","ex"]'
  readonly hp: number | null;
  readonly types: string;              // JSON: '["Grass"]'
  readonly evolves_from: string | null; // JSON: '[]' or '"Kadabra"' or null
  readonly evolves_to: string | null;
  readonly rules: string | null;       // JSON: '["Pokemon ex rule: ..."]'
  readonly abilities: string | null;   // JSON: '[{"name":"...","text":"...","type":"Ability"}]'
  readonly attacks: string | null;     // JSON: '[{"name":"...","cost":[...],"damage":"120+","text":"..."}]'
  readonly weaknesses: string | null;  // JSON: '[{"type":"Fire","value":"×2"}]'
  readonly retreat_cost: string | null; // JSON: '["Colorless","Colorless"]'
  readonly regulation_mark: string | null;
  readonly set_id: string;
  readonly legalities: string | null;  // JSON: '{"standard":"Legal",...}'
}

function adaptCardRow(row: SqliteCardRow): CardDefinition;
function adaptPokemonRow(row: SqliteCardRow): PokemonCardDefinition;
function adaptTrainerRow(row: SqliteCardRow): TrainerCardDefinition;
function adaptEnergyRow(row: SqliteCardRow): EnergyCardDefinition;

// Standard format filter
interface FormatConfig {
  readonly formatDate: Date;  // determines which regulation marks are legal
}

const ROTATION_DATE = new Date('2026-04-10');
const PRE_ROTATION_MARKS = ['G', 'H', 'I'] as const;
const POST_ROTATION_MARKS = ['H', 'I', 'J'] as const;

function getLegalRegulationMarks(formatDate: Date): ReadonlyArray<string>;
function isStandardLegal(row: SqliteCardRow, formatDate: Date): boolean;

// Loads all Standard-legal cards from SQLite into a definition map
function loadStandardCardPool(
  dbPath: string,
  formatDate: Date
): ReadonlyMap<string, CardDefinition>;

// Prize value derivation (Standard format — only ex and Mega Evolution ex are relevant):
// - subtypes includes 'Mega Evolution' and 'ex' => 3
// - subtypes includes 'ex' => 2
// - otherwise => 1
// (V, VMAX, VSTAR, GX, EX, TAG TEAM are not Standard-legal)

// Weakness value normalization:
// SQLite stores "×2" (U+00D7 multiplication sign). Adapter normalizes to "x2" (ASCII letter x).
// Same for any "×" in resistance values.

// ACE SPEC energy detection:
// Check if the card's `rules` JSON array contains a string matching "ACE SPEC" (case-insensitive).
// If so, set `isAceSpec: true` on the EnergyCardDefinition.

// Damage parsing:
// "120+" => { damage: 120, damageModifier: '+' }
// "30x"  => { damage: 30, damageModifier: 'x' }
// "80-"  => { damage: 80, damageModifier: '-' }
// "50"   => { damage: 50, damageModifier: null }
// ""     => { damage: 0, damageModifier: null }
```

---

## Acceptance Criteria

- [ ] All types compile with `tsc --noEmit` under strict mode
- [ ] `CardDefinition` discriminated union narrows correctly on `cardType`
- [ ] `PlayerAction` discriminated union narrows correctly on `type`
- [ ] `GameEvent` discriminated union narrows correctly on `type`
- [ ] Card adapter transforms SQLite rows for at least 1 Pokemon, 1 Trainer, 1 Energy correctly
- [ ] `isStandardLegal` rejects cards with null/missing regulation marks (except Basic Energy)
- [ ] `isStandardLegal` rejects Radiant Pokemon
- [ ] `getLegalRegulationMarks` returns G/H/I before 2026-04-10, H/I/J on or after
- [ ] `loadStandardCardPool` loads ~4000+ cards from SQLite for current Standard
- [ ] RNG produces deterministic sequences given the same seed
- [ ] All types use `readonly` — no mutable state
- [ ] `applySpecialCondition` enforces mutual exclusivity: Asleep/Confused/Paralyzed replace each other
- [ ] Adapter normalizes "×2" to "x2" in weakness/resistance values
- [ ] Adapter detects ACE SPEC energy cards via rules text
- [ ] Deck validation counts ACE SPEC across both Trainer and Energy cards (max 1 total)
- [ ] `PokemonStage` does not include `MegaEvolutionEx` — Mega Evolution ex uses its printed stage
