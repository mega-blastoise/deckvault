
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
  ph.innerHTML = "<span style=\"font-size:28px\">♦</span><span>" + (type || "—") + "</span>";
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
    ? "<span class=\"jpopover-chip " + markCls + "\">" + escHtml(mark) + "</span>"
    : "";

  var metaParts = [];
  if (card.supertype) metaParts.push("<span>" + escHtml(card.supertype) + "</span>");
  if (types)          metaParts.push("<span>·</span><span>" + escHtml(types) + "</span>");
  if (hp)             metaParts.push("<span>·</span><strong>" + escHtml(hp) + "</strong>");

  var attacksHtml = "";
  var attacks = card.attacks || [];
  if (attacks.length) {
    attacksHtml += "<div class=\"jpopover-section\">Attacks</div>";
    for (var i = 0; i < attacks.length; i++) {
      var a = attacks[i];
      var cost = (a.cost || []).join(" ") || "—";
      attacksHtml +=
        "<div class=\"jpopover-attack\">" +
          "<div class=\"jpopover-attack-hd\">" +
            "<span>" + escHtml(a.name || "") + "</span>" +
            "<span>" + escHtml(a.damage || "") + "</span>" +
          "</div>" +
          "<div class=\"jpopover-attack-cost\">" + escHtml(cost) + "</div>" +
          (a.text ? "<div class=\"jpopover-attack-sub\">" + escHtml(a.text) + "</div>" : "") +
        "</div>";
    }
  }

  var abilitiesHtml = "";
  var abilities = card.abilities || [];
  if (abilities.length) {
    abilitiesHtml += "<div class=\"jpopover-section\">Abilities</div>";
    for (var j = 0; j < abilities.length; j++) {
      var ab = abilities[j];
      abilitiesHtml +=
        "<div class=\"jpopover-ability\">" +
          "<div class=\"jpopover-ability-name\">" + escHtml(ab.name || "") + "</div>" +
          (ab.text ? "<div class=\"jpopover-ability-text\">" + escHtml(ab.text) + "</div>" : "") +
        "</div>";
    }
  }

  return (
    "<div class=\"jpopover-inner\">" +
      "<img class=\"jpopover-img\" src=\"" + escHtml(imgUrl) + "\" alt=\"" + escHtml(card.name || "") + "\" loading=\"lazy\" />" +
      "<div class=\"jpopover-info\">" +
        "<div class=\"jpopover-name\">" + escHtml(card.name || "") + "</div>" +
        "<div class=\"jpopover-meta\">" + metaParts.join("") + "</div>" +
        (chipHtml ? "<div>" + chipHtml + "</div>" : "") +
        (setId ? "<div style=\"font-size:10px;color:var(--text-tertiary);font-family:ui-monospace,monospace\">" + escHtml(setId) + "</div>" : "") +
        abilitiesHtml +
        attacksHtml +
      "</div>" +
    "</div>" +
    "<div class=\"jpopover-footer\">" +
      "<button class=\"jpop-add-btn\" data-pop-add=\"1\" type=\"button\">Add to deck  +</button>" +
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
    if (st === "Pokémon") pkCt += e.quantity;
    else if (st === "Trainer")  trCt += e.quantity;
    else if (st === "Energy")   enCt += e.quantity;
  }
  var total = pkCt + trCt + enCt;
  var row = document.getElementById("stats-row");
  var track = document.getElementById("stats-track");
  if (row) {
    row.innerHTML =
      "<span class=\"jstats-segment jstats-segment--pk\">Pokémon " + pkCt + "</span>" +
      "<span class=\"jstats-segment jstats-segment--tr\">Trainers " + trCt + "</span>" +
      "<span class=\"jstats-segment jstats-segment--en\">Energy " + enCt + "</span>";
  }
  if (track) {
    var pkP = total ? (pkCt / total * 100).toFixed(1) : 0;
    var trP = total ? (trCt / total * 100).toFixed(1) : 0;
    var enP = total ? (enCt / total * 100).toFixed(1) : 0;
    track.innerHTML =
      "<div class=\"jstats-fill jstats-fill--pk\" style=\"width:" + pkP + "%\"></div>" +
      "<div class=\"jstats-fill jstats-fill--tr\" style=\"width:" + trP + "%\"></div>" +
      "<div class=\"jstats-fill jstats-fill--en\" style=\"width:" + enP + "%\"></div>";
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
    return e.card.name + " (" + (e.card.setId || e.id) + "·" + e.card.regulationMark + ")";
  }).join(", ");
  if (rotating.length > 3) names += ", +" + (rotating.length - 3) + " more";
  container.innerHTML =
    "<div class=\"jrot-warn\">" +
      "<span class=\"jrot-warn-icon\">&#9888;</span>" +
      "<span class=\"jrot-warn-body\">" +
        "<span class=\"jrot-warn-title\">" +
          rotating.length + " card" + (rotating.length > 1 ? "s are" : " is") + " not legal in Standard" +
        "</span>" +
        escHtml(names) +
      "</span>" +
      "<button class=\"jrot-warn-dismiss\" type=\"button\" aria-label=\"Dismiss\">&times;</button>" +
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
    body.innerHTML = "<div class=\"jdeck-empty\">search for cards &#8250;<br>click + to add to deck</div>";
    return;
  }

  var groups = [
    { key: "pk", label: "POKÉMON", entries: state.deck.filter(function(e) { return e.card && e.card.supertype === "Pokémon"; }) },
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
      "<div class=\"jsec-hd\">" +
        "<div class=\"jsec-hd-row\">" +
          "<span class=\"jsec-hd-label jsec-hd-label--" + grp.key + "\">" + grp.label + "</span>" +
          "<span class=\"jsec-hd-ct\">" + secTotal + "</span>" +
        "</div>" +
      "</div>" +
      "<div class=\"jsec-divider\"></div>";

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
        "<div class=\"jdrow\">" +
          "<div class=\"jdrow-thumb\">" +
            "<img src=\"" + imgUrl + "\" alt=\"" + escHtml(name) + "\" loading=\"lazy\" onerror=\"this.hidden=true\" />" +
          "</div>" +
          "<div class=\"jdrow-info\">" +
            "<span class=\"jdrow-name\">" + escHtml(name) + "</span>" +
            "<div class=\"jdrow-meta\">" +
              "<span class=\"jdrow-dot " + dotCls + "\"></span>" +
              "<span>" + escHtml(metaText) + "</span>" +
            "</div>" +
          "</div>" +
          "<div class=\"jdrow-ctrl\">" +
            "<button class=\"jdrow-btn\" data-id=\"" + entry.id + "\" data-delta=\"-1\" aria-label=\"Remove one\" " +
              (entry.quantity <= 1 ? " disabled" : "") + ">&#8722;</button>" +
            "<span class=\"jdrow-qty\">" + entry.quantity + "</span>" +
            "<button class=\"jdrow-btn\" data-id=\"" + entry.id + "\" data-delta=\"1\" aria-label=\"Add one\" " +
              ((atLim || atMax) ? " disabled" : "") + ">+</button>" +
          "</div>" +
          "<button class=\"jdrow-rm\" data-remove-id=\"" + entry.id + "\" aria-label=\"Remove " + escHtml(name) + "\">&times;</button>" +
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
    html += "<div class=\"jcard-skel\"><div class=\"jcard-skel-img\"></div><div class=\"jcard-skel-foot\"></div></div>";
  }
  grid.innerHTML = html;
}

