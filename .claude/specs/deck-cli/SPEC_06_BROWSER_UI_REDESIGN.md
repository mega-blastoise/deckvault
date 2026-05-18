# SPEC_06: Browser Mode UI Redesign

## Context

The current browser mode (`src/browser/template.ts`, 1182 lines) ships a functional
but unpolished dark terminal aesthetic — monospace font, near-black backgrounds, dense
tight spacing. That was an appropriate first pass for MVP validation, but the target
state is a polished standalone product with card art as the primary visual element.

This spec replaces the CSS layer, restructures the HTML, and refines interactions. The
JavaScript state machine, MCP endpoints, and TypeScript server code are **not** changed
— the redesign is entirely within `template.ts`.

---

## Prerequisites

- SPEC_05 (browser mode architecture — `server.ts`, `open.ts`, `template.ts` all stable)
- SPEC_06 parser fix (search_cards returns JSON — no longer markdown regex)
- `--provider chrome` flow works end to end

---

## Design Constraints

- **Zero external dependencies.** No CDN fetches for fonts, CSS, or JS. The page must
  be fully functional offline (for card queries) with no network other than pokemontcg.io
  for card images.
- **Single HTML file.** CSS and JS are inlined in the template. No separate assets.
- **No framework.** Vanilla DOM manipulation — the existing JS logic stays. Redesign
  is CSS + HTML structure only, plus minor JS additions for interactions.
- **Fast initial paint.** `window.__DECK_CONTEXT__` is serialised into the page;
  the deck renders on DOMContentLoaded without any fetch calls.
- **Accessible.** Keyboard navigation, focus rings, ARIA labels on interactive controls.

---

## Visual Direction

### Palette

Move from near-black to a warm off-white base. Card art reads better against light
surfaces. The accent color uses a neutral blue-gray that doesn't compete with Energy
type colors.

```
Token                 Value         Role
──────────────────────────────────────────────────────
--bg-root             #F5F4F1       Page background (warm off-white)
--bg-panel            #FFFFFF       Panel surfaces
--bg-raised           #F9F8F6       Inset areas (search grid bg, deck list)
--bg-input            #F1F0ED       Input fields, secondary surfaces
--border              #E4E3DF       Subtle panel/row borders
--border-strong       #C9C7C1       Focused inputs, section dividers
--text-primary        #1C1917       Main text (stone-950)
--text-secondary      #78716C       Labels, meta text (stone-500)
--text-tertiary       #A8A29E       Placeholders, ghost text (stone-400)
--accent              #2563EB       Primary interactive blue
--accent-light        #EFF6FF       Accent hover/selected backgrounds
--accent-text         #1D4ED8       Accent text on light backgrounds
--green               #16A34A       Valid/legal state
--green-light         #F0FDF4       Legal badge background
--amber               #D97706       Warning state
--amber-light         #FFFBEB       Warning badge background
--red                 #DC2626       Error/illegal state
--red-light           #FEF2F2       Error badge background
```

### Typography

Replace JetBrains Mono with a system sans-serif stack. Monospace is reserved for
card IDs and code-like values only.

```
Body:         system-ui, -apple-system, 'Segoe UI', sans-serif
Monospace:    ui-monospace, 'JetBrains Mono', monospace  (IDs, counts only)
Base size:    15px
```

### Elevation

Panels use `box-shadow` for depth rather than borders:

```
--shadow-sm:  0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08)
--shadow-md:  0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06)
--shadow-lg:  0 10px 25px rgba(0,0,0,.12), 0 4px 6px rgba(0,0,0,.07)
```

---

## Layout

Three-column panel grid unchanged. Column widths adjusted for the larger card tiles:

```
┌──────────────────┬──────────────────┬────────────────────────────┐
│  SEARCH   380px  │  DECK     360px  │  ASSISTANT       flex 1    │
└──────────────────┴──────────────────┴────────────────────────────┘
```

All three panels are full-height. Overflow scrolls within each panel's content area.

### Panel anatomy

Each panel has three zones:

```
┌──────────────────────────────────────┐
│  HEADER  (fixed, 48px)               │
│  ─────────────────────────────────── │
│  CONTENT (flex 1, overflow-y auto)   │
│  ─────────────────────────────────── │
│  FOOTER  (fixed, search/chat input)  │
└──────────────────────────────────────┘
```

---

## Panel 1 — Card Search

### Header

```
┌───────────────────────────────────────┐
│  🔍  [           search cards...    ] │
└───────────────────────────────────────┘
```

Search input is the only element in the header. Clean, full-width, 40px tall.
No panel label, no chrome. Focus ring on tab, `aria-label="Search cards"`.

### Type filter bar (below header, pinned)

Pill-button row with color-coded type chips. Replaces the current JTAB system.

```
[ All ] [ ⚫ Pokémon ] [ 🟣 Trainer ] [ 🟡 Energy ]
```

Active pill: filled background (`--accent-light`, `--accent-text` border+text).
Inactive pill: ghost with `--border` border.

Each tab has a small color dot matching the section theme color:
- Pokémon: `#38BDF8` (sky)
- Trainer: `#A78BFA` (violet)
- Energy: `#FBBF24` (amber)

