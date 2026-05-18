# Implementation Prompt — SPEC_07 + SPEC_08

Paste this prompt into a new Claude Code session opened at the **monorepo root**.
This is incremental work on an already-shipping codebase — read the existing code
before writing anything new.

---

## Context

`johto` is a competitive Pokémon TCG deck refinement CLI at `apps/deck-cli/`. The MCP
server it talks to lives at `apps/mcp-server/` (Rust, SQLite-backed). Both are fully
built and working. You are adding two things:

1. **SPEC_07** — A hypergeometric probability engine: a new Rust MCP tool
   (`analyze_deck_probability`), TypeScript types and formatter, and two new CLI flags
   (`--stats`, `--spotlight`).

2. **SPEC_08** — Docsite updates: two new MDX pages and targeted additions to four
   existing pages in `apps/deck-cli/docs/`, plus a navigation restructure in
   `dxdocs.config.ts`.

---

## Read First (in this order)

### Specs
1. `.claude/specs/deck-cli/SPEC_07_DECK_PROBABILITY.md`
2. `.claude/specs/deck-cli/SPEC_08_DOCSITE_UPDATES.md`

### Existing code to understand before writing anything
3. `apps/mcp-server/src/tools/load_deck.rs` — the tool pattern to replicate
4. `apps/mcp-server/src/tools/validate_deck.rs` — same pattern, shorter
5. `apps/mcp-server/src/tools/mod.rs` — where to add the new module declaration
6. `apps/mcp-server/src/domains/deck.rs` — `parse_deck_file` and domain types you will reuse
7. `apps/deck-cli/src/args.ts` — the `cac` flag pattern and `CliArgs` interface to extend
8. `apps/deck-cli/src/index.ts` — the startup sequence; understand where `--stats` fits
9. `apps/deck-cli/src/agent/tools.ts` — `AGENT_TOOLS` array to extend
10. `apps/deck-cli/dxdocs.config.ts` — the navigation structure to update
11. `apps/deck-cli/docs/mcp-tools.mdx` — MDX style and component conventions to match

Do not write a single line of code until you have read all eleven files.

---

## Math Correction

SPEC_07's reference table contains incorrect probability values. The **correct** values
computed from the hypergeometric distribution (N=60, n=7 for opening hand; n=6 for prize
zone) are:

| Copies (K) | p_open  | p_prized |
|:----------:|:-------:|:--------:|
| 1          | 11.7%   | 10.0%    |
| 2          | 22.1%   | 19.2%    |
| 3          | 31.5%   | 27.5%    |
| 4          | 39.9%   | 35.1%    |

Use these values — not the ones in the spec table — for the `docs/probability.mdx`
reference table and the Phase 1 verification assertions below.

The formula itself in the spec is correct:

```
p_open   = 1 − C(N−K, 7) / C(N, 7)
p_prized = 1 − C(N−K, 6) / C(N, 6)
p_turn_T = 1 − C(N−K, 7+T) / C(N, 7+T)   for T in 1..=4
```

Implement the combination function in log-space as specified in SPEC_07 to avoid
floating-point overflow. All output `f64` values round to 4 decimal places.

---

## Implementation Order

Work through the phases in sequence. Run the verification at the end of each phase
before proceeding.

---

### Phase 1 — Rust MCP Tool

**Files to create/modify:**
- `apps/mcp-server/src/tools/analyze_probability.rs` ← **new**
- `apps/mcp-server/src/tools/mod.rs` ← add `pub mod analyze_probability;`
- Find the file where `LoadDeckTool` and `ValidateDeckTool` are registered (likely
  `src/main.rs`) and register `AnalyzeProbabilityTool` there too

**Implementation notes:**
- Reuse `parse_deck_file` from `crate::domains::deck` — same call site as `load_deck.rs`
- Enrich card names via `self.db.get_card_by_id(&entry.id)` for display — same pattern
- `N = deck_file.cards.iter().map(|c| c.quantity).sum::<u32>()`
- `complete = N == 60` — partial decks are supported, probabilities computed on actual N
- Spotlight: if `arguments["spotlight"]` is provided as a JSON array of strings, mark
  those card IDs with `spotlight: true`; they sort to the top of `openingHand`
- `p_prized` is `Some(...)` only when `K <= 2`; `None` otherwise
- `p_exactly_two` is `0.0` when `K < 2`
- Use the Rust types exactly as specified in SPEC_07 with `#[serde(rename_all = "camelCase")]`

