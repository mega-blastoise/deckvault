# Moonshot: Spec Document Strategy

## Dependency Graph

```
SPEC_01 (Landing + Gates)
    │
    ├─▶ SPEC_02 (Meta → My Deck)
    │       │
    │       └─▶ SPEC_03 (Analytics)
    │                   │
    │                   └─▶ SPEC_05 (UX Differentiators)
    │                               │
    │                               └─▶ SPEC_04 (Evolution Tracking)
    │
    └─▶ SPEC_06 (Local Meta)    ← can start after SPEC_02 data patterns are established
```

SPEC_01 is the only true blocker — it establishes the new navigation contract. All other specs are
sequential within the competitive core loop. SPEC_06 can be worked in parallel after SPEC_02.

---

## Phase Descriptions

### Phase 0: Foundation & Funnel

| Spec | Focus | Deliverables |
|------|-------|--------------|
| SPEC_01 | Landing page + navigation gates | LandingPage component, navbar gating, route restructure, feature showcase sections |

### Phase 1: Meta Intelligence

| Spec | Focus | Deliverables |
|------|-------|--------------|
| SPEC_02 | Meta → My Deck pipeline | Meta deck database (seeded), collection-aware filter, budget substitution, clone-to-builder |

### Phase 2: Analytics Engine

| Spec | Focus | Deliverables |
|------|-------|--------------|
| SPEC_03 | Deck analytics math + UI | deck-math lib (4 modules), DeckAnalyticsPanel, 4 sub-panels, REST endpoint |

### Phase 3: Tracking & UX

| Spec | Focus | Deliverables |
|------|-------|--------------|
| SPEC_04 | Deck evolution + version history | Snapshot model, deck_versions DB table, DeckDiffView, version timeline UI |
| SPEC_05 | UX builder differentiators | Visual layout view, live legality overlay, drag-and-drop, version control UI wiring |

### Phase 4: Community Layer

| Spec | Focus | Deliverables |
|------|-------|--------------|
| SPEC_06 | Local meta intelligence | LGS deck reporting, archetype frequency aggregation, local meta dashboard |

---

## Exit Criteria

### Phase 0 Exit
- [ ] `GET /` renders `LandingPage` (not a redirect)
- [ ] Collection navbar link has `disabled` state + tooltip "Coming Soon"
- [ ] Dashboard navbar link has `disabled` state + tooltip "Coming Soon"
- [ ] Sign-in CTA on landing page routes to `/sign-in`
- [ ] All existing deck routes (`/decks/*`) remain functional

### Phase 1 Exit
- [ ] `GET /api/v1/meta-decks` returns paginated list of curated decklists
- [ ] `GET /api/v1/meta-decks?collectionOnly=true` filters to user-buildable decks
- [ ] User can navigate to a meta deck and click "Build This" to clone into DeckBuilderPage
- [ ] Budget substitutions display price estimates per card

### Phase 2 Exit
- [ ] All four `deck-math` functions pass unit tests with known inputs
- [ ] `DeckAnalyticsPage` renders for any deck ID with all four panels populated
- [ ] Opening hand panel shows probability slider (7-card hand default)
- [ ] Prize risk panel shows per-card risk for cards with ≤ 2 copies

### Phase 3 Exit
- [ ] Deck save operation creates a `deck_versions` snapshot automatically
- [ ] DeckDetailPage shows version history tab
- [ ] Selecting two versions renders `DeckDiffView` (added/removed cards)
- [ ] Version list is paginated (max 20 shown initially)

### Phase 4 (SPEC_05) Exit
- [ ] Deck builder has toggle between "List View" and "Visual View"
- [ ] Visual view groups cards by: Pokémon / Trainer / Energy
- [ ] Legality badge updates on every card add without page reload
- [ ] Cards can be reordered via drag within the list view

### Phase 4 (SPEC_06) Exit
- [ ] Authenticated users can submit "I faced [archetype] at [LGS]" reports
- [ ] Local meta page shows top archetypes by report frequency in last 30 days
- [ ] Reports are rate-limited (max 10/user/day)

---

## Execution Strategy

```
Week 1
┌──────────────────────────────────────────────┐
│  SPEC_01: Landing + Gates                    │
│  ├── LandingPage component + CSS             │
│  ├── Navbar gating (collection, dashboard)   │
│  └── Route restructure                       │
└──────────────────────────────────────────────┘

Week 2
┌──────────────────────────────────────────────┐
│  SPEC_02: Meta → My Deck                     │
│  ├── DB migration: meta_decks table          │
│  ├── Seed 20 curated tournament lists        │
│  ├── REST endpoint + collection filter       │
│  └── MetaDeckBrowserPage + clone-to-builder  │
└──────────────────────────────────────────────┘

Week 3
┌──────────────────────────────────────────────┐
│  SPEC_03: Deck Analytics                     │
│  ├── deck-math lib (pure TS, unit tested)    │
│  ├── REST analytics endpoint                 │
│  └── DeckAnalyticsPanel (4 sub-panels)       │
└──────────────────────────────────────────────┘

Week 4 ─ parallel tracks possible ─────────────
┌────────────────────────┐  ┌──────────────────┐
│  SPEC_04: Evolution    │  │  SPEC_05: UX     │
│  ├── DB migration      │  │  ├── Visual view  │
│  ├── Auto-snapshot     │  │  ├── Live legality│
│  └── DeckDiffView      │  │  └── Drag-drop    │
└────────────────────────┘  └──────────────────┘

Week 5
┌──────────────────────────────────────────────┐
│  SPEC_06: Local Meta                         │
│  ├── DB migration: lgs_reports table         │
│  ├── Report submission endpoint              │
│  └── LocalMetaPage                           │
└──────────────────────────────────────────────┘
```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Pokemon TCG API rate limits for meta deck card data | Medium | High | Cache all card lookups in SQLite at seed time; never re-fetch in request path |
| Drag-and-drop library adds bundle weight | Medium | Low | Use native HTML5 DnD API — no external library needed |
| Hypergeometric calculation overflow for large N | Low | Medium | Use log-space arithmetic; validate with known lookup tables in tests |
| Meta deck seed data becomes stale | High | Medium | Add `last_updated` field; surface staleness badge in UI ("Data from [date]") |
| Local meta reports are gamed/spammed | Medium | Medium | Rate limit per user per day; require authentication; report flagging UI |
| Landing page Pokemon assets are large | Medium | Medium | Use WebP + `<picture>` srcset; lazy load below-fold images; preload hero asset |

---

## Rollback Plan

Each phase is additive and behind its own routes/endpoints. Rollback per phase:

**Phase 0**: Revert route change (`/` redirect back to `/dashboard`); remove `disabled` prop from navbar links
**Phase 1**: Drop `meta_decks` and `meta_deck_cards` tables; remove `/api/v1/meta-decks` handler registration
**Phase 2**: Remove `DeckAnalyticsPage` route; `deck-math` lib is inert (no side effects)
**Phase 3**: Drop `deck_versions` table; remove snapshot trigger from deck save handler; hide version history tab
**Phase 4**: Remove visual view toggle (revert builder to list-only); native DnD leaves no infrastructure traces
**Phase 5**: Drop `lgs_reports` table; remove route and handler
