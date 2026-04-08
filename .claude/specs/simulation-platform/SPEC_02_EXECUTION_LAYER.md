# SPEC_02: Simulation Execution Layer

## Context

This spec bridges the input layer (SPEC_01) and the visualization layer (SPEC_03-05). It implements the Web Worker that runs `@pokemon/engine`'s `SimulationRunner` in the browser, the Bun API route that resolves card definitions from SQLite, the progress reporting protocol, and the React hook that orchestrates everything.

The key architectural decision: simulation runs **client-side in a Web Worker**, not on the server. Card definitions are the only server-fetched data. This keeps the server stateless, eliminates long-running request concerns, and allows real-time progress feedback.

---

## Prerequisites

- SPEC_01 complete (DeckInputPanel provides `ResolvedDeck`, SimulationConfig provides `SimulationUserConfig`)
- `packages/@engine` is complete with `runSimulation`, `simulateGame`, `GameState`, `GameEvent` exports
- `database/pokemon-data.sqlite3.db` contains Standard-legal card data

---

## Requirements

### 1. Bun API Route: Card Definition Resolution

```typescript
// POST /api/v1/sim/card-definitions
// Body: { cardIds: string[], formatDate: string }
// Response: { definitions: Record<string, SerializedCardDefinition> }

// The route:
// 1. Reads the unique cardIds from the request body
// 2. Calls loadStandardCardPool() from @engine adapter with the formatDate
// 3. Filters to only the requested cardIds
// 4. Serializes CardDefinition objects to plain JSON (Map -> Record)
// 5. Returns the definitions
```

The `CardDefinition` type from the engine uses discriminated unions and readonly arrays. The serialized form must preserve all fields but convert to JSON-safe types (no `Map`, no `Set`, no `Date`).

```typescript
interface SerializedCardDefinition {
  readonly id: string;
  readonly name: string;
  readonly supertype: 'Pokemon' | 'Trainer' | 'Energy';
  // All other fields from CardDefinition, JSON-safe
  // Attacks, abilities, weaknesses, etc.
}
```

Response must include a 400 error with specific messages if:
- Any `cardId` is not found in the card pool
- Any card is not Standard-legal for the given `formatDate`
- Request body is malformed

Cache the full Standard card pool in memory on the Bun server (keyed by formatDate). The pool changes only on rotation date boundaries (2026-04-10).

### 2. Web Worker: simulation.worker.ts

```typescript
// apps/web/src/workers/simulation.worker.ts

// Message protocol (main thread -> worker):
interface WorkerInMessage {
  readonly type: 'RUN_SIMULATION';
  readonly config: WorkerSimulationConfig;
}

interface WorkerSimulationConfig {
  readonly deck1: { name: string; cards: ReadonlyArray<{ cardId: string; count: number }> };
  readonly deck2: { name: string; cards: ReadonlyArray<{ cardId: string; count: number }> };
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly games: number;
  readonly maxTurnsPerGame: number;
  readonly seed: number;
  readonly formatDate: string;
  readonly captureReplays: boolean;       // if true, store full event logs for replay
  readonly replayGameIndices?: number[];  // specific games to capture (default: first 50)
}

// Message protocol (worker -> main thread):
type WorkerOutMessage =
  | { readonly type: 'PROGRESS'; readonly gamesCompleted: number; readonly totalGames: number; readonly percent: number }
  | { readonly type: 'COMPLETE'; readonly result: SerializedSimulationResult }
  | { readonly type: 'ERROR'; readonly message: string; readonly stack?: string };
```

The Worker:
1. Receives `RUN_SIMULATION` message
2. Reconstructs `CardDefinition` map from the serialized definitions
3. Runs games one at a time (cannot use `runSimulation` directly because it calls `loadStandardCardPool` which uses `bun:sqlite`)
4. Instead, implements a custom loop: calls `createGame` + `simulateGame` per game, collecting `GameResult` entries
5. Posts `PROGRESS` every 10 games (or every 1% for large runs, whichever is more frequent)
6. For games in `replayGameIndices`, captures the full `eventLog` from `GameState`
7. Aggregates results using the engine's `computeDeckStats` function
8. Posts `COMPLETE` with the full result

**Critical**: The Worker cannot import `loadStandardCardPool` or any `bun:sqlite` code. It receives pre-resolved definitions. The Worker must construct the `definitionRegistry` (a `Map<string, CardDefinition>`) from the serialized JSON.

