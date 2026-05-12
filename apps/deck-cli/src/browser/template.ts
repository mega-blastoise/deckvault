import { buildSystemPrompt, renderDeck } from '../agent/prompt';
import type { EnrichedDeck } from '../deck/types';

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

// ── CSS ───────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #080a0d;
  --bg-panel:    #0c1018;
  --bg-cell:     #111820;
  --bg-input:    #0d1520;
  --bdr:         #1a2a3a;
  --bdr-hi:      #1e3a5a;
  --text:        #c9d8e8;
  --text-2:      #4d6a84;
  --text-3:      #243444;
  --accent:      #0ea5e9;
  --accent-dim:  #062030;
  --green:       #22c55e;
  --amber:       #f59e0b;
  --red:         #ef4444;
  --green-dim:   #0a2010;
  --amber-dim:   #2a1800;
  --red-dim:     #2a0808;
  font-size: 13px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  height: 100dvh;
  overflow: hidden;
}

/* ── Layout ──────────────────────────────────────────────────────── */

.jdck {
  display: grid;
  grid-template-columns: 360px 340px 1fr;
  grid-template-rows: 100dvh;
  height: 100dvh;
}

/* ── Panel shell ─────────────────────────────────────────────────── */

.jpanel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--bdr);
}
.jpanel:last-child { border-right: none; }

.jpanel__hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--bdr);
  background: var(--bg-panel);
  flex-shrink: 0;
  min-height: 40px;
}

.jpanel__label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
  white-space: nowrap;
}

/* ── Search panel ────────────────────────────────────────────────── */

.jsearch__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--bdr);
  border-radius: 4px;
  padding: 4px 8px;
}

.jsearch__prompt {
  color: var(--accent);
  font-size: 0.75rem;
  flex-shrink: 0;
  user-select: none;
}

.jsearch__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-family: inherit;
  font-size: 0.78rem;
  caret-color: var(--accent);
}
.jsearch__input::placeholder { color: var(--text-3); }

.jtabs {
  display: flex;
  gap: 2px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--bdr);
  background: var(--bg-panel);
  flex-shrink: 0;
}

.jtab {
  padding: 3px 8px;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid var(--bdr);
  border-radius: 3px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.jtab:hover { border-color: var(--bdr-hi); color: var(--text); }
.jtab.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

.jcard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  align-content: start;
  overflow: auto;
}

/* Individual card in search grid */
.jcard {
  display: flex;
  flex-direction: column;
  background: var(--bg-cell);
  border: 1px solid var(--bdr);
  border-radius: 5px;
  overflow: hidden;
  cursor: default;
  min-height: 400px;
  min-width: 240px;
}
.jcard:hover { border-color: var(--bdr-hi); }

.jcard__img-wrap {
  position: relative;
  aspect-ratio: 5 / 7;
  background: var(--bg-input);
  overflow: hidden;
}

.jcard__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Regulation mark badge overlaid on top-right of card image */
.jcard__mark {
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 2px 5px;
  border-radius: 3px;
  line-height: 1;
}
.jcard__mark.ok  { background: var(--green-dim); color: var(--green); border: 1px solid var(--green); }
.jcard__mark.no  { background: var(--red-dim);   color: var(--red);   border: 1px solid var(--red);   }
.jcard__mark.unk { background: var(--amber-dim); color: var(--amber); border: 1px solid var(--amber); }

.jcard__foot {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px 2px;
}

.jcard__name {
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  color: var(--text);
}

.jtype-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.jcard__add {
  width: 100%;
  padding: 5px 0;
  background: var(--accent-dim);
  border: none;
  border-top: 1px solid var(--bdr);
  color: var(--accent);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.05em;
}
.jcard__add:hover { background: var(--accent); color: #fff; }

.jsearch__empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-3);
  line-height: 2;
}

/* ── Deck builder panel ──────────────────────────────────────────── */

.jdeck__name {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  min-width: 0;
}
.jdeck__name::placeholder { color: var(--text-3); }

