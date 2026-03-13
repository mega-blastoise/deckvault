# Phase 1 Roadmap: MCP Server Completion + Deck Stability

## Overview

Phase 1 has two workstreams:

1. **MCP Server Completion** — finish the Pokemon TCG MCP server (currently on branch `specs___rs/mcp-server`) so it passes all acceptance criteria across all 4 phases, then merge.
2. **Deck Stability** — fix type bugs, migrate deck storage from localStorage to a persistent SQLite API, and do a full QA pass on all deck functionality.

---

## Workstream 1: MCP Server Completion

### Current State

All four phases of the MCP server spec have been partially or fully implemented in `apps/mcp-server/`. The crate builds (`cargo build` succeeds). The remaining issues are:

| Gap | Detail |
|-----|--------|
| SSE transport not wired | `main.rs` parses `--transport` arg but always calls `transport::stdio::run_stdio()`, never routing to `run_sse()` |
| 21 compiler warnings | `cargo clippy -- -D warnings` would fail; unused functions in `server_sent_events.rs` because transport routing is broken |
| No test suite | Acceptance criteria across all 4 specs include `cargo test` passing — no test files written yet |
| No MCP config | `.claude/settings.json` does not have the `mcpServers.pokemon-tcg` entry |

### Tasks

#### 1.1 — Wire SSE Transport in `main.rs`

`main.rs` line 64 hardcodes `transport::stdio::run_stdio(registry).await`. Replace with the conditional routing the spec defines:

```rust
match transport.as_str() {
    "stdio" => transport::stdio::run_stdio(registry).await,
    "sse" => {
        let port: u16 = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3001);
        transport::sse::run_sse(registry, port).await
    }
    other => anyhow::bail!("Unknown transport: {other}. Use 'stdio' or 'sse'."),
}
```

Note: the `sse.rs` file is named `server_sent_events.rs` in the repo — the transport module's `mod.rs` must expose it as `pub mod server_sent_events` and the import in `main.rs` must match.

#### 1.2 — Fix All Clippy Warnings

Run `cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings` and fix each warning to zero. The bulk of warnings come from:
- Dead code in `server_sent_events.rs` (because transport was never routed)
- `unused import` and `unused variable` warnings scattered across tool files

This gate must pass before merge.

#### 1.3 — Write Test Suite

Create `apps/mcp-server/tests/` with at minimum:

**`protocol_tests.rs`** — JSON-RPC serialization round-trips:
- `RequestId::String` and `RequestId::Number` round-trip
- `JsonRpcRequest` with and without `id` (notification vs call)
- `JsonRpcResponse` and `JsonRpcError` serialize correctly
- `InitializeResult` serializes with correct camelCase field names (`protocolVersion`, `serverInfo`)

**`tool_tests.rs`** — Tool registry behavior:
- Registering a tool makes it appear in `list_tools()`
- Calling a registered tool dispatches to its `execute()` method
- Calling an unknown tool returns `ToolError::ExecutionFailed`

**`integration_tests.rs`** — End-to-end via stdio:
- `initialize` request returns `protocolVersion: "2024-11-05"`
- `ping` returns `{}`
- `tools/list` returns array with all 6 Pokemon tools
- `tools/call` with `search_cards` returns card data from SQLite
- Unknown method returns `error.code: -32601`
- Malformed JSON returns `error.code: -32700`
- Notification (no `id`) produces no response

#### 1.4 — Verify All Spec Acceptance Criteria

Run through each checklist in SPEC_01–SPEC_04 and mark completed. Specifically verify:

**SPEC-01 (Transport & Protocol):**
- [ ] `initialize` returns valid `InitializeResult`
- [ ] `ping` returns `{}`
- [ ] Unknown method → `-32601`
- [ ] Malformed JSON → `-32700`
- [ ] Notification produces no stdout output
- [ ] EOF on stdin exits cleanly

**SPEC-02 (Tool Registry):**
- [ ] `tools/list` returns all tools with `name`, `description`, `inputSchema`
- [ ] `tools/call` dispatches correctly
- [ ] Unknown tool → `isError: true` in `CallToolResult` (not a JSON-RPC error)

**SPEC-03 (Domain Logic):**
- [ ] `search_cards` returns matching cards from SQLite
- [ ] `get_card_by_id` returns correct card or not-found error
- [ ] `list_sets` returns all sets
- [ ] `get_set_cards` returns cards for a given set ID
- [ ] `compare_cards` returns side-by-side comparison
- [ ] `get_price_info` returns pricing URLs / data
- [ ] Card count correct (19,818 cards, 170 sets)

