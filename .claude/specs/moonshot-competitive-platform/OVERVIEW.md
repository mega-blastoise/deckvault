# Moonshot: Competitive Platform OVERVIEW

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Project Johto — Current                       │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Browse   │  │  Decks   │  │Collection│  │  Dashboard   │   │
│  │ (cards)  │  │ (builder)│  │(gated🔒) │  │  (gated 🔒)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Project Johto — Moonshot Target                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Landing Page (/)                       │   │
│  │   Hero  ─▶  Feature Showcase  ─▶  Sign-up CTA           │   │
│  └─────────────────────────────────────────────────────────┘   │
│          │                                                       │
│          ▼                                                       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │                  Competitive Core Loop                  │     │
│  │                                                         │     │
│  │  ┌─────────────┐    ┌─────────────┐    ┌───────────┐  │     │
│  │  │  Meta Decks  │─▶ │  My Deck    │─▶  │ Analytics │  │     │
│  │  │  (SPEC_02)   │   │  Adapter    │    │ (SPEC_03) │  │     │
│  │  └─────────────┘    └─────────────┘    └───────────┘  │     │
│  │         │                  │                  │         │     │
│  │         ▼                  ▼                  ▼         │     │
│  │  ┌─────────────┐    ┌─────────────┐    ┌───────────┐  │     │
│  │  │  Evolution  │    │  UX Builder │    │   Local   │  │     │
│  │  │  Tracking   │    │  (SPEC_05)  │    │   Meta    │  │     │
│  │  │  (SPEC_04)  │    └─────────────┘    │  (SPEC_06)│  │     │
│  │  └─────────────┘                       └───────────┘  │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Goals

1. Convert the app from a collection tracker into a **competitive play platform** that beats Limitless TCG and RK9.gg on the workflow layer
2. Gate pre-release features and ship a polished **landing page** that serves as a signup funnel
3. Build the **"From Meta → My Deck"** pipeline: the most valuable missing feature in the ecosystem
4. Ship a **deck analytics engine** covering opening consistency, prize risk, and energy curve — all pure math, no external deps
5. Add **deck evolution tracking** with version diffs to give players historical insight
6. Elevate **UX** to be a product-level differentiator against competitors' clunky builders
7. Lay groundwork for **local meta intelligence** as the long-term moat

---

## Current State Analysis

| Area | Status | Notes |
|------|--------|-------|
| Deck builder (CRUD) | ✅ Complete | DeckBuilderPage, DeckDetailPage, DecksPage |
| Deck browse | ✅ Complete | DeckBrowsePage with format filter + pagination |
| Card browse | ✅ Complete | BrowsePage with search/filter |
| Google OAuth | ✅ Complete | Auth flow wired end-to-end |
| Collection CRUD | ✅ Complete | Postgres-backed useCollectionQuery hooks |
| Landing page | ❌ Missing | `/` redirects to DashboardPage (stats grid) |
| Meta deck database | ❌ Missing | No curated/tournament decklist ingestion |
| Collection-aware deck recommendations | ❌ Missing | No "can I build this?" logic |
| Deck analytics (math) | ❌ Missing | No probability, consistency, prize risk |
| Deck version history | ❌ Missing | No snapshot/diff system |
| UX: drag-and-drop builder | ❌ Missing | Current builder is click-based list |
| UX: visual deck layout | ❌ Missing | No grouped-by-type visual grid |
| UX: instant legality overlay | 🔄 Partial | DeckValidation component exists, not real-time |
| Local meta tracking | ❌ Missing | No LGS/regional data layer |
| Dashboard (coming soon gate) | ❌ Missing | Currently shown as home |
| Collection (coming soon gate) | ❌ Missing | Currently exposed in navbar |

---

## Technology Stack

| Tool | Version | Purpose |
|------|---------|---------|
| React 19 | 19.2 | Frontend framework |
| Bun | 1.3.5 | Runtime + bundler |
| TanStack Query | 5.x | Server state, caching |
| React Router | 7.x | Routing |
| TypeScript | 5.5 strict | Type safety |
| Actix-web + Rust | 4.9 | REST API |
| PostgreSQL | 15 | Primary database |
| Vanilla CSS + BEM | — | Styling |
| DM Sans / JetBrains Mono | — | Typography (already configured) |

