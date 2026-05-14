# SPEC_08: Docsite Updates

## Context

The docs site at `apps/deck-cli/docs/` (built by `@bundt/dxdocs@^0.4.0`) covers the
technical surface of `johto` well — build steps, file format, MCP tool reference — but
is missing two categories of content:

1. **Strategic usage guidance.** There is no page explaining how to actually use an agent
   session to improve a deck, understand matchups, or work through opening hands. The
   `agent-session.mdx` page covers startup mechanics but treats the session as a black box.

2. **SPEC_07 surface.** The new `analyze_deck_probability` MCP tool, `--stats` flag, and
   `--spotlight` flag introduced in SPEC_07 have no documentation anywhere in the site.

This spec defines two new pages, targeted updates to four existing pages, and navigation
changes to `dxdocs.config.ts`.

---

## Prerequisites

- SPEC_07 complete — `analyze_deck_probability` MCP tool shipped and registered
- `--stats` and `--spotlight` flags live in `src/args.ts` and `src/index.ts`
- `docs/` dxdocs setup stable (already confirmed — site builds clean)

---

## New Pages

### 1. `docs/strategy-guide.mdx`

The primary missing content. Covers the four use cases a player needs in practice:
improving a deck, understanding strategies, navigating matchups, and sequencing hands.

**Frontmatter:**
```yaml
---
title: Strategy Guide
description: How to use johto's agent session for deck improvement, matchup analysis, and hand sequencing.
---
```

**Section outline and required content:**

#### § Starting with context

One paragraph. Explain that the agent receives the full enriched decklist before the
first message — card names, HP, attacks, abilities, regulation marks — so the player
never needs to describe their deck. Link to [Agent Session](/agent-session) for startup
mechanics.

```
ANTHROPIC_API_KEY=sk-ant-... johto --deck ./decks/my-deck.toml
```

Callout (tip): "Run `--dry-run` first to confirm all card IDs resolved correctly before
opening a live session."

#### § 1. Improving the deck

Explain that the agent has `search_cards`, `get_card_by_id`, and `compare_cards` live and
will look up alternatives in real-time when asked about cuts and additions.

Include a **Prompt patterns** subsection with a code block of concrete examples:

```
The deck feels slow on T1. What's dragging it down and what would you cut or add?

I keep running out of Dark Energy mid-game — is the fix more energy, better recovery,
or a different accelerator?

I have 2 open slots. Given the spread strategy, what 2 cards would you add and why?

Should I run 3 or 4 copies of Salvatore?
```

Note: when the agent proposes a swap it calls `compare_cards` for a side-by-side view,
then `validate_deck` to confirm the revised list is legal. Mention versioned snapshots —
the original TOML is never mutated.

#### § 2. Understanding strategies

Explain that the system prompt includes a full archetype framework and the agent reasons
against your specific 60 cards, not a generic archetype.

**Prompt patterns:**
```
Walk me through the primary and secondary win conditions of this deck.

What does this deck do when the main attacker gets KO'd before I've set up the bench?

Explain the Night Joker priority order — when do I copy Zekrom vs Sigilyph vs Reshiram?
```

Note: deck-specific questions yield deck-specific answers because the exact card text is
in context. "Explain Hungry Jaws" gets a different answer depending on whether the deck
contains Toxtricity, Carvanha, and Salvatore.

#### § 3. Matchup guidance

Explain that the agent can use `search_cards` to look up what common meta decks run and
reason about your deck against them.

**Prompt patterns:**
```
How does this deck match up against Dragapult ex spread decks?

What's my worst matchup given this list? What in the deck helps survive it?

My local meta has a lot of Lugia VSTAR and Charizard ex. How do I pilot this against both?
```

Note: the agent can do prize math, identify weakness exploits (example: Sharpedo and
Dusknoir share Grass ×2 — this is a real vulnerability), and flag when trainer counts
leave exposure in specific scenarios.

#### § 4. Hand setup and sequencing

Describe this as the highest-value use. The agent knows every card's exact text and can
work through specific hand states precisely.

**Prompt patterns:**
```
What does my perfect T1 hand look like, and what do I mulligan toward?

Walk me through the Secret Box → Academy at Night → Grimsley's Move combo
step by step, including what I need in hand before I start it.

If I open Carvanha active with Toxel + Buddy-Buddy Poffin + Salvatore
+ Lillie's Determination + 2 Dark Energy, what's my T1 play?
```

