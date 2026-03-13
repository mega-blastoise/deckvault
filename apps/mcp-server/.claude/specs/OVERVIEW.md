# Pokemon TCG MCP Server — Architecture Overview

## System Overview

A Model Context Protocol (MCP) server written in Rust that exposes Pokemon TCG data
to AI assistants via JSON-RPC 2.0. Designed as a progressive Rust learning exercise,
building from minimal stdin/stdout transport to a full HTTP+SSE server with concurrent
connections.

```
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Clients                               │
│  (Claude Code, VS Code Copilot, any JSON-RPC 2.0 consumer)       │
└──────────┬──────────────────────────────────┬────────────────────┘
           │ stdin/stdout (Phase 1)           │ HTTP + SSE (Phase 4)
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    pokemon-mcp-server                            │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────────┐ │
│  │  Transport Layer │    │         Protocol Layer              │ │
│  │                  │    │                                     │ │
│  │  ● StdioTransport│───▶│  ● JSON-RPC 2.0 Parser/Serializer   │ │
│  │  ● SseTransport  │    │  ● MCP Method Router                │ │
│  └──────────────────┘    │  ● Request/Response/Notification    │ │
│                          └──────────────┬──────────────────────┘ │
│                                         │                        │
│  ┌──────────────────────────────────────▼──────────────────────┐ │
│  │                    Tool Registry                            │ │
│  │                                                             │ │
│  │  HashMap<String, Box<dyn Tool>>                             │ │
│  │  ● search_cards        ● get_card_by_id                     │ │
│  │  ● list_sets           ● compare_cards                      │ │
│  │  ● get_set_cards       ● get_evolution_chain                │ │
│  └──────────────────────────────────────┬──────────────────────┘ │
│                                         │                        │
│  ┌──────────────────────────────────────▼──────────────────────┐ │
│  │                   Domain Layer                              │ │
│  │                                                             │ │
│  │  ● PokemonCard, Set, Attack, Ability structs                │ │
│  │  ● Database layer (rusqlite, read-only)                     │ │
│  │  ● Query engine (SQL + domain filtering)                    │ │
│  │  ● Error hierarchy (thiserror)                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Data Source                               │ │
│  │                                                             │ │
│  │  apps/mcp-server/database/pokemon-data.sqlite3.db           │ │
│  │  (replicated from database/pokemon-data.sqlite3.db)         │ │
│  │  19,818 cards across 170 sets — read-only access            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Goals

### Primary Objectives

1. Build a working MCP server that Claude Code can connect to for Pokemon TCG queries
2. Progressive Rust learning: each phase introduces new concepts that compound on prior work
3. Ship a real tool — not a toy — that adds value to the existing Pokemon platform

### Learning Objectives by Phase

| Phase | Rust Concepts Introduced |
|-------|--------------------------|
| 1 — Transport & Protocol | serde, enums, structs, `Option`, `Result`, `#[serde(untagged)]`, stdin/stdout async I/O |
| 2 — Tool Registry | traits, `dyn Trait`, `Box`, `HashMap`, dynamic dispatch, lifetimes, `async_trait` |
| 3 — Domain Logic | rusqlite, `FromRow`, iterators, closures, pattern matching, `thiserror`, `From` impl, JSON-in-TEXT column parsing |
| 4 — SSE Transport | axum, tokio channels, `mpsc`, async streams, `Arc`, concurrent connections |

## Current State Analysis

### What Exists

```
apps/
├── tcg-api/                    ✅ Rust GraphQL API (actix-web, sqlx, neo4rs)
│   └── src/
│       ├── database/
│       │   └── postgres/models/
│       │       ├── pokemon_card/  ✅ PokemonCard struct with serde + FromRow
│       │       └── set/           ✅ PokemonCardSet struct
│       └── ...
├── graphql-api/                ✅ TS GraphQL API (uses SQLite DB)
├── rest-api/                   ✅ TS REST API (uses SQLite DB)
├── web/                        ✅ React SSR frontend
├── scripts/                    ✅ Data sync tools
└── distributed-ledger/         🔄 Minimal Rust blockchain

database/
└── pokemon-data.sqlite3.db     ✅ 19,818 cards, 170 sets (canonical source)

packages/
├── @database/
│   └── lib/sqlite.ts           ✅ SQLite schema + query functions (Bun)
├── @pokemon-data/
│   └── data/cards/             ✅ 172 JSON files (raw source data)
└── ...
```

### What Needs Work