---

## Component Architecture

```
apps/web/src/web/
├── pages/
│   ├── LandingPage/              # NEW — SPEC_01
│   │   ├── index.ts
│   │   ├── LandingPage.tsx
│   │   └── LandingPage.css
│   ├── MetaDeckBrowserPage/      # NEW — SPEC_02
│   ├── DeckAnalyticsPage/        # NEW — SPEC_03
│   ├── DeckBuilderPage.tsx       # MODIFIED — SPEC_05
│   └── DeckDetailPage.tsx        # MODIFIED — SPEC_04, SPEC_05
│
├── components/
│   ├── LandingHero/              # NEW — SPEC_01
│   ├── FeatureShowcase/          # NEW — SPEC_01
│   ├── MetaDeckCard/             # NEW — SPEC_02
│   ├── CollectionFilter/         # NEW — SPEC_02
│   ├── DeckAnalyticsPanel/       # NEW — SPEC_03
│   │   ├── OpeningHandSim/
│   │   ├── ConsistencyChart/
│   │   ├── PrizeRiskMeter/
│   │   └── EnergyCurve/
│   ├── DeckVersionHistory/       # NEW — SPEC_04
│   ├── DeckDiffView/             # NEW — SPEC_04
│   └── DeckBuilderVisual/        # NEW — SPEC_05 (drag-drop)
│
├── lib/
│   └── deck-math/                # NEW — SPEC_03
│       ├── hypergeometric.ts
│       ├── opening-hand.ts
│       ├── prize-risk.ts
│       └── energy-curve.ts
│
apps/rest-api/src/handlers/
├── meta-decks.ts                 # NEW — SPEC_02
└── deck-versions.ts              # NEW — SPEC_04
```

---

## Data Flow

```
Meta Deck Pipeline (SPEC_02):
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Meta Deck   │     │  User Owns   │     │ Recommended  │
│  Database    │─▶  │  Filter      │─▶  │   Variants   │
│  (curated)   │     │  (collection)│     │  + Budget    │
└──────────────┘     └──────────────┘     └──────────────┘

Deck Analytics Flow (SPEC_03):
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Deck Cards  │     │  deck-math   │     │  Analytics   │
│  (60 cards)  │─▶  │  lib (pure   │─▶  │  Dashboard   │
│              │     │  functions)  │     │  (4 panels)  │
└──────────────┘     └──────────────┘     └──────────────┘

Deck Evolution Flow (SPEC_04):
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Deck Save   │─▶  │  Snapshot    │     │  Diff View   │
│  (any edit)  │     │  created     │─▶  │  (v1 vs v2)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Success Criteria

### Phase Completion Gates

- [ ] **Phase 0 (Landing + Gates)**: `/` renders LandingPage with sign-up CTA; `/collection` and `/dashboard` navbar links show "Coming Soon" tooltip; no broken routes
- [ ] **Phase 1 (Meta → My Deck)**: User can browse meta decklists, filter by owned cards, and clone a personalized variant into their builder
- [ ] **Phase 2 (Deck Analytics)**: All four math panels render correct results for a test 60-card deck; opening hand probability matches hypergeometric ground truth ±0.1%
- [ ] **Phase 3 (Evolution Tracking)**: Deck edits auto-snapshot; diff view shows added/removed cards between any two versions; version list renders in DeckDetailPage
- [ ] **Phase 4 (UX Differentiators)**: Deck builder has visual card layout grouped by type; legality overlay updates in real time on every card add; drag-and-drop reordering works
- [ ] **Phase 5 (Local Meta)**: Users can log a deck they faced at their LGS; frequency dashboard shows top 5 archetypes by report count

### Quality Metrics

- [ ] Landing page Lighthouse Performance score ≥ 90 on mobile
- [ ] All new TypeScript files pass `bun run check-types` with zero errors
- [ ] deck-math functions have unit test coverage ≥ 95% (pure functions — trivial to test)
- [ ] No `any` types introduced in any new file
- [ ] All new REST endpoints return responses in < 200ms for typical inputs
