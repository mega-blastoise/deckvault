# SPEC_07: Deck Probability Analysis

## Context

The agent currently reasons about deck consistency qualitatively — "you should run 4 copies
of Salvatore" — without being able to cite exact probabilities. This spec adds a
hypergeometric probability engine to the MCP server and exposes it as an agent tool and a
`--stats` CLI flag, closing that gap entirely.

This is **not** simulation. No game state is modelled, no turns are replayed. The output is
closed-form combinatorics computed from a deck list. It does not require the Anthropic API
and does not consume tokens.

---

## Prerequisites

- SPEC_02 (MCP server extensions — `load_deck`, `validate_deck`, `parse_deck_file`, `EnrichedDeck`)
- SPEC_03 (CLI `--deck` flag, agent loop, `AGENT_TOOLS` registry in `tools.ts`)

---

## Mathematical Model

All probability computations use the **hypergeometric distribution**:

```
P(X = k) = C(K, k) × C(N−K, n−k) / C(N, n)
```

| Symbol | Meaning |
|--------|---------|
| `N`    | Deck size (total cards) |
| `K`    | Copies of target card in deck |
| `n`    | Cards drawn (hand size) |
| `k`    | Exact successes desired |

### Derived quantities

**P(at least 1 in opening hand of 7)**
```
p_open = 1 − C(N−K, 7) / C(N, 7)
```

**P(at least 1 copy is prized)**
Prize zone = 6 cards randomly removed before play.
```
p_prized = 1 − C(N−K, 6) / C(N, 6)
```

Only meaningful for low-copy cards (1–2 copies). Cards with K ≥ 4 omit this field.

**P(at least 1 seen by turn T)**
After opening hand (7) + T additional draws (one per turn, assuming going second):
```
p_by_turn_T = 1 − C(N−K, 7+T) / C(N, 7+T)
```
Computed for T = 1, 2, 3, 4 (turns 1–4).

**Combination function**
Computed in log space to avoid u64 overflow on large values:
```rust
fn ln_combinations(n: u64, k: u64) -> f64 {
    // sum of ln(i) for i in (n-k+1)..=n  minus  sum of ln(i) for i in 1..=k
}
fn combinations(n: u64, k: u64) -> f64 { ln_combinations(n, k).exp() }
```

---

## New MCP Tool: `analyze_deck_probability`

### File

`apps/mcp-server/src/tools/analyze_probability.rs`

### Registration

Add to `apps/mcp-server/src/tools/mod.rs`:
```rust
pub mod analyze_probability;
```

Wire in the tool registry (wherever `LoadDeckTool`, `ValidateDeckTool` are registered):
```rust
registry.register(Box::new(AnalyzeProbabilityTool::new(Arc::clone(&db))));
```

### Struct

```rust
pub struct AnalyzeProbabilityTool {
    db: Arc<Database>,
}

impl AnalyzeProbabilityTool {
    pub fn new(db: Arc<Database>) -> Self { Self { db } }
}
```

### Input schema

```json
{
  "type": "object",
  "required": ["path"],
  "properties": {
    "path": {
      "type": "string",
      "description": "Absolute or relative path to the deck TOML or JSON file"
    },
    "spotlight": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional list of card IDs to always include in output regardless of copy count"
    }
  }
}
```

### Execute logic

```
1. Parse deck via parse_deck_file(path)  — reuse existing domain fn, same as load_deck
2. Enrich each card ID via self.db.get_card_by_id(id)
3. N = sum of all quantities (deck size — may be < 60 for WIP decks)
4. For each unique card entry:
   a. K = entry.quantity
   b. Compute p_open   = hypergeometric_at_least_one(N, K, 7)
   c. Compute p_exact1 = hypergeometric_exact(N, K, 7, 1)
   d. Compute p_exact2 = hypergeometric_exact(N, K, 7, 2)  — 0.0 when K < 2
   e. Compute p_prized = if K <= 2 { Some(hypergeometric_at_least_one(N, K, 6)) } else { None }
   f. Compute turn_curve: Vec<(u8, f64)> for T in 1..=4
5. Build opening_hand list: all cards, sorted descending by p_open
6. Build prized_risk list:  cards where p_prized is Some, sorted descending
7. If spotlight provided: mark those entries; they appear first in opening_hand
8. Serialize and return as JSON text in CallToolResult
```

### Output schema