Note: the more specific the hand state, the more precise the answer. The agent won't
hallucinate timing rules because it has the exact card text in context.

#### § 5. Comparing two decks

Show the multi-deck flag and a sample comparative question:

```bash
johto \
  --deck ./decks/mega-sharpedo-ex.toml \
  --deck ./decks/mega-sharpedo-ex-2.toml
```

```
What does Deck 2 do that Deck 1 can't, and which would you run at a tournament?
```

#### § 6. What the agent can't do

Short section. Be direct:

- Cannot simulate games or calculate probability distributions mid-session on its own
  — use `--stats` for that (see [Probability Analysis](/probability))
- Cannot watch replays or pull tournament results
- Cannot push proposed changes back to the TOML automatically — write-back is a planned
  feature; current workflow is manual editing of the versioned snapshot

---

### 2. `docs/probability.mdx`

Required by SPEC_07. Covers the `--stats` flag, `analyze_deck_probability` agent tool,
and the hypergeometric model.

**Frontmatter:**
```yaml
---
title: Probability Analysis
description: Opening hand probabilities, prize risk, and turn curve analysis using the hypergeometric distribution.
---
```

**Section outline:**

#### § What this does

One paragraph. This computes **hypergeometric probabilities** — the exact mathematical
likelihood of drawing specific cards — directly from a deck list. No game state is
modelled, no turns are replayed. The result is deterministic given the deck composition.

Callout (info): "Probability analysis runs entirely on the local MCP server. It does not
call the Anthropic API and does not consume tokens."

#### § Using `--stats`

Shell example with full annotated output block (copy the `--stats` output format from
SPEC_07 verbatim). Explain each column:

| Column | Meaning |
|---|---|
| `×` | Copy count in the deck |
| `open 1+` | P(at least 1 copy in opening hand of 7) |
| `T2` | P(at least 1 seen by end of Turn 2, going second) |
| `T3` | P(at least 1 seen by end of Turn 3) |
| `T4` | P(at least 1 seen by end of Turn 4) |

Explain ★ spotlight: auto-applied to ACE SPEC cards and cards referenced as "combo" in
`[meta].notes`. Manual override: `--spotlight <id>` (repeatable).

Explain ⚠ Prize risk: singletons and 2-ofs where the card may be among the 6 prized
cards before the game begins.

Callout (tip): "`--stats` can be combined with `--dry-run` — only the probability table
is printed, no system prompt, no REPL."

#### § Opening hand probability reference

Prose: one sentence framing the table as a reference for deciding copy counts.

Then the reference table from SPEC_07:

| Copies | open 1+ | p(prized) |
|:------:|:-------:|:---------:|
| 1      | 10.9%   | 10.0%     |
| 2      | 20.7%   | 19.0%     |
| 3      | 29.5%   | 27.1%     |
| 4      | 37.4%   | 34.4%     |

Callout (warning): "These values assume a complete 60-card deck. The CLI computes
probabilities on the actual deck size when `complete: false` — numbers will shift
when missing slots are filled."

#### § Prize risk

Explain the concept: 6 cards are randomly removed before play begins. A singleton has a
10% chance of being one of them; a 2-of has ~19%. This is especially relevant for:

