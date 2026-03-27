# Game Engine: OVERVIEW

## Purpose

Build a headless Pokemon TCG game engine that can simulate complete matches between two decks. The primary use cases are:

1. **Deck Testing** — Run N simulated games to measure a deck's consistency, opening hand quality, and average prize-card pace
2. **Matchup Analysis** — Pit two decks against each other to estimate win rates and identify favorable/unfavorable matchups
3. **Rule Enforcement** — Validate that plays are legal according to the February 2026 rulebook (Mega Evolution: Ascended Heroes)

The engine is **not** a UI, a multiplayer server, or a competitive AI. It is a deterministic simulation library consumed by other parts of the platform.

---

## Format Restriction: Standard Only

The engine enforces **Standard format** exclusively. Only cards with valid regulation marks are permitted:

| Date Range | Legal Regulation Marks |
|------------|----------------------|
| Until 2026-04-09 | **G, H, I** |
| From 2026-04-10 | **H, I, J** (G rotates out) |

The engine accepts a `formatDate` parameter (defaults to current date) to determine which regulation marks are legal. Deck validation rejects any card whose `regulationMark` is not in the active set. Basic Energy cards are exempt from rotation (always legal).

**Radiant Pokemon** (regulation mark F and earlier) are **not Standard-legal** and are therefore not supported by the engine. They are explicitly excluded from deck validation and card adapter.

---

## Scope

### In Scope (v1)

- **Standard format only** — regulation marks G/H/I (pre-rotation) or H/I/J (post-rotation)
- Complete turn lifecycle: setup, draw, main phase actions, attack, Pokemon Checkup
- All 3 win conditions (prizes, no Pokemon in play, deck-out)
- Mulligan procedure with extra draw tracking
- All 5 Special Conditions (Asleep, Burned, Confused, Paralyzed, Poisoned)
- Damage calculation pipeline (base damage, modifiers, weakness, resistance, effects)
- Energy attachment and cost validation (typed energy + Colorless wildcard)
- Evolution rules (Basic -> Stage 1 -> Stage 2, timing restrictions)
- Retreat mechanics (energy discard cost)
- Trainer card subtypes: Item (unlimited), Supporter (1/turn), Stadium (1/turn, replaces), Pokemon Tool (1 per Pokemon), Technical Machine (attach to Pokemon, grants attack)
- Prize card values: 1 (regular), 2 (ex), 3 (Mega Evolution ex)
- Mega Evolution ex use their printed stage (Basic/Stage1/Stage2), not a special stage — MegaEvolutionEx is a subtype only
- ACE SPEC deck limit (1 per deck, across both Trainer and Special Energy cards)
- Tera Pokemon ex: immune to all attack damage while on Bench (hard-coded rule)
- Coin flip RNG (seeded for reproducibility)
- Event log for every game action (replay, analysis)
- Heuristic AI player for automated simulation
- Simulation runner with aggregate statistics

### Out of Scope (v1)

- Visual UI / game board rendering (future spec)
- Online multiplayer / networking
- Natural language card text parsing (effects are manually mapped)
- Expanded or Unlimited formats
- Radiant Pokemon (not Standard-legal)
- Lost Zone mechanics (defer to v2)
- V-UNION mechanics (defer to v2)
- Ancient Traits, BREAK Evolution, Restored Pokemon (legacy mechanics, not Standard)
- Prism Star cards (not Standard)
- Pokemon V, VMAX, VSTAR, GX, EX, TAG TEAM (rotated out of Standard — legacy formats only)

---

## Architecture

