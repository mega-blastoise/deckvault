# Simulation Platform -- Architecture Overview

## Purpose

Build a competitive-grade deck simulation and analytics platform on the Project Johto website. A Pokemon TCG player uses this to test their deck's consistency, understand matchups against the meta, and validate their list before a tournament.

The Simulation Platform is the primary consumer of the `@pokemon/engine` package (already built). It provides two core experiences:

1. **Simulation Analytics Dashboard** -- run N games, get rich visual analytics
2. **Replay Viewer** -- step through any individual simulated game on a visual board

---

## System Architecture

```txt
                         Browser (React 19)
                         ==================

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐  │
  │  │ DeckInput    │──▶│ SimulationConfig  │──▶│ Web Worker(s)  │  │
  │  │ Panel        │   │ Panel             │   │                │  │
  │  │              │   │ (games, keys,     │   │ SimulationRun- │  │
  │  │ 3 modes:     │   │  format, opponent)│   │ ner from       │  │
  │  │ - Saved deck │   └──────────────────┘   │ @pokemon/engine │  │
  │  │ - PTCGL paste│                           │                │  │
  │  │ - Meta pick  │   postMessage(progress)   │ Card defs pre- │  │
  │  └──────────────┘   ◀──────────────────────│ loaded as JSON  │  │
  │                                             └───────┬────────┘  │
  │        postMessage(SimulationResult)                │           │
  │  ◀──────────────────────────────────────────────────┘           │
  │                                                                 │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                   Results Rendering                       │   │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │   │
  │  │  │Analytics │  │ Matchup  │  │ Replay   │               │   │
  │  │  │Dashboard │  │ Matrix   │  │ Viewer   │               │   │
  │  │  │(SPEC_03) │  │(SPEC_04) │  │(SPEC_05) │               │   │
  │  │  └──────────┘  └──────────┘  └──────────┘               │   │
  │  └──────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────┘
                              │
               fetch card defs│+ set abbreviations + meta decks
                              ▼
                   apps/web Bun Server
                   ==================
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  Bun API Routes                                                 │
  │  ┌──────────────────┐  ┌──────────────────┐                     │
  │  │GET /api/v1/sim/  │  │GET /api/v1/sim/  │                     │
  │  │  card-definitions│  │  meta-decks      │                     │
  │  │                  │  │                  │                     │
  │  │ Reads pokemon-   │  │ Reads decks.     │                     │
  │  │ data.sqlite3.db  │  │ sqlite3.db       │                     │
  │  │ via @engine      │  │ directly         │                     │
  │  │ adapter          │  │                  │                     │
  │  └──────────────────┘  └──────────────────┘                     │
  │                                                                 │
  │  ┌──────────────────┐                                           │
  │  │GET /api/v1/sim/  │                                           │
  │  │  set-abbreviations│                                          │
  │  │                  │                                           │
  │  │ Maps PTCGL set   │                                           │
  │  │ codes (OBF, PAL) │                                           │
  │  │ to set IDs       │                                           │
  │  └──────────────────┘                                           │
  └─────────────────────────────────────────────────────────────────┘
                              │
               Saved decks    │(auth-gated, Mode 1 only)
                              ▼
                    apps/rest-api (Bun)
                    ==================
  ┌─────────────────────────────────────────────────────────────────┐
  │  GET /api/v1/decks       (user's saved decks, PostgreSQL)       │
  │  GET /api/v1/decks/:id   (single deck detail)                   │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Data Stores

| Store | File / Service | Purpose | Accessed By |
|-------|---------------|---------|-------------|
| `pokemon-data.sqlite3.db` | `database/pokemon-data.sqlite3.db` | Readonly card definitions | `apps/web` Bun routes via `@engine` adapter |
| `decks.sqlite3.db` | `database/decks.sqlite3.db` | Meta archetype decklists | `apps/web` Bun routes directly |
| PostgreSQL | `apps/rest-api` | Users, user decks, collections | `apps/rest-api` endpoints |

**Note**: `apps/tcg-api` (Rust) and `apps/graphql-api` are inactive and not referenced by this workstream.

---

## Simulation Execution Model

The engine runs **entirely in-browser via Web Workers**. The engine's game loop is pure TypeScript with no I/O -- all card definitions are pre-fetched server-side and injected.

```txt
Browser                              Bun Server
  │                                      │
  │  1. POST deck card IDs               │
  │─────────────────────────────────────▶│
  │                                      │  resolve via @engine adapter
  │  2. JSON card definitions            │  (bun:sqlite)
  │◀─────────────────────────────────────│
  │                                      │
  │  3. Create Web Worker                │
  │     Pass: definitions + config       │
  │                                      │
  │  4. Worker runs SimulationRunner     │
  │     Posts: progress events           │
  │     (% complete, games done)         │
  │                                      │
  │  5. Worker posts SimulationResult    │
  │                                      │
  │  6. Main thread renders analytics    │