```json
{
  "deckSize": 60,
  "complete": true,
  "openingHand": [
    {
      "cardId": "sv5-144",
      "name": "Buddy-Buddy Poffin",
      "copies": 4,
      "pOpen": 0.3950,
      "pExactlyOne": 0.3168,
      "pExactlyTwo": 0.1213,
      "pPrized": null,
      "turnCurve": [
        { "turn": 1, "pAtLeastOne": 0.4580 },
        { "turn": 2, "pAtLeastOne": 0.5166 },
        { "turn": 3, "pAtLeastOne": 0.5703 },
        { "turn": 4, "pAtLeastOne": 0.6192 }
      ],
      "spotlight": false
    },
    {
      "cardId": "sv8pt5-117",
      "name": "Maximum Belt",
      "copies": 1,
      "pOpen": 0.1095,
      "pExactlyOne": 0.1095,
      "pExactlyTwo": 0.0,
      "pPrized": 0.1000,
      "turnCurve": [
        { "turn": 1, "pAtLeastOne": 0.1277 },
        { "turn": 2, "pAtLeastOne": 0.1454 },
        { "turn": 3, "pAtLeastOne": 0.1625 },
        { "turn": 4, "pAtLeastOne": 0.1791 }
      ],
      "spotlight": true
    }
  ],
  "prizedRisk": [
    { "cardId": "sv8pt5-117", "name": "Maximum Belt",  "copies": 1, "pPrized": 0.1000 },
    { "cardId": "sv8pt5-37",  "name": "Dusknoir",      "copies": 1, "pPrized": 0.1000 },
    { "cardId": "me2-90",     "name": "Grimsley's Move","copies": 1, "pPrized": 0.1000 }
  ]
}
```

`complete: true` when `deckSize == 60`. When false the agent should note that
probabilities are computed on the partial deck and will shift when the deck is finalized.

