# SPEC_05: Browser Mode

## Context

Browser mode serves two related purposes from a single `--provider chrome` flag:

1. **Deck viewer + Q&A** — load an existing deck file and ask Gemini Nano questions
   about it. Lightweight alternative to the Anthropic REPL for quick on-device sessions.

2. **Deck builder + TOML export** — build a new deck from scratch using a card search
   panel backed by the running MCP server, then export the result as a `.toml` file in
   the exact SPEC_01 format the CLI expects. The exported file drops straight into
   `johto --deck <file>` in the REPL.

Both purposes share the same served page, the same three-panel layout, and the same
Chrome Prompt API chat panel. The builder pre-populates from the loaded deck when
`--deck` is provided; it starts empty when it is not.

`--deck` is **optional** in browser mode. It is still required for `--provider anthropic`.

This is explicitly a **lightweight deck viewer, builder, and basic Q&A experience**,
not a replacement for the Anthropic REPL session. Gemini Nano is a small on-device
model — competitive reasoning depth will be shallower than Claude. That expectation
is surfaced in the spec and in the served page itself.

---

## Prerequisites

- SPEC_01 (deck file format — TOML schema the builder exports to)
- SPEC_02 (MCP server — `load_deck` for enrichment, `search_cards` / `get_card_by_id`
  for the builder's card search panel)
- SPEC_03 (CLI app — `args.ts`, `index.ts`, `deck/loader.ts` already present)
- SPEC_04 (agent prompt — static layer re-used in browser system prompt)
- Chrome Canary / Dev with `chrome://flags/#prompt-api-for-gemini-nano` enabled
  (runtime requirement for the served page, not for the CLI build)

---

## New Dependencies

No new npm packages. `Bun.serve` handles the HTTP server. The MCP client (already
present) handles card search. TOML serialisation is implemented as a ~20-line pure
function in the page JS — no library needed for the simple SPEC_01 schema.

---

## Requirements

### 1. CLI Flag (`src/args.ts` — modified)

Add `provider` to `CliArgs` and parse `--provider`. Make `--deck` optional when
`--provider chrome` is set.

```typescript
export type LlmProvider = 'anthropic' | 'chrome';

export interface CliArgs {
  readonly deckPaths: readonly string[];
  readonly dryRun: boolean;
  readonly mcpServerPath: string;
  readonly provider: LlmProvider;   // NEW — default 'anthropic'
}
```

**`parseArgs` changes:**

Add `--provider` parsing inside the arg loop:

```typescript
} else if (arg === '--provider') {
  const next = args[++i];
  if (!next) throw new Error('--provider requires a value');
  if (next !== 'anthropic' && next !== 'chrome') {
    throw new Error(`Unknown provider "${next}". Valid options: anthropic, chrome`);
  }
  provider = next as LlmProvider;
}
```

Replace the existing deck-path guard:

```typescript
// Before:
if (deckPaths.length === 0) {
  throw new Error('At least one --deck path is required');
}

// After:
if (deckPaths.length === 0 && provider !== 'chrome') {
  throw new Error('--deck is required for --provider anthropic');
}
```

Guard: `--dry-run` combined with `--provider chrome` exits with:
```
Error: --dry-run is not applicable in browser mode (--provider chrome)
```

Update `printHelp` to document both changes:

```
  --deck, -d <path>       Path to deck file (.toml or .json). Repeatable.
                          Optional when --provider chrome (opens empty builder).
  --provider <name>       LLM provider. Options: anthropic (default), chrome.
                          chrome: opens browser, uses Chrome Prompt API (no API key).
```

---

### 2. Entry Point Branch (`src/index.ts` — modified)

Move `ANTHROPIC_API_KEY` check to be conditional on provider. Pass `mcp` into
`startBrowserServer`. Handle the `deck: EnrichedDeck | null` case.

```typescript
const args = parseArgs(process.argv);

// API key guard — only for Anthropic REPL mode
if (args.provider === 'anthropic') {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error(
      'Error: ANTHROPIC_API_KEY environment variable is required for --provider anthropic'
    );
    process.exit(1);
  }
}

// MCP server — required in both modes (deck enrichment + card search)
console.log('Starting MCP server...');
const mcp = new McpClient(args.mcpServerPath);
await mcp.initialize();
console.log('MCP server ready.');

// Deck loading — empty array is valid for browser mode
const decks = await Promise.all(
  args.deckPaths.map((p) => {
    console.log(`Loading deck: ${p}`);
    return loadAndEnrichDeck(p, mcp);
  })
);
if (decks.length > 0) {
  console.log(`Loaded ${decks.length} deck(s): ${decks.map((d) => d.name).join(', ')}`);
}
```

Browser branch (inserted before existing REPL logic):

```typescript
if (args.provider === 'chrome') {
  if (decks.length > 1) {
    console.warn(
      'Warning: browser mode supports one deck at a time. Using first deck: ' +
        decks[0]!.name
    );
  }

  const { startBrowserServer } = await import('./browser/server');
  const { openInBrowser } = await import('./browser/open');

  const deck = decks[0] ?? null;
  const server = startBrowserServer(deck, mcp);   // mcp passed — used for card search API
  const url = `http://localhost:${server.port}`;

  console.log(`Serving deck at: ${url}`);
  if (!deck) console.log('No deck loaded — browser will open the deck builder.');
  console.log('Press Ctrl+C to stop.\n');
  openInBrowser(url);

  const shutdown = (): never => {
    server.close();
    mcp.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<never>(() => {});
}

// --- existing REPL path continues below, untouched ---
```

---

### 3. Browser Server (`src/browser/server.ts` — modified)

Accepts `McpClient` and exposes two JSON API routes for the card search panel.

```typescript
import type { McpClient } from '../mcp/client';
import type { EnrichedDeck } from '../deck/types';
import { generatePage } from './template';

export interface BrowserServer {
  readonly port: number;
  readonly close: () => void;
}

interface McpToolResult {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text: string }>;
  readonly isError: boolean | null;
}