```

For meta matchup matrix: up to **8 parallel Web Workers** (one per matchup). Default single-matchup usage is 1 Worker.

---

## Existing Engine API (already built -- do not re-spec)

Package: `packages/@engine` (`@pokemon/engine`)

| Export | Location | Purpose |
|--------|----------|---------|
| `createGame(config)` | `lib/core/game.ts` | Initialize a game, validate decks |
| `simulateGame(ai1, ai2, config)` | `lib/ai/player.ts` | Run one complete game, return final `GameState` |
| `runSimulation(config)` | `lib/simulation/runner.ts` | Run N games, return `SimulationResult` |
| `runMatchupMatrix(config)` | `lib/simulation/runner.ts` | Run deck vs multiple opponents |
| `loadStandardCardPool(dbPath, date)` | `lib/adapter.ts` | Load card definitions from SQLite |
| `DeckInput` | `lib/simulation/runner.ts` | `{ name, cards: [{ cardId, count }] }` |
| `SimulationConfig` | `lib/simulation/runner.ts` | Full config including games, seed, format date |
| `SimulationResult` | `lib/simulation/runner.ts` | Aggregate results + per-game `GameResult[]` |
| `GameState` | `lib/types/game.ts` | Full game state including `eventLog: GameEvent[]` |
| `GameEvent` | `lib/types/event.ts` | Discriminated union of 30+ event types |

Key constraint: `adapter.ts` uses `bun:sqlite` -- only runs in Bun server or Bun Worker, NOT in browser. Card definitions must be pre-fetched and serialized.

---

## Deck Input Modes

All three coexist in a unified `DeckInputPanel`:

| Mode | Source | Auth Required | Data Store |
|------|--------|---------------|------------|
| Saved Decks | `rest-api` `GET /api/v1/decks` | Yes | PostgreSQL |
| PTCGL Paste | Client-side parser | No | None (inline) |
| Meta Archetype | `apps/web` Bun route | No | `decks.sqlite3.db` |

---

## Component Map

```txt
apps/web/src/web/
├── pages/
│   └── SimulatePage/
│       ├── index.ts
│       ├── SimulatePage.tsx          # Container: route params, state orchestration
│       ├── SimulatePageView.tsx      # View: layout shell
│       └── SimulatePage.css
│
├── workers/
│   └── simulation.worker.ts          # Web Worker: runs SimulationRunner
│
├── components/
│   ├── DeckInputPanel/               # SPEC_01
│   │   ├── index.ts
│   │   ├── DeckInputPanel.tsx        # Container: mode switching, state
│   │   ├── DeckInputPanelView.tsx    # View: tab UI, mode content
│   │   ├── SavedDeckPicker.tsx       # Mode 1: fetch from rest-api
│   │   ├── PtcglPasteInput.tsx       # Mode 2: textarea + parser
│   │   ├── MetaDeckPicker.tsx        # Mode 3: archetype grid
│   │   ├── ptcgl-parser.ts           # PTCGL text -> DeckInput converter
│   │   ├── types.ts
│   │   └── DeckInputPanel.css
│   │
│   ├── SimulationConfig/             # SPEC_01
│   │   ├── index.ts
│   │   ├── SimulationConfig.tsx
│   │   ├── SimulationConfigView.tsx
│   │   ├── KeyCardSelector.tsx       # Mark cards for detailed analytics
│   │   ├── types.ts
│   │   └── SimulationConfig.css
│   │
│   ├── SimulationProgress/           # SPEC_02
│   │   ├── index.ts
│   │   ├── SimulationProgress.tsx
│   │   └── SimulationProgress.css
│   │
│   ├── AnalyticsDashboard/           # SPEC_03
│   │   ├── index.ts
│   │   ├── AnalyticsDashboard.tsx
│   │   ├── AnalyticsDashboardView.tsx
│   │   ├── WinConditionBreakdown/
│   │   ├── PrizeRaceTimeline/
│   │   ├── OpeningHandQuality/
│   │   ├── KeyCardCurves/
│   │   ├── TrainerUtilization/
│   │   ├── TurnLengthDistribution/
│   │   └── AnalyticsDashboard.css
│   │
│   ├── MatchupMatrix/                # SPEC_04
│   │   ├── index.ts
│   │   ├── MatchupMatrix.tsx
│   │   ├── MatchupMatrixView.tsx
│   │   ├── MatchupCell.tsx
│   │   ├── types.ts
│   │   └── MatchupMatrix.css
│   │
│   └── ReplayViewer/                 # SPEC_05
│       ├── index.ts
│       ├── ReplayViewer.tsx
│       ├── ReplayViewerView.tsx
│       ├── GameBoard/
│       │   ├── index.ts
│       │   ├── GameBoard.tsx
│       │   ├── PokemonSlot.tsx
│       │   ├── ZoneIndicator.tsx
│       │   └── GameBoard.css
│       ├── EventLogPanel/
│       │   ├── index.ts
│       │   ├── EventLogPanel.tsx
│       │   ├── EventRenderer.tsx
│       │   └── EventLogPanel.css
│       ├── ReplayControls/
│       │   ├── index.ts
│       │   ├── ReplayControls.tsx
│       │   └── ReplayControls.css
│       ├── GamePicker.tsx
│       ├── types.ts
│       └── ReplayViewer.css
```

---

## Dependency Graph

```txt
SPEC_01: Deck Input & Simulation Configuration
  (DeckInputPanel, SimulationConfig, /simulate route, PTCGL parser,
   key card marking, decks.sqlite3.db seeding notes, Bun meta-deck routes)
    │
    └──▶ SPEC_02: Simulation Execution Layer
           (simulation.worker.ts, Bun card-def API route,
            progress events, Worker manager hook, caching)
           │
           ├──▶ SPEC_03: Analytics Visualization Suite    ┐
           │    (6 analytics panels, data transforms)      │
           │                                               │ parallel --
           ├──▶ SPEC_04: Meta Matchup Matrix              │ no cross-
           │    (color grid, multi-Worker orchestration)    │ dependencies
           │                                               │
           └──▶ SPEC_05: Replay Viewer                    ┘
                (game board, event log, step controls)