- ACE SPEC cards (exactly 1 in deck by rule)
- Win-condition tech singletons (Dusknoir, Sigilyph, Grimsley's Move)
- One-of Supporters that anchor a combo (Dawn tutoring the full Dusk line)

Include a concrete example from a real deck (Mega Sharpedo ex / Dusknoir): list the 7
singletons, each at 10% prized risk, and explain what each one's absence means for the
game plan.

#### § Turn curve

Explain T1–T4 columns. Key insight: turn curve answers "at what point is this card
reliably in reach?" not just "do I open with it?".

Concrete use case: deciding between 2-of and 3-of Rare Candy.
- 2 copies: open 1+ = 20.7%, by T3 = 29.5%
- 3 copies: open 1+ = 29.5%, by T3 = 41.3%

If you need Rare Candy by T2 to set up your Stage 2, 3 copies meaningfully improves the
odds. If Stage 2 is only needed by T4, 2 copies is defensible.

#### § Asking the agent

Show that `analyze_deck_probability` is also available as an agent tool mid-session.

**Prompt patterns that trigger it automatically:**
```
How consistent is this deck?

Should I run 2 or 3 copies of Rare Candy?

What's the prize risk on my singletons?

If I cut a Buddy-Buddy Poffin to add a third Salvatore, how does that affect consistency?
```

The agent will call `analyze_deck_probability` with the current deck path and cite exact
percentages in its response rather than reasoning qualitatively.

#### § Combo probability (future)

Short note: joint probability (card A AND card B both in opening 7) is computable but
not yet implemented. Example: "P(Carvanha + Salvatore in opening hand)" — the probability
you can evolve Sharpedo on T1.

Callout (info): "Multi-card combo analysis is tracked in the project backlog. For now,
ask the agent — it can reason through joint probabilities manually when you describe the
combo."

---

## Updated Pages

### `docs/agent-session.mdx`

**Agent tools table** — add new row:

| Tool | When the agent uses it |
|---|---|
| `analyze_deck_probability` | Computing exact open rates and prize risk when asked about consistency or copy counts |

**New section after "Proposing a deck change":**

#### Probability analysis

```
You: should I run 3 or 4 copies of Salvatore?

[tool: analyze_deck_probability]

With 3 copies, you open at least 1 Salvatore in 29.5% of games. Bumping to 4 copies
raises that to 37.4% — a meaningful 8-point improvement on a card that enables same-turn
Sharpedo evolution. Given your 8-energy count and Carvanha's Reckless Charge pre-loading
damage, I'd run 4.
```

Add a Callout (tip): "Use `--stats` to see probabilities for every card in your deck
before the session opens. See [Probability Analysis](/probability)."

---

### `docs/cli-reference.mdx`

**Add two new flag sections** after `--dry-run`:

#### `--stats`

Print a probability table (opening hand odds, prize risk, turn curve) for each loaded
deck immediately after loading, before the REPL prompt opens.

```bash
johto --deck ./decks/my-deck.toml --stats
```

Compatible with `--dry-run` — when both are set, only the stats table is printed (no
system prompt, no REPL). Not available with `--provider chrome`.

#### `--spotlight <id>`

Pin a specific card ID to the ★ spotlight section of the `--stats` output. Repeatable.

```bash
johto --deck ./decks/my-deck.toml \
  --stats \
  --spotlight sv8pt5-117 \
  --spotlight sv8pt5-37
```

ACE SPEC cards are spotlighted automatically; `--spotlight` is for other high-priority
singletons you want to track explicitly.

**Guard rules table** — add new row:

| Condition | Error |
|---|---|
| `--stats` with `--provider chrome` | `Error: --stats is not applicable in browser mode (--provider chrome)` |

---

### `docs/mcp-tools.mdx`

**Tools overview table** — add new row:

| Tool | Added by | Description |
|---|---|---|
| `analyze_deck_probability` | **new** (SPEC_07) | Hypergeometric probability analysis for every card in a deck |

**New full section** after `validate_deck`, following the exact same structure as the
existing tool sections:

---

#### `analyze_deck_probability`

Reads a deck file, computes hypergeometric opening-hand probabilities for every card, and
returns prize risk and a T1–T4 draw curve. No database query is performed beyond what
`load_deck` already does — this is pure arithmetic on copy counts and deck size.

##### Input

```json
{
  "path": "/absolute/or/relative/path/to/deck.toml",
  "spotlight": ["sv8pt5-117", "sv8pt5-37"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | string | ✅ | Absolute or relative path to the deck file |
| `spotlight` | string[] | — | Card IDs to mark with ★ in `--stats` output |

##### Output — `ProbabilityReport`

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
    }
  ],
  "prizedRisk": [
    { "cardId": "sv8pt5-117", "name": "Maximum Belt", "copies": 1, "pPrized": 0.1000 }
  ]
}
```

`complete: true` when `deckSize == 60`. Incomplete decks still return valid probabilities
computed on the actual deck size — the agent notes this in its response.

All probability values are `f64` rounded to 4 decimal places.

##### Field reference

| Field | Type | Description |
|---|---|---|
| `deckSize` | integer | Total card count (sum of all quantities) |
| `complete` | boolean | `true` when `deckSize == 60` |
| `openingHand` | CardProbability[] | All cards, sorted descending by `pOpen` |
| `prizedRisk` | PrizedEntry[] | Cards with `copies ≤ 2`, sorted descending by `pPrized` |
| `pOpen` | float | P(at least 1 in opening hand of 7) |
| `pExactlyOne` | float | P(exactly 1 in opening hand of 7) |
| `pExactlyTwo` | float | P(exactly 2 in opening hand of 7); `0.0` when `copies < 2` |
| `pPrized` | float \| null | P(at least 1 copy prized); `null` when `copies ≥ 3` |
| `turnCurve` | TurnCurveEntry[] | `turn` 1–4: P(at least 1 seen by that turn, going second) |

Callout (info): "Probability values use the hypergeometric distribution computed in
log-space to avoid floating-point overflow on the combination function."

---

### `docs/index.mdx`

**CardGrid** — add two new cards:

```mdx
<Card title="Strategy Guide" href="/strategy-guide">
  Prompt patterns for deck improvement, matchup analysis, and hand sequencing.
</Card>
<Card title="Probability Analysis" href="/probability">
  Opening hand odds, prize risk, and turn curves from the hypergeometric model.
</Card>
```

---

## Navigation

`apps/deck-cli/dxdocs.config.ts`:

```typescript
export default {
  // ... existing config ...
  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Getting Started',
      items: [
        { type: 'page', path: '/quickstart', title: 'Quickstart' },
        { type: 'page', path: '/deck-format', title: 'Deck File Format' },
      ]
    },
    {
      type: 'group',
      title: 'Modes',
      items: [
        { type: 'page', path: '/agent-session', title: 'Agent Session (REPL)' },
        { type: 'page', path: '/browser-mode', title: 'Browser Mode' },
      ]
    },
    {
      type: 'group',
      title: 'Guides',                             // NEW group
      items: [
        { type: 'page', path: '/strategy-guide', title: 'Strategy Guide' },
        { type: 'page', path: '/probability',    title: 'Probability Analysis' },
      ]
    },
    {
      type: 'group',
      title: 'Reference',
      items: [
        { type: 'page', path: '/cli-reference', title: 'CLI Reference' },
        { type: 'page', path: '/mcp-tools',     title: 'MCP Tools' },
      ]
    }
  ],
};
```

A **Guides** group sits between Modes and Reference. This is where content that answers
"how do I use this?" lives, distinct from the reference material that answers "what does
this flag do?"

---

## File Changeset

| File | Change |
|------|--------|
| `apps/deck-cli/docs/strategy-guide.mdx` | **new** — six-section strategy and prompting guide |
| `apps/deck-cli/docs/probability.mdx` | **new** — seven-section probability analysis guide |
| `apps/deck-cli/docs/agent-session.mdx` | **modify** — add `analyze_deck_probability` to tools table; add probability example; add `--stats` Callout |
| `apps/deck-cli/docs/cli-reference.mdx` | **modify** — add `--stats` and `--spotlight` flag docs; add guard rule |
| `apps/deck-cli/docs/mcp-tools.mdx` | **modify** — add `analyze_deck_probability` to overview table and add full tool section |
| `apps/deck-cli/docs/index.mdx` | **modify** — add Strategy Guide and Probability Analysis cards to CardGrid |
| `apps/deck-cli/dxdocs.config.ts` | **modify** — add Guides group with strategy-guide and probability pages |

---

## Success Criteria

- [ ] `bun run docs:build` completes with no errors after all changes
- [ ] `bun run docs:dev` serves all 9 pages without 404s
- [ ] Navigation renders three groups: Getting Started · Modes · Guides · Reference
- [ ] `strategy-guide.mdx` contains all six sections with concrete prompt examples in
      code blocks
- [ ] `probability.mdx` contains the p_open reference table with values matching SPEC_07
      ground truth (4-of: 37.4%, 1-of: 10.9%)
- [ ] `mcp-tools.mdx` documents `analyze_deck_probability` with input/output JSON
      matching the `ProbabilityReport` schema in SPEC_07
- [ ] `cli-reference.mdx` documents `--stats` and `--spotlight` flags including the
      `--provider chrome` guard rule
- [ ] `index.mdx` CardGrid shows all 4 primary entry points (Quickstart, Deck Format,
      Agent Session, Browser Mode) plus the 2 new cards (Strategy Guide, Probability)
- [ ] No existing page content is removed — all changes are additive except the
      navigation config restructure
