# Intelligent Deck Construction — OVERVIEW

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│              Intelligent Deck Construction Loop               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               SPEC_01: Search by Use Case             │   │
│  │                                                        │   │
│  │  Browse  ──▶  "energy acceleration"  ──▶  Ranked      │   │
│  │  Deck Builder ──▶  "my deck needs draw"  ──▶  Suggest │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│                          ▼ (tags power deck-aware search)     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             SPEC_02: Rapid Deck Scaffolder            │   │
│  │                                                        │   │
│  │  Archetype ──▶ Cluster ──▶ Frequency ──▶ Scaffold    │   │
│  │  Scaffold  ──▶ "weak to ability lock" ──▶ Tag Search  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Goals

1. Give players a semantic search layer — search by intent ("energy acceleration"), not by card text
2. Build a meta-aware deck scaffolder that produces structured 60-card foundations in seconds
3. Create an intelligent construction loop: scaffold → identify gaps → search by use case → iterate

These two features form the highest-leverage unbuilt surface in the app. Together they
differentiate DeckVault from every other TCG tool that only offers free-text search and manual building.

---

## Implementation Order

**SPEC_01 first.** Use case search is self-contained and provides the tag infrastructure that
powers SPEC_02's deck-aware gap analysis. Building SPEC_02 without SPEC_01 produces a scaffolder
with no recommendation layer.

| Spec | Feature | Depends On |
|------|---------|------------|
| SPEC_01 | Card Search by Use Case | Nothing — standalone |
| SPEC_02 | Rapid Deck Scaffolder | SPEC_01 (deck-aware tag search) |

---

## Architecture Context

### Databases
- **SQLite** (`pokemon-data.sqlite3.db`): read-only card data — `pokemon_cards`, `pokemon_card_sets`.
  All card text lives here. Tag pattern matching runs here.
- **PostgreSQL**: user data, decks, meta decks, collections.
  Meta usage counts and user-specific features run here.

### API Pattern
New handlers follow the established pattern: create in `apps/rest-api/src/handlers/`,
register router in `apps/rest-api/src/index.ts`.

### Frontend Pattern
New pages: `apps/web/src/web/pages/ComponentName/` with `index.ts` barrel.
New routes: `routes.tsx` + `ROUTES` const in `routes/index.tsx`.
Services: `apps/web/src/web/services/`.

---

## Success Criteria (Both Specs)

- [ ] Searching "energy acceleration" on BrowsePage returns Electric Generator, Baxcalibur, Mirage Gate
- [ ] Searching "draw" while editing a deck surfaces cards used in that archetype first
- [ ] Scaffolding "Dragapult" produces a structured 60-card deck with labeled tiers
- [ ] Scaffolded deck can be cloned directly into the deck builder
- [ ] All new endpoints respond in < 200ms for typical inputs
- [ ] `bun run check-types` clean, 133/133 tests pass after both specs shipped