async function runSearch(q) {
  var grid = document.getElementById("search-results");
  if (!q && !_curFilter) {
    _sr = [];
    grid.innerHTML = "<div class=\"jsearch-empty\" style=\"grid-column:1/-1\">type to search<br>19,818 cards</div>";
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
    grid.innerHTML = "<div class=\"jsearch-empty\" style=\"grid-column:1/-1\">no cards found</div>";
    return;
  }
  grid.innerHTML = cards.map(function(card, i) {
    var imgUrl = (card.images && card.images.small) || deriveImgUrl(card.id);
    var mark   = card.regulationMark || null;
    var mCls   = mark ? (LEGAL_MARKS[mark] ? "ok" : "no") : "unk";
    var types  = card.types || [];
    var tClr   = (types[0] && TYPE_CLR[types[0]]) || "#A8A29E";
    var mBadge = mark ? ("<span class=\"jcard-mark " + mCls + "\">" + escHtml(mark) + "</span>") : "";
    return (
      "<div class=\"jcard\" tabindex=\"0\" role=\"button\" data-tile-idx=\"" + i + "\" aria-label=\"" + escHtml(card.name) + "\">"+
        "<div class=\"jcard-img-wrap\">" +
          "<img class=\"jcard-img\" src=\"" + escHtml(imgUrl) + "\" alt=\"" + escHtml(card.name) + "\" loading=\"lazy\" data-type=\"" + escHtml(types[0] || "") + "\" onerror=\"onImgError(this)\" />" +
          mBadge +
          "<div class=\"jcard-overlay\">" +
            "<button class=\"jcard-add-btn\" data-add-idx=\"" + i + "\" type=\"button\" aria-label=\"Add " + escHtml(card.name) + " to deck\">+</button>" +
          "</div>" +
        "</div>" +
        "<div class=\"jcard-footer\">" +
          "<span class=\"jcard-type-dot\" style=\"background:" + tClr + "\"></span>" +
          "<span class=\"jcard-name\">" + escHtml(card.name) + "</span>" +
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
  return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
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
    ? "[" + markList.map(function(m) { return "\"" + m + "\""; }).join(", ") + "]"
    : "[\"H\", \"I\"]";

  var out = "name = \"" + escToml(name) + "\"\n";
  out += "format = \"standard\"\n";
  out += "regulation_marks = " + marksToml + "\n";
  state.deck.forEach(function(entry) {
    out += "\n[[cards]]\n";
    out += "id = \"" + entry.id + "\"\n";
    out += "quantity = " + entry.quantity + "\n";
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
  var ctx   = "---\n## Session Context\n\n";
  ctx += "## Current Deck: " + name + "\n";
  ctx += "Total: " + total + " / 60\n\n";
  var groups = [
    { label: "Pokemon",  items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Pokémon"; }) },
    { label: "Trainers", items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Trainer"; }) },
    { label: "Energy",   items: state.deck.filter(function(e) { return e.card && e.card.supertype === "Energy"; }) },
    { label: "Unknown",  items: state.deck.filter(function(e) { return !e.card; }) },
  ];
  groups.forEach(function(g) {
    if (!g.items.length) return;
    var st = g.items.reduce(function(n, e) { return n + e.quantity; }, 0);
    ctx += "### " + g.label + " (" + st + " cards)\n";
    g.items.forEach(function(e) {
      if (!e.card) { ctx += "  " + e.quantity + "x [Unknown: " + e.id + "]\n"; return; }
      ctx += "  " + e.quantity + "x " + e.card.name + " (" + (e.card.setId || e.id) + ")";
      ctx += " [Mark: " + (e.card.regulationMark || "unknown") + "]\n";
    });
    ctx += "\n";
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
      "<div class=\"jsetup\">" +
        "<div class=\"jsetup-hd\">&#9888; Chrome Prompt API unavailable</div>" +
        "<div class=\"jsetup-body\">" +
          "<ol>" +
            "<li>Open <code>chrome://flags/#prompt-api-for-gemini-nano</code><br>Set to <strong>Enabled</strong> and relaunch Chrome</li>" +
            "<li>Open <code>chrome://components/</code><br>Click <strong>Check for Update</strong> on <em>Optimization Guide On Device Model</em></li>" +
          "</ol>" +
        "</div>" +
        "<div class=\"jsetup-footer\">Card search and deck builder work without the AI. For full Claude analysis: <code>johto --deck &lt;file&gt;</code></div>" +
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
      aEl.textContent = full + "▌";
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