```

SPEC_03, SPEC_04, and SPEC_05 are independent of each other and can be implemented in parallel after SPEC_02.

---

## Existing State Analysis

| Capability | Status | Location | Gap |
|------------|--------|----------|-----|
| Game engine core | Done | `packages/@engine/lib/core/` | None |
| AI player | Done | `packages/@engine/lib/ai/` | None |
| Simulation runner | Done | `packages/@engine/lib/simulation/runner.ts` | None |
| Matchup matrix runner | Done | `packages/@engine/lib/simulation/runner.ts` | None |
| Card adapter (SQLite) | Done | `packages/@engine/lib/adapter.ts` | None |
| Event log types | Done | `packages/@engine/lib/types/event.ts` | None |
| Meta deck seed data | Partial | `database/seeds/data/meta_decks.json` | Only 5 decks; need 8-12 |
| `decks.sqlite3.db` seeded | Missing | `database/decks.sqlite3.db` | Table exists but empty |
| `/simulate` route | Missing | -- | Not registered |
| DeckInputPanel | Missing | -- | No component |
| PTCGL parser | Missing | -- | No parser |
| Set abbreviation API | Missing | -- | No route |
| Web Worker integration | Missing | -- | No `workers/` directory |
| Analytics panels | Missing | -- | No components |
| Matchup matrix UI | Missing | -- | No component |
| Replay viewer | Missing | -- | No component |

---

## Technology Stack

| Tool | Version | Purpose |
|------|---------|---------|
| React | 19.2 | UI framework (SSR + hydration) |
| TypeScript | 5.5 | Type-safe implementation |
| Bun | 1.3.5 | Server runtime, bundler, test runner |
| React Router | 7 | Client-side routing (`/simulate`) |
| `@pokemon/engine` | 0.0.1-alpha.1 | Game simulation (Web Worker) |
| Canvas API | native | Chart rendering (analytics panels) |
| Web Workers API | native | Off-main-thread simulation |
| CSS (vanilla) | -- | Styling with BEM naming |

---

## Design Decisions

### Why Web Workers (not server-side simulation)?

- Engine is pure TypeScript with no I/O in the game loop -- ideal for Workers
- Keeps server stateless and eliminates long-running request timeouts
- Progress events via `postMessage` give real-time UI feedback
- Scales with client hardware (8 parallel Workers for matchup matrix)
- No server cost per simulation -- scales to zero

### Why Canvas for analytics (not SVG or a charting library)?

- Fine-grained control over competitive-oriented visualizations
- No external dependencies (d3, chart.js, recharts all add bundle weight)
- Matches the project's "vanilla over frameworks" philosophy
- Canvas performs better for dense data (1000+ game data points)

### Why pre-fetch card definitions instead of bundling?

- Card pool changes with rotation dates -- cannot be static bundle
- `bun:sqlite` in adapter.ts is server-only (not browser-compatible)
- Definitions are ~200KB JSON for Standard pool -- acceptable fetch cost
- Enables caching on the Bun server route (card pool rarely changes)

---

## Navigation Integration

| Route | Layout | Auth | Purpose |
|-------|--------|------|---------|
| `/simulate` | AppLayout | Optional | Main simulation page |
| `/decks/:deckId` | AppLayout | No | Existing -- gains "Test this deck" CTA |

---

## Success Criteria

### Phase 1 (SPEC_01 + SPEC_02)
- [ ] `/simulate` route renders with functional deck input (all 3 modes)
- [ ] PTCGL paste parser correctly maps `OBF 125` to `sv3-125` for all standard sets
- [ ] Web Worker executes 1000-game simulation and returns `SimulationResult`
- [ ] Progress bar updates during simulation via `postMessage`
- [ ] `decks.sqlite3.db` seeded with meta archetypes accessible via Bun API route

### Phase 2 (SPEC_03 + SPEC_04 + SPEC_05 -- parallel)
- [ ] All 6 analytics panels render from `SimulationResult` data
- [ ] Matchup matrix runs up to 8 parallel Workers with per-matchup progress
- [ ] Replay viewer steps through individual game event logs with visual board
- [ ] `bunx tsc --noEmit` reports 0 errors across all new files
- [ ] `bun test` passes for PTCGL parser, data transforms, and Worker message protocol