export function startBrowserServer(
  deck: EnrichedDeck | null,
  mcp: McpClient
): BrowserServer {
  const html = generatePage(deck);

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/') {
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (url.pathname === '/api/search') {
        return handleSearch(url.searchParams, mcp);
      }

      if (url.pathname.startsWith('/api/card/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/card/'.length));
        return handleGetCard(id, mcp);
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return { port: server.port, close: () => server.stop() };
}
```

---

### 4. Browser Open Utility (`src/browser/open.ts` — unchanged)

```typescript
import { spawn } from 'node:child_process';

export function openInBrowser(url: string): void {
  const [cmd, ...cmdArgs] =
    process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
    : ['xdg-open', url];

  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
}
```

---

### 5. Card Search API (`src/browser/server.ts` — continued)

Two private functions backing the API routes. Both proxy to the running MCP child
process and return the MCP tool's JSON text directly as the HTTP response body.

```typescript
async function handleSearch(
  params: URLSearchParams,
  mcp: McpClient
): Promise<Response> {
  const args: Record<string, unknown> = {};
  const q        = params.get('q');
  const type     = params.get('type');
  const supertype = params.get('supertype');
  const setId    = params.get('set_id');
  const hpMin    = params.get('hp_min');
  const hpMax    = params.get('hp_max');
  const limit    = params.get('limit');

  if (q)         args['query']     = q;
  if (type)      args['type']      = type;
  if (supertype) args['supertype'] = supertype;
  if (setId)     args['set_id']    = setId;
  if (hpMin)     args['hp_min']    = parseInt(hpMin, 10);
  if (hpMax)     args['hp_max']    = parseInt(hpMax, 10);
  args['limit'] = limit ? Math.min(parseInt(limit, 10), 50) : 15;

  try {
    const result = await mcp.callTool('search_cards', args) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleGetCard(id: string, mcp: McpClient): Promise<Response> {
  try {
    const result = await mcp.callTool('get_card_by_id', { id }) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? 'null';
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

**API contract:**

| Route | Query params | Returns |
|-------|-------------|---------|
| `GET /api/search` | `q`, `type`, `supertype`, `set_id`, `hp_min`, `hp_max`, `limit` | `PokemonCard[]` JSON array |
| `GET /api/card/:id` | — | `PokemonCard` JSON object or `null` |

Both routes return the MCP tool's text content verbatim — no transformation. The page
JS can parse and consume the same `PokemonCard` shape as the existing enriched deck types.

---

### 6. HTML Page Template (`src/browser/template.ts` — modified)

#### 6a. `generatePage` signature change

```typescript
export function generatePage(deck: EnrichedDeck | null): string
```

Two separate script injections replace the single `__SYSTEM_PROMPT__`:

```typescript
// Static prompt layer only (no deck context) — used to rebuild session after edits
const staticPromptJson  = JSON.stringify(BROWSER_STATIC_PROMPT);
// Initial deck context as text — empty string when no deck loaded
const initialDeckCtx    = deck ? renderDeckContext(deck) : '';
const initialCtxJson    = JSON.stringify(initialDeckCtx);
// Initial deck data for pre-populating the builder — null when no deck
const deckContextJson   = JSON.stringify(deck);
```

Injected into the page `<head>`:

```html
<script>
  window.__STATIC_PROMPT__  = ${staticPromptJson};
  window.__INITIAL_CTX__    = ${initialCtxJson};
  window.__DECK_CONTEXT__   = ${deckContextJson};  // EnrichedDeck | null
</script>
```

`renderDeckContext` is the same deck-to-text rendering as SPEC_04's `renderDeck`, but
exported from `prompt.ts`. Import and call it directly:

```typescript
import { buildSystemPrompt } from '../agent/prompt';

// Extract only the session context section from the full system prompt
function renderDeckContext(deck: EnrichedDeck): string {
  const full = buildSystemPrompt([deck]);
  const marker = '---\n## Session Context';
  const idx = full.lastIndexOf(marker);
  return idx !== -1 ? full.slice(idx) : '';
}
```

#### 6b. Browser static prompt (`BROWSER_STATIC_PROMPT` constant)

Same role, format rules, deck skeleton, archetype frameworks, and prize trade math
as SPEC_04's static layer. The tool-use section is **replaced** with a builder note:

```typescript
const BROWSER_STATIC_PROMPT = `\
You are a competitive Pokemon TCG deck assistant running in a browser session with
Gemini Nano, an on-device model. You are helping the user understand, improve, or
build a deck for Standard format competitive play.

Note: Gemini Nano is a small model. For deep competitive analysis, use the terminal
session (johto --deck <file> without --provider chrome) which runs Claude.

Your role in this session:
- Answer questions about the deck's composition and strategy
- Flag obvious issues: count violations, likely rotation problems, thin Trainer engine
- Explain what cards do and how they interact
- Suggest high-level improvements when asked
- Help the user decide which cards to add during a build session

Always reference actual card names from the deck. Be clear when you are uncertain.

---

## Standard Format Rules

Current Standard rotation: Regulation marks H, I, J are legal.
Regulation mark G rotated out on 2026-04-10. Any G-mark card is illegal.

Deck construction rules:
- Exactly 60 cards total
- Maximum 4 copies of any card with the same name (Basic Energy exempt)
- Must contain at least 1 Basic Pokemon

---

## Standard Deck Skeleton

Pokemon:  12–18
Trainer:  30–38  (Supporters 8–12 | Items 12–18 | Stadiums 2–4 | Tools 2–6)
Energy:   8–14

Core Trainer staples:
  Professor's Research ×4   primary draw engine
  Boss's Orders ×2–3        gust / prize control
  Iono ×3–4                 disruption + draw
  Arven ×2–3                Item + Tool search
  Ultra Ball ×4             Pokemon search
  Nest Ball ×3–4            Basic search
  Switch / Escape Rope ×2–4 mobility

---

## Prize Trade Math

One-prize vs two-prize (ex/V):  equal 3-KO race; energy efficiency decides
One-prize vs three-prize:       you need 2 KOs; they need 6 — strong one-prize advantage
Two-prize vs two-prize:         pure 3-KO race; first-KO tempo is decisive
Two-prize vs three-prize:       slight three-prize advantage if they can OHKO

---
`;
```

#### 6c. Three-panel layout structure

```html
<div class="jdck-layout">

  <!-- Panel 1: Card search -->
  <aside class="jdck-search" id="panel-search">
    <div class="jdck-search__header">
      <span class="jdck-panel-label">Card Search</span>
      <input class="jdck-search__input" id="search-input"
        type="search" placeholder="Name, type, set…" autocomplete="off" />
      <div class="jdck-search__filters">
        <select class="jdck-search__select" id="filter-supertype">
          <option value="">All</option>
          <option value="Pokémon">Pokémon</option>
          <option value="Trainer">Trainer</option>
          <option value="Energy">Energy</option>
        </select>
      </div>
    </div>
    <ul class="jdck-search__results" id="search-results" role="list"></ul>
  </aside>

  <!-- Panel 2: Deck builder -->
  <main class="jdck-builder" id="panel-builder">
    <div class="jdck-builder__header">
      <input class="jdck-builder__name" id="deck-name"
        type="text" placeholder="Deck name…" maxlength="80" />
      <div class="jdck-builder__count" id="deck-count">0 / 60</div>
      <button class="jdck-builder__export" id="export-btn" type="button">
        Export TOML
      </button>
    </div>
    <div class="jdck-builder__body" id="builder-body">
      <!-- Sections rendered by JS: Pokémon / Trainers / Energy / Unknown -->
    </div>
  </main>

  <!-- Panel 3: Chat -->
  <section class="jdck-chat" id="panel-chat">
    <div class="jdck-chat__status" id="ai-status">Initializing…</div>
    <div class="jdck-chat__messages" id="messages" role="log" aria-live="polite"></div>
    <div class="jdck-chat__toolbar">
      <button class="jdck-chat__refresh" id="refresh-btn" type="button"
        title="Rebuild AI context from current deck state">
        Refresh context
      </button>
    </div>
    <form class="jdck-chat__form" id="chat-form">
      <textarea class="jdck-chat__input" id="chat-input"
        placeholder="Ask about your deck… (Enter to send)" rows="3"
        aria-label="Message input"></textarea>
      <button class="jdck-chat__submit" id="submit-btn" type="submit" disabled>
        Send
      </button>
    </form>
  </section>

</div>
```

#### 6d. Page CSS (`PAGE_CSS` constant)

BEM prefix `jdck-`. Three-column grid on desktop; responsive stack on mobile.

```typescript
const PAGE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-base:          #0d0f14;
  --bg-surface:       #161b27;
  --bg-raised:        #1e2535;
  --border:           #2a3148;
  --text-primary:     #e2e8f0;
  --text-secondary:   #8892a4;
  --text-muted:       #4a5568;
  --accent:           #6c8ef5;
  --accent-dim:       #2d3d6e;
  --warn:             #f6ad55;
  --error:            #fc8181;
  --success:          #68d391;
  font-size: 14px;
}

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  height: 100dvh;
  overflow: hidden;
}

/* ── Layout ─────────────────────────────────────────── */

.jdck-layout {
  display: grid;
  grid-template-columns: 260px 300px 1fr;
  grid-template-rows: 100dvh;
  height: 100dvh;
}

.jdck-panel-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

/* ── Search panel ────────────────────────────────────── */

.jdck-search {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.jdck-search__header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.jdck-search__input {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.8rem;
  padding: 6px 10px;
  outline: none;
  width: 100%;
}
.jdck-search__input:focus { border-color: var(--accent-dim); }

.jdck-search__filters { display: flex; gap: 6px; }

.jdck-search__select {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.75rem;
  padding: 4px 6px;
  flex: 1;
}

.jdck-search__results {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.jdck-result {
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--bg-raised);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  cursor: default;
}

.jdck-result__info { flex: 1; min-width: 0; }

.jdck-result__name {
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jdck-result__detail {
  font-size: 0.67rem;
  color: var(--text-muted);
  margin-top: 1px;
}

.jdck-result__add {
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.jdck-result__add:hover { background: var(--accent); color: #fff; }

/* ── Builder panel ───────────────────────────────────── */

.jdck-builder {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.jdck-builder__header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.jdck-builder__name {
  flex: 1;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.8rem;
  padding: 5px 8px;
  outline: none;
  min-width: 0;
}
.jdck-builder__name:focus { border-color: var(--accent-dim); }

.jdck-builder__count {
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-raised);
}
.jdck-builder__count--valid   { color: var(--success); }
.jdck-builder__count--over    { color: var(--error); }
.jdck-builder__count--under   { color: var(--warn); }

.jdck-builder__export {
  background: var(--success);
  border: none;
  border-radius: 5px;
  color: #0d1a0d;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.jdck-builder__export:hover   { filter: brightness(1.1); }
.jdck-builder__export:disabled { opacity: 0.35; cursor: not-allowed; }

.jdck-builder__body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jdck-builder__empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.7;
}

.jdck-section-header {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 8px 6px 3px;
}

.jdck-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--bg-raised);
}

.jdck-row__name {
  flex: 1;
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jdck-row__mark {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.jdck-row__mark--legal   { color: var(--success); background: color-mix(in srgb, var(--success)  12%, transparent); }
.jdck-row__mark--illegal { color: var(--error);   background: color-mix(in srgb, var(--error)    12%, transparent); }
.jdck-row__mark--unknown { color: var(--warn);    background: color-mix(in srgb, var(--warn)     12%, transparent); }

.jdck-row__stepper {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.jdck-row__btn {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 1;
}
.jdck-row__btn:hover { border-color: var(--accent-dim); color: var(--accent); }

.jdck-row__qty {
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 14px;
  text-align: center;
}

.jdck-row__remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.jdck-row__remove:hover { color: var(--error); }

/* ── Chat panel ──────────────────────────────────────── */

.jdck-chat {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.jdck-chat__status {
  padding: 7px 14px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.jdck-chat__status--error { color: var(--error); }
.jdck-chat__status--ready { color: var(--success); }

.jdck-chat__messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jdck-msg { display: flex; flex-direction: column; gap: 3px; max-width: 640px; }
.jdck-msg--user      { align-self: flex-end; }
.jdck-msg--assistant { align-self: flex-start; }

.jdck-msg__role {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.jdck-msg--user .jdck-msg__role      { color: var(--accent); text-align: right; }
.jdck-msg--assistant .jdck-msg__role { color: var(--text-muted); }

.jdck-msg__text {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.jdck-msg--user .jdck-msg__text      { background: var(--accent-dim); }
.jdck-msg--assistant .jdck-msg__text { background: var(--bg-raised); }

.jdck-chat__toolbar {
  padding: 4px 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.jdck-chat__refresh {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
  padding: 3px 8px;
  cursor: pointer;
}
.jdck-chat__refresh:hover { border-color: var(--accent-dim); color: var(--accent); }

.jdck-chat__form {
  padding: 10px 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
}

.jdck-chat__input {
  flex: 1;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  padding: 7px 11px;
  resize: none;
  outline: none;
  line-height: 1.5;
}
.jdck-chat__input:focus { border-color: var(--accent-dim); }

.jdck-chat__submit {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 7px 14px;
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-end;
}
.jdck-chat__submit:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Setup guide ─────────────────────────────────────── */

.jdck-setup { padding: 20px; max-width: 500px; }
.jdck-setup__title { font-size: 0.95rem; font-weight: 600; color: var(--warn); margin-bottom: 10px; }
.jdck-setup__steps {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.jdck-setup code {
  background: var(--bg-raised);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.78rem;
  color: var(--accent);
}
.jdck-setup__note {
  margin-top: 12px;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.6;
}

/* ── Responsive ──────────────────────────────────────── */

@media (max-width: 1024px) {
  .jdck-layout {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 50dvh 50dvh;
  }
  .jdck-search  { grid-column: 1; grid-row: 1; border-bottom: 1px solid var(--border); }
  .jdck-builder { grid-column: 2; grid-row: 1; border-bottom: 1px solid var(--border); }
  .jdck-chat    { grid-column: 1 / -1; grid-row: 2; }
}

@media (max-width: 640px) {
  .jdck-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 33dvh 33dvh 34dvh;
  }
  .jdck-search  { grid-column: 1; grid-row: 1; }
  .jdck-builder { grid-column: 1; grid-row: 2; }
  .jdck-chat    { grid-column: 1; grid-row: 3; }
}
`;
```

#### 6e. Page JS (`PAGE_JS` constant)

The page JS owns four concerns: deck state, card search, TOML export, and Chrome AI.

**State model:**

```javascript
// Each entry in state.deck: { id, quantity, card: PokemonCard | null }
// card is null when search result has no full data yet (added directly by ID)
const state = {
  deck: [],          // current working deck
  chatSession: null, // window.ai.languageModel session
};
```

**Initialisation — pre-populate from loaded deck:**

```javascript
if (window.__DECK_CONTEXT__) {
  const loaded = window.__DECK_CONTEXT__;
  document.getElementById('deck-name').value = loaded.name ?? '';
  state.deck = loaded.cards.map(c => ({
    id: c.id,
    quantity: c.quantity,
    card: c.card ?? null,
  }));
  renderBuilder();
}
```

**Deck builder render — `renderBuilder()`:**

Rebuilds `#builder-body` from `state.deck`. Groups by supertype (Pokémon → Trainers →
Energy → Unknown). Each row has `−` / `quantity` / `+` stepper and a `×` remove button.
The quantity `+` button is disabled when:
- Non–Basic Energy card is already at 4 copies
- Total deck count is already at 60

Count badge (`#deck-count`) uses class `--valid` (green) at exactly 60,
`--over` (red) above 60, `--under` (amber) otherwise.

Export button is disabled only when `state.deck` is empty.

**Card search — debounced fetch to `/api/search`:**

```javascript
let searchTimer = null;

document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(e.target.value.trim()), 280);
});

document.getElementById('filter-supertype').addEventListener('change', () => {
  runSearch(document.getElementById('search-input').value.trim());
});

async function runSearch(q) {
  const supertype = document.getElementById('filter-supertype').value;
  const params = new URLSearchParams({ limit: '15' });
  if (q)         params.set('q', q);
  if (supertype) params.set('supertype', supertype);

  const res = await fetch('/api/search?' + params);
  const cards = await res.json();
  renderSearchResults(cards);
}
```

`renderSearchResults(cards)` replaces `#search-results` content. Each `<li>` shows
the card name, HP / supertype detail, and a regulation mark badge. The "Add" button
calls `addCard(card)`.

**`addCard(card)` — add to deck:**

```javascript
function addCard(card) {
  const existing = state.deck.find(e => e.id === card.id);
  const isBasicEnergy = card.supertype === 'Energy' &&
    (card.subtypes ?? []).includes('Basic');
  const limit = isBasicEnergy ? 60 : 4;

  if (existing) {
    if (existing.quantity < limit) existing.quantity++;
  } else {
    state.deck.push({ id: card.id, quantity: 1, card });
  }
  renderBuilder();
}
```

**TOML export — `exportDeck()`:**

```javascript
function exportDeck() {
  const name = document.getElementById('deck-name').value.trim() || 'Untitled Deck';

  // Collect regulation marks from cards that have one
  const marks = [...new Set(
    state.deck
      .map(e => e.card?.regulationMark)
      .filter(Boolean)
  )].sort();
  const marksToml = marks.length
    ? '[' + marks.map(m => '"' + m + '"').join(', ') + ']'
    : '["H", "I"]';

  function escStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  let out = 'name = "' + escStr(name) + '"\n';
  out += 'format = "standard"\n';
  out += 'regulation_marks = ' + marksToml + '\n';

  for (const entry of state.deck) {
    out += '\n[[cards]]\n';
    out += 'id = "' + entry.id + '"\n';
    out += 'quantity = ' + entry.quantity + '\n';
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = (slug || 'deck') + '.toml';

  const blob = new Blob([out], { type: 'text/plain; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('export-btn').addEventListener('click', exportDeck);
```

**Chrome AI — initialisation and session lifecycle:**

Session is created on page load from `window.__STATIC_PROMPT__ + window.__INITIAL_CTX__`.
"Refresh context" destroys the current session and recreates it from the current deck
state rendered client-side.

```javascript
function buildCurrentSystemPrompt() {
  const name   = document.getElementById('deck-name').value.trim() || 'Untitled Deck';
  const total  = state.deck.reduce((n, e) => n + e.quantity, 0);

  let ctx = '---\n## Session Context\n\n';
  ctx += '## Current Deck: ' + name + '\n';
  ctx += 'Total cards: ' + total + ' / 60\n\n';

  const groups = {
    'Pokémon':  state.deck.filter(e => e.card?.supertype === 'Pokémon'),
    'Trainers': state.deck.filter(e => e.card?.supertype === 'Trainer'),
    'Energy':   state.deck.filter(e => e.card?.supertype === 'Energy'),
    'Unknown':  state.deck.filter(e => !e.card),
  };

  for (const [section, entries] of Object.entries(groups)) {
    if (!entries.length) continue;
    const sectionTotal = entries.reduce((n, e) => n + e.quantity, 0);
    ctx += '### ' + section + ' (' + sectionTotal + ' cards)\n';
    for (const { quantity, card, id } of entries) {
      if (!card) { ctx += '  ' + quantity + 'x [Unknown: ' + id + ']\n'; continue; }
      ctx += '  ' + quantity + 'x ' + card.name + ' (' + card.setId + ')';
      ctx += ' [Mark: ' + (card.regulationMark ?? 'unknown') + ']\n';
      if (card.supertype === 'Pokémon') {
        ctx += '     HP: ' + (card.hp ?? '—') + ' | Types: ' + (card.types?.join('/') || '—') + '\n';
        for (const a of (card.attacks ?? [])) {
          ctx += '     [' + (a.cost?.join('') || '') + '] ' + a.name;
          if (a.damage) ctx += ' — ' + a.damage;
          ctx += '\n';
        }
      }
    }
    ctx += '\n';
  }
  return window.__STATIC_PROMPT__ + ctx;
}

async function createSession(systemPrompt) {
  if (state.chatSession) {
    try { state.chatSession.destroy?.(); } catch (_) {}
    state.chatSession = null;
  }
  state.chatSession = await window.ai.languageModel.create({ systemPrompt });
}
```

`promptStreaming` yields **cumulative** text in Chrome's implementation. The loop
tracks `lastLength` to extract the delta on each chunk (same pattern as original spec).

**"Refresh context" button:**

```javascript
document.getElementById('refresh-btn').addEventListener('click', async () => {
  setStatus('Rebuilding context…');
  try {
    await createSession(buildCurrentSystemPrompt());
    setStatus('Context updated — Gemini Nano (on-device)', 'ready');
  } catch (err) {
    setStatus('Refresh failed: ' + err.message, 'error');
  }
});
```

The chat form, `window.ai` availability check, setup guide, and streaming output
handler are otherwise identical to the original SPEC_05 definition.

---

## File Structure

```
apps/deck-cli/src/
├── args.ts                MODIFIED — provider field, --deck optional for chrome
├── index.ts               MODIFIED — conditional API key, mcp passed to browser server
└── browser/
    ├── server.ts          MODIFIED — McpClient param, /api/search, /api/card/:id routes
    ├── open.ts            UNCHANGED
    └── template.ts        MODIFIED — null deck, three-panel layout, builder + export JS

No changes to:
  src/agent/loop.ts
  src/agent/tools.ts
  src/agent/prompt.ts      (imported by template.ts, not modified)
  src/mcp/client.ts
  src/deck/loader.ts
  src/deck/writer.ts
  src/deck/types.ts
```

---

## Acceptance Criteria

**CLI / server:**
- [ ] `johto --provider chrome` (no `--deck`) starts without error and opens the browser
      to an empty deck builder
- [ ] `johto --deck ./decks/example.toml --provider chrome` opens the browser with the
      builder pre-populated from the loaded deck
- [ ] `GET /api/search?q=charizard` returns a JSON array of `PokemonCard` objects
- [ ] `GET /api/card/sv3-125` returns the full `PokemonCard` JSON for that ID
- [ ] Ctrl+C kills the HTTP server and MCP child process cleanly
- [ ] `bun run check-types` reports zero errors

**Card search panel:**
- [ ] Typing in the search input debounces and fires a search after ~280 ms
- [ ] Supertype filter restricts results to Pokémon / Trainer / Energy when selected
- [ ] Each result shows the card name, HP / supertype, and regulation mark badge
- [ ] Clicking "Add" inserts the card into the deck (or increments its quantity)

**Deck builder panel:**
- [ ] Count badge reads `X / 60` and is green at 60, amber under, red over
- [ ] `−` button decrements quantity; removes the row when quantity reaches 0
- [ ] `+` button is disabled at quantity 4 for non–Basic Energy cards
- [ ] `+` button is disabled when deck total is already 60
- [ ] Cards are grouped into Pokémon / Trainers / Energy / Unknown sections
- [ ] Regulation mark badge on each row matches the H/I/J legal colour logic

**TOML export:**
- [ ] Clicking "Export TOML" downloads a `.toml` file
- [ ] The exported file parses without error via `smol-toml` in TypeScript
- [ ] `regulation_marks` in the exported file reflects the actual marks present in the deck
- [ ] A deck exported from the builder and loaded with `johto --deck <file>` starts a
      valid REPL session (end-to-end smoke test)
- [ ] Export button is disabled when the builder contains zero cards

**Chat panel:**
- [ ] "Refresh context" recreates the Gemini session from the current deck state
- [ ] After refreshing, the AI's responses reference card names from the updated deck
- [ ] `window.ai` unavailable → setup guide renders; no JS errors in console

---

## Dependencies

- SPEC_01 (TOML schema the builder exports to)
- SPEC_02 (MCP `search_cards` and `get_card_by_id` used by the search API)
- SPEC_03 (CLI structure — args, index, McpClient, loadAndEnrichDeck)
- SPEC_04 (agent prompt — `buildSystemPrompt` imported for deck context text)

---

## Verification

```bash
# Type check
cd apps/deck-cli && bun run check-types

# --provider chrome without --deck: no error, prints localhost URL
bun src/index.ts --provider chrome &
sleep 1 && kill %1   # manual: check output contains "http://localhost:"

# --deck optional guard still enforced for anthropic mode
bun src/index.ts --provider anthropic 2>&1 \
  | grep -q "required" && echo "PASS" || echo "FAIL"

# Unknown provider error
bun src/index.ts --deck ./decks/example.toml --provider bad 2>&1 \
  | grep -q "Unknown provider" && echo "PASS" || echo "FAIL"

# Search API (requires running server — manual)
# curl "http://localhost:{PORT}/api/search?q=charizard&limit=3"
#   → JSON array, length <= 3

# Export smoke test (manual)
# 1. johto --provider chrome
# 2. Add cards in builder, set name, click Export TOML
# 3. johto --deck ~/Downloads/<exported>.toml   (REPL mode)
#    → session opens, deck name appears in prompt
```

---

## Out of Scope

- Multiple decks in browser mode (single deck enforced; multi-deck deferred)
- Ollama / local LLM provider integration (separate workstream)
- Full in-page deck validation UI (use `johto --deck <file> --dry-run` or the CLI's
  `validate_deck` MCP tool after export)
- Deck write-back to the platform database
- Persistent builder state across page reloads
- Drag-and-drop card reordering
