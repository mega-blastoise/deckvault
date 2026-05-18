# Deck CLI — Overview

## Purpose

A self-contained, portable command-line tool for competitive Pokemon TCG deck refinement.
The CLI creates an AI agent session pre-loaded with your deck's full context, connected
to the project's MCP server for live card lookups, comparisons, and deck validation.

The simulation engine remains WIP. Rather than depending on its output, the CLI uses a
well-contexted language model as the strategic intelligence layer — bringing competitive
meta knowledge to bear directly against your specific 60 cards.

---

## Design Constraints

- **Zero service dependencies at runtime.** No postgres, no rest-api, no Docker. The tool
  runs anywhere Bun runs.
- **Decks are files, not database records.** Deck state lives in TOML files on the
  filesystem — portable, version-controllable, human-editable.
- **Card enrichment comes from the MCP server.** The existing `pokemon-mcp-server` binary
  (SQLite-backed, no network required for card data) is the only runtime dependency beyond
  Bun and the Anthropic API (REPL mode) or Chrome (browser mode).
- **The agent is the intelligence layer.** No simulation output is consumed. Competitive
  reasoning is provided by the model, informed by the loaded deck context and format rules
  baked into the system prompt.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Terminal                                │
│                                                                     │
│  $ johto --deck ./decks/charizard-ex.toml                           │
│  $ johto --deck ./decks/charizard-ex.toml --provider chrome         │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  spawns
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     apps/deck-cli  (Bun)                            │
│                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│  │  args.ts        │    │  deck/loader.ts  │    │  agent/prompt.ts│ │
│  │  Parse --deck   │───▶│  Parse TOML file │───▶│  Build system   │ │
│  │  --provider     │    │  Validate struct  │    │  prompt with    │ │
│  └─────────────────┘    └────────┬──────────┘    │  deck context   │ │
│                                  │               └────────┬────────┘ │
│              ┌───────────────────┤                        │          │
│              │ enrich via MCP    │                        │          │
│              ▼                   ▼                        ▼          │
│  ┌───────────────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  mcp/client.ts        │  │browser/      │  │  agent/loop.ts    │ │
│  │  JSON-RPC over stdio  │  │server.ts     │  │  Anthropic SDK    │ │
│  │  (both modes)         │  │open.ts       │  │  streaming REPL   │ │
│  └──────────┬────────────┘  │template.ts   │  └─────────┬─────────┘ │
└─────────────│───────────────┴──────────────┘────────────│───────────┘
              │ spawns                  │ Bun.serve        │ HTTPS
              ▼                        ▼                   ▼
 ┌─────────────────────┐   ┌──────────────────┐  ┌──────────────────┐
 │ pokemon-mcp-server  │   │ Default browser  │  │  Anthropic API   │
 │ (Rust binary)       │   │ Chrome Prompt API│  │  claude-sonnet   │
 │ SQLite: 19,818 cards│   │ Gemini Nano      │  │  (REPL mode only)│
 └─────────────────────┘   └──────────────────┘  └──────────────────┘
```

---

## Phased Spec Documents

| Spec | Scope | Inputs | Outputs |
|------|-------|--------|---------|
| SPEC_01 | Deck file format | — | TOML/JSON schema, validation rules |
| SPEC_02 | MCP server extensions | SPEC_01 schema | Two new Rust tools: `load_deck`, `validate_deck` |
| SPEC_03 | CLI application | SPEC_01 + SPEC_02 | `apps/deck-cli` Bun app, agent REPL |
| SPEC_04 | Agent system prompt | All above | System prompt template, competitive context |
| SPEC_05 | Browser mode | SPEC_01–04 | `--provider chrome` flag, Bun HTTP server, self-contained HTML page with Chrome Prompt API |

---

## What Is Out of Scope

- Simulation engine integration (deferred until engine AI quality improves)
- REST API or postgres access (decks are file-based only)
- Web UI components (separate from the browser mode page, which is self-contained)
- Deck write-back to the platform's database
- Multi-user or shared sessions
- Ollama / local LLM integration (separate workstream)
- Multi-deck browser mode (single deck enforced in SPEC_05; deferred)

---

## File Layout (Target State)

```
apps/deck-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── args.ts
│   ├── mcp/
│   │   ├── client.ts
│   │   └── types.ts
│   ├── deck/
│   │   ├── loader.ts
│   │   ├── writer.ts
│   │   └── types.ts
│   ├── agent/
│   │   ├── loop.ts
│   │   ├── prompt.ts
│   │   └── tools.ts
│   └── browser/               # SPEC_05
│       ├── server.ts
│       ├── open.ts
│       └── template.ts
└── decks/
    └── example.toml           # Bundled example deck

apps/mcp-server/src/
├── domains/
│   └── deck.rs                # NEW — DeckFile domain types (SPEC_02)
└── tools/
    ├── load_deck.rs            # NEW (SPEC_02)
    └── validate_deck.rs        # NEW (SPEC_02)
```

---

## Success Criteria

- [ ] `johto --deck ./decks/charizard-ex.toml` starts a REPL session with the deck fully
      loaded and enriched in the first assistant turn
- [ ] The agent can answer "what's my turn 1 plan?" with specific card names from the deck
- [ ] The agent correctly flags any card in the deck that is not legal in current Standard
      (regulation marks H, I, J) without needing to be asked
- [ ] `validate_deck` MCP tool returns accurate violation list for a purposely malformed
      deck file (wrong count, over-limit card, rotating card)
- [ ] The CLI runs to completion with no running services other than `pokemon-mcp-server`
      (child process) and Anthropic API access
- [ ] `cargo clippy -- -D warnings` clean after MCP server additions
- [ ] `bun run check-types` clean for the CLI app
- [ ] `johto --deck ./decks/charizard-ex.toml --provider chrome` opens the default
      browser with the deck rendered and Chrome Prompt API initialised — no API key required
- [ ] Browser page renders a setup guide (not a blank/broken state) when `window.ai`
      is unavailable