```
packages/@engine/
├── src/
│   ├── types/              # All type definitions
│   │   ├── card.ts         # Card representations (EngineCard, PokemonCard, TrainerCard, EnergyCard)
│   │   ├── game.ts         # GameState, PlayerState, Zone types
│   │   ├── action.ts       # All legal player actions (discriminated union)
│   │   ├── effect.ts       # Card effect definitions
│   │   └── event.ts        # Game event log entries
│   ├── core/               # Pure game logic
│   │   ├── game.ts         # Game initialization, turn loop, win condition checks
│   │   ├── setup.ts        # Deck shuffle, mulligan, initial hand/prizes/bench
│   │   ├── turn.ts         # Turn phase orchestration
│   │   ├── combat.ts       # Attack resolution, damage pipeline
│   │   ├── conditions.ts   # Special Conditions (apply, check, remove)
│   │   ├── evolution.ts    # Evolution validation and execution
│   │   ├── energy.ts       # Energy attachment, cost checking, retreat cost
│   │   ├── trainer.ts      # Trainer card play validation and resolution
│   │   └── checkup.ts      # Pokemon Checkup (between-turns step)
│   ├── effects/            # Card effect implementations
│   │   ├── registry.ts     # Effect lookup by card ID
│   │   ├── abilities.ts    # Ability effect handlers
│   │   ├── attacks.ts      # Attack effect handlers (beyond base damage)
│   │   └── trainers.ts     # Trainer card effect handlers
│   ├── ai/                 # Heuristic AI
│   │   ├── player.ts       # AI decision engine
│   │   ├── priorities.ts   # Action priority scoring
│   │   └── targeting.ts    # Target selection heuristics
│   ├── simulation/         # Simulation runner
│   │   ├── runner.ts       # Run N games, collect results
│   │   ├── metrics.ts      # Statistical analysis (win rate, consistency, etc.)
│   │   └── opening.ts      # Opening hand analysis
│   ├── adapter.ts          # Transform SQLite card rows -> EngineCard definitions
│   ├── rng.ts              # Seeded PRNG (coin flips, shuffles)
│   └── index.ts            # Public API surface
├── __tests__/
│   ├── core/
│   ├── effects/
│   ├── ai/
│   └── simulation/
├── package.json
└── tsconfig.json
```

### Key Design Principles

1. **Pure functions** — All game logic is `(state, action) => newState`. No mutation, no side effects.
2. **Deterministic** — Seeded PRNG means identical inputs produce identical game replays.
3. **Event-sourced** — Every state transition emits an event. The full game can be reconstructed from the event log.
4. **Zero runtime dependencies** — The engine depends only on `@pokemon/database` (SQLite via `bun:sqlite`) for card definitions. No npm packages.
5. **Typed effects** — Card effects are not parsed from text strings. They are hand-coded as typed functions keyed by card ID in a registry. This is the only viable approach for correctness.

---

## Dependency Graph

```
SPEC_01 (Core Types)
    │
    ├──▶ SPEC_02 (Game Flow)
    │        │
    │        ├──▶ SPEC_03 (Combat)
    │        │        │
    │        │        └──▶ SPEC_04 (Card Effects)
    │        │
    │        └──▶ SPEC_05 (AI Player)  ← needs SPEC_03 + SPEC_04
    │
    └──▶ SPEC_06 (Simulation)  ← needs SPEC_05
```

SPEC_01 is the foundation. SPEC_02 and SPEC_03 build sequentially. SPEC_04 (effects) requires combat to plug into. SPEC_05 (AI) requires all game mechanics. SPEC_06 (simulation) wraps everything.

---

## Package Integration

```json
{
  "name": "@pokemon/engine",
  "version": "0.0.1-alpha.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./simulation": "./src/simulation/runner.ts"
  },
  "dependencies": {
    "@pokemon/database": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5"
  },
  "scripts": {
    "test": "bun test",
    "check-types": "tsc --noEmit"
  }
}
```

The engine is consumed by:
- `apps/rest-api` — expose simulation endpoints (POST /api/simulate)
- `apps/web` — future deck testing UI page
- CLI scripts — batch simulation runs

---

## Rulebook Authority

All game mechanics are derived from the **Pokemon Trading Card Game: Web Rulebook (February 2026)** located at `assets/asc_rulebook_en.pdf`. Where the spec references a rule, the rulebook page number is cited. Any ambiguity defaults to the rulebook text.

---

## Standard Format Card Pool

The engine loads card definitions from the readonly SQLite database at `database/pokemon-data.sqlite3.db` (accessed via `@pokemon/database` using `bun:sqlite`). Card columns like `attacks`, `abilities`, `weaknesses`, `types`, `subtypes`, and `rules` are stored as stringified JSON and parsed by the adapter.

The adapter filters to Standard-legal cards only:

1. `regulation_mark` is in the active legal set (G/H/I or H/I/J based on `formatDate`)
2. `legalities` JSON contains `"standard": "Legal"`
3. Card is NOT a Radiant Pokemon (`subtypes` JSON does not include `"Radiant"`)
4. Basic Energy cards are always legal regardless of regulation mark

Cards that fail these checks are rejected at deck validation time with a clear error indicating the reason (rotated, not standard-legal, or banned subtype).

Current card pool size by regulation mark (from SQLite):
| Mark | Cards |
|------|-------|
| G | ~1,634 |
| H | ~1,283 |
| I | ~1,200 |
| J | ~68 (growing as sets release) |