```typescript
// Inside the worker, reconstruct the definition map:
function deserializeDefinitions(
  defs: Record<string, SerializedCardDefinition>
): ReadonlyMap<string, CardDefinition> {
  return new Map(Object.entries(defs).map(([id, def]) => [id, def as CardDefinition]));
}
```

### 3. Replay Data Capture

For the Replay Viewer (SPEC_05), the Worker must capture full event logs for selected games. By default, capture the first 50 games (or all games if total < 50). The event log is the `eventLog` array from `GameState`.

```typescript
interface CapturedReplay {
  readonly gameIndex: number;
  readonly seed: number;
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw';
  readonly winReason: WinReason;
  readonly totalTurns: number;
}

// Included in the complete result:
interface SerializedSimulationResult {
  // ... same fields as SimulationResult ...
  readonly capturedReplays: ReadonlyArray<CapturedReplay>;
}
```

Event logs can be large (500-2000 events per game). For 50 captured replays, this is ~1-5MB of JSON. The Worker posts the full result; the main thread holds it in memory.

### 4. useSimulation Hook

```typescript
// apps/web/src/web/hooks/useSimulation.ts

interface UseSimulationOptions {
  readonly onProgress?: (percent: number, gamesCompleted: number) => void;
  readonly onComplete?: (result: SerializedSimulationResult) => void;
  readonly onError?: (error: string) => void;
}

interface UseSimulationReturn {
  readonly run: (
    deck1: ResolvedDeck,
    deck2: ResolvedDeck,
    config: SimulationUserConfig
  ) => Promise<void>;
  readonly cancel: () => void;
  readonly status: 'idle' | 'resolving' | 'running' | 'complete' | 'error';
  readonly progress: number;                    // 0-100
  readonly gamesCompleted: number;
  readonly result: SerializedSimulationResult | null;
  readonly error: string | null;
}

function useSimulation(options?: UseSimulationOptions): UseSimulationReturn;
```

The hook:
1. On `run()`: sets status to `resolving`, fetches card definitions from `POST /api/v1/sim/card-definitions`
2. On definitions received: creates a `Worker` from `simulation.worker.ts`, posts `RUN_SIMULATION`, sets status to `running`
3. On `PROGRESS` messages: updates `progress` and `gamesCompleted`
4. On `COMPLETE`: sets `result`, status to `complete`, terminates the Worker
5. On `ERROR`: sets `error`, status to `error`, terminates the Worker
6. On `cancel()`: terminates the Worker, sets status to `idle`
7. Cleanup: terminates the Worker on unmount

### 5. SimulationProgress Component

```typescript
// apps/web/src/web/components/SimulationProgress/SimulationProgress.tsx

interface SimulationProgressProps {
  readonly status: 'resolving' | 'running';
  readonly progress: number;             // 0-100
  readonly gamesCompleted: number;
  readonly totalGames: number;
  readonly onCancel: () => void;
}
```

Visual:
- During `resolving`: "Loading card data..." with indeterminate progress bar
- During `running`: determinate progress bar with `gamesCompleted / totalGames` label and percentage
- Cancel button always visible

**BEM class prefix**: `.sim-progress`

### 6. Definition Caching Strategy

Card definitions rarely change. Cache at two levels:

**Server-side** (Bun route): In-memory `Map<string, Map<string, CardDefinition>>` keyed by formatDate string. The full Standard pool is loaded once per unique formatDate and reused for all requests.

**Client-side** (browser): Cache definitions in `sessionStorage` keyed by `sim-defs-${formatDate}`. On subsequent simulations with the same format date, skip the fetch. Max cache size: 1 entry (evict old dates). Definitions are ~200KB JSON for the full Standard pool.

