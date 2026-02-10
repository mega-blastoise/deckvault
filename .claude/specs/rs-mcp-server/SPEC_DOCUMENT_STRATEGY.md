# Pokemon MCP Server — Spec Document Strategy

## Document Inventory

| Document | Status | Purpose |
|----------|--------|---------|
| OVERVIEW.md | ✅ Written | System architecture, goals, success criteria |
| SPEC_DOCUMENT_STRATEGY.md | ✅ This file | Phase plan, dependency graph, risks |
| SPEC_01.md | ✅ Written | Phase 1: Transport & Protocol |
| SPEC_02.md | ✅ Written | Phase 2: Tool/Resource Registry |
| SPEC_03.md | ✅ Written | Phase 3: Pokemon Domain Logic |
| SPEC_04.md | ✅ Written | Phase 4: SSE Transport |

## Dependency Graph

```
SPEC_01: Transport & Protocol
    │
    │  (SPEC_02 depends on SPEC_01 — needs JSON-RPC types to define tool execution)
    ▼
SPEC_02: Tool/Resource Registry
    │
    │  (SPEC_03 depends on SPEC_02 — implements the Tool trait defined in SPEC_02)
    ▼
SPEC_03: Pokemon Domain Logic
    │
    │  (SPEC_04 depends on SPEC_01 + SPEC_03 — needs protocol + working tools)
    ▼
SPEC_04: SSE Transport
```

All phases are **strictly sequential**. Each phase produces a working, testable binary.
No phase requires backtracking to modify prior phases (additive only).

## Phase Plan

### Phase 1: Transport & Protocol

**Focus**: JSON-RPC 2.0 types, serde, stdin/stdout I/O
**Estimated scope**: ~400 lines of Rust
**Deliverable**: Binary that reads JSON-RPC from stdin, routes `initialize` + `ping`, writes response to stdout

```
Rust Concepts Unlocked:
├── struct / enum with named fields
├── #[derive(Serialize, Deserialize, Debug, Clone)]
├── #[serde(untagged)], #[serde(rename_all = "camelCase")]
├── Option<T>, Result<T, E>
├── match expressions on enums
├── tokio::io::{AsyncBufReadExt, AsyncWriteExt}
├── String vs &str (function signatures)
└── Module system (mod.rs, pub use)
```

### Phase 2: Tool/Resource Registry

**Focus**: Traits, dynamic dispatch, registry pattern
**Estimated scope**: ~300 lines of Rust (additive)
**Deliverable**: `tools/list` returns tool metadata; `tools/call` dispatches to stub tools

```
Rust Concepts Unlocked:
├── trait definition with default methods
├── async_trait macro
├── Box<dyn Tool + Send + Sync>
├── HashMap<String, Box<dyn Tool>>
├── lifetime annotations ('static bound)
├── impl blocks for structs
├── serde_json::Value for dynamic params
└── From<T> trait implementations
```

### Phase 3: Pokemon Domain Logic

**Focus**: SQLite access, data modeling, JSON-in-TEXT parsing, async HTTP, error handling
**Estimated scope**: ~900 lines of Rust (additive)
**Deliverable**: 6 working tools querying 19,818 cards from SQLite + live pricing from pokemontcg.io API

```
Rust Concepts Unlocked:
├── rusqlite Connection, query_map, params![]
├── Custom FromRow-like trait for SQLite rows
├── JSON-in-TEXT column deserialization (serde_json::from_str on TEXT columns)
├── thiserror derive macros + From<T> for error conversion
├── Iterator chains: .filter().map().collect()
├── Closures as filter predicates
├── Pattern matching on nested Options
├── reqwest::Client for async HTTP (live pricing)
├── Arc<T> for shared database connection
└── String methods (contains, to_lowercase) for search
```

### Phase 4: SSE Transport

**Focus**: HTTP server, async streams, channels, concurrency
**Estimated scope**: ~500 lines of Rust (additive)
**Deliverable**: Full HTTP+SSE MCP transport alongside existing stdio

```
Rust Concepts Unlocked:
├── axum Router, handlers, extractors
├── tokio::sync::mpsc channels
├── Sse<impl Stream<Item = ...>>
├── Arc<Mutex<T>> vs Arc<RwLock<T>>
├── Tower middleware / layers
├── Graceful shutdown (tokio::signal)
├── Multiple async tasks (tokio::spawn)
└── Error type unification across boundaries
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| serde struggles with MCP's loosely-typed params | Medium | Medium | Use `serde_json::Value` as escape hatch; add targeted `#[serde(untagged)]` |
| `async_trait` lifetime complexity in Tool registry | Medium | Low | Start with `'static` bound on all tools; tools own their data |
| SQLite TEXT columns contain malformed JSON | Low | Medium | Wrap `serde_json::from_str` in fallback that returns `None`; log warnings |
| pokemontcg.io API rate limits pricing requests | Medium | Low | Cache responses; timeout after 5s; return "pricing unavailable" gracefully |
| MCP protocol evolves after spec is written | Low | Medium | Implement core spec (2024-11-05); ignore experimental features |
| axum version conflicts with tokio | Low | Low | Pin versions; axum 0.8 uses tokio 1.x (same as existing) |
| rusqlite `bundled` feature increases compile time | Low | Low | Accept it; bundled avoids system libsqlite3 version mismatches |

## Build Order Verification

After each phase, verify the binary works:

```bash
# Phase 1 — Does it speak JSON-RPC?
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null

# Phase 2 — Does it list tools?
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null

# Phase 3 — Does it query cards?
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_cards","arguments":{"query":"charizard"}},"id":2}\n' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null

# Phase 4 — Does SSE work?
DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
  cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport sse &
curl -N http://localhost:3001/sse
# In another terminal:
curl -X POST http://localhost:3001/message -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Scope Boundaries

### In Scope

- JSON-RPC 2.0 protocol (request, response, notification, batch)
- MCP methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`
- Stdio and SSE transports
- Read-only Pokemon TCG data tools backed by SQLite
- Live pricing via `api.pokemontcg.io/v2/cards/{id}` HTTP API
- Database replicated from `database/pokemon-data.sqlite3.db` → `apps/mcp-server/database/`

### Out of Scope

- MCP `sampling` capability (LLM invocation from server)
- MCP `prompts` capability (prompt templates)
- Write operations (no card creation/mutation)
- PostgreSQL / Neo4j connectivity
- Authentication / authorization
- Docker containerization (can be added later, trivially)
- CI/CD pipeline configuration
