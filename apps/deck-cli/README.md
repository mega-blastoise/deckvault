# johto

Competitive Pokémon TCG deck refinement CLI. Load a `.toml` deck file, start an AI agent session pre-loaded with your 60 cards, connected to a local 19,818-card SQLite database via MCP — no services, no Docker, no internet required for card data.

---

## Install

```bash
npm install -g @johto-ai/cli
johto init
```

Or via Docker:

```bash
docker run --rm -it \
  -v "$PWD/decks:/decks" \
  -e ANTHROPIC_API_KEY \
  ghcr.io/nicholasgalante1997/johto:latest \
  run --deck /decks/my-deck.toml
```

Or via the curl installer:

```bash
curl -fsSL https://johto.deckvault.gg/install.sh | sh
```

---

## Usage

```bash
johto init                              # first-run setup wizard
johto run --deck ./decks/my-deck.toml  # REPL session
johto run --provider chrome            # browser mode
johto doctor                           # verify install
johto auth set anthropic <key>         # persist API key
johto --help                           # all subcommands
```

### REPL mode (Anthropic)

Starts an interactive agent session. The agent receives your full decklist — card names, HP, attacks, regulation marks — as the system prompt, and has four MCP tools for live card lookups.

```bash
johto run --deck ./decks/mega-gardevoir-ex.toml
```

Type questions at the `You:` prompt. `quit` or `exit` ends the session.

**On the first message the agent will:**
- Review the decklist for legality violations without being asked
- Note any rotating cards (marks outside H/I/J)
- Identify consistency issues and suggest specific swaps

### Browser mode (Chrome Prompt API)

Serves a local three-panel page — card search, deck builder, and on-device chat — powered by Gemini Nano. No API key required.

```bash
# Open deck builder (no deck pre-loaded)
johto run --provider chrome

# Pre-populate builder from an existing deck
johto run --deck ./decks/mega-gardevoir-ex.toml --provider chrome
```

The builder exports decks as `.toml` files in SPEC_01 format, ready to drop into `johto run --deck <file>`.

Requires Chrome Canary / Dev with `chrome://flags/#prompt-api-for-gemini-nano` enabled. The page renders a setup guide (not a blank state) when `window.ai` is unavailable.

### Dry run

```bash
johto run --deck ./decks/mega-gardevoir-ex.toml --dry-run
```

Prints the assembled system prompt — static competitive knowledge layer + injected deck context — then exits. No API calls, no API key required. Useful for verifying prompt construction or diffing prompt changes.

---

## Deck file format

Decks are plain TOML files stored under `decks/`. 60 cards total, H/I/J regulation marks only. Human-writable, version-controllable, no tooling required.

```toml
name = "Mega Gardevoir ex — Psychic Control"
format = "standard"
regulation_marks = ["H", "I"]

# Pokémon — 14
[[cards]]
id = "me1-60"        # Mega Gardevoir ex (Ascended Heroes)
quantity = 3

[[cards]]
id = "me1-58"        # Ralts
quantity = 4

# Trainers — 31
[[cards]]
id = "me1-119"       # Lillie's Determination
quantity = 4

# Energy — 15
[[cards]]
id = "sve-5"         # Basic Psychic Energy
quantity = 15

[meta]
archetype = "mega-gardevoir-ex"
version = "1.0"
notes = "Prime Catcher ACE SPEC build"
```

Card IDs match the Pokemon TCG API format: `{set-id}-{collector-number}` (e.g. `sv3-125`, `me1-60`). See `decks/example.toml` for a complete 60-card example.

### Validation rules

| Rule | Check |
|---|---|
| R1 | Total quantity = exactly 60 |
| R2 | No duplicate `id` values |
| R3 | Each `quantity` is 1–60 |
| R4 | Non-Basic Energy cards have quantity ≤ 4 |
| R5 | `format` = `"standard"` (case-sensitive) |
| R6 | `regulation_marks` is non-empty; values in `["G","H","I","J"]` |
| R7 | No blank `id` values |
| LEGALITY | Cards with regulation marks outside H/I/J are flagged as rotating |

### JSON alternative

`.json` extension is also accepted — useful for programmatic generation (e.g. export from the web platform):

