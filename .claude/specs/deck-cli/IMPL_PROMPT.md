# Implementation Prompt — deck-cli Spec Work

Use this prompt to begin implementation. Paste it directly into a new Claude Code session
opened at the root of the Pokemon monorepo.

---

## Prompt

You are implementing the `johto` deck CLI tool for this Pokemon TCG platform. The full
specification is in `.claude/specs/deck-cli/`. Read all five spec files plus the overview
before writing any code.

**Specs to read first (in order):**
1. `.claude/specs/deck-cli/OVERVIEW.md`
2. `.claude/specs/deck-cli/SPEC_01_DECK_FILE_FORMAT.md`
3. `.claude/specs/deck-cli/SPEC_02_MCP_EXTENSIONS.md`
4. `.claude/specs/deck-cli/SPEC_03_CLI_APP.md`
5. `.claude/specs/deck-cli/SPEC_04_AGENT_CONTEXT.md`
6. `.claude/specs/deck-cli/SPEC_05_BROWSER_MODE.md`

**Rulebook reference:** `assets/asc_rulebook_en.pdf` — the official 2026 Pokémon TCG
rulebook (44 pages). SPEC_04's `STATIC_PROMPT` content is derived from this document.
If you need to verify a game mechanic, read the relevant appendix.

**Existing MCP server to extend:** `apps/mcp-server/` (Rust, already has card/set tools).
**SQLite database:** `database/pokemon-data.sqlite3.db` (19,818 cards, includes
`regulation_mark` column on `pokemon_cards` table).

---

## Implementation Order

Work through the specs in this sequence. Complete and verify each phase before moving on.

### Phase 1 — SPEC_01: Create the example deck file

Create `apps/deck-cli/decks/example.toml` — a valid 60-card Standard-legal deck in the
exact format defined in SPEC_01. Use real card IDs from the SQLite database (query it
with `sqlite3 database/pokemon-data.sqlite3.db` to confirm IDs exist). The deck must:
- Total exactly 60 cards
- Contain only H/I/J regulation mark cards
- Include at least one Basic Pokémon, some Trainers, and Basic Energy
- Pass all validation rules R1–R7 from SPEC_01

Verify: `smol-toml` parses it without error.

### Phase 2 — SPEC_02: Extend the MCP server (Rust)

Add two new tools to `apps/mcp-server/`:

1. Add `regulation_mark: Option<String>` to `PokemonCard` in `src/domains/card.rs`
   and map it from the `regulation_mark` column in `row_to_card` in `src/domains/db.rs`.

2. Add `toml = "0.8"` to `apps/mcp-server/Cargo.toml`.

3. Create `src/domains/deck.rs` with `DeckFile`, `DeckCardEntry`, `EnrichedDeck`,
   `EnrichedDeckCard`, `DeckValidationReport`, `ValidationViolation`, `ParseError`,
   `parse_deck_file`, and `validate_deck` — exactly as specified in SPEC_02.
   Register the module in `src/domains/mod.rs`.

4. Create `src/tools/load_deck.rs` and `src/tools/validate_deck.rs` per SPEC_02.
   Register both modules in `src/tools/mod.rs` and register the tools in `src/main.rs`.

Verify:
```bash
cargo build --manifest-path apps/mcp-server/Cargo.toml
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings
# Test tools list includes load_deck and validate_deck:
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); names=[t['name'] for t in d['result']['tools']]; assert 'load_deck' in names and 'validate_deck' in names; print('PASS')"
```

### Phase 3 — SPEC_03: Create the CLI package

Create `apps/deck-cli/` as a new workspace package per SPEC_03:

1. `package.json` — exact structure from SPEC_03 (`bin.johto → dist/johto.mjs`,
   `bin.bun-johto → src/index.ts`, scripts, deps including `cac`).