.jdeck__count {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 3px;
  border: 1px solid var(--bdr);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.jdeck__count.ok   { color: var(--green); border-color: var(--green); background: var(--green-dim); }
.jdeck__count.warn { color: var(--amber); border-color: var(--amber); background: var(--amber-dim); }
.jdeck__count.no   { color: var(--red);   border-color: var(--red);   background: var(--red-dim); }

.jexport-btn {
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--green);
  border-radius: 3px;
  color: var(--green);
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
}
.jexport-btn:hover { background: var(--green); color: #000; }
.jexport-btn:disabled { opacity: 0.25; cursor: not-allowed; }

.jdeck-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.jdck-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-3);
  line-height: 2.2;
}

/* Section header inside deck list */
.jsec-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--text-2);
  border-top: 1px solid var(--bdr);
  margin-top: 2px;
}
.jsec-hd:first-child { border-top: none; margin-top: 0; }
.jsec-hd--pokmon  { color: #38bdf8; border-top-color: #38bdf820; }
.jsec-hd--trainer { color: #a78bfa; border-top-color: #a78bfa20; }
.jsec-hd--energy  { color: #fbbf24; border-top-color: #fbbf2420; }
.jsec-ct {
  font-size: 0.58rem;
  color: var(--text-3);
  font-weight: 400;
}

/* Deck card row */
.jdrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
}
.jdrow:hover { background: var(--bg-cell); }

.jdrow__img-wrap {
  width: 44px;
  height: 62px;
  flex-shrink: 0;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--bdr);
}

.jdrow__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.jdrow__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.jdrow__name {
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.jdrow__mark {
  display: inline-block;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 1px 4px;
  border-radius: 2px;
  width: fit-content;
}
.jdrow__mark.ok  { background: var(--green-dim); color: var(--green); }
.jdrow__mark.no  { background: var(--red-dim);   color: var(--red);   }
.jdrow__mark.unk { background: var(--amber-dim); color: var(--amber); }

.jdrow__ctrl {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.jdrow__btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-input);
  border: 1px solid var(--bdr);
  border-radius: 3px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1;
}
.jdrow__btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.jdrow__btn:disabled { opacity: 0.3; cursor: not-allowed; }

.jdrow__qty {
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.jdrow__rm {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  line-height: 1;
}
.jdrow__rm:hover { color: var(--red); }

/* ── Chat panel ──────────────────────────────────────────────────── */

.jchat__status {
  font-size: 0.65rem;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.jchat__status.ok    { color: var(--green); }
.jchat__status.error { color: var(--red); }

.jchat__msgs {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jmsg { display: flex; flex-direction: column; gap: 3px; max-width: 560px; }
.jmsg--user      { align-self: flex-end; }
.jmsg--assistant { align-self: flex-start; }

.jmsg__role {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.jmsg--user .jmsg__role      { color: var(--accent); text-align: right; }
.jmsg--assistant .jmsg__role { color: var(--text-3); }

.jmsg__text {
  padding: 8px 11px;
  border-radius: 5px;
  font-size: 0.8rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.jmsg--user .jmsg__text      { background: var(--accent-dim); border: 1px solid var(--bdr-hi); }
.jmsg--assistant .jmsg__text { background: var(--bg-cell); border: 1px solid var(--bdr); }

.jchat__foot {
  border-top: 1px solid var(--bdr);
  background: var(--bg-panel);
  flex-shrink: 0;
}

.jchat__toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 4px 10px;
  border-bottom: 1px solid var(--bdr);
}

.jrefresh-btn {
  background: none;
  border: 1px solid var(--bdr);
  border-radius: 3px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.62rem;
  padding: 3px 8px;
  cursor: pointer;
}
.jrefresh-btn:hover { border-color: var(--bdr-hi); color: var(--text); }

.jchat__form {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 10px;
}

.jchat__prompt {
  color: var(--accent);
  font-size: 0.75rem;
  padding-bottom: 7px;
  flex-shrink: 0;
  user-select: none;
}

.jchat__input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--bdr);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.78rem;
  padding: 6px 10px;
  resize: none;
  outline: none;
  line-height: 1.5;
  caret-color: var(--accent);
}
.jchat__input:focus { border-color: var(--bdr-hi); }
.jchat__input::placeholder { color: var(--text-3); }

.jsend-btn {
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--accent);
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-end;
}
.jsend-btn:hover:not(:disabled) { background: var(--accent); color: #000; }
.jsend-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Setup guide ─────────────────────────────────────────────────── */

.jsetup {
  padding: 20px 16px;
  font-size: 0.75rem;
  line-height: 1.8;
  color: var(--text-2);
}
.jsetup__title {
  color: var(--amber);
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.jsetup ol { padding-left: 16px; display: flex; flex-direction: column; gap: 6px; }
.jsetup code {
  background: var(--bg-cell);
  border: 1px solid var(--bdr);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  color: var(--accent);
}
.jsetup__note {
  margin-top: 14px;
  font-size: 0.7rem;
  color: var(--text-3);
  border-top: 1px solid var(--bdr);
  padding-top: 10px;
}

/* ── Responsive ──────────────────────────────────────────────────── */

@media (max-width: 1100px) {
  .jdck {
    grid-template-columns: 320px 300px 1fr;
  }
}
@media (max-width: 900px) {
  .jdck {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 50dvh 50dvh;
  }
  .jpanel:first-child  { grid-column: 1; grid-row: 1; }
  .jpanel:nth-child(2) { grid-column: 2; grid-row: 1; }
  .jpanel:last-child   { grid-column: 1 / -1; grid-row: 2; border-right: none; }
}
`;

// ── Page JS ───────────────────────────────────────────────────────────────────
// Rules for code inside this template literal:
//   - No ${...}  — TypeScript would interpolate them.
//   - No \'      — in a backtick literal \' resolves to ', breaking nested JS strings.
//   - Use "..."  for any JS string that must contain a single quote.
//   - Use \\n    for a JS-level \n escape (becomes \n in the embedded script).

const PAGE_JS = `
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

var state = { deck: [], chatSession: null };
var _sr = [];           // current search result set (indexed by data-search-idx)
var _curFilter = '';    // active supertype tab filter

// ── Image helpers ─────────────────────────────────────────────────────────────

function deriveImgUrl(id) {
  var d = id.indexOf('-');
  if (d < 0) return '';
  return 'https://images.pokemontcg.io/' + id.slice(0, d) + '/' + id.slice(d + 1) + '.png';
}

function cardImg(entry) {
  if (entry.card && entry.card.images && entry.card.images.small) return entry.card.images.small;
  return deriveImgUrl(entry.id);
}

// ── Type color dot ────────────────────────────────────────────────────────────

var TYPE_CLR = {
  Fire:'#f97316', Water:'#38bdf8', Grass:'#4ade80', Lightning:'#facc15',
  Psychic:'#e879f9', Fighting:'#fb7185', Darkness:'#818cf8', Metal:'#94a3b8',
  Dragon:'#a78bfa', Colorless:'#64748b', Fairy:'#f9a8d4'
};

function typeDot(types) {
  var t = types && types[0];
  var c = (t && TYPE_CLR[t]) || '#334155';
  return '<span class="jtype-dot" style="background:' + c + '" title="' + (t || '') + '"></span>';
}

// ── Mark badge class ──────────────────────────────────────────────────────────

var LEGAL_MARKS = { H: true, I: true, J: true };

function markBadge(mark) {
  if (!mark) return '';
  var cls = LEGAL_MARKS[mark] ? 'ok' : 'no';
  return '<span class="jcard__mark ' + cls + '">' + mark + '</span>';
}

function markRowBadge(mark) {
  if (!mark) return '';
  var cls = LEGAL_MARKS[mark] ? 'ok' : 'no';
  return '<span class="jdrow__mark ' + cls + '">' + mark + '</span>';
}

// ── Deck helpers ──────────────────────────────────────────────────────────────

function deckTotal() {
  return state.deck.reduce(function(n, e) { return n + e.quantity; }, 0);
}

function adjustQty(id, delta) {
  var entry = state.deck.find(function(e) { return e.id === id; });
  if (!entry) return;
  entry.quantity += delta;
  if (entry.quantity <= 0) state.deck = state.deck.filter(function(e) { return e.id !== id; });
  renderBuilder();
}

function removeCard(id) {
  state.deck = state.deck.filter(function(e) { return e.id !== id; });
  renderBuilder();
}

function addCard(card) {
  var existing = state.deck.find(function(e) { return e.id === card.id; });
  var isBasicEnergy = card.supertype === 'Energy' && (card.subtypes || []).includes('Basic');
  var limit = isBasicEnergy ? 60 : 4;
  if (existing) {
    if (existing.quantity < limit) existing.quantity++;
  } else {
    state.deck.push({ id: card.id, quantity: 1, card: card });
    if (!card.images || !card.regulationMark) enrichCardAsync(card.id);
  }
  renderBuilder();
}

async function enrichCardAsync(id) {
  try {
    var res = await fetch('/api/card/' + id);
    var full = await res.json();
    if (!full || full.error) return;
    var entry = state.deck.find(function(e) { return e.id === id; });
    if (entry) { entry.card = full; renderBuilder(); }
  } catch(_) {}
}

// ── Deck builder render ───────────────────────────────────────────────────────

function renderBuilder() {
  var body = document.getElementById('builder-body');
  var ct = deckTotal();

  var badge = document.getElementById('deck-count');
  badge.textContent = ct + '/60';
  badge.className = 'jdeck__count ' + (ct === 60 ? 'ok' : ct > 60 ? 'no' : 'warn');

  var exportBtn = document.getElementById('export-btn');
  exportBtn.disabled = state.deck.length === 0;

  if (!state.deck.length) {
    body.innerHTML = '<div class="jdck-empty">search for cards ›<br>click + to add to deck</div>';
    return;
  }

  var groups = [
    { key: 'Pokemon',  label: 'POKEMON',  entries: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Pokémon'; }) },
    { key: 'Trainer',  label: 'TRAINERS', entries: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Trainer'; }) },
    { key: 'Energy',   label: 'ENERGY',   entries: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Energy'; }) },
    { key: 'unknown',  label: '—',        entries: state.deck.filter(function(e) { return !e.card; }) },
  ];

  var html = '';
  for (var gi = 0; gi < groups.length; gi++) {
    var grp = groups[gi];
    if (!grp.entries.length) continue;
    var secTotal = grp.entries.reduce(function(n, e) { return n + e.quantity; }, 0);
    html += '<div class="jsec-hd jsec-hd--' + grp.key.toLowerCase() + '">' +
      grp.label +
      '<span class="jsec-ct">' + secTotal + '</span>' +
    '</div>';

    for (var ei = 0; ei < grp.entries.length; ei++) {
      var entry = grp.entries[ei];
      var imgUrl = cardImg(entry);
      var name = entry.card ? entry.card.name : entry.id;
      var mark = entry.card ? (entry.card.regulationMark || null) : null;
      var isBasicE = entry.card && entry.card.supertype === 'Energy' &&
        (entry.card.subtypes || []).includes('Basic');
      var atLim = !isBasicE && entry.quantity >= 4;
      var atMax = ct >= 60;
      html += '<div class="jdrow">' +
        '<div class="jdrow__img-wrap">' +
          '<img class="jdrow__img" src="' + imgUrl + '" alt="' + name + '" loading="lazy" onerror="this.hidden=true" />' +
        '</div>' +
        '<div class="jdrow__info">' +
          '<span class="jdrow__name">' + name + '</span>' +
          markRowBadge(mark) +
        '</div>' +
        '<div class="jdrow__ctrl">' +
          '<button class="jdrow__btn" data-id="' + entry.id + '" data-delta="-1">-</button>' +
          '<span class="jdrow__qty">' + entry.quantity + '</span>' +
          '<button class="jdrow__btn" data-id="' + entry.id + '" data-delta="1"' +
            ((atLim || atMax) ? ' disabled' : '') + '>+</button>' +
          '<button class="jdrow__rm" data-remove-id="' + entry.id + '">&times;</button>' +
        '</div>' +
      '</div>';
    }
  }

  body.innerHTML = html;
}

// Builder event delegation
document.getElementById('builder-body').addEventListener('click', function(e) {
  var d = e.target.closest('[data-delta]');
  if (d) { adjustQty(d.getAttribute('data-id'), parseInt(d.getAttribute('data-delta'), 10)); return; }
  var r = e.target.closest('[data-remove-id]');
  if (r) removeCard(r.getAttribute('data-remove-id'));
});

// ── Initialise from loaded deck ───────────────────────────────────────────────

if (window.__DECK_CONTEXT__) {
  var loaded = window.__DECK_CONTEXT__;
  document.getElementById('deck-name').value = loaded.name || '';
  state.deck = loaded.cards.map(function(c) {
    return { id: c.id, quantity: c.quantity, card: c.card || null };
  });
  renderBuilder();
}

// Sync header deck name with input
document.getElementById('deck-name').addEventListener('input', function(e) {
  renderBuilder();
});

// ── Card search ───────────────────────────────────────────────────────────────

var _searchTimer = null;

document.getElementById('search-input').addEventListener('input', function(e) {
  clearTimeout(_searchTimer);
  var q = e.target.value.trim();
  _searchTimer = setTimeout(function() { runSearch(q); }, 280);
});

document.getElementById('type-tabs').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-filter]');
  if (!btn) return;
  document.querySelectorAll('.jtab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  _curFilter = btn.getAttribute('data-filter');
  runSearch(document.getElementById('search-input').value.trim());
});

async function runSearch(q) {
  var params = new URLSearchParams({ limit: '16' });
  if (q) params.set('q', q);
  if (_curFilter) params.set('supertype', _curFilter);
  try {
    var res = await fetch('/api/search?' + params);
    var cards = await res.json();
    renderSearchResults(Array.isArray(cards) ? cards : []);
  } catch(_) {
    renderSearchResults([]);
  }
}

function renderSearchResults(cards) {
  _sr = cards.slice();
  var grid = document.getElementById('search-results');
  if (!cards.length) {
    grid.innerHTML = '';
    return;
  }
  grid.innerHTML = cards.map(function(card, i) {
    var imgUrl = (card.images && card.images.small) || deriveImgUrl(card.id);
    var mark = card.regulationMark || null;
    var types = card.types || [];
    return '<div class="jcard" role="listitem">' +
      '<div class="jcard__img-wrap">' +
        '<img class="jcard__img" src="' + imgUrl + '" alt="' + card.name + '" loading="lazy" onerror="this.hidden=true" />' +
        markBadge(mark) +
      '</div>' +
      '<div class="jcard__foot">' +
        typeDot(types) +
        '<span class="jcard__name">' + card.name + '</span>' +
      '</div>' +
      '<button class="jcard__add" data-search-idx="' + i + '">+</button>' +
    '</div>';
  }).join('');
}

// Search click delegation
document.getElementById('search-results').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-search-idx]');
  if (!btn) return;
  var idx = parseInt(btn.getAttribute('data-search-idx'), 10);
  var card = _sr[idx];
  if (card) addCard(card);
});

// ── TOML export ───────────────────────────────────────────────────────────────

function escToml(s) {
  return s.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
}

function exportDeck() {
  var name = document.getElementById('deck-name').value.trim() || 'Untitled Deck';
  var marks = [];
  var seenMarks = {};
  state.deck.forEach(function(e) {
    var m = e.card && e.card.regulationMark;
    if (m && !seenMarks[m]) { seenMarks[m] = true; marks.push(m); }
  });
  marks.sort();
  var marksToml = marks.length
    ? '[' + marks.map(function(m) { return '"' + m + '"'; }).join(', ') + ']'
    : '["H", "I"]';

  var out = 'name = "' + escToml(name) + '"\\n';
  out += 'format = "standard"\\n';
  out += 'regulation_marks = ' + marksToml + '\\n';
  state.deck.forEach(function(entry) {
    out += '\\n[[cards]]\\n';
    out += 'id = "' + entry.id + '"\\n';
    out += 'quantity = ' + entry.quantity + '\\n';
  });

  var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  var blob = new Blob([out], { type: 'text/plain; charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (slug || 'deck') + '.toml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('export-btn').addEventListener('click', exportDeck);

// ── Chrome AI ─────────────────────────────────────────────────────────────────

function setAiStatus(msg, cls) {
  var el = document.getElementById('ai-status');
  el.textContent = msg;
  el.className = 'jchat__status' + (cls ? ' ' + cls : '');
}

function buildCurrentPrompt() {
  var name = document.getElementById('deck-name').value.trim() || 'Untitled Deck';
  var total = deckTotal();
  var ctx = '---\\n## Session Context\\n\\n';
  ctx += '## Current Deck: ' + name + '\\n';
  ctx += 'Total: ' + total + ' / 60\\n\\n';
  var groups = [
    { label: 'Pokemon',  items: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Pokémon'; }) },
    { label: 'Trainers', items: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Trainer'; }) },
    { label: 'Energy',   items: state.deck.filter(function(e) { return e.card && e.card.supertype === 'Energy'; }) },
    { label: 'Unknown',  items: state.deck.filter(function(e) { return !e.card; }) },
  ];
  groups.forEach(function(g) {
    if (!g.items.length) return;
    var st = g.items.reduce(function(n, e) { return n + e.quantity; }, 0);
    ctx += '### ' + g.label + ' (' + st + ' cards)\\n';
    g.items.forEach(function(e) {
      if (!e.card) { ctx += '  ' + e.quantity + 'x [Unknown: ' + e.id + ']\\n'; return; }
      ctx += '  ' + e.quantity + 'x ' + e.card.name + ' (' + e.card.setId + ')';
      ctx += ' [Mark: ' + (e.card.regulationMark || 'unknown') + ']\\n';
    });
    ctx += '\\n';
  });
  return window.__STATIC_PROMPT__ + ctx;
}

async function createAiSession(prompt) {
  if (state.chatSession) {
    try { state.chatSession.destroy && state.chatSession.destroy(); } catch(_) {}
    state.chatSession = null;
  }
  state.chatSession = await window.ai.languageModel.create({ systemPrompt: prompt });
}

async function initAI() {
  if (!window.ai || !window.ai.languageModel) {
    document.getElementById('chat-msgs').innerHTML =
      '<div class="jsetup">' +
        '<div class="jsetup__title">Chrome Prompt API unavailable</div>' +
        '<ol>' +
          '<li>Open <code>chrome://flags/#prompt-api-for-gemini-nano</code></li>' +
          '<li>Set to <strong>Enabled</strong> and relaunch Chrome</li>' +
          '<li>Open <code>chrome://components/</code> and update <strong>Optimization Guide On Device Model</strong></li>' +
        '</ol>' +
        '<div class="jsetup__note">' +
          'For full Claude-powered analysis: <code>johto --deck &lt;file&gt;</code> in your terminal.' +
        '</div>' +
      '</div>';
    setAiStatus('Prompt API unavailable', 'error');
    return;
  }
  try {
    setAiStatus('initializing gemini nano...');
    await createAiSession(window.__STATIC_PROMPT__ + window.__INITIAL_CTX__);
    document.getElementById('send-btn').disabled = false;
    setAiStatus('gemini nano ready', 'ok');
  } catch(err) {
    setAiStatus('init failed: ' + err.message, 'error');
  }
}

document.getElementById('refresh-btn').addEventListener('click', async function() {
  setAiStatus('rebuilding context...');
  try {
    await createAiSession(buildCurrentPrompt());
    document.getElementById('send-btn').disabled = false;
    setAiStatus('context updated', 'ok');
  } catch(err) {
    setAiStatus('refresh failed: ' + err.message, 'error');
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

var chatMsgs = document.getElementById('chat-msgs');

function appendMsg(role, text) {
  var div = document.createElement('div');
  div.className = 'jmsg jmsg--' + role;
  var roleLabel = role === 'user' ? 'you' : 'assistant';
  div.innerHTML = '<div class="jmsg__role">' + roleLabel + '</div><div class="jmsg__text"></div>';
  div.querySelector('.jmsg__text').textContent = text;
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  return div.querySelector('.jmsg__text');
}

document.getElementById('chat-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!state.chatSession) return;
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  document.getElementById('send-btn').disabled = true;
  appendMsg('user', text);
  var aEl = appendMsg('assistant', '...');
  try {
    var stream = state.chatSession.promptStreaming(text);
    var lastLen = 0;
    var full = '';
    for await (var chunk of stream) {
      full += chunk.slice(lastLen);
      lastLen = chunk.length;
      aEl.textContent = full;
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
  } catch(err) {
    aEl.textContent = 'Error: ' + err.message;
  } finally {
    document.getElementById('send-btn').disabled = false;
  }
});

document.getElementById('chat-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('chat-form').dispatchEvent(new Event('submit'));
  }
});

initAI();
`;

// ── HTML template ─────────────────────────────────────────────────────────────

export function generatePage(deck: EnrichedDeck | null): string {
  const staticPromptJson = JSON.stringify(BROWSER_STATIC_PROMPT);
  const initialCtxJson   = JSON.stringify(deck ? renderDeckContext(deck) : '');
  const deckJson         = JSON.stringify(deck);
  const deckName         = deck ? deck.name.replace(/"/g, '&quot;') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>johto${deck ? ` — ${deck.name}` : ''}</title>
  <style>${PAGE_CSS}</style>
  <script>
    window.__STATIC_PROMPT__ = ${staticPromptJson};
    window.__INITIAL_CTX__   = ${initialCtxJson};
    window.__DECK_CONTEXT__  = ${deckJson};
  </script>
</head>
<body>
<div class="jdck">

  <!-- Panel 1 — Card search -->
  <aside class="jpanel">
    <div class="jpanel__hd">
      <span class="jpanel__label">search</span>
      <div class="jsearch__bar">
        <span class="jsearch__prompt">›</span>
        <input class="jsearch__input" id="search-input"
          type="search" placeholder="name, set, type…" autocomplete="off" spellcheck="false" />
      </div>
    </div>
    <div class="jtabs" id="type-tabs">
      <button class="jtab active" data-filter="">ALL</button>
      <button class="jtab" data-filter="Pokémon">PKM</button>
      <button class="jtab" data-filter="Trainer">TRN</button>
      <button class="jtab" data-filter="Energy">NRG</button>
    </div>
    <div class="jcard-grid" id="search-results" role="list">
      <div class="jsearch__empty" style="grid-column:1/-1">
        type to search<br>19,818 cards
      </div>
    </div>
  </aside>

  <!-- Panel 2 — Deck builder -->
  <main class="jpanel">
    <div class="jpanel__hd">
      <input class="jdeck__name" id="deck-name"
        type="text" placeholder="deck name…" maxlength="80"
        value="${deckName}" />
      <span class="jdeck__count warn" id="deck-count">0/60</span>
      <button class="jexport-btn" id="export-btn" type="button" disabled>↓ TOML</button>
    </div>
    <div class="jdeck-body" id="builder-body">
      <div class="jdck-empty">search for cards ›<br>click + to add to deck</div>
    </div>
  </main>

  <!-- Panel 3 — AI assistant -->
  <section class="jpanel" style="border-right:none">
    <div class="jpanel__hd">
      <span class="jpanel__label">assistant</span>
      <span class="jchat__status" id="ai-status">initializing…</span>
    </div>
    <div class="jchat__msgs" id="chat-msgs" role="log" aria-live="polite"></div>
    <div class="jchat__foot">
      <div class="jchat__toolbar">
        <button class="jrefresh-btn" id="refresh-btn" type="button">
          ↺ rebuild context from deck
        </button>
      </div>
      <form class="jchat__form" id="chat-form">
        <span class="jchat__prompt">›</span>
        <textarea class="jchat__input" id="chat-input"
          placeholder="ask about your deck…" rows="2"
          aria-label="Message input" spellcheck="false"></textarea>
        <button class="jsend-btn" id="send-btn" type="submit" disabled>SEND</button>
      </form>
    </div>
  </section>

</div>
<script>${PAGE_JS}</script>
</body>
</html>`;
}