**SPEC-04 (SSE Transport):**
- [ ] `--transport stdio` works exactly as before (no regression)
- [ ] `--transport sse` starts HTTP server (default port 3001)
- [ ] `GET /sse` returns SSE stream with `endpoint` event
- [ ] `POST /message?sessionId=<id>` returns 202 and SSE event
- [ ] Invalid session → 404
- [ ] Multiple concurrent clients get isolated responses
- [ ] Clean shutdown on SIGINT/SIGTERM

#### 1.5 — Add MCP Config to `.claude/settings.json`

Add the Pokemon TCG MCP server entry so Claude Code can use it:

```json
{
  "mcpServers": {
    "pokemon-tcg": {
      "command": "cargo",
      "args": [
        "run",
        "--manifest-path",
        "apps/mcp-server/Cargo.toml",
        "--",
        "--transport",
        "stdio"
      ],
      "env": {
        "DATABASE_PATH": "./apps/mcp-server/database/pokemon-data.sqlite3.db"
      }
    }
  }
}
```

### Definition of Done (MCP Server)

- `cargo build --manifest-path apps/mcp-server/Cargo.toml` — 0 errors, 0 warnings
- `cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings` — 0 warnings
- `cargo test --manifest-path apps/mcp-server/Cargo.toml` — all tests pass
- `cargo build --release --manifest-path apps/mcp-server/Cargo.toml` — succeeds, binary < 20MB
- No `unwrap()` in non-test code
- No `unsafe` blocks
- All SPEC-01–04 acceptance criteria checked
- `.claude/settings.json` has `mcpServers.pokemon-tcg` entry
- Branch merged to `main`

---

## Workstream 2: Deck Stability

### 2a: Type Bug Fixes

There is a critical type mismatch between the `DeckCard` type definition and several consumers. The canonical type (`types/deck.ts`) defines:

```ts
interface DeckCard {
  card: {
    name: string;
    id: string;
    supertype: string;
    subtype?: string;
    set: { id: string; name: string };
  };
  quantity: number;
}
```

But multiple files access a flat `.cardId` property that does not exist on this type:

| File | Broken Access | Fix |
|------|--------------|-----|
| `contexts/Deck.tsx` | `c.cardId` in `addCardToDeck`, `removeCardFromDeck`, `setCardQuantityInDeck` | `c.card.id` |
| `hooks/useDeckValidation.ts` | `deckCard.cardId` (5 occurrences) | `deckCard.card.id` |
| `pages/DeckDetailPage.tsx` | `deckCard.cardId` (1 occurrence in card detail lookup) | `deckCard.card.id` |

