import sanitizeHtml from 'sanitize-html';
import serialize from 'serialize-javascript';

import { buildSystemPrompt } from '../agent/prompt';
import type { EnrichedDeck } from '../deck/types';

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

// ── CSS ───────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
@import url('https://rsms.me/inter/inter.css');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-root:       #F7F7F5;
  --bg-panel:      #FFFFFF;
  --bg-raised:     #FAFAF8;
  --bg-input:      #F4F4F2;
  --border:        rgba(0,0,0,.08);
  --border-strong: rgba(0,0,0,.14);
  --text-primary:  #111110;
  --text-secondary:#6F6E6B;
  --text-tertiary: #B0AFA9;

  --accent:        #2563EB;
  --accent-light:  #EFF6FF;
  --accent-border: #BFDBFE;
  --accent-text:   #1D4ED8;

  --green:         #16A34A;
  --green-light:   #F0FDF4;
  --green-border:  #BBF7D0;
  --amber:         #D97706;
  --amber-light:   #FFFBEB;
  --amber-border:  #FDE68A;
  --red:           #DC2626;
  --red-light:     #FEF2F2;
  --red-border:    #FECACA;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.05);
  --shadow-lg: 0 16px 40px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);

  font-size: 15px;
}

body {
  background: var(--bg-root);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  height: auto;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* ── Scrollbars ──────────────────────────────────────────────────────────── */

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }

/* ── App bar ─────────────────────────────────────────────────────────────── */

.japp-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 36px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  z-index: 50;
}
.japp-name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: var(--text-primary);
}
.japp-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

.jdck {
  display: grid;
  grid-template-columns: 380px 360px 1fr;
  grid-template-rows: calc(100dvh - 36px);
  height: calc(100dvh - 36px);
  margin-top: 36px;
}

/* ── Panel shell ─────────────────────────────────────────────────────────── */

.jpanel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
}
.jpanel:last-child { border-right: none; }

.jpanel-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 52px;
}

/* ── Panel label ─────────────────────────────────────────────────────────── */

.jpanel-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  flex-shrink: 0;
  user-select: none;
}

/* ── Search input ────────────────────────────────────────────────────────── */

.jsearch-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 8px 12px;
  transition: border-color .15s, background .15s, box-shadow .15s;
}
.jsearch-wrap:focus-within {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--accent-light);
}

.jsearch-icon { color: var(--text-tertiary); font-size: 13px; flex-shrink: 0; user-select: none; }

.jsearch-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13.5px;
  caret-color: var(--accent);
}
.jsearch-input::placeholder { color: var(--text-tertiary); }

/* ── Type filter bar ─────────────────────────────────────────────────────── */

.jtype-bar {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-raised);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.jtype-bar::-webkit-scrollbar { display: none; }

.jtype-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .01em;
  cursor: pointer;
  white-space: nowrap;
  transition: all .1s;
}
.jtype-tab:hover { border-color: var(--accent-border); color: var(--accent-text); background: var(--accent-light); }
.jtype-tab.active { background: var(--accent-light); border-color: var(--accent-border); color: var(--accent-text); }
.jtype-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.jtype-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ── Card search grid ────────────────────────────────────────────────────── */

.jcard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  align-content: start;
  background: var(--bg-raised);
}

/* ── Card tile ───────────────────────────────────────────────────────────── */

.jcard {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .12s, box-shadow .12s;
}
.jcard:hover { box-shadow: var(--shadow-md); border-color: transparent; }
.jcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.jcard-img-wrap {
  position: relative;
  aspect-ratio: 5 / 7;
  background: var(--bg-input);
  overflow: hidden;
}

.jcard-img { width: 100%; height: 100%; object-fit: cover; display: block; }

.jcard-overlay {
  position: absolute;
  inset: 0;
  background: rgba(28,25,23,.42);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity .15s;
}
.jcard:hover .jcard-overlay,
.jcard:focus-within .jcard-overlay { opacity: 1; }

.jcard-add-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid rgba(255,255,255,.3);
  color: #fff;
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: transform .1s, background .1s;
}
.jcard-add-btn:hover { transform: scale(1.1); background: var(--accent-text); }
.jcard-add-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

