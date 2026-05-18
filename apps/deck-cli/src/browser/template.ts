import sanitizeHtml from 'sanitize-html';
import serialize from 'serialize-javascript';

import { buildSystemPrompt } from '../agent/prompt';
import type { EnrichedDeck } from '../deck/types';
// Text-loader imports inline the file contents at build time, so the compiled
// binary doesn't need page.css / page.client.js.txt on disk at runtime.
// page.js is renamed to .txt so the bundler's JS loader doesn't try to parse it.
import PAGE_CSS from './page.css'           with { type: 'text' };
import PAGE_JS  from './page.client.js.txt' with { type: 'text' };

const stripTags = (s: string): string =>
  sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} });

// ── Browser static system prompt ─────────────────────────────────────────────

export const BROWSER_STATIC_PROMPT = `\
You are a competitive Pokemon TCG deck assistant running in a browser session with
Gemini Nano, an on-device model. You are helping the user understand, improve, or
build a deck for Standard format competitive play.

Note: Gemini Nano is a small model. For deep competitive analysis, use the terminal
session (johto without --provider chrome) which runs Claude.

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

Pokemon:  12-18
Trainer:  30-38  (Supporters 8-12 | Items 12-18 | Stadiums 2-4 | Tools 2-6)
Energy:   8-14

Core Trainer staples:
  Professor's Research x4   primary draw engine
  Boss's Orders x2-3        gust / prize control
  Iono x3-4                 disruption + draw
  Arven x2-3                Item + Tool search
  Ultra Ball x4             Pokemon search
  Nest Ball x3-4            Basic search
  Switch / Escape Rope x2-4 mobility

---

## Prize Trade Math

One-prize vs two-prize (ex/V):  equal 3-KO race; energy efficiency decides
One-prize vs three-prize:       you need 2 KOs; they need 6 - strong one-prize advantage
Two-prize vs two-prize:         pure 3-KO race; first-KO tempo is decisive
Two-prize vs three-prize:       slight three-prize advantage if they can OHKO

---
`;

function renderDeckContext(deck: EnrichedDeck): string {
  const full = buildSystemPrompt([deck]);
  const marker = '---\n## Session Context';
  const idx = full.lastIndexOf(marker);
  return idx !== -1 ? full.slice(idx) : '';
}

// ── HTML template ─────────────────────────────────────────────────────────────

export function generatePage(deck: EnrichedDeck | null): string {
  const staticPromptJson = serialize(BROWSER_STATIC_PROMPT, { isJSON: true });
  const initialCtxJson   = serialize(deck ? renderDeckContext(deck) : '', { isJSON: true });
  const deckJson         = serialize(deck, { isJSON: true });
  const deckName         = deck ? stripTags(deck.name) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>johto${deck ? ` — ${stripTags(deck.name)}` : ''}</title>
  <style>${PAGE_CSS}</style>
  <script>
    window.__STATIC_PROMPT__ = ${staticPromptJson};
    window.__INITIAL_CTX__   = ${initialCtxJson};
    window.__DECK_CONTEXT__  = ${deckJson};
  </script>
</head>
<body>
<header class="japp-bar">
  <span class="japp-name">johto</span>
  <span class="japp-sub">Pokemon TCG deck tool</span>
</header>
<div class="jdck">

  <!-- Panel 1 — Card search -->
  <aside class="jpanel">
    <div class="jpanel-hd">
      <span class="jpanel-label">Search</span>
      <div class="jsearch-wrap">
        <span class="jsearch-icon" aria-hidden="true">&#128269;</span>
        <input class="jsearch-input" id="search-input"
          type="search" placeholder="search cards…" autocomplete="off" spellcheck="false"
          aria-label="Search cards" />
      </div>
    </div>
    <div class="jtype-bar" id="type-tabs" role="tablist" aria-label="Filter by card type">
      <button class="jtype-tab active" data-filter="" role="tab" aria-selected="true">All</button>
      <button class="jtype-tab" data-filter="Pokémon" role="tab" aria-selected="false">
        <span class="jtype-dot" style="background:#38BDF8" aria-hidden="true"></span>Pokémon
      </button>
      <button class="jtype-tab" data-filter="Trainer" role="tab" aria-selected="false">
        <span class="jtype-dot" style="background:#8B5CF6" aria-hidden="true"></span>Trainer
      </button>
      <button class="jtype-tab" data-filter="Energy" role="tab" aria-selected="false">
        <span class="jtype-dot" style="background:#F59E0B" aria-hidden="true"></span>Energy
      </button>
    </div>
    <div class="jcard-grid" id="search-results" role="list" aria-label="Search results">
      <div class="jsearch-empty" style="grid-column:1/-1">
        type to search<br>19,818 cards
      </div>
    </div>
  </aside>

  <!-- Panel 2 — Deck builder -->
  <main class="jpanel">
    <div class="jpanel-hd">
      <span class="jpanel-label">Deck</span>
      <input class="jdeck-name" id="deck-name"
        type="text" placeholder="deck name…" maxlength="80"
        value="${deckName}" aria-label="Deck name" />
      <span class="jdeck-count warn" id="deck-count" aria-live="polite">0/60</span>
      <button class="jexport-btn" id="export-btn" type="button" disabled aria-label="Export deck as TOML file">&#8595; TOML</button>
    </div>
    <div class="jstats-bar" aria-hidden="true">
      <div class="jstats-row" id="stats-row">
        <span class="jstats-segment jstats-segment--pk">Pokémon 0</span>
        <span class="jstats-segment jstats-segment--tr">Trainers 0</span>
        <span class="jstats-segment jstats-segment--en">Energy 0</span>
      </div>
      <div class="jstats-track" id="stats-track">
        <div class="jstats-fill jstats-fill--pk" style="width:0%"></div>
        <div class="jstats-fill jstats-fill--tr" style="width:0%"></div>
        <div class="jstats-fill jstats-fill--en" style="width:0%"></div>
      </div>
    </div>
    <div id="rotation-warn"></div>
    <div class="jdeck-body" id="builder-body" role="list" aria-label="Current deck">
      <div class="jdeck-empty">search for cards &#8250;<br>click + to add to deck</div>
    </div>
  </main>

  <!-- Panel 3 — AI assistant -->
  <section class="jpanel" style="border-right:none">
    <div class="jchat-hd">
      <span class="jpanel-label">Assistant</span>
      <span class="jai-status init" id="ai-status" aria-live="polite">
        <span class="jai-dot" aria-hidden="true"></span>
        <span id="ai-status-text">initializing…</span>
      </span>
      <button class="jrebuild-btn" id="refresh-btn" type="button" aria-label="Rebuild AI context from current deck">
        &#8635; context
      </button>
    </div>
    <div class="jchat-msgs" id="chat-msgs" role="log" aria-live="polite" aria-label="Chat messages"></div>
    <div class="jchat-foot">
      <form class="jchat-form" id="chat-form">
        <textarea class="jchat-input" id="chat-input"
          placeholder="ask about your deck…" rows="1"
          aria-label="Message" spellcheck="false"></textarea>
        <button class="jsend-btn" id="send-btn" type="submit" disabled aria-label="Send message">Send &#8594;</button>
      </form>
      <p class="jchat-hint">Shift+Enter for new line · / to search</p>
    </div>
  </section>

</div>

<div id="card-popover" class="jpopover" hidden role="dialog" aria-label="Card details" aria-modal="false"></div>
<div id="toast-container" class="jtoast-container" aria-live="polite" aria-atomic="false"></div>
<script>${PAGE_JS}</script>
</body>
</html>`;
}