```json
{
  "name": "Mega Gardevoir ex",
  "format": "standard",
  "regulation_marks": ["H", "I"],
  "cards": [
    { "id": "me1-60", "quantity": 3 },
    { "id": "me1-58", "quantity": 4 }
  ]
}
```

### Versioned snapshots

The CLI creates versioned files when saving proposed changes — original files are never mutated:

```
decks/
├── mega-gardevoir-ex.toml        # working copy
├── mega-gardevoir-ex.v1.toml     # saved version
└── mega-gardevoir-ex.v2.toml     # newer snapshot
```

---

## Agent tools

Available to the agent during a REPL session via MCP:

| Tool | Description |
|---|---|
| `search_cards` | Search by name, type, supertype, rarity, set, HP range |
| `get_card_by_id` | Full card details — attacks, abilities, HP, regulation mark |
| `compare_cards` | Side-by-side stat comparison of two cards |
| `validate_deck` | Re-check legality after proposed changes |

The agent calls these automatically — you don't need to invoke them explicitly.

---

## MCP server tools

Two deck-specific tools were added to `apps/mcp-server` as part of this feature:

### `load_deck`

Parses a deck file and enriches every card ID against the SQLite database. Returns a camelCase-serialised `EnrichedDeck` including full card data (name, HP, attacks, abilities, `regulationMark`) per entry.

```json
{ "path": "/absolute/path/to/deck.toml" }
```

### `validate_deck`

Runs all R1–R7 + LEGALITY checks and returns a structured report. `is_error: true` when violations exist.

```json
{ "path": "/absolute/path/to/deck.toml" }
```

Example response:

```json
{
  "valid": false,
  "totalCards": 60,
  "unknownCardIds": [],
  "violations": [
    {
      "rule": "LEGALITY",
      "message": "\"Iono\" (sv2-185) has regulation mark G; not legal in current Standard (H/I/J)",
      "cardId": "sv2-185"
    }
  ]
}
```

---

## Standard rotation (current)

Legal regulation marks: **H, I, J**  
Mark G rotated out **2026-04-10**.

---

## Architecture

```
apps/deck-cli/src/
├── index.ts          entry point — wires all modules, REPL loop
├── args.ts           subcommand parser (johto run / init / doctor / auth / sync-data)
├── mcp/
│   ├── client.ts     JSON-RPC 2.0 over stdio — spawns pokemon-mcp-server
│   └── types.ts      McpContent, McpToolResult
├── deck/
│   ├── loader.ts     loadAndEnrichDeck — calls load_deck MCP tool
│   ├── writer.ts     writeDeckVersion — saves proposed decks as versioned TOML
│   └── types.ts      EnrichedDeck, CardDetail (mirror of Rust output)
├── agent/
│   ├── loop.ts       Anthropic streaming agent loop with tool dispatch
│   ├── prompt.ts     buildSystemPrompt — static rules layer + deck context
│   └── tools.ts      AGENT_TOOLS definitions + dispatchTool
└── browser/
    ├── server.ts     Bun.serve HTTP server with /api/search and /api/card/:id
    ├── open.ts       cross-platform browser open
    └── template.ts   self-contained HTML page (Chrome Prompt API + deck builder)
```

The MCP server runs as a child process (stdin/stdout JSON-RPC). The CLI never talks to PostgreSQL, the REST API, or any network service other than the Anthropic API in REPL mode.

---

## From source

```bash
# 1. Build the MCP card server (Rust — one-time, ~30s)
cargo build --release --manifest-path apps/mcp-server/Cargo.toml

# 2. Install CLI deps
cd apps/deck-cli
bun install

# 3. Run from source without building
bun run dev -- --deck ./decks/example.toml --dry-run

# Type check (no emit)
bun run typecheck

# Smoke tests (all 5 phases)
cd ../../__tests__/deck-cli/smoke
bun install && bun test
```

Smoke tests auto-skip phases that require binaries or the database if those aren't present. Phase 1 (TOML parsing) runs anywhere.

```
Phase 1 — Deck file format      (pure schema, no binaries)
Phase 2 — MCP tools             (requires mcp-server release build + SQLite)
Phase 3 — CLI guards            (requires CLI binary)
Phase 4 — System prompt content (requires all of the above + --dry-run)
Phase 5 — Browser mode          (requires all of the above)
```

See [Developing Locally](docs/development.mdx) for the full contributor workflow.