.jcard-mark {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 20px;
  letter-spacing: .05em;
  line-height: 1.4;
  pointer-events: none;
}
.jcard-mark.ok  { background: var(--green); color: #fff; }
.jcard-mark.no  { background: var(--red);   color: #fff; }
.jcard-mark.unk { background: var(--amber); color: #fff; }

.jcard-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}

.jcard-type-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.jcard-name {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  flex: 1;
}

.jsearch-empty {
  grid-column: 1 / -1;
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.9;
}

.jcard-skel {
  background: var(--bg-panel);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.jcard-skel-img {
  aspect-ratio: 5/7;
  background: linear-gradient(90deg, var(--bg-input) 25%, var(--border) 50%, var(--bg-input) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
.jcard-skel-foot { height: 34px; background: var(--bg-raised); }

/* ── Card detail popover ─────────────────────────────────────────────────── */

.jpopover {
  position: fixed;
  width: 316px;
  background: var(--bg-panel);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 100;
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 24px);
}
.jpopover[hidden] { display: none; }

.jpopover-inner {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
  flex: 1;
}

.jpopover-img { width: 100%; aspect-ratio: 5/7; object-fit: cover; border-radius: 7px; display: block; }

.jpopover-info { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

.jpopover-name { font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.3; }

.jpopover-meta { display: flex; flex-wrap: wrap; gap: 4px; font-size: 11px; color: var(--text-secondary); }

.jpopover-chip {
  padding: 1px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .03em;
  border: 1px solid;
}
.jpopover-chip.ok  { background: var(--green-light); color: var(--green); border-color: var(--green-border); }
.jpopover-chip.no  { background: var(--red-light);   color: var(--red);   border-color: var(--red-border); }
.jpopover-chip.unk { background: var(--amber-light); color: var(--amber); border-color: var(--amber-border); }

.jpopover-section {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding-top: 4px;
  border-top: 1px solid var(--border);
  margin-top: 2px;
}

.jpopover-attack { padding: 5px 0; border-bottom: 1px solid var(--border); }
.jpopover-attack:last-child { border-bottom: none; }
.jpopover-attack-hd { display: flex; justify-content: space-between; font-weight: 600; font-size: 12px; color: var(--text-primary); }
.jpopover-attack-sub { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; line-height: 1.4; }
.jpopover-attack-cost { font-family: ui-monospace, monospace; font-size: 10px; color: var(--accent-text); }

.jpopover-ability { padding: 5px 0; border-bottom: 1px solid var(--border); }
.jpopover-ability:last-child { border-bottom: none; }
.jpopover-ability-name { font-weight: 600; font-size: 12px; color: var(--accent-text); }
.jpopover-ability-text { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; line-height: 1.4; }

.jpopover-footer { padding: 10px 14px; border-top: 1px solid var(--border); background: var(--bg-raised); flex-shrink: 0; }

.jpop-add-btn {
  width: 100%;
  padding: 9px;
  background: var(--accent);
  border: none;
  border-radius: 9px;
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: .02em;
  cursor: pointer;
  transition: background .12s;
}
.jpop-add-btn:hover { background: var(--accent-text); }
.jpop-add-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ── Deck builder panel ──────────────────────────────────────────────────── */

.jdeck-name {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
}
.jdeck-name::placeholder { color: var(--text-tertiary); }

.jdeck-count {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  letter-spacing: .02em;
  border-radius: 20px;
  border: 1.5px solid;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: all .15s;
  flex-shrink: 0;
}
.jdeck-count.ok   { color: var(--green); border-color: var(--green-border); background: var(--green-light); }
.jdeck-count.warn { color: var(--amber); border-color: var(--amber-border); background: var(--amber-light); }
.jdeck-count.no   { color: var(--red);   border-color: var(--red-border);   background: var(--red-light); }

@keyframes countPulse {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.2); }
  100% { transform: scale(1); }
}
.jdeck-count.pulse { animation: countPulse .5s ease-out; }

.jexport-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: var(--green);
  border: none;
  border-radius: 7px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background .12s;
}
.jexport-btn:hover { background: #15803d; }
.jexport-btn:disabled { opacity: .4; cursor: not-allowed; background: var(--text-tertiary); }
.jexport-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Section stats bar */
.jstats-bar { padding: 7px 16px 9px; border-bottom: 1px solid var(--border); background: var(--bg-raised); flex-shrink: 0; }

.jstats-row { display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 600; margin-bottom: 5px; letter-spacing: .01em; }

.jstats-segment { font-weight: 600; }
.jstats-segment--pk { color: #0EA5E9; }
.jstats-segment--tr { color: #8B5CF6; }
.jstats-segment--en { color: #F59E0B; }

.jstats-track { height: 3px; background: var(--bg-input); border-radius: 3px; overflow: hidden; display: flex; }
.jstats-fill { height: 100%; transition: width .3s ease; }
.jstats-fill--pk { background: #0EA5E9; }
.jstats-fill--tr { background: #8B5CF6; }
.jstats-fill--en { background: #F59E0B; }

/* Rotation warning */
.jrot-warn {
  margin: 10px 14px 0;
  padding: 8px 10px;
  background: var(--amber-light);
  border: 1px solid var(--amber-border);
  border-left: 3px solid var(--amber);
  border-radius: 8px;
  font-size: 11px;
  display: flex;
  gap: 7px;
  align-items: flex-start;
}
.jrot-warn-icon { color: var(--amber); flex-shrink: 0; font-size: 13px; line-height: 1.5; }
.jrot-warn-body { flex: 1; line-height: 1.5; color: var(--text-secondary); }
.jrot-warn-title { font-weight: 700; color: var(--amber); display: block; margin-bottom: 1px; }
.jrot-warn-dismiss {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
  padding: 0;
}
.jrot-warn-dismiss:hover { color: var(--amber); }

/* Deck body */
.jdeck-body { flex: 1; overflow-y: auto; padding-bottom: 8px; }

.jdeck-empty {
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 2;
}

/* Section header */
.jsec-hd { padding: 14px 16px 5px; }
.jsec-hd-row { display: flex; align-items: center; justify-content: space-between; }
.jsec-hd-label { font-size: 9.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.jsec-hd-label--pk { color: #0EA5E9; }
.jsec-hd-label--tr { color: #8B5CF6; }
.jsec-hd-label--en { color: #F59E0B; }
.jsec-hd-label--un { color: var(--text-tertiary); }
.jsec-hd-ct { font-size: 11px; font-weight: 600; color: var(--text-tertiary); }

.jsec-divider { height: 1px; background: var(--border); margin: 0 14px 4px; }

/* Deck card row */
.jdrow {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 6px 16px;
  transition: background .1s;
}
.jdrow:hover { background: var(--bg-raised); }

.jdrow-thumb {
  width: 38px;
  height: 53px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--border);
  position: relative;
}
.jdrow-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.jdrow-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.jdrow-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.jdrow-meta { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--text-tertiary); }

.jdrow-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.jdrow-dot.ok  { background: var(--green); }
.jdrow-dot.no  { background: var(--red); }
.jdrow-dot.unk { background: var(--amber); }

.jdrow-ctrl {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 2px;
}

.jdrow-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  border-radius: 5px;
  transition: background .1s, color .1s;
  line-height: 1;
}
.jdrow-btn:hover:not(:disabled) { background: var(--accent-light); color: var(--accent); }
.jdrow-btn:disabled { opacity: .35; cursor: not-allowed; }
.jdrow-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.jdrow-qty {
  font-size: 12.5px;
  font-weight: 700;
  min-width: 22px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.jdrow-rm {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  border-radius: 4px;
  transition: background .1s, color .1s;
  margin-left: 3px;
}
.jdrow-rm:hover { background: var(--red-light); color: var(--red); }
.jdrow-rm:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ── Chat panel ──────────────────────────────────────────────────────────── */

.jchat-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 52px;
}

.jchat-hd-label { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
/* chat hd uses .jpanel-label — kept for back-compat */

.jai-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-secondary); }
.jai-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--text-tertiary); }
.jai-status.ok .jai-dot    { background: var(--green); }
.jai-status.error .jai-dot { background: var(--red); }
.jai-status.init .jai-dot  { background: var(--amber); animation: dotPulse 1.2s ease-in-out infinite; }
@keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

.jrebuild-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .02em;
  cursor: pointer;
  white-space: nowrap;
  transition: all .12s;
}
.jrebuild-btn:hover { border-color: var(--accent-border); color: var(--accent-text); }
.jrebuild-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Messages */
.jchat-msgs {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jmsg-user {
  align-self: flex-end;
  max-width: 86%;
  background: var(--accent);
  color: #fff;
  border-radius: 13px 13px 3px 13px;
  padding: 9px 13px;
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.jmsg-asst {
  align-self: flex-start;
  max-width: 94%;
  background: var(--bg-raised);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 13px 13px 13px 3px;
  padding: 9px 13px;
  font-size: 13.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Setup guide */
.jsetup {
  align-self: stretch;
  border: 1px solid var(--amber-border);
  border-left: 3px solid var(--amber);
  border-radius: 9px;
  background: var(--amber-light);
  overflow: hidden;
  margin: 4px 0;
}
.jsetup-hd {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 13px;
  font-size: 13px;
  font-weight: 700;
  color: var(--amber);
  border-bottom: 1px solid var(--amber-border);
}
.jsetup-body { padding: 10px 13px; font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.jsetup-body ol { padding-left: 16px; display: flex; flex-direction: column; gap: 6px; }
.jsetup-body code {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 11px;
  background: rgba(0,0,0,.07);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--text-primary);
}
.jsetup-footer {
  padding: 8px 13px;
  border-top: 1px solid var(--amber-border);
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Chat input footer */
.jchat-foot { border-top: 1px solid var(--border); background: var(--bg-panel); padding: 10px 14px; flex-shrink: 0; }

.jchat-form { display: flex; align-items: flex-end; gap: 8px; }

.jchat-input {
  flex: 1;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: 9px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13.5px;
  padding: 9px 13px;
  resize: none;
  outline: none;
  line-height: 1.5;
  caret-color: var(--accent);
  overflow-y: auto;
  transition: border-color .15s, background .15s, box-shadow .15s;
  field-sizing: content;
  min-height: 42px;
  max-height: 120px;
}
.jchat-input:focus { border-color: var(--accent); background: var(--bg-panel); box-shadow: 0 0 0 3px var(--accent-light); }
.jchat-input::placeholder { color: var(--text-tertiary); }

.jsend-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: .03em;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  align-self: flex-end;
  transition: background .12s, opacity .12s;
}
.jsend-btn:hover:not(:disabled) { background: var(--accent-text); }
.jsend-btn:disabled { opacity: .4; cursor: not-allowed; }
.jsend-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ── Toast notifications ─────────────────────────────────────────────────── */

.jtoast-container {
  position: fixed;
  top: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 200;
  pointer-events: none;
}

.jtoast {
  background: var(--text-primary);
  color: #fff;
  padding: 8px 14px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .01em;
  box-shadow: var(--shadow-md);
  opacity: 0;
  transform: translateX(16px);
  transition: opacity .2s, transform .2s;
}
.jtoast--show { opacity: 1; transform: translateX(0); }
.jtoast--hide { opacity: 0; transform: translateX(16px); }

/* ── Chat hint ───────────────────────────────────────────────────────────── */

.jchat-hint {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
  letter-spacing: .02em;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */

@media (max-width: 1100px) {
  .jdck { grid-template-columns: 340px 320px 1fr; }
}
@media (max-width: 900px) {
  .jdck { grid-template-columns: 1fr 1fr; grid-template-rows: calc(50dvh - 18px) calc(50dvh - 18px); }
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
"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────

var TYPE_THEMES = {
  Fire:      { accent:"#EA580C", light:"#FFF7ED", border:"#FED7AA", text:"#9A3412" },
  Water:     { accent:"#2563EB", light:"#EFF6FF", border:"#BFDBFE", text:"#1E40AF" },
  Grass:     { accent:"#16A34A", light:"#F0FDF4", border:"#BBF7D0", text:"#166534" },
  Lightning: { accent:"#D97706", light:"#FFFBEB", border:"#FDE68A", text:"#92400E" },
  Psychic:   { accent:"#DB2777", light:"#FDF2F8", border:"#FBCFE8", text:"#9D174D" },
  Fighting:  { accent:"#C2410C", light:"#FFF7ED", border:"#FDBA74", text:"#7C2D12" },
  Darkness:  { accent:"#4F46E5", light:"#EEF2FF", border:"#C7D2FE", text:"#3730A3" },
  Metal:     { accent:"#475569", light:"#F1F5F9", border:"#CBD5E1", text:"#334155" },
  Dragon:    { accent:"#7C3AED", light:"#F5F3FF", border:"#DDD6FE", text:"#5B21B6" },
  Colorless: { accent:"#78716C", light:"#F5F5F4", border:"#D6D3D1", text:"#57534E" },
  Fairy:     { accent:"#E11D48", light:"#FFF1F2", border:"#FECDD3", text:"#BE123C" }
};

var TYPE_CLR = {
  Fire:"#F97316", Water:"#38BDF8", Grass:"#4ADE80", Lightning:"#FACC15",
  Psychic:"#E879F9", Fighting:"#FB7185", Darkness:"#818CF8", Metal:"#94A3B8",
  Dragon:"#A78BFA", Colorless:"#64748B", Fairy:"#F9A8D4"
};

var LEGAL_MARKS = { H:true, I:true, J:true };

// ── State ─────────────────────────────────────────────────────────────────────

var state = { deck: [], chatSession: null };
var _sr = [];
var _curFilter = "";
var _popCardId = null;
var _warnDismissed = false;

// ── Image helpers ─────────────────────────────────────────────────────────────

function deriveImgUrl(id) {
  var d = id.indexOf("-");
  if (d < 0) return "";
  return "https://images.pokemontcg.io/" + id.slice(0, d) + "/" + id.slice(d + 1) + ".png";
}

function deriveLargeImgUrl(id) {
  var d = id.indexOf("-");
  if (d < 0) return "";
  return "https://images.pokemontcg.io/" + id.slice(0, d) + "/" + id.slice(d + 1) + "_hires.png";
}

function onImgError(img) {
  img.hidden = true;
  var type = img.getAttribute("data-type") || "";
  var clr = TYPE_CLR[type] || "#A8A29E";
  var ph = document.createElement("div");
  ph.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:11px;font-weight:600;color:#fff;opacity:.85;background:" + clr;
  ph.innerHTML = "<span style=\\"font-size:28px\\">♦</span><span>" + (type || "—") + "</span>";
  if (img.parentElement) img.parentElement.appendChild(ph);
}

// ── Type theme ────────────────────────────────────────────────────────────────

function detectPrimaryType(deckCards) {
  var counts = {};
  for (var i = 0; i < deckCards.length; i++) {
    var e = deckCards[i];
    if (!e.card || e.card.supertype !== "Energy") continue;
    var types = e.card.types || [];
    for (var j = 0; j < types.length; j++) {
      var t = types[j];
      counts[t] = (counts[t] || 0) + e.quantity;
    }
  }
  var best = null, bestCt = 0;
  Object.keys(counts).forEach(function(t) {
    if (counts[t] > bestCt) { best = t; bestCt = counts[t]; }
  });
  return best || "Colorless";
}

function applyTypeTheme(type) {
  var theme = TYPE_THEMES[type] || TYPE_THEMES["Colorless"];
  var s = document.documentElement.style;
  s.setProperty("--accent",        theme.accent);
  s.setProperty("--accent-light",  theme.light);
  s.setProperty("--accent-border", theme.border);
  s.setProperty("--accent-text",   theme.text);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showToast(msg) {
  var container = document.getElementById("toast-container");
  var el = document.createElement("div");
  el.className = "jtoast";
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add("jtoast--show"); });
  });
  setTimeout(function() {
    el.classList.remove("jtoast--show");
    el.classList.add("jtoast--hide");
    setTimeout(function() { el.remove(); }, 300);
  }, 2500);
}

// ── Card detail popover ───────────────────────────────────────────────────────

function showCardPopover(card, tileEl) {
  if (_popCardId === card.id) { hideCardPopover(); return; }

  var pop = document.getElementById("card-popover");
  var rect = tileEl.getBoundingClientRect();
  var popW = 316;
  var left = rect.right + 8;
  var top  = rect.top;

  if (left + popW > window.innerWidth - 8) left = rect.left - popW - 8;
  if (top + 440 > window.innerHeight - 8)  top  = window.innerHeight - 440 - 8;
  if (top < 8)  top  = 8;
  if (left < 8) left = 8;

  pop.style.left = left + "px";
  pop.style.top  = top  + "px";
  pop.innerHTML  = renderPopoverContent(card);
  pop.hidden     = false;
  _popCardId     = card.id;

  var addBtn = pop.querySelector("[data-pop-add]");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      addCard(card);
      showToast("Added " + card.name);
      hideCardPopover();
    });
  }
}

function hideCardPopover() {
  var pop = document.getElementById("card-popover");
  if (pop) pop.hidden = true;
  _popCardId = null;
}

function renderPopoverContent(card) {
  var imgUrl  = (card.images && card.images.large) || deriveLargeImgUrl(card.id) || deriveImgUrl(card.id);
  var mark    = card.regulationMark || null;
  var markCls = mark ? (LEGAL_MARKS[mark] ? "ok" : "no") : "unk";
  var hp      = card.hp ? card.hp + " HP" : null;
  var types   = (card.types || []).join(", ");
  var setId   = card.setId || "";

  var chipHtml = mark
    ? "<span class=\\"jpopover-chip " + markCls + "\\">" + escHtml(mark) + "</span>"
    : "";

  var metaParts = [];
  if (card.supertype) metaParts.push("<span>" + escHtml(card.supertype) + "</span>");
  if (types)          metaParts.push("<span>·</span><span>" + escHtml(types) + "</span>");
  if (hp)             metaParts.push("<span>·</span><strong>" + escHtml(hp) + "</strong>");

  var attacksHtml = "";
  var attacks = card.attacks || [];
  if (attacks.length) {
    attacksHtml += "<div class=\\"jpopover-section\\">Attacks</div>";
    for (var i = 0; i < attacks.length; i++) {
      var a = attacks[i];
      var cost = (a.cost || []).join(" ") || "—";
      attacksHtml +=
        "<div class=\\"jpopover-attack\\">" +
          "<div class=\\"jpopover-attack-hd\\">" +
            "<span>" + escHtml(a.name || "") + "</span>" +
            "<span>" + escHtml(a.damage || "") + "</span>" +
          "</div>" +
          "<div class=\\"jpopover-attack-cost\\">" + escHtml(cost) + "</div>" +
          (a.text ? "<div class=\\"jpopover-attack-sub\\">" + escHtml(a.text) + "</div>" : "") +
        "</div>";
    }
  }

  var abilitiesHtml = "";
  var abilities = card.abilities || [];
  if (abilities.length) {
    abilitiesHtml += "<div class=\\"jpopover-section\\">Abilities</div>";
    for (var j = 0; j < abilities.length; j++) {
      var ab = abilities[j];
      abilitiesHtml +=
        "<div class=\\"jpopover-ability\\">" +
          "<div class=\\"jpopover-ability-name\\">" + escHtml(ab.name || "") + "</div>" +
          (ab.text ? "<div class=\\"jpopover-ability-text\\">" + escHtml(ab.text) + "</div>" : "") +
        "</div>";
    }
  }

  return (
    "<div class=\\"jpopover-inner\\">" +
      "<img class=\\"jpopover-img\\" src=\\"" + escHtml(imgUrl) + "\\" alt=\\"" + escHtml(card.name || "") + "\\" loading=\\"lazy\\" />" +
      "<div class=\\"jpopover-info\\">" +
        "<div class=\\"jpopover-name\\">" + escHtml(card.name || "") + "</div>" +
        "<div class=\\"jpopover-meta\\">" + metaParts.join("") + "</div>" +
        (chipHtml ? "<div>" + chipHtml + "</div>" : "") +
        (setId ? "<div style=\\"font-size:10px;color:var(--text-tertiary);font-family:ui-monospace,monospace\\">" + escHtml(setId) + "</div>" : "") +
        abilitiesHtml +
        attacksHtml +
      "</div>" +
    "</div>" +
    "<div class=\\"jpopover-footer\\">" +
      "<button class=\\"jpop-add-btn\\" data-pop-add=\\"1\\" type=\\"button\\">Add to deck  +</button>" +
    "</div>"
  );
}

// ── Global events ─────────────────────────────────────────────────────────────

document.addEventListener("click", function(e) {
  if (!_popCardId) return;
  var pop = document.getElementById("card-popover");
  if (!pop) return;
  if (!pop.contains(e.target) && !e.target.closest("[data-tile-idx]")) {
    hideCardPopover();
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") { hideCardPopover(); return; }
  if (e.key === "/" && document.activeElement !== document.getElementById("search-input")) {
    e.preventDefault();
    document.getElementById("search-input").focus();
  }
});

// ── Deck helpers ──────────────────────────────────────────────────────────────

function deckTotal() {
  return state.deck.reduce(function(n, e) { return n + e.quantity; }, 0);
}

function updateDeckCount() {
  var ct = deckTotal();
  var badge = document.getElementById("deck-count");
  var wasOk = badge.classList.contains("ok");
  badge.textContent = ct + "/60";
  var cls = ct === 60 ? "ok" : ct > 60 ? "no" : "warn";
  badge.className = "jdeck-count " + cls;
  if (ct === 60 && !wasOk) {
    badge.classList.add("pulse");
    setTimeout(function() { badge.classList.remove("pulse"); }, 600);
  }
}

function renderStats() {
  var pkCt = 0, trCt = 0, enCt = 0;
  for (var i = 0; i < state.deck.length; i++) {
    var e = state.deck[i];
    var st = e.card && e.card.supertype;
    if (st === "Pok\\u00e9mon") pkCt += e.quantity;
    else if (st === "Trainer")  trCt += e.quantity;
    else if (st === "Energy")   enCt += e.quantity;
  }
  var total = pkCt + trCt + enCt;
  var row = document.getElementById("stats-row");
  var track = document.getElementById("stats-track");
  if (row) {
    row.innerHTML =
      "<span class=\\"jstats-segment jstats-segment--pk\\">Pok\\u00e9mon " + pkCt + "</span>" +
      "<span class=\\"jstats-segment jstats-segment--tr\\">Trainers " + trCt + "</span>" +
      "<span class=\\"jstats-segment jstats-segment--en\\">Energy " + enCt + "</span>";
  }
  if (track) {
    var pkP = total ? (pkCt / total * 100).toFixed(1) : 0;
    var trP = total ? (trCt / total * 100).toFixed(1) : 0;
    var enP = total ? (enCt / total * 100).toFixed(1) : 0;
    track.innerHTML =
      "<div class=\\"jstats-fill jstats-fill--pk\\" style=\\"width:" + pkP + "%\\"></div>" +
      "<div class=\\"jstats-fill jstats-fill--tr\\" style=\\"width:" + trP + "%\\"></div>" +
      "<div class=\\"jstats-fill jstats-fill--en\\" style=\\"width:" + enP + "%\\"></div>";
  }
}

function renderRotationWarning() {
  var container = document.getElementById("rotation-warn");
  if (!container) return;
  if (_warnDismissed) { container.innerHTML = ""; return; }
  var rotating = state.deck.filter(function(e) {
    if (!e.card || !e.card.regulationMark) return false;
    return !LEGAL_MARKS[e.card.regulationMark];
  });
  if (!rotating.length) { container.innerHTML = ""; return; }
  var names = rotating.slice(0, 3).map(function(e) {
    return e.card.name + " (" + (e.card.setId || e.id) + "\\u00b7" + e.card.regulationMark + ")";
  }).join(", ");
  if (rotating.length > 3) names += ", +" + (rotating.length - 3) + " more";
  container.innerHTML =
    "<div class=\\"jrot-warn\\">" +
      "<span class=\\"jrot-warn-icon\\">&#9888;</span>" +
      "<span class=\\"jrot-warn-body\\">" +
        "<span class=\\"jrot-warn-title\\">" +
          rotating.length + " card" + (rotating.length > 1 ? "s are" : " is") + " not legal in Standard" +
        "</span>" +
        escHtml(names) +
      "</span>" +
      "<button class=\\"jrot-warn-dismiss\\" type=\\"button\\" aria-label=\\"Dismiss\\">&times;</button>" +
    "</div>";
  var btn = container.querySelector(".jrot-warn-dismiss");
  if (btn) btn.addEventListener("click", function() { _warnDismissed = true; renderRotationWarning(); });
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
  var isBasicEnergy = card.supertype === "Energy" && (card.subtypes || []).indexOf("Basic") >= 0;
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
    var res = await fetch("/api/card/" + id);
    var full = await res.json();
    if (!full || full.error) return;
    var entry = state.deck.find(function(e) { return e.id === id; });
    if (entry) { entry.card = full; renderBuilder(); }
  } catch(_) {}
}

// ── Deck builder render ───────────────────────────────────────────────────────

function renderBuilder() {
  updateDeckCount();
  renderStats();
  renderRotationWarning();
  applyTypeTheme(detectPrimaryType(state.deck));

  var body    = document.getElementById("builder-body");
  var expBtn  = document.getElementById("export-btn");
  expBtn.disabled = state.deck.length === 0;

  if (!state.deck.length) {
    body.innerHTML = "<div class=\\"jdeck-empty\\">search for cards &#8250;<br>click + to add to deck</div>";
    return;
  }

  var groups = [
    { key: "pk", label: "POK\\u00c9MON", entries: state.deck.filter(function(e) { return e.card && e.card.supertype === "Pok\\u00e9mon"; }) },
    { key: "tr", label: "TRAINERS",  entries: state.deck.filter(function(e) { return e.card && e.card.supertype === "Trainer"; }) },
    { key: "en", label: "ENERGY",    entries: state.deck.filter(function(e) { return e.card && e.card.supertype === "Energy"; }) },
    { key: "un", label: "UNKNOWN",   entries: state.deck.filter(function(e) { return !e.card; }) },
  ];

  var html = "";
  for (var gi = 0; gi < groups.length; gi++) {
    var grp = groups[gi];
    if (!grp.entries.length) continue;
    var secTotal = grp.entries.reduce(function(n, e) { return n + e.quantity; }, 0);
    html +=
      "<div class=\\"jsec-hd\\">" +
        "<div class=\\"jsec-hd-row\\">" +
          "<span class=\\"jsec-hd-label jsec-hd-label--" + grp.key + "\\">" + grp.label + "</span>" +
          "<span class=\\"jsec-hd-ct\\">" + secTotal + "</span>" +
        "</div>" +
      "</div>" +
      "<div class=\\"jsec-divider\\"></div>";

    for (var ei = 0; ei < grp.entries.length; ei++) {
      var entry = grp.entries[ei];
      var imgUrl = entry.card && entry.card.images && entry.card.images.small
        ? entry.card.images.small
        : deriveImgUrl(entry.id);
      var name   = entry.card ? entry.card.name : entry.id;
      var mark   = entry.card ? (entry.card.regulationMark || null) : null;
      var setId  = entry.card ? (entry.card.setId || "") : "";
      var dotCls = mark ? (LEGAL_MARKS[mark] ? "ok" : "no") : "unk";
      var isBasicE = entry.card && entry.card.supertype === "Energy"
        && (entry.card.subtypes || []).indexOf("Basic") >= 0;
      var atLim  = !isBasicE && entry.quantity >= 4;
      var atMax  = deckTotal() >= 60;
      var metaText = [mark || "?", setId].filter(Boolean).join(" · ");

      html +=
        "<div class=\\"jdrow\\">" +
          "<div class=\\"jdrow-thumb\\">" +
            "<img src=\\"" + imgUrl + "\\" alt=\\"" + escHtml(name) + "\\" loading=\\"lazy\\" onerror=\\"this.hidden=true\\" />" +
          "</div>" +
          "<div class=\\"jdrow-info\\">" +
            "<span class=\\"jdrow-name\\">" + escHtml(name) + "</span>" +
            "<div class=\\"jdrow-meta\\">" +
              "<span class=\\"jdrow-dot " + dotCls + "\\"></span>" +
              "<span>" + escHtml(metaText) + "</span>" +
            "</div>" +
          "</div>" +
          "<div class=\\"jdrow-ctrl\\">" +
            "<button class=\\"jdrow-btn\\" data-id=\\"" + entry.id + "\\" data-delta=\\"-1\\" aria-label=\\"Remove one\\" " +
              (entry.quantity <= 1 ? " disabled" : "") + ">&#8722;</button>" +
            "<span class=\\"jdrow-qty\\">" + entry.quantity + "</span>" +
            "<button class=\\"jdrow-btn\\" data-id=\\"" + entry.id + "\\" data-delta=\\"1\\" aria-label=\\"Add one\\" " +
              ((atLim || atMax) ? " disabled" : "") + ">+</button>" +
          "</div>" +
          "<button class=\\"jdrow-rm\\" data-remove-id=\\"" + entry.id + "\\" aria-label=\\"Remove " + escHtml(name) + "\\">&times;</button>" +
        "</div>";
    }
  }

  body.innerHTML = html;
}

// Builder event delegation
document.getElementById("builder-body").addEventListener("click", function(e) {
  var d = e.target.closest("[data-delta]");
  if (d) { adjustQty(d.getAttribute("data-id"), parseInt(d.getAttribute("data-delta"), 10)); return; }
  var r = e.target.closest("[data-remove-id]");
  if (r) removeCard(r.getAttribute("data-remove-id"));
});

// ── Init from loaded deck ─────────────────────────────────────────────────────

if (window.__DECK_CONTEXT__) {
  var loaded = window.__DECK_CONTEXT__;
  var nameInput = document.getElementById("deck-name");
  if (nameInput) nameInput.value = loaded.name || "";
  state.deck = (loaded.cards || []).map(function(c) {
    return { id: c.id, quantity: c.quantity, card: c.card || null };
  });
  applyTypeTheme(detectPrimaryType(state.deck));
  renderBuilder();
}

document.getElementById("deck-name").addEventListener("input", function() { renderBuilder(); });

// ── Card search ───────────────────────────────────────────────────────────────

var _searchTimer = null;

document.getElementById("search-input").addEventListener("input", function(e) {
  clearTimeout(_searchTimer);
  var q = e.target.value.trim();
  _searchTimer = setTimeout(function() { runSearch(q); }, 280);
});

document.getElementById("type-tabs").addEventListener("click", function(e) {
  var btn = e.target.closest("[data-filter]");
  if (!btn) return;
  document.querySelectorAll(".jtype-tab").forEach(function(t) {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
  _curFilter = btn.getAttribute("data-filter");
  runSearch(document.getElementById("search-input").value.trim());
});

function showSkeletons() {
  var grid = document.getElementById("search-results");
  var html = "";
  for (var i = 0; i < 8; i++) {
    html += "<div class=\\"jcard-skel\\"><div class=\\"jcard-skel-img\\"></div><div class=\\"jcard-skel-foot\\"></div></div>";
  }
  grid.innerHTML = html;
}

async function runSearch(q) {
  var grid = document.getElementById("search-results");
  if (!q && !_curFilter) {
    _sr = [];
    grid.innerHTML = "<div class=\\"jsearch-empty\\" style=\\"grid-column:1/-1\\">type to search<br>19,818 cards</div>";
    return;
  }
  showSkeletons();
  var params = new URLSearchParams({ limit: "16" });
  if (q) params.set("q", q);
  if (_curFilter) params.set("supertype", _curFilter);
  try {
    var res = await fetch("/api/search?" + params);
    var cards = await res.json();
    renderSearchResults(Array.isArray(cards) ? cards : []);
  } catch(_) {
    renderSearchResults([]);
  }
}

function renderSearchResults(cards) {
  _sr = cards.slice();
  var grid = document.getElementById("search-results");
  if (!cards.length) {
    grid.innerHTML = "<div class=\\"jsearch-empty\\" style=\\"grid-column:1/-1\\">no cards found</div>";
    return;
  }
  grid.innerHTML = cards.map(function(card, i) {
    var imgUrl = (card.images && card.images.small) || deriveImgUrl(card.id);
    var mark   = card.regulationMark || null;
    var mCls   = mark ? (LEGAL_MARKS[mark] ? "ok" : "no") : "unk";
    var types  = card.types || [];
    var tClr   = (types[0] && TYPE_CLR[types[0]]) || "#A8A29E";
    var mBadge = mark ? ("<span class=\\"jcard-mark " + mCls + "\\">" + escHtml(mark) + "</span>") : "";
    return (
      "<div class=\\"jcard\\" tabindex=\\"0\\" role=\\"button\\" data-tile-idx=\\"" + i + "\\" aria-label=\\"" + escHtml(card.name) + "\\">"+
        "<div class=\\"jcard-img-wrap\\">" +
          "<img class=\\"jcard-img\\" src=\\"" + escHtml(imgUrl) + "\\" alt=\\"" + escHtml(card.name) + "\\" loading=\\"lazy\\" data-type=\\"" + escHtml(types[0] || "") + "\\" onerror=\\"onImgError(this)\\" />" +
          mBadge +
          "<div class=\\"jcard-overlay\\">" +
            "<button class=\\"jcard-add-btn\\" data-add-idx=\\"" + i + "\\" type=\\"button\\" aria-label=\\"Add " + escHtml(card.name) + " to deck\\">+</button>" +
          "</div>" +
        "</div>" +
        "<div class=\\"jcard-footer\\">" +
          "<span class=\\"jcard-type-dot\\" style=\\"background:" + tClr + "\\"></span>" +
          "<span class=\\"jcard-name\\">" + escHtml(card.name) + "</span>" +
        "</div>" +
      "</div>"
    );
  }).join("");
}

// Search event delegation
document.getElementById("search-results").addEventListener("click", function(e) {
  var addBtn = e.target.closest("[data-add-idx]");
  if (addBtn) {
    var idx = parseInt(addBtn.getAttribute("data-add-idx"), 10);
    var card = _sr[idx];
    if (card) { addCard(card); showToast("Added " + card.name); }
    return;
  }
  var tile = e.target.closest("[data-tile-idx]");
  if (tile) {
    var idx = parseInt(tile.getAttribute("data-tile-idx"), 10);
    var card = _sr[idx];
    if (card) showCardPopover(card, tile);
  }
});

document.getElementById("search-results").addEventListener("keydown", function(e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  var tile = e.target.closest("[data-tile-idx]");
  if (!tile) return;
  e.preventDefault();
  var idx = parseInt(tile.getAttribute("data-tile-idx"), 10);
  var card = _sr[idx];
  if (card) { addCard(card); showToast("Added " + card.name); }
});

// ── TOML export ───────────────────────────────────────────────────────────────

function escToml(s) {
  return s.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\\"");
}

function exportDeck() {
  var name  = document.getElementById("deck-name").value.trim() || "Untitled Deck";
  var marks = {};
  var markList = [];
  state.deck.forEach(function(e) {
    var m = e.card && e.card.regulationMark;
    if (m && !marks[m]) { marks[m] = true; markList.push(m); }
  });
  markList.sort();
  var marksToml = markList.length
    ? "[" + markList.map(function(m) { return "\\"" + m + "\\""; }).join(", ") + "]"
    : "[\\"H\\", \\"I\\"]";

  var out = "name = \\"" + escToml(name) + "\\"\\n";
  out += "format = \\"standard\\"\\n";
  out += "regulation_marks = " + marksToml + "\\n";
  state.deck.forEach(function(entry) {
    out += "\\n[[cards]]\\n";
    out += "id = \\"" + entry.id + "\\"\\n";
    out += "quantity = " + entry.quantity + "\\n";
  });

  var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  var blob = new Blob([out], { type: "text/plain; charset=utf-8" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href   = url;
  a.download = (slug || "deck") + ".toml";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById("export-btn").addEventListener("click", exportDeck);

// ── Chrome AI ─────────────────────────────────────────────────────────────────

function setAiStatus(msg, cls) {
  var statusEl  = document.getElementById("ai-status");
  var statusTxt = document.getElementById("ai-status-text");
  if (statusTxt) statusTxt.textContent = msg;
  statusEl.className = "jai-status" + (cls ? " " + cls : " init");
}

function buildCurrentPrompt() {
  var name  = document.getElementById("deck-name").value.trim() || "Untitled Deck";
  var total = deckTotal();
  var ctx   = "---\\n## Session Context\\n\\n";
  ctx += "## Current Deck: " + name + "\\n";
  ctx += "Total: " + total + " / 60\\n\\n";
  var groups = [
    { label: "Pokemon",  items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Pok\\u00e9mon"; }) },
    { label: "Trainers", items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Trainer"; }) },
    { label: "Energy",   items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Energy"; }) },
    { label: "Unknown",  items: state.deck.filter(function(e) { return !e.card; }) },
  ];
  groups.forEach(function(g) {
    if (!g.items.length) return;
    var st = g.items.reduce(function(n, e) { return n + e.quantity; }, 0);
    ctx += "### " + g.label + " (" + st + " cards)\\n";
    g.items.forEach(function(e) {
      if (!e.card) { ctx += "  " + e.quantity + "x [Unknown: " + e.id + "]\\n"; return; }
      ctx += "  " + e.quantity + "x " + e.card.name + " (" + (e.card.setId || e.id) + ")";
      ctx += " [Mark: " + (e.card.regulationMark || "unknown") + "]\\n";
    });
    ctx += "\\n";
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
    var chatMsgsEl = document.getElementById("chat-msgs");
    chatMsgsEl.innerHTML =
      "<div class=\\"jsetup\\">" +
        "<div class=\\"jsetup-hd\\">&#9888; Chrome Prompt API unavailable</div>" +
        "<div class=\\"jsetup-body\\">" +
          "<ol>" +
            "<li>Open <code>chrome://flags/#prompt-api-for-gemini-nano</code><br>Set to <strong>Enabled</strong> and relaunch Chrome</li>" +
            "<li>Open <code>chrome://components/</code><br>Click <strong>Check for Update</strong> on <em>Optimization Guide On Device Model</em></li>" +
          "</ol>" +
        "</div>" +
        "<div class=\\"jsetup-footer\\">Card search and deck builder work without the AI.\\u2003For full Claude analysis: <code>johto --deck &lt;file&gt;</code></div>" +
      "</div>";
    setAiStatus("Prompt API unavailable", "error");
    return;
  }
  try {
    setAiStatus("initializing Gemini Nano…");
    await createAiSession(window.__STATIC_PROMPT__ + window.__INITIAL_CTX__);
    document.getElementById("send-btn").disabled = false;
    setAiStatus("ready", "ok");
  } catch(err) {
    setAiStatus("init failed: " + err.message, "error");
  }
}

document.getElementById("refresh-btn").addEventListener("click", async function() {
  setAiStatus("rebuilding context…");
  try {
    await createAiSession(buildCurrentPrompt());
    document.getElementById("send-btn").disabled = false;
    setAiStatus("context updated", "ok");
  } catch(err) {
    setAiStatus("refresh failed: " + err.message, "error");
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

var chatMsgs = document.getElementById("chat-msgs");

function appendMsg(role, text) {
  var div = document.createElement("div");
  div.className = role === "user" ? "jmsg-user" : "jmsg-asst";
  div.textContent = text;
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  return div;
}

// Textarea auto-grow fallback for browsers without field-sizing support
(function() {
  var ta = document.getElementById("chat-input");
  if (ta && !("fieldSizing" in ta.style)) {
    ta.addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });
  }
})();

document.getElementById("chat-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (!state.chatSession) return;
  var input = document.getElementById("chat-input");
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "";
  document.getElementById("send-btn").disabled = true;
  appendMsg("user", text);
  var aEl = appendMsg("asst", "");
  try {
    var stream = state.chatSession.promptStreaming(text);
    var lastLen = 0;
    var full = "";
    for await (var chunk of stream) {
      full += chunk.slice(lastLen);
      lastLen = chunk.length;
      aEl.textContent = full + "\\u258c";
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
    aEl.textContent = full;
  } catch(err) {
    aEl.textContent = "Error: " + err.message;
  } finally {
    document.getElementById("send-btn").disabled = false;
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }
});

document.getElementById("chat-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("chat-form").dispatchEvent(new Event("submit"));
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

initAI();
`;

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