**Verify:**
```bash
cargo build --manifest-path apps/mcp-server/Cargo.toml
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Confirm tool is registered
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | DATABASE_PATH=database/pokemon-data.sqlite3.db \
    apps/mcp-server/target/release/pokemon-mcp-server 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
names = [t['name'] for t in d['result']['tools']]
assert 'analyze_deck_probability' in names, f'tool missing; found: {names}'
print('PASS — tool registered')
"

# Verify probability math against known correct values
DECK="$(pwd)/apps/deck-cli/decks/example.toml"
echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"analyze_deck_probability\",\"arguments\":{\"path\":\"$DECK\"}},\"id\":2}" \
  | DATABASE_PATH=database/pokemon-data.sqlite3.db \
    apps/mcp-server/target/release/pokemon-mcp-server 2>/dev/null \
  | python3 -c "
import sys, json, math
d = json.load(sys.stdin)
report = json.loads(d['result']['content'][0]['text'])

# Deck must be complete
assert report['complete'] == True, f'expected complete=true, got {report}'

# Find the 4-of card with highest p_open (should be ~0.3995)
four_ofs = [c for c in report['openingHand'] if c['copies'] == 4]
assert four_ofs, 'no 4-of cards found'
p = four_ofs[0]['pOpen']
assert abs(p - 0.3995) < 0.001, f'4-of p_open expected ~0.3995, got {p}'

# 1-of p_open should be ~0.1167 (7/60)
one_ofs = [c for c in report['openingHand'] if c['copies'] == 1]
if one_ofs:
    p1 = one_ofs[0]['pOpen']
    assert abs(p1 - 0.1167) < 0.001, f'1-of p_open expected ~0.1167, got {p1}'
    p_prized = one_ofs[0]['pPrized']
    assert p_prized is not None, '1-of should have pPrized'
    assert abs(p_prized - 0.1000) < 0.001, f'1-of p_prized expected ~0.1000, got {p_prized}'

# 4-of should have pPrized = null
assert four_ofs[0]['pPrized'] is None, '4-of should have pPrized=null'

# Turn curve should have 4 entries per card
assert len(four_ofs[0]['turnCurve']) == 4, 'turnCurve should have 4 entries'
assert four_ofs[0]['turnCurve'][0]['turn'] == 1

print('PASS — all math assertions passed')
"

# Verify incomplete deck returns complete=false
INCOMPLETE="$(pwd)/apps/deck-cli/decks/mega-sharpedo-ex-2.toml"
echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"analyze_deck_probability\",\"arguments\":{\"path\":\"$INCOMPLETE\"}},\"id\":3}" \
  | DATABASE_PATH=database/pokemon-data.sqlite3.db \
    apps/mcp-server/target/release/pokemon-mcp-server 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
report = json.loads(d['result']['content'][0]['text'])
assert report['complete'] == False, 'incomplete deck should return complete=false'
assert report['deckSize'] == 58, f'expected deckSize=58, got {report[\"deckSize\"]}'
print(f'PASS — incomplete deck: deckSize={report[\"deckSize\"]}, complete={report[\"complete\"]}')
"
```

---

### Phase 2 — TypeScript Types and Formatter

**Files to create:**
- `apps/deck-cli/src/probability/types.ts` ← **new** — TypeScript mirror of Rust output types
- `apps/deck-cli/src/probability/format.ts` ← **new** — `--stats` table renderer

**`types.ts`** — copy exactly from SPEC_07. No additional types needed.

**`format.ts`** — exports a single function:

```typescript
export function formatProbabilityReport(
  deckName: string,
  report: ProbabilityReport
): string
```

It returns the multi-line string shown in the SPEC_07 `--stats` output format section.
Requirements:
- Header bar uses `━` (U+2501), section dividers use `─` (U+2500)
- Card name column is left-padded to 26 chars; quantity column right-padded to 2
- Percentages are formatted to one decimal place (e.g. `39.9%`)
- `★` suffix on spotlight cards, right-padded so percentage columns stay aligned
- `⚠  Prize risk` section only prints when `prizedRisk.length > 0`
- Incomplete decks show `[N/60 — incomplete]` in the header; complete decks show `[60/60]`

**Verify:**
```bash
cd apps/deck-cli && bun run typecheck
```
Must be clean — zero errors.

---

### Phase 3 — CLI Wiring

