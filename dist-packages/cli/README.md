# @johto-ai/cli

> Competitive Pokémon TCG deck refinement at your terminal.

`johto` loads your 60-card deck as a TOML file, opens an AI agent session pre-populated with every card's stats, attacks, and regulation mark, and connects it to a local 19,818-card SQLite database via MCP. The agent reviews legality, flags consistency issues, and suggests specific swaps — informed by current Standard format rules baked into its system prompt.

No PostgreSQL. No Docker. No network calls for card data. Just a deck file and an API key.

---

## Install

```bash
npm install -g @johto-ai/cli @johto-ai/card-data@latest
johto init
```

`@johto-ai/card-data` is a [peer dependency](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependencies) and is released on its own cadence — install it explicitly so you can pull data refreshes (`@latest`) without bumping the CLI itself.

`johto init` runs an interactive wizard: writes `~/.config/johto/config.toml`, prompts for your Anthropic API key, and verifies the bundled binaries.

The meta package selects the matching platform binary at install time via `optionalDependencies`. Supported targets:

| OS    | Arch         |
|-------|--------------|
| Linux | x64, arm64   |
| macOS | x64, arm64   |

Windows is tracked for v1.1.

### Alternative install paths

```bash
# Docker (multi-arch)
docker run --rm -it \
  -v "$PWD/decks:/decks" \
  -e ANTHROPIC_API_KEY \
  ghcr.io/mega-blastoise/johto:latest \
  run --deck /decks/my-deck.toml

# Curl installer (writes to ~/.local/bin)
curl -fsSL https://johto.deckvault.gg/install.sh | sh

# Ephemeral
npx @johto-ai/cli run --deck ./my-deck.toml
```

---

## Quick start

```bash
johto init                                         # one-time setup
johto run --deck ./decks/mega-gardevoir-ex.toml    # REPL session
```

The agent opens with a forced legality review, then waits for your questions:

```text
You: what's my turn 1 plan?

Agent: With Lillie's Determination as your engine, you're hunting Ralts
on T1. Best opener:
  - Lead with Ralts (me1-58, 4 copies) — 70 HP, basic
  - Attach Psychic Energy (sve-5)
  - Play Lillie's Determination (me1-119, 4 copies) to redraw
  - Hold Prime Catcher for a key gust on T2 once Kirlia is set up
...
```

---

## Commands

```bash
johto init                              # interactive first-run wizard
johto run --deck <file>                 # REPL session (Anthropic)
johto run --provider chrome             # browser mode (Chrome Prompt API)
johto run --deck <file> --dry-run       # print the system prompt and exit
johto run --deck <file> --stats         # show probability table before REPL
johto doctor                            # diagnose install
johto auth set anthropic <key>          # persist API key
johto auth show                         # list configured providers
johto sync-data                         # refresh the card database
johto --help                            # full subcommand reference
```

### REPL mode (Anthropic)

Streams a Claude session with your full decklist injected into the system prompt and four MCP tools available for live card lookups. Requires `ANTHROPIC_API_KEY` in the environment or `johto auth set anthropic <key>`.

On the first message the agent will:

- Review the decklist for legality (regulation marks H, I, J only)
- Flag rotating cards (anything outside H/I/J)
- Identify consistency issues — wrong supporter ratios, missing search targets, energy math

Type `quit` or `exit` to end the session. Proposed deck edits are saved as versioned snapshots (`deck.v1.toml`, `deck.v2.toml`) — original files are never mutated.

### Browser mode (Chrome Prompt API)

```bash
johto run --provider chrome
johto run --deck ./decks/mega-gardevoir-ex.toml --provider chrome
```

Serves a local three-panel page — card search, deck builder, on-device chat — powered by Gemini Nano. **No API key required.** Decks export as `.toml` files in the format below.

Requires Chrome Canary / Dev with `chrome://flags/#prompt-api-for-gemini-nano` enabled. When `window.ai` is unavailable, the page renders a setup guide rather than a blank state.

### Dry run

```bash
johto run --deck ./decks/mega-gardevoir-ex.toml --dry-run
```

Prints the assembled system prompt and exits. No API calls, no key required. Useful for verifying prompt construction or diffing prompt changes across versions.

---

## Deck file format

Plain TOML, 60 cards total, H/I/J regulation marks only. Human-writable, version-controllable, no tooling required.

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

Card IDs follow the Pokemon TCG API format: `{set-id}-{collector-number}` (e.g. `sv3-125`, `me1-60`). A complete 60-card example is bundled at `decks/example.toml`.

### Validation rules

| Rule     | Check                                                            |
|----------|------------------------------------------------------------------|
| R1       | Total quantity = exactly 60                                      |
| R2       | No duplicate `id` values                                         |
| R3       | Each `quantity` is 1–60                                          |
| R4       | Non-Basic Energy cards have quantity ≤ 4                         |
| R5       | `format` = `"standard"` (case-sensitive)                         |
| R6       | `regulation_marks` non-empty; values in `["G","H","I","J"]`      |
| R7       | No blank `id` values                                             |
| LEGALITY | Cards with marks outside H/I/J flagged as rotating               |

JSON is also accepted (`.json` extension) — useful for programmatic generation.

---

## Agent tools

Available to the agent during REPL sessions via MCP. The agent invokes them automatically — no manual calls needed.

| Tool             | Description                                                |
|------------------|------------------------------------------------------------|
| `search_cards`   | Search by name, type, supertype, rarity, set, HP range     |
| `get_card_by_id` | Full card details — attacks, abilities, HP, regulation     |
| `compare_cards`  | Side-by-side stat comparison of two cards                  |
| `validate_deck`  | Re-check legality after proposed changes                   |

---

## Standard rotation

Legal regulation marks: **H, I, J**.
Mark **G** rotated out on **2026-04-10**.

---

## Configuration

`johto init` writes `~/.config/johto/config.toml`:

```toml
[providers.anthropic]
api_key = "sk-ant-..."

[paths]
mcp_server = "/path/to/pokemon-mcp-server"   # auto-resolved via npm
card_db    = "/path/to/pokemon-data.sqlite3"  # auto-resolved via npm
```

Environment variable overrides:

| Variable                | Purpose                                       |
|-------------------------|-----------------------------------------------|
| `ANTHROPIC_API_KEY`     | API key for REPL mode                         |
| `JOHTO_MCP_SERVER_PATH` | Override the bundled `pokemon-mcp-server`     |
| `JOHTO_CARD_DB_PATH`    | Override the bundled SQLite card database     |

---

## Troubleshooting

```bash
johto doctor
```

Checks every prerequisite — binary presence, database integrity, API key, network reachability — and prints actionable remediation for anything missing. Run it first if anything misbehaves.

---

## Links

- **Documentation** — [johto.deckvault.gg](https://johto.deckvault.gg)
- **Source** — [github.com/mega-blastoise/deckvault](https://github.com/mega-blastoise/deckvault)
- **Issues** — [github.com/mega-blastoise/deckvault/issues](https://github.com/mega-blastoise/deckvault/issues)

---

## License

MIT