### Rust types

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbabilityReport {
    pub deck_size: u32,
    pub complete: bool,
    pub opening_hand: Vec<CardProbability>,
    pub prized_risk: Vec<PrizedEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardProbability {
    pub card_id: String,
    pub name: String,
    pub copies: u32,
    pub p_open: f64,
    pub p_exactly_one: f64,
    pub p_exactly_two: f64,
    pub p_prized: Option<f64>,
    pub turn_curve: Vec<TurnCurveEntry>,
    pub spotlight: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnCurveEntry {
    pub turn: u8,
    pub p_at_least_one: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrizedEntry {
    pub card_id: String,
    pub name: String,
    pub copies: u32,
    pub p_prized: f64,
}
```

All `f64` probability values are rounded to 4 decimal places before serialization.

---

## TypeScript Types

New file: `apps/deck-cli/src/probability/types.ts`

```typescript
export type TurnCurveEntry = {
  turn: number;
  pAtLeastOne: number;
};

export type CardProbability = {
  cardId: string;
  name: string;
  copies: number;
  pOpen: number;
  pExactlyOne: number;
  pExactlyTwo: number;
  pPrized: number | null;
  turnCurve: TurnCurveEntry[];
  spotlight: boolean;
};

export type PrizedEntry = {
  cardId: string;
  name: string;
  copies: number;
  pPrized: number;
};

export type ProbabilityReport = {
  deckSize: number;
  complete: boolean;
  openingHand: CardProbability[];
  prizedRisk: PrizedEntry[];
};
```

---

## Agent Tool

Add to `AGENT_TOOLS` in `apps/deck-cli/src/agent/tools.ts`:

```typescript
{
  name: 'analyze_deck_probability',
  description:
    'Compute hypergeometric opening-hand probabilities and prize risk for every card ' +
    'in a deck. Returns p(at least 1 in opening 7), p(prized), and a turn 1–4 draw curve ' +
    'per card. Use this when asked about consistency, copy counts, or singleton risk.',
  input_schema: {
    type: 'object' as const,
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the deck TOML or JSON file',
      },
      spotlight: {
        type: 'array',
        items: { type: 'string' },
        description: 'Card IDs to highlight in output',
      },
    },
  },
},
```

The agent calls this automatically when:
- The user asks "how consistent is this deck?"
- The user asks "should I run 2 or 3 copies of X?"
- The user asks about singleton risk or prize probability
- The agent is evaluating a proposed cut that reduces a 4-of to a 3-of

---

## CLI `--stats` Flag

### Behaviour

When `--stats` is passed, after the deck loads and before the REPL prompt opens, the CLI
calls `analyze_deck_probability` on each loaded deck and prints a formatted summary to
stdout. The REPL then opens as normal.

```
$ johto --deck ./decks/mega-sharpedo-ex-2.toml --stats
```

### Output format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Deck: Mega Sharpedo ex / Dusknoir   [58/60 — incomplete]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Opening hand (7 from 58)
  ────────────────────────────────────────────────────────
  Card                      ×  open 1+   T2     T3     T4
  ────────────────────────────────────────────────────────
  Buddy-Buddy Poffin        4   39.5%  45.8%  51.7%  57.0%
  Poké Pad                  4   39.5%  45.8%  51.7%  57.0%
  Ultra Ball                4   39.5%  45.8%  51.7%  57.0%
  Lillie's Determination    4   39.5%  45.8%  51.7%  57.0%
  Salvatore                 3   30.8%  36.2%  41.3%  46.1%
  Boss's Orders             3   30.8%  36.2%  41.3%  46.1%
  Janine's Secret Art       2   21.5%  25.6%  29.5%  33.3%
  Night Stretcher           2   21.5%  25.6%  29.5%  33.3%
  Dawn                      1   11.0%  12.8%  14.5%  16.3%
  Binding Mochi             1   11.0%  12.8%  14.5%  16.3%
  Rare Candy                1   11.0%  12.8%  14.5%  16.3%
  Energy Recycler           1   11.0%  12.8%  14.5%  16.3%
  Mega Signal               1   11.0%  12.8%  14.5%  16.3%
  Maximum Belt    ★         1   11.0%  12.8%  14.5%  16.3%
  Dusknoir        ★         1   11.0%  12.8%  14.5%  16.3%
  ────────────────────────────────────────────────────────

  ⚠  Prize risk  (singletons — each has 10.0% chance of being prized)
     Maximum Belt · Dusknoir · Mega Signal · Dawn · Binding Mochi
     Rare Candy · Energy Recycler

  ★  = spotlight cards (high-impact singletons)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The ★ spotlight markers are automatically applied to ACE SPEC cards and cards whose
`[meta]` notes contain the word "combo". The user can also pass `--spotlight <id>` to
pin specific cards.

`--stats` may be combined with `--dry-run` — in that case, only the stats table is
printed (no system prompt dump, no REPL).

### Implementation location

`apps/deck-cli/src/index.ts` — after `loadAndEnrichDeck` succeeds, before
`buildSystemPrompt` and before the REPL opens, check the `--stats` flag and call
`mcp.callTool('analyze_deck_probability', { path })`, then format and print.

A formatting helper lives at `apps/deck-cli/src/probability/format.ts`.

---

## New CLI Flags Summary

| Flag | Type | Description |
|------|------|-------------|
| `--stats` | boolean | Print probability table after deck load, before REPL |
| `--spotlight <id>` | string (repeatable) | Pin card IDs to ★ in stats output |

Both flags are parsed in `apps/deck-cli/src/args.ts` via `cac`.

---

## Docs Page

New file: `apps/deck-cli/docs/probability.mdx`

Content sections:
1. **What this does** — one paragraph: hypergeometric distribution, what it tells you, what it doesn't (not simulation)
2. **Using `--stats`** — shell example, annotated output screenshot/block
3. **Opening hand probabilities** — table of p_open values for 1–4 copies in a 60-card deck (reference card)
4. **Prize risk** — explain the 10% singleton risk, when it matters (ACE SPECs, tech singletons, Dusknoir)
5. **Turn curve** — explain T1–T4 columns, when to use them (deciding between 2-of and 3-of)
6. **Asking the agent** — example prompts that trigger `analyze_deck_probability` mid-session
7. **Combo probability** — note that joint probability (card A AND card B in opening 7) is
   computable but not currently in scope; link to the GitHub issue

### Navigation update

`apps/deck-cli/dxdocs.config.ts` — add to the Reference group:

```typescript
{ type: 'page', path: '/probability', title: 'Probability Analysis' },
```

---

## Reference: p_open for common copy counts

| Copies (K) | p_open (60-card deck, 7-card hand) | p_prized |
|:----------:|:-----------------------------------:|:--------:|
| 1          | 10.9%                               | 10.0%    |
| 2          | 20.7%                               | 19.0%    |
| 3          | 29.5%                               | 27.1%    |
| 4          | 37.4%                               | 34.4%    |

These values are the ground truth the doc page and agent both reference.

---

## File Changeset

| File | Change |
|------|--------|
| `apps/mcp-server/src/tools/analyze_probability.rs` | **new** — Rust tool implementation |
| `apps/mcp-server/src/tools/mod.rs` | **modify** — add `pub mod analyze_probability;` |
| `apps/mcp-server/src/main.rs` (or registry file) | **modify** — register `AnalyzeProbabilityTool` |
| `apps/deck-cli/src/probability/types.ts` | **new** — TypeScript response types |
| `apps/deck-cli/src/probability/format.ts` | **new** — `--stats` table formatter |
| `apps/deck-cli/src/agent/tools.ts` | **modify** — add `analyze_deck_probability` tool definition |
| `apps/deck-cli/src/args.ts` | **modify** — add `--stats`, `--spotlight` flags |
| `apps/deck-cli/src/index.ts` | **modify** — wire `--stats` flag after deck load |
| `apps/deck-cli/docs/probability.mdx` | **new** — dxdocs page |
| `apps/deck-cli/dxdocs.config.ts` | **modify** — add probability to Reference nav group |

---

## Success Criteria

- [ ] `johto --deck ./decks/mega-sharpedo-ex-2.toml --stats` prints the probability table
      to stdout before the REPL opens, then the session proceeds normally
- [ ] The agent calls `analyze_deck_probability` when asked "should I run 2 or 3 copies
      of Salvatore?" and cites exact percentages in its answer
- [ ] `analyze_deck_probability` returns correct values for known inputs:
      K=4, N=60, n=7 → `pOpen ≈ 0.3950` (±0.0001)
      K=1, N=60, n=6 → `pPrized ≈ 0.1000` (±0.0001)
- [ ] Incomplete decks (< 60 cards) return `complete: false` and correct probabilities
      computed on the actual `deckSize`, not 60
- [ ] `--stats --dry-run` prints only the stats table, not the system prompt
- [ ] `cargo clippy -- -D warnings` clean after addition of `analyze_probability.rs`
- [ ] `bun run typecheck` clean after addition of `src/probability/types.ts`
- [ ] `docs/probability.mdx` builds without error under `bun run docs:build`
- [ ] The probability page appears in the Reference section of the built site