```typescript
// In useSimulation hook:
async function resolveDefinitions(
  cardIds: ReadonlyArray<string>,
  formatDate: string
): Promise<Record<string, SerializedCardDefinition>> {
  const cacheKey = `sim-defs-${formatDate}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const allDefs = JSON.parse(cached) as Record<string, SerializedCardDefinition>;
    // Verify all requested cardIds are present
    const missing = cardIds.filter(id => !(id in allDefs));
    if (missing.length === 0) return allDefs;
  }

  // Fetch from server — request the full pool (not just needed cards)
  // to benefit from caching for future simulations
  const response = await fetch('/api/v1/sim/card-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardIds: [], formatDate, fullPool: true })
  });

  const data = await response.json();
  sessionStorage.setItem(cacheKey, JSON.stringify(data.definitions));
  return data.definitions;
}
```

### 7. Worker Bundling

The Web Worker must be bundled separately from the main app bundle. Configure Webpack to recognize `simulation.worker.ts`:

```typescript
// Worker instantiation in useSimulation:
const worker = new Worker(
  new URL('../workers/simulation.worker.ts', import.meta.url)
);
```

This uses the standard `new URL(..., import.meta.url)` pattern that Webpack 5 recognizes for Worker entry points. No additional loader configuration needed.

### 8. Error Handling

| Error Scenario | Source | Handling |
|---------------|--------|----------|
| Card ID not in pool | Bun API route | 400 response with list of invalid IDs |
| Card not Standard-legal | Bun API route | 400 response with card name + reason |
| Worker crash | Web Worker | `onerror` handler -> status `error` |
| Worker timeout | Main thread | No automatic timeout; user can cancel |
| Network failure | fetch | Catch in hook, display error message |
| Invalid deck (< 60 cards) | Engine validation | Worker posts ERROR with validation message |

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/web/src/workers/simulation.worker.ts` | Web Worker | New |
| `apps/web/src/web/hooks/useSimulation.ts` | Simulation orchestration hook | New |
| `apps/web/src/web/components/SimulationProgress/index.ts` | Barrel | New |
| `apps/web/src/web/components/SimulationProgress/SimulationProgress.tsx` | Progress UI | New |
| `apps/web/src/web/components/SimulationProgress/SimulationProgress.css` | Styles | New |
| `apps/web/src/server/routes/sim.ts` (or equivalent) | Bun API routes | New |
| `apps/web/src/server/lib/routes.ts` | Register new API patterns | Modify |
| `apps/web/src/web/pages/SimulatePage/SimulatePage.tsx` | Wire useSimulation hook | Modify |

---

## Acceptance Criteria

- [ ] `POST /api/v1/sim/card-definitions` returns valid JSON for a list of Standard-legal card IDs
- [ ] `POST /api/v1/sim/card-definitions` returns 400 with error details for unknown card IDs
- [ ] Card definitions are cached in Bun server memory (second request for same formatDate is < 5ms)
- [ ] `simulation.worker.ts` receives definitions + config and runs simulation entirely in-browser
- [ ] Worker posts `PROGRESS` messages at least every 10 games during a 1000-game run
- [ ] Worker posts `COMPLETE` with a valid `SerializedSimulationResult` including `gameResults` array
- [ ] Worker posts `ERROR` with descriptive message when deck validation fails
- [ ] `capturedReplays` contains event logs for up to 50 games when `captureReplays` is true
- [ ] Each captured replay's `eventLog` contains `GAME_STARTED`, `TURN_STARTED`, and `GAME_OVER` events
- [ ] `useSimulation` hook transitions through statuses: `idle` -> `resolving` -> `running` -> `complete`
- [ ] `useSimulation.cancel()` terminates the Worker and returns to `idle` status
- [ ] SimulationProgress shows indeterminate bar during `resolving` and determinate bar during `running`
- [ ] Cancel button in SimulationProgress calls `cancel()` and returns to input phase
- [ ] Client-side definition cache in `sessionStorage` avoids redundant fetches for same formatDate
- [ ] Worker is properly terminated on hook unmount (no memory leaks)
- [ ] 1000-game simulation completes in under 60 seconds in Chrome/Firefox (client hardware dependent)
- [ ] `bunx tsc --noEmit` reports 0 errors for all new files

---

## Out of Scope

- Multiple parallel Workers (SPEC_04 handles matchup matrix parallelism)
- Analytics rendering (SPEC_03)
- Replay visualization (SPEC_05)
- Server-side simulation fallback
- WebSocket-based progress (postMessage is sufficient for single-tab usage)

---

## Verification

```bash
# Worker file exists
ls apps/web/src/workers/simulation.worker.ts

# Hook exists
ls apps/web/src/web/hooks/useSimulation.ts

# API route responds
curl -s -X POST http://localhost:3000/api/v1/sim/card-definitions \
  -H 'Content-Type: application/json' \
  -d '{"cardIds":["sv3-125"],"formatDate":"2026-04-03"}' | head -c 200

# Type check
cd apps/web && bunx tsc --noEmit

# Build succeeds (Worker bundled)
cd apps/web && bun run build
```