Additionally, `DeckContext.tsx`'s `addCardToDeck` stores `{ cardId, quantity }` (flat shape) instead of `{ card: { ... }, quantity }` (nested shape). Since `DeckBuilderPage` bypasses `addCardToDeck` and writes the nested shape directly via `createDeck`/`updateDeck`, the context method `addCardToDeck` is writing data in the wrong shape. Either:
- Fix `addCardToDeck` to accept a full card object and write the nested shape, OR
- Remove it entirely (it's not currently called from any page)

**Decision**: Unify on the nested `{ card, quantity }` shape everywhere, matching the type definition. Update `addCardToDeck` signature to accept `card: DeckCard['card']` instead of `cardId: string`.

### 2b: DeckDetailPage Card Data

`DeckDetailPage` uses `useCards(1, 100)` to load card details, then tries to match deck cards by ID. This is broken for two reasons:

1. `useCards(1, 100)` only fetches 100 cards — a deck can contain cards from any of 19,818 cards across 170 sets
2. The card ID lookup uses `.cardId` (flat) instead of `.card.id` (nested) — see 2a above

**Fix approach**: Since the `DeckCard` type already embeds `name`, `supertype`, `subtype`, and `set` info sufficient for display, the detail page should:
- Display card name, supertype, set name from embedded `deck.cards[i].card` directly — no API fetch needed for basic info
- For card images: fetch by card ID from the API only when rendering (can be lazy-loaded per card, or skipped for the list view)
- Remove the `useCards(1, 100)` call from DeckDetailPage entirely
- Add a `useCardById` hook (or similar) for loading the image URL per card if needed

The grouped display (Pokemon / Trainer / Energy) should work off `deckCard.card.supertype` without needing to re-fetch.

### 2c: Deck Persistence — SQLite API

**Goal**: Replace `localStorage` deck storage with a persistent SQLite database exposed over a REST API, backed by a Docker volume.

**Architecture decision**: Extend the existing `apps/rest-api` with deck CRUD endpoints. The rest-api already uses `bun:sqlite`, has the `@pokemon/framework` router pattern, and is already in `docker-compose.yml`. A separate deck API service adds unnecessary complexity.

**New SQLite file**: Deck data uses a *separate* SQLite file from the read-only pokemon card database. The deck database is writable and user-specific. This is important — do not write decks into `pokemon-data.sqlite3.db`.

**Deck database location**: `/data/decks.sqlite3.db` inside the container, mounted from a named Docker volume `deck_data` on the host.

#### Database Schema

```sql
CREATE TABLE IF NOT EXISTS decks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  description TEXT,
  format     TEXT NOT NULL DEFAULT 'standard',
  cards      TEXT NOT NULL DEFAULT '[]',  -- JSON array of DeckCard
  cover_card_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

The `cards` column stores the full `DeckCard[]` as a JSON string. This matches the existing in-memory shape and avoids a card_quantities join table, which adds no value given the small deck sizes (max 60 cards).

#### New REST API Endpoints

Add to `apps/rest-api/src/`:

```
handlers/decks.ts       — CRUD handler functions
services/deckDatabase.ts — Deck-specific DB service
```

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/decks` | List all decks (array, sorted by `updated_at` desc) |
| `GET` | `/api/v1/decks/:id` | Get single deck by ID |
| `POST` | `/api/v1/decks` | Create a new deck |
| `PUT` | `/api/v1/decks/:id` | Update a deck (full replace of mutable fields) |
| `DELETE` | `/api/v1/decks/:id` | Delete a deck |

Request/response shapes match the existing `Deck` type from `types/deck.ts` exactly, so no client-side type changes needed beyond the storage layer.

The deck service initializes the `decks` table on startup (CREATE TABLE IF NOT EXISTS) so no separate migration step is needed.

**CORS**: Update `rest-api/docker-compose.yml` `CORS_ORIGINS` to include the web app origin if not already present.

#### Docker Volume

Update `apps/rest-api/docker-compose.yml`:

```yaml
services:
  rest-api:
    environment:
      - DECK_DATABASE_PATH=/deck-data/decks.sqlite3.db
      # ... existing env vars
    volumes:
      - ../../database:/data:ro          # existing: read-only pokemon cards
      - deck_data:/deck-data             # new: writable deck storage

volumes:
  deck_data:
    labels:
      - "docker.pokemon.workspace.service=rest-api"
```

#### Frontend Changes

Replace the `DeckContext` localStorage implementation with TanStack Query:

**New hooks** in `apps/web/src/web/hooks/`:
- `useDecksQuery.ts` — `useQuery` for `GET /api/v1/decks`
- `useDeckQuery.ts` — `useQuery` for `GET /api/v1/decks/:id`
- `useDeckMutations.ts` — `useMutation` for create, update, delete

**Updated `DeckContext`**: Replace `useLocalStorage<DeckStore>` with the TanStack Query hooks. The context interface (`DeckContextValue`) stays the same — pages don't need to change. Mutations should call `queryClient.invalidateQueries({ queryKey: ['decks'] })` after success.

**Loading state**: Add a `isLoading` field to `DeckContextValue` so pages can show a loading state on initial load.

**Migration**: On first load, if `localStorage` contains decks (key `pokemon-tcg-decks`), migrate them to the API via `POST /api/v1/decks` for each deck, then clear localStorage. This ensures existing data is not lost for users upgrading.

### 2d: Deck Functionality QA

Full QA pass covering all deck-related flows. Each item below is a testable acceptance criterion.

#### Deck List Page (`/decks`)

- [ ] Empty state shows "No decks yet" with Create Deck CTA
- [ ] Decks load from API on mount
- [ ] Each deck card shows: name, format badge, card count, valid/invalid status
- [ ] Format filter buttons (All / Standard / Expanded / Unlimited) filter the list correctly
- [ ] Clicking a deck navigates to Deck Detail
- [ ] Edit button navigates to Deck Builder in edit mode
- [ ] Delete button opens confirmation modal
- [ ] Confirming delete removes the deck from list
- [ ] Cancelling delete modal leaves the deck unchanged
- [ ] "Create New Deck" button navigates to Deck Builder (new deck mode)

#### Deck Builder Page (`/decks/new` and `/decks/:id/edit`)

- [ ] **New deck mode**: Name input empty, format defaults to Standard, deck is empty
- [ ] **Edit mode**: Existing deck's name, format, description, and cards pre-populated
- [ ] Deck name input is required — save button shows alert if empty
- [ ] Card browser: searching by name returns matching cards
- [ ] Card browser: results are debounced (no request per keystroke)
- [ ] "Legal only" toggle filters results to format-legal cards (Standard/Expanded)
- [ ] Clicking a card adds it to the deck panel
- [ ] Card counter increments on add
- [ ] 4-of rule enforced: clicking a card already at 4 copies does nothing
- [ ] Basic Energy is exempt from the 4-of rule
- [ ] Deck panel shows each card with quantity controls (+/-)
- [ ] `-` button decrements quantity; at 1 it removes the card
- [ ] `+` button increments quantity (with 4-of enforcement)
- [ ] Card count display shows `X/60` in header
- [ ] Count turns green when deck reaches exactly 60 cards
- [ ] Validation panel (compact mode) shows errors/warnings in real-time
- [ ] Save persists deck to API (create or update)
- [ ] After save, navigates to Deck Detail page
- [ ] Cancel with no changes navigates away without prompt
- [ ] Cancel with unsaved changes shows confirmation dialog
- [ ] Deck description field is optional and saves correctly

#### Deck Detail Page (`/decks/:id`)

- [ ] Deck not found state shows friendly error with back link
- [ ] Header shows deck name, format badge, `X/60` card count, valid/invalid badge
- [ ] Description shown if present
- [ ] Stats row shows Pokemon / Trainer / Energy / Basic counts
- [ ] Cards grouped by supertype (Pokémon, Trainer, Energy)
- [ ] Each card shows: name, set name, quantity
- [ ] Card image shown if available (lazy loaded)
- [ ] Cards without loadable images still show name + quantity (no blank/broken UI)
- [ ] Validation summary shown for non-valid decks
- [ ] Edit button navigates to Deck Builder in edit mode
- [ ] Delete button opens confirmation modal
- [ ] Confirming delete navigates back to `/decks`

#### Cross-cutting

- [ ] Decks persist across page refresh (API-backed, not localStorage)
- [ ] Decks persist across Docker container restarts (volume-backed SQLite)
- [ ] Multiple browser tabs see consistent deck data (API-backed, no localStorage divergence)
- [ ] All deck routes handle loading state gracefully (no flash of empty content)
- [ ] All deck routes handle API errors gracefully (show error state, not crash)

---

## Docker Self-Contained Orchestration

The full platform should start cleanly with `docker compose up` and require no manual setup steps beyond Docker being installed.

### Audit Checklist

- [ ] `docker compose up` starts all services without errors
- [ ] Web app is accessible at `http://localhost:3000`
- [ ] Rest API is accessible at `http://localhost:3001/health`
- [ ] GraphQL API is accessible (verify port)
- [ ] Deck data persists across `docker compose down && docker compose up`
- [ ] Pokemon card data volume is read-only (rest-api cannot write to it)
- [ ] `docker compose down -v` clears all volumes (destructive — documented)
- [ ] Healthchecks pass for all services before dependents start

### Service Dependency Order

Services that depend on the rest-api must declare `depends_on` with healthcheck condition:

```yaml
depends_on:
  rest-api:
    condition: service_healthy
```

This prevents the web app from starting before the API is ready.

---

## Phase 1 Completion Gates

Phase 1 is complete when all of the following are true:

1. **MCP Server**: `cargo test` passes, `cargo clippy -- -D warnings` is clean, all 4 spec acceptance criteria checked, merged to `main`
2. **Type Bugs**: Zero TypeScript type errors (`bun run check-types`) related to deck types
3. **Deck API**: `GET/POST/PUT/DELETE /api/v1/decks` endpoints implemented and working in the rest-api
4. **Persistence**: Decks survive `docker compose down && docker compose up` (no data loss)
5. **Data Migration**: Existing localStorage decks migrate to API on first load
6. **Deck QA**: All items in section 2d checked
7. **Docker**: `docker compose up` works end-to-end, all healthchecks pass

---

## Implementation Order

```
1. MCP Server fixes (1.1 → 1.2 → 1.3 → 1.4 → 1.5)  ~1 session
2. Deck type fixes (2a)                                ~0.5 session
3. DeckDetailPage card data fix (2b)                   ~0.5 session
4. Deck REST API (2c — backend)                        ~1 session
5. Deck frontend migration (2c — frontend)             ~1 session
6. Docker audit & fixes                                ~0.5 session
7. Deck QA pass (2d)                                   ~1 session
```

Each step is independently testable before moving to the next.