2. `tsconfig.json` — bundt-style conventions from SPEC_03.
3. `build/index.ts` — `Bun.build()` script with shebang injection and `chmod +x`.
4. `src/args.ts` — `cac`-based parsing with all flags from SPEC_03.
5. `src/mcp/client.ts` and `src/mcp/types.ts`
6. `src/deck/types.ts`, `src/deck/loader.ts`, `src/deck/writer.ts`
7. `src/agent/tools.ts` and `src/agent/loop.ts`
8. `src/index.ts` — entry point wiring everything together

Verify:
```bash
cd apps/deck-cli && bun install
bun run typecheck
bun run build
head -1 dist/johto.mjs   # must be #!/usr/bin/env bun
ls -la dist/johto.mjs    # must be executable
./dist/johto.mjs --help
```

### Phase 4 — SPEC_04: Implement the agent system prompt

Create `apps/deck-cli/src/agent/prompt.ts` with `buildSystemPrompt`, `STATIC_PROMPT`,
`renderDeck`, and `renderCard` per SPEC_04.

The `STATIC_PROMPT` must contain all rulebook-derived sections:
- Official turn structure (one energy/turn, one Supporter/turn, T1 no-Supporter rule)
- Damage calculation (exact order, Weakness ×2, Resistance subtracts)
- Special Conditions table (Asleep, Burned, Confused, Paralyzed, Poisoned)
- Card types and prize penalties table (Mega Evolution ex = 3 prizes)
- ACE SPEC 1-per-deck rule
- Lost Zone permanence rule
- Standard rotation and deck construction rules
- Deck skeleton and Trainer staple counts
- Prize trade math (updated for Mega Evolution ex)
- Archetype frameworks
- Tool use guidance

Verify:
```bash
./dist/johto.mjs --deck ./decks/example.toml --dry-run | grep -q "×2" && echo "Weakness PASS"
./dist/johto.mjs --deck ./decks/example.toml --dry-run | grep -q "3 prize" && echo "Mega ex PASS"
./dist/johto.mjs --deck ./decks/example.toml --dry-run | grep -qi "ACE SPEC" && echo "ACE SPEC PASS"
```

### Phase 5 — SPEC_05: Browser mode

Implement the `browser/` module per SPEC_05:

1. Update `src/args.ts` — add `provider: LlmProvider`, `--provider` flag, make
   `--deck` optional for chrome.
2. Update `src/index.ts` — conditional API key check, browser branch, pass `mcp` to
   `startBrowserServer`.
3. `src/browser/server.ts` — `Bun.serve` with `port: 0`, `/api/search`, `/api/card/:id`.
4. `src/browser/open.ts` — platform-aware browser open.
5. `src/browser/template.ts` — three-panel layout, deck builder, TOML export,
   Chrome Prompt API integration, `BROWSER_STATIC_PROMPT`.

Verify:
```bash
bun run typecheck   # must be clean
./dist/johto.mjs --provider chrome &
sleep 1 && kill %1  # should print a localhost URL without error
./dist/johto.mjs --provider invalid 2>&1 | grep -q "Unknown provider" && echo "PASS"
```

---

## Constraints

- Follow all conventions in `CLAUDE.md` (global) and `.claude/CLAUDE.md` (project).
- Rust: `cargo clippy -- -D warnings` must be clean after Phase 2.
- TypeScript: `bun run typecheck` must be clean after each phase.
- Do not modify `apps/rest-api/` or `apps/web/` — this work is isolated to
  `apps/mcp-server/` and the new `apps/deck-cli/`.
- Do not add npm packages beyond those specified in the specs.
- Card IDs in `example.toml` must be verified against the live SQLite database.
- The `regulation_mark` field must be wired through from SQLite → `PokemonCard` →
  `EnrichedDeckCard` → rendered in the system prompt. This is non-negotiable for the
  legality-checking feature to work.

## Starting point

Begin with Phase 1. Query the SQLite database to find 60 real card IDs for the
example deck, then proceed through the phases in order.