### Card grid (scrollable)

2-column grid, `156px` min column width. Cards are fully art-driven — the image is
the dominant element. Minimal footer below.

```
┌──────────────┐  ┌──────────────┐
│              │  │              │
│  card art    │  │  card art    │
│  5:7 ratio   │  │  5:7 ratio   │
│              │  │              │
│              │  │              │
│ ─────────── │  │ ─────────── │
│ H  Charizard │  │ I  Gardevoir │
│    ex        │  │    ex        │
└──────────────┘  └──────────────┘
```

**Card tile structure:**
- Image: full-width, `aspect-ratio: 5/7`, `object-fit: cover`, lazy-loaded
- Regulation mark chip: overlaid top-right, pill shape (not just a letter)
  - Legal (H/I/J): white text on `--green` background
  - Illegal: white text on `--red` background
- Footer strip: card name (semibold, single line, ellipsis) + type dot
- Add button: not visible by default — appears as a `+` overlay on image hover
  - Position: absolute, bottom-right corner of image, circular, `--accent` fill
  - Keyboard: focusable, `aria-label="Add {card name}"`

**On card tile click** (not the + button): opens the card detail popover (see below).

**Empty/loading state:** Skeleton shimmer animation on a 2×4 grid while search is
in-flight. "type to search · 19,818 cards" message before any search.

### Card detail popover (new)

Clicking a card tile opens a full-detail popover anchored to the tile. Not a modal —
no backdrop, no focus trap. Dismisses on `Escape`, click-outside, or clicking the same
card again.

```
┌────────────────────────────────────────────────────┐
│  ┌──────────────┐   Charizard ex                   │
│  │              │   Pokémon ex — Fire — 330 HP      │
│  │  large art   │                                   │
│  │              │   Regulation mark: I              │
│  │              │   Set: Obsidian Flames (sv3-125)   │
│  │              │                                   │
│  │              │   ─── Abilities ─────────────────  │
│  │              │   Stoke — Once per turn, search   │
│  │              │   your deck for up to 3 Fire...   │
│  │              │                                   │
│  └──────────────┘   ─── Attacks ──────────────────  │
│                     RRR  Burning Darkness  180      │
│                     This attack does 30 more…       │
│                                                     │
│                     [ Add to deck  + ]              │
└────────────────────────────────────────────────────┘
```

Popover appears to the right of the card tile (or left if near the right edge).
`box-shadow: --shadow-lg`. `border-radius: 12px`. White background.

---

## Panel 2 — Deck Builder

### Header

```
┌─────────────────────────────────────────────────────┐
│  [   Charizard ex — Pidgeot Control         ]  60/60 │
│                                              [↓ TOML] │
└─────────────────────────────────────────────────────┘
```

Deck name input: left-aligned, semibold placeholder, no border on rest state.
Count badge: right-aligned, pill shaped, color-coded:
- `warn`: 0–59 — amber
- `ok`: 60 — green (slightly larger, subtle pulse animation on hit)
- `no`: > 60 — red

Export button: solid green CTA when deck is saveable, disabled otherwise.

### Section stats bar (pinned, below header)

Small breakdown row showing Pokémon / Trainer / Energy counts:

```
  Pokémon 14  ·  Trainers 33  ·  Energy 12
  ─────────────────────────────────────────
  [type-colored mini bar proportional to counts]
```

The bar is a thin horizontal line (4px) split into three segments with type colors
(sky / violet / amber). Updates live as cards are added/removed.

### Card list (scrollable)

Section headers use a left-colored border and section count badge:

```
│ ▐ POKÉMON                              14 │
│ ─────────────────────────────────────────  │
```

Card rows:

```
┌────────────────────────────────────────────┐
│  ┌────┐  Charizard ex          ●  I        │
│  │ 🃏 │  sv3-125 · Fire                   │
│  └────┘  ─────────────────── [−] 3 [+] ×  │
└────────────────────────────────────────────┘
```

- Thumbnail: 44×62px, rounded corners, lazy-loaded, fallback to colored placeholder
- Name: semibold, 14px, ellipsis on overflow
- Meta line: set ID · type (secondary text, 12px)
- Regulation mark: small colored dot (not text chip) — green=legal, red=rotating
- Quantity stepper: `[−]` `3` `[+]` in a compact pill, `×` to remove
  - `−` disabled at 1, `+` disabled at 4 (or 60 total)
  - `×` always enabled — removes entire entry

### Rotating card warning

If any card in the deck has a non-H/I/J regulation mark, show a pinned warning banner
at the top of the card list (above section headers):

```
⚠  2 cards are not legal in current Standard
   Iono (sv2-185 · G),  Colress's Experiment (sv4-196 · G)
```

Amber background, dismissable with ×.

---

## Panel 3 — AI Assistant

### Header

```
┌─────────────────────────────────────────────────────────────┐
│  Assistant          ● Gemini Nano ready          [↺ context] │
└─────────────────────────────────────────────────────────────┘
```