1. New `apps/mcp-server/` Rust crate — does not exist yet
2. JSON-RPC 2.0 types (Request, Response, Error, Notification)
3. MCP protocol implementation (initialize, tools/list, tools/call, resources/*)
4. Tool trait and registry system
5. SQLite database layer (rusqlite, read-only access to replicated DB)
6. Domain types with JSON-in-TEXT column deserialization
7. Domain tools (search, filter, compare, evolution chains)
8. SSE transport with axum

## Technology Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | 1.92.0 | Language (matches `.mise.toml`) |
| serde | 1.0 | Serialization/deserialization |
| serde_json | 1.0 | JSON handling |
| rusqlite | 0.32 | SQLite database access (bundled, no system dep) |
| reqwest | 0.12 | HTTP client for live pricing fetches (Phase 3) |
| tokio | 1.42 | Async runtime (matches `tcg-api`) |
| thiserror | 2.0 | Typed error hierarchies |
| axum | 0.8 | HTTP server for SSE transport (Phase 4) |
| tokio-stream | 0.1 | Async stream utilities (Phase 4) |
| tracing | 0.1 | Structured logging |

### Explicitly NOT Using

| Tool | Reason |
|------|--------|
| actix-web | Already used in `tcg-api`; axum teaches different patterns |
| sqlx | Async + compile-time checks are overkill for read-only SQLite; `rusqlite` is simpler |
| async-graphql | MCP uses JSON-RPC, not GraphQL |
| rmcp / mcp-rs | Learning exercise — we build the protocol layer ourselves |

## Component Architecture

```
apps/mcp-server/
├── Cargo.toml
├── src/
│   ├── main.rs                    # Entry point, transport selection
│   ├── protocol/
│   │   ├── mod.rs
│   │   ├── jsonrpc.rs             # JSON-RPC 2.0 types (Request, Response, Error)
│   │   ├── mcp.rs                 # MCP-specific methods and params
│   │   └── handler.rs             # Route JSON-RPC method → handler function
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── stdio.rs               # stdin/stdout transport
│   │   └── sse.rs                 # HTTP + SSE transport (Phase 4)
│   ├── registry/
│   │   ├── mod.rs
│   │   ├── tool.rs                # Tool trait definition
│   │   └── resource.rs            # Resource trait definition
│   ├── tools/
│   │   ├── mod.rs
│   │   ├── search_cards.rs        # Full-text card search
│   │   ├── get_card_by_id.rs      # Lookup by ID
│   │   ├── list_sets.rs           # Browse available sets
│   │   ├── get_set_cards.rs       # Cards within a set
│   │   ├── compare_cards.rs       # Side-by-side comparison
│   │   └── get_price_info.rs      # Live pricing via tcgplayer/cardmarket URLs
│   ├── domain/
│   │   ├── mod.rs
│   │   ├── card.rs                # PokemonCard, Attack, Ability, etc.
│   │   ├── set.rs                 # CardSet
│   │   ├── db.rs                  # Database connection + queries (rusqlite)
│   │   └── error.rs               # Domain error types
│   └── lib.rs                     # Public API for integration tests
└── tests/
    ├── protocol_tests.rs
    ├── tool_tests.rs
    └── integration_tests.rs
```

## Data Flow

### Stdio Transport (Phases 1–3)

```
┌────────┐    JSON-RPC request     ┌──────────────────────┐
│ Client │ ──────────────────────▶ │ stdin (BufReader)     │
│        │    (one line per msg)   │                       │
│        │                         │   parse JSON          │
│        │                         │   ▼                   │
│        │                         │   Router.dispatch()   │
│        │                         │   ▼                   │
│        │                         │   Tool.execute()      │
│        │                         │   ▼                   │
│        │    JSON-RPC response    │   serialize result    │
│        │ ◀────────────────────── │ stdout (write_all)    │
└────────┘                         └──────────────────────┘
```

### SSE Transport (Phase 4)

```
┌────────┐                         ┌──────────────────────┐
│ Client │ ── GET /sse ──────────▶ │ axum HTTP server      │
│        │ ◀── SSE stream ──────── │                       │
│        │    (endpoint URL)       │   Accept connection   │
│        │                         │   Create mpsc channel │
│        │ ── POST /message ─────▶ │   tx ──▶ handler      │
│        │                         │          ▼            │
│        │                         │   Router.dispatch()   │
│        │                         │          ▼            │
│        │ ◀── SSE event ──────── │   rx ◀── result       │
└────────┘                         └──────────────────────┘
```

## Success Criteria

### Phase Completion Gates

- [ ] **Phase 1**: `echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | cargo run` returns valid MCP init response
- [ ] **Phase 2**: `tools/list` returns registered tools; `tools/call` dispatches to correct handler
- [ ] **Phase 3**: All 6 Pokemon tools return correct data from SQLite DB (19,818 cards); `cargo test` passes
- [ ] **Phase 4**: Claude Code connects via SSE transport; concurrent clients handled

### Quality Metrics

- [ ] `cargo clippy -- -D warnings` reports 0 warnings
- [ ] `cargo test` passes with 0 failures
- [ ] `cargo build --release` completes without errors
- [ ] All public types have derive macros for `Debug` at minimum
- [ ] No `unwrap()` in non-test code — all errors propagated with `?` or matched
- [ ] No `unsafe` blocks
- [ ] Binary size < 20MB (release build)

## Integration with Existing Platform

The MCP server is a **standalone binary** that reads from a local SQLite database
(`apps/mcp-server/database/pokemon-data.sqlite3.db`), replicated from the canonical
`database/pokemon-data.sqlite3.db`. It does NOT depend on PostgreSQL, Neo4j, or any
running service. This makes it:

- Easy to test in isolation
- Deployable as a Claude Code MCP server config entry
- Useful without the full Docker Compose stack running
- Self-contained — the SQLite file ships alongside the binary

### Claude Code Configuration

Once built, users add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "pokemon-tcg": {
      "command": "cargo",
      "args": ["run", "--manifest-path", "apps/mcp-server/Cargo.toml"],
      "env": {
        "DATABASE_PATH": "./apps/mcp-server/database/pokemon-data.sqlite3.db"
      }
    }
  }
}
```

Or with the release binary:

```json
{
  "mcpServers": {
    "pokemon-tcg": {
      "command": "./apps/mcp-server/target/release/pokemon-mcp-server",
      "env": {
        "DATABASE_PATH": "./apps/mcp-server/database/pokemon-data.sqlite3.db"
      }
    }
  }
}
```
