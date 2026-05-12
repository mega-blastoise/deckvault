# johto

Competitive Pokémon TCG deck refinement CLI. Load a `.toml` deck file, get an AI agent session pre-loaded with your 60 cards, connected to a local card database for live lookups — no services, no Docker, no internet required for card data.

```bash
johto --deck ./decks/my-deck.toml
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Bun ≥ 1.3** | Runtime and package manager |
| **Rust + Cargo** | For building the MCP card server |
| **SQLite database** | `database/pokemon-data.sqlite3.db` in the monorepo root |
| **`ANTHROPIC_API_KEY`** | Required for `--provider anthropic` (REPL mode) only |

---

## Build

```bash
# 1. Build the MCP card server (one-time)
cargo build --release --manifest-path apps/mcp-server/Cargo.toml

# 2. Install CLI deps and build the binary
cd apps/deck-cli
bun install
bun run build
# → dist/johto.mjs
```

---

## Usage

```
johto [options]

Options:
  -d, --deck <path>       Deck file (.toml or .json). Repeatable.
                          Optional with --provider chrome.
  --provider <name>       anthropic (default) · chrome
  --mcp-server <path>     Path to pokemon-mcp-server binary
                          Default: auto-resolved from monorepo root
  --dry-run               Print assembled system prompt and exit
                          (REPL mode only — no API key required)
  -h, --help              Show help
  -v, --version           Show version
```

### REPL mode (Anthropic)

Starts an interactive agent session backed by `claude-sonnet-4-5`. The agent receives your full decklist — card names, HP, attacks, regulation marks — as the system prompt and has access to the card database via MCP tools.

```bash
ANTHROPIC_API_KEY=sk-ant-... johto --deck ./decks/charizard-ex.toml
```

Type questions at the `You:` prompt. `quit` or `exit` ends the session.

### Browser mode (Chrome Prompt API)

Serves a local three-panel page — card search, deck builder, and chat — powered by Gemini Nano on-device. No API key required.

```bash
# Open the deck builder (no deck pre-loaded)
johto --provider chrome

# Pre-populate the builder from an existing deck
johto --deck ./decks/charizard-ex.toml --provider chrome
```

Requires Chrome Canary / Dev with `chrome://flags/#prompt-api-for-gemini-nano` enabled.

### Inspect the system prompt

```bash
johto --deck ./decks/charizard-ex.toml --dry-run
```

Prints the assembled prompt — static competitive knowledge layer + your deck context — then exits without making any API calls.

---

## Deck file format

Decks are plain TOML files. 60 cards, H/I/J regulation marks only.

```toml
name = "Mega Gardevoir ex — Psychic Control"
format = "standard"
regulation_marks = ["H", "I"]

# Pokémon — 14
[[cards]]
id = "me1-60"        # Mega Gardevoir ex
quantity = 3

[[cards]]
id = "me1-58"        # Ralts
quantity = 4

# ... (56 more cards)

# Energy — 15
[[cards]]
id = "sve-5"         # Basic Psychic Energy
quantity = 15

[meta]
archetype = "mega-gardevoir-ex"
version = "1.0"
notes = "Prime Catcher ACE SPEC build"
```

Card IDs match the Pokemon TCG API format: `{set-id}-{collector-number}` (e.g. `sv3-125`, `me1-60`).

See `decks/example.toml` for a complete 60-card example.

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
| LEGALITY | Cards with regulation marks outside H/I/J are flagged |

### JSON alternative

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

Use `.json` extension — the CLI and MCP server detect format by extension.

---

## Agent tools

The agent has four MCP tools available during a REPL session:

| Tool | Description |
|---|---|
| `search_cards` | Search by name, type, supertype, set, HP range |
| `get_card_by_id` | Full card details — attacks, HP, regulation mark |
| `compare_cards` | Side-by-side stat comparison |
| `validate_deck` | Re-check legality after proposed changes |

The agent calls these automatically when it needs to verify card details before making recommendations.

---

## MCP server tools

Two deck-specific tools were added to the `pokemon-mcp-server`:

### `load_deck`

```json
{ "path": "/absolute/path/to/deck.toml" }
```

Parses the deck file and enriches every card ID against the SQLite database. Returns an `EnrichedDeck` object (camelCase JSON) including `regulationMark` per card.

### `validate_deck`

```json
{ "path": "/absolute/path/to/deck.toml" }
```

Returns a structured violation report:

```json
{
  "valid": true,
  "violations": [],
  "totalCards": 60,
  "unknownCardIds": []
}
```

---

## Standard rotation (current)

Legal regulation marks: **H, I, J**  
Mark G rotated out on **2026-04-10**.

---

## Development

```bash
cd apps/deck-cli

# Type check
bun run typecheck

# Build binary
bun run build

# Run from source (no build step)
bun run dev -- --deck ./decks/example.toml --dry-run

# Smoke tests
cd ../../__tests__/deck-cli/smoke
bun install && bun test
```

The compiled binary at `dist/johto.mjs` has a `#!/usr/bin/env bun` shebang and executable permissions. It resolves deps from `node_modules` at runtime — not bundled.