Status indicator: small colored dot + text. States:
- `initializing…` — amber dot
- `ready` — green dot
- `error` — red dot + error text

Rebuild context button: icon+label, ghost style, right-aligned.

### Messages

Chat bubbles, not "terminal output with role labels":

```
                         ┌────────────────────────────┐
                         │ What's my turn 1 plan?      │
                         └────────────────────────────┘

 ┌────────────────────────────────────────────────────┐
 │ With Charizard ex, your ideal turn 1 is:           │
 │                                                     │
 │ • Open with Charmander on the Active spot          │
 │ • Bench a second Charmander if you have it         │
 │ • Use Nest Ball to search out basics               │
 └────────────────────────────────────────────────────┘
```

- User messages: right-aligned, `--accent` background, white text
- Assistant messages: left-aligned, `--bg-raised` background, `--text-primary`
- No role label — position and color is sufficient hierarchy
- Streamed text renders incrementally with a blinking cursor `▌`

### Setup guide (window.ai unavailable)

Replaces the existing `jsetup` block with a styled card component:

```
┌──────────────────────────────────────────────────────────┐
│  ⚠  Chrome Prompt API not available                      │
│  ─────────────────────────────────────────────────────── │
│  To enable Gemini Nano in this page:                     │
│                                                           │
│  1. Open  chrome://flags/#prompt-api-for-gemini-nano     │
│     Set to Enabled and relaunch Chrome                   │
│                                                           │
│  2. Open  chrome://components/                           │
│     Click Check for Update on                            │
│     Optimization Guide On Device Model                   │
│                                                           │
│  ─────────────────────────────────────────────────────── │
│  The card search and deck builder work without the API.  │
│  For full Claude-powered analysis: johto --deck <file>   │
└──────────────────────────────────────────────────────────┘
```

Amber left border. All other functionality (search, builder, export) remains usable.

### Chat input footer

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Ask about your deck...                             │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                               [ Send → ]    │
└─────────────────────────────────────────────────────────────┘
```

- `textarea` autogrows up to 5 lines (`field-sizing: content` where supported,
  JS fallback otherwise)
- Send button: filled `--accent` when input is non-empty, disabled ghost otherwise
- `Enter` submits, `Shift+Enter` adds newline

---

## Keyboard Navigation

| Key | Action |
|---|---|
| `/` | Focus search input (from anywhere) |
| `Escape` | Close card detail popover |
| `Tab` | Navigate search results (card tiles are focusable) |
| `Enter` on focused card tile | Add card to deck |
| `Shift+Enter` in chat input | Insert newline |
| `Enter` in chat input | Submit message |

All interactive controls have visible focus rings (`outline: 2px solid --accent, outline-offset: 2px`).

---

## Interactions

### Add card feedback

When a card is added to the deck, a small toast notification appears at the top-right:

```
  ✓  Added Charizard ex  ×3
```

Auto-dismisses after 2.5s. Stacks if multiple cards added quickly.

### Deck count pulse

When the deck count hits exactly 60, the count badge animates with a brief green
scale pulse before settling at the `ok` state.

### Card image fallback

When pokemontcg.io image fails to load, show a type-colored placeholder:

```
┌──────────────────┐
│                  │
│  ♦ Fire          │  ← type color bg, Energy symbol
│  Charizard ex    │
│                  │
└──────────────────┘
```

---

## File Changes

This spec modifies exactly one file:

```
apps/deck-cli/src/browser/template.ts    REWRITTEN
```

`server.ts`, `open.ts`, `args.ts`, and all Rust code are unchanged.

The TypeScript exports remain identical:
```typescript
export function generatePage(deck: EnrichedDeck | null): string
export const BROWSER_STATIC_PROMPT: string
```

---

## Acceptance Criteria

- [ ] All three panels are visible at 1280px viewport width with no horizontal scroll
- [ ] Card art thumbnails load from pokemontcg.io with lazy loading; fallback placeholder
      renders for failed requests (no broken image icon)
- [ ] Type filter tabs correctly filter search results by Pokémon / Trainer / Energy
- [ ] Card detail popover opens on click, shows attacks + abilities, dismisses on Escape
- [ ] Pressing `/` from anywhere focuses the search input
- [ ] Add card toast notification fires and auto-dismisses
- [ ] Deck count badge pulses green on reaching exactly 60 cards
- [ ] Rotating card warning banner appears for G-mark cards
- [ ] Export button downloads a valid SPEC_01-compliant TOML file
- [ ] Chat input auto-grows up to 5 lines
- [ ] Setup guide renders correctly when `window.ai` is undefined
- [ ] All interactive elements have visible focus rings (keyboard nav works)
- [ ] No external network requests besides pokemontcg.io image CDN
- [ ] `bun run typecheck` reports zero errors after changes

---

## Dependencies

- SPEC_05 (browser mode architecture)
- SPEC_06 parser fix (`search_cards` JSON format — already merged)

---

## Out of Scope

- Multi-deck tab support (deferred)
- Drag-and-drop card reordering in the builder
- Deck import from URL or clipboard
- Dark mode toggle
- Mobile layout (below 900px)
- Undo/redo history for deck edits