**Files to modify:**
- `apps/deck-cli/src/args.ts` — add `stats` and `spotlightIds` to `CliArgs`; add flags
- `apps/deck-cli/src/agent/tools.ts` — add `analyze_deck_probability` tool to `AGENT_TOOLS`
- `apps/deck-cli/src/index.ts` — call stats after deck load, before prompt build

#### `args.ts` changes

Extend `CliArgs`:
```typescript
export interface CliArgs {
  readonly deckPaths: readonly string[];
  readonly dryRun: boolean;
  readonly mcpServerPath: string;
  readonly provider: LlmProvider;
  readonly stats: boolean;                  // NEW
  readonly spotlightIds: readonly string[]; // NEW
}
```

Add flags (follow the existing `cac` pattern exactly):
```typescript
.option('--stats', 'Print probability table after deck load, before REPL')
.option('--spotlight <id>', 'Pin card ID to ★ in --stats output. Repeatable.')
```

Add guard in `parseArgs()` — after the `--dry-run` + chrome guard:
```typescript
if (options['stats'] && provider === 'chrome') {
  console.error(
    'Error: --stats is not applicable in browser mode (--provider chrome)'
  );
  process.exit(1);
}
```

Parse `--spotlight` the same way `--deck` is parsed (handle string or string[]).

#### `tools.ts` changes

Add to `AGENT_TOOLS` array (copy from SPEC_07 exactly).

#### `index.ts` changes

Insert the stats block **after** the `decks` array is populated and **before**
`buildSystemPrompt` is called. The `--stats --dry-run` combination should print only
the stats table then exit (no system prompt printed):

```typescript
if (args.stats) {
  for (const [i, deckPath] of args.deckPaths.entries()) {
    const rawResult = await mcp.callTool('analyze_deck_probability', {
      path: deckPath,
      spotlight: args.spotlightIds.length > 0 ? args.spotlightIds : undefined,
    });
    // parse rawResult, call formatProbabilityReport, print to stdout
  }
  if (args.dryRun) {
    mcp.destroy();
    process.exit(0);
  }
}
```

**Verify:**
```bash
cd apps/deck-cli

# Typecheck must be clean
bun run typecheck

# Build
bun run build

# --stats on a complete deck
./dist/johto.mjs \
  --deck ./decks/example.toml \
  --stats --dry-run \
  | grep -q "open 1+" && echo "PASS — stats header present"

./dist/johto.mjs \
  --deck ./decks/example.toml \
  --stats --dry-run \
  | grep -q "60/60" && echo "PASS — complete deck label"

# --stats on an incomplete deck
./dist/johto.mjs \
  --deck ./decks/mega-sharpedo-ex-2.toml \
  --stats --dry-run \
  | grep -q "incomplete" && echo "PASS — incomplete deck label"

# --stats --dry-run must NOT print the system prompt
./dist/johto.mjs \
  --deck ./decks/example.toml \
  --stats --dry-run \
  | grep -qv "SYSTEM PROMPT" && echo "PASS — no system prompt in stats+dry-run"

# --stats with --provider chrome must error
./dist/johto.mjs \
  --provider chrome \
  --stats 2>&1 \
  | grep -q "not applicable in browser mode" && echo "PASS — chrome guard"

# Guard rules must still work
./dist/johto.mjs 2>&1 \
  | grep -q "required for --provider anthropic" && echo "PASS — no-deck guard"

./dist/johto.mjs --provider invalid 2>&1 \
  | grep -q "Unknown provider" && echo "PASS — invalid-provider guard"
```

---

### Phase 4 — Docs

All changes are in `apps/deck-cli/docs/` and `apps/deck-cli/dxdocs.config.ts`.
Do not remove or restructure any existing content — all changes are additive except
the navigation config.

#### New file: `docs/strategy-guide.mdx`

Write the full page per SPEC_08 § "New Pages — 1. strategy-guide.mdx". Six sections:
1. Starting with context
2. Improving the deck (with Prompt patterns code block)
3. Understanding strategies (with Prompt patterns code block)
4. Matchup guidance (with Prompt patterns code block)
5. Hand setup and sequencing (with Prompt patterns code block)
6. Comparing two decks
7. What the agent can't do (include the `--stats` callout linking to `/probability`)

Use the existing MDX components: `<Callout variant="tip|info|warning">` for callouts.
Match the prose style and component usage in `agent-session.mdx`.

#### New file: `docs/probability.mdx`

Write the full page per SPEC_08 § "New Pages — 2. probability.mdx". Seven sections:
1. What this does
2. Using `--stats` (include the full annotated output block from SPEC_07)
3. Opening hand probability reference (use the **corrected** values from this prompt,
   not SPEC_07's table — 1-of: 11.7%, 2-of: 22.1%, 3-of: 31.5%, 4-of: 39.9%)
4. Prize risk
5. Turn curve
6. Asking the agent (prompt patterns)
7. Combo probability (future — Callout info)

Column explanation table for `--stats`:

| Column | Meaning |
|---|---|
| `×` | Copy count in the deck |
| `open 1+` | P(at least 1 copy in opening hand of 7) |
| `T2` | P(at least 1 seen by end of Turn 2, going second) |
| `T3` | P(at least 1 seen by end of Turn 3) |
| `T4` | P(at least 1 seen by end of Turn 4) |

#### Modified file: `docs/agent-session.mdx`

Two additions only — do not touch anything else:

1. In the **Agent tools** table, add a new row:
   | `analyze_deck_probability` | Computing exact open rates and prize risk when asked about consistency or copy counts |

2. After the "Proposing a deck change" section, add a new "Probability analysis" section
   with the example exchange from SPEC_08 and a Callout (tip) linking to `/probability`.

#### Modified file: `docs/cli-reference.mdx`

Two additions only:

1. After the `--dry-run` section, add `--stats` and `--spotlight` flag sections per SPEC_08.

2. In the **Guard rules** table, add the chrome + stats row.

#### Modified file: `docs/mcp-tools.mdx`

Two additions only:

1. In the **All available tools** table, add the `analyze_deck_probability` row.

2. After the `validate_deck` section, add the full `analyze_deck_probability` section
   per SPEC_08 — input schema, full output JSON example, field reference table, and
   a Callout (info) about log-space computation.

#### Modified file: `docs/index.mdx`

In the `<CardGrid>`, add two new `<Card>` entries after the existing four:

```mdx
<Card title="Strategy Guide" href="/strategy-guide">
  Prompt patterns for deck improvement, matchup analysis, and hand sequencing.
</Card>
<Card title="Probability Analysis" href="/probability">
  Opening hand odds, prize risk, and turn curves from the hypergeometric model.
</Card>
```

#### `dxdocs.config.ts`

Replace the existing `navigation` array with the updated version from SPEC_08 —
adding a **Guides** group between Modes and Reference containing `strategy-guide`
and `probability`. Do not modify any other config key.

**Verify:**
```bash
cd apps/deck-cli

# Build docs — must complete with zero errors
bun run docs:build

# All 9 pages must exist in site/
for page in "" quickstart deck-format agent-session browser-mode \
            strategy-guide probability cli-reference mcp-tools; do
  path="site/${page}/index.html"
  [ -z "$page" ] && path="site/index.html"
  [ -f "$path" ] && echo "PASS — $path" || echo "FAIL — $path missing"
done

# Probability page must contain the corrected reference values
grep -q "39.9%" site/probability/index.html && echo "PASS — 39.9% present"
grep -q "11.7%" site/probability/index.html && echo "PASS — 11.7% present"

# Strategy guide must contain at least one prompt pattern
grep -q "T1 hand" site/strategy-guide/index.html && echo "PASS — strategy content present"

# Navigation must contain Guides group
grep -q "strategy-guide" site/index.html && echo "PASS — strategy-guide in nav"
grep -q "probability" site/index.html && echo "PASS — probability in nav"
```

---

## Constraints

- Follow all conventions in `CLAUDE.md` (global) and `.claude/CLAUDE.md` (project):
  `no any`, named exports only, vanilla CSS, no new npm packages beyond what is already
  in `package.json`.
- Rust: `cargo clippy -- -D warnings` must be clean after Phase 1. No new Cargo
  dependencies are required — the probability math uses only `std`.
- TypeScript: `bun run typecheck` must be clean after each phase.
- Do not modify `apps/rest-api/`, `apps/web/`, or any other app — this work touches only
  `apps/mcp-server/` and `apps/deck-cli/`.
- Do not add `pub mod` declarations for files that don't exist yet.
- The `--stats` block in `index.ts` must call `mcp.callTool` — do not compute
  probabilities in TypeScript. The Rust tool is the single source of truth for the math.
- The reference table in `probability.mdx` must use the corrected values from this
  prompt (11.7% / 22.1% / 31.5% / 39.9%), not the values in SPEC_07.

---

## Starting Point

Begin by reading the eleven files listed above. Then start Phase 1 — build the Rust
tool and verify the math assertions before writing any TypeScript or docs.
