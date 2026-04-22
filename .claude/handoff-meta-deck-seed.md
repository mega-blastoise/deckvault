# Handoff: DeckVault — Adoption Strategy + Meta Deck Seed

## The actual goal: market saturation among competitive Pokemon TCG players

The owner's primary goal is **adoption**. The platform is live on a prod domain via Cloudflare tunnel, has zero marketing and zero users. The target audience is **competitive Pokemon TCG players** — people who play in sanctioned events, track Championship Points, follow the Standard format meta, and want better tooling than what exists today.

The competitive landscape is fragmented and bad:
- **Limitless TCG** — read-only tournament results and decklists. No account, no saving, no building from a list.
- **RK9.gg** — event registration and brackets only.
- **PTCGL** — the official client handles online play but has a terrible deck builder and no meta context.
- **Discord/Facebook groups** — unstructured, ephemeral, no tooling.

DeckVault's positioning is: **the hub for everything around competitive play that isn't the game itself** — meta awareness, deck building and management, CP tracking, local meta intelligence, format rotation clarity.

**The simulation platform is explicitly deprioritized.** Competitive players use PTCGL for that. The value is in the surrounding ecosystem.

---

## Current platform state (as of April 17, 2026)

### What's live and working
- `/` — Landing page with competitive TCG value prop, production-ready
- `/browse` — Card browser, public
- `/sets` + `/sets/:setId` — Set browser, public
- `/rotation` — Format rotation calendar (linked in navbar), timely post-April 10 rotation
- `/meta-decks` — **Public** meta deck browser with tier filtering, clone-to-deck flow, collection-aware enrichment when authenticated
- `/decks/:id` — **Already public** (no auth required), shareable URLs work today
- `/decks/:id/analytics` — Deck analytics, public
- `/decks/browse` — Browse public decks
- `/decks`, `/decks/new`, `/decks/:id/edit` — Full deck CRUD, protected
- `/local-meta` — Match reporting (public view, authenticated reporting)
- `/cp` — **CP Tracker, fully built, protected — NOT IN NAVBAR** (critical gap)
- `/sign-in` — Google OAuth

### Auth-gated but discoverable
Deck building, collections, dashboard require a Google account. The sign-in friction is intentional. The viral loop relies on unauthenticated value first.

### What is broken / wrong right now
- **Meta deck data is stale** — PostgreSQL still has old G-regulation decks (Miraidon/Regieleki VMAX, Regidrago VSTAR, Mew ex, Gardevoir ex with sv1 cards) that rotated out April 10. A competitive player who opens `/meta-decks` today sees pre-rotation garbage and immediately distrusts the platform.
- **CP Tracker is invisible** — Fully implemented, unique on the market, not linked from anywhere.
- **PTCGL import is buried** — The parser exists in the simulation flow only, not surfaced in the deck builder.

---

## The viral loop (already structurally in place)

```
Player sees link to a deck on Discord/Twitter/Reddit
          ↓
/decks/:id  (public, no auth required)
          ↓
Sees full decklist, card images, validation, version history
          ↓
"Clone to my builder" CTA  →  sign-up prompt
          ↓
User account created, deck saved, starts building
          ↓
Player shares their variant  →  loop repeats
```

This loop is **structurally complete** — deck detail pages are public, clone flows exist. What's missing is a visible **"Share this deck"** CTA with a copy-URL button on DeckDetailPage to make the entry point obvious.

---

## Priority stack for adoption (ordered by impact/effort)

### 1. Fix meta deck data (blocker — kills trust on first visit)
**Status**: JSON and seed script are correct on disk. PostgreSQL still has old data.
See seeding instructions below.

### 2. CP Tracker in navbar (~30 min)
`apps/web/src/web/components/Navbar/Navbar.tsx` — add a link to `/cp` (protected, shows only when `isAuthenticated`).
No other work needed — the page, API, and data model are fully implemented.
This is the most **unique** feature on the platform. No other TCG tool has a CP tracker. Competitive players obsess over their standing toward Day 2 (500 CP) and Worlds (1000 CP). This gives logged-in users a reason to return after every tournament.

### 3. "Share deck" CTA on DeckDetailPage (~1 hour)
`apps/web/src/web/pages/DeckDetailPage/` — add a share button that copies the current URL to clipboard. Small UI addition with outsized impact on organic spread. Discord, Reddit, and group chats are the distribution channel — every shared deck URL is a new acquisition funnel entry.

### 4. PTCGL import in deck builder (~2 hours)
`apps/web/src/web/components/DeckInputPanel/ptcgl-parser.ts` and `PtcglPasteInput.tsx` already exist. Surface them in the deck builder page (`DeckBuilderPage`). 
The activation moment is: player pastes their current list from PTCGL → it's validated against the current format → they see errors or confirmation → they save it. This converts a "curious visitor" into an "invested user" in under 60 seconds.

### 5. Regular meta deck updates (ongoing content work)
The meta changes every 2-3 weeks after major events. The seed pipeline is now fast (paste Limitless URLs, validate, seed). Stale data is a trust killer. The platform needs to be perceived as maintained and current.

### 6. Shareable /meta-decks filters
The meta deck browser at `/meta-decks` should support URL-encoded filter state (tier, archetype) so players can share links like `/meta-decks?tier=S` in community channels.

---

## Go-to-market approach (not yet started)

The owner has not done any marketing. The right entry points for competitive Pokemon TCG players:

- **Reddit**: r/pkmntcg, r/PokemonTCG — post meta deck analysis content linking back to the platform
- **Discord**: major competitive TCG servers (PokeBeach, Limitless community, regional group chats) — share deck links, get feedback
- **Limitless TCG community** — players already looking at those decklists; DeckVault is the next step (save, build, track)
- **Content creators** — YouTube/TikTok TCG content creators who cover meta analysis

The hook for cold traffic: "Browse current meta decklists, clone one to your builder, track your CP through the season."

---

## Technical debt to be aware of

- **Simulation engine**: ~40% complete. Abilities don't fire (zero registered effects), attack effects are generic patterns not mapped to actual cards, 14 engine tests fail. **Owner has explicitly deprioritized this.** Do not touch without being asked.
- **/scaffold route** is public and unprotected — appears to be a dev tool exposed in production.
- The `apps/tcg-api` (Rust GraphQL) and `apps/distributed-ledger` exist in the repo but are **not in production** (`docker-compose.prod.yml` does not include them).

---

## Immediate task: seed meta decks to production

### What was changed on disk
- `database/seeds/data/meta_decks.json` — fully replaced with 9 HIJ-legal decklists, all 60 cards, all card IDs validated against SQLite
- `database/seeds/meta_decks.ts` — fixed to insert `tier` column (it was missing from the INSERT despite being in the JSON)

### Production architecture
`docker-compose.prod.yml` at repo root. Services: `web`, `rest-api`, `graphql-api`, `postgres`, `nginx`, `cloudflared`. All on internal `pika` Docker network. Postgres is NOT exposed to host. Credentials in `.env.prod` (not readable by Claude).

### Seeding commands

```bash
# Step 1: clear old pre-rotation meta decks
# docker compose exec uses Docker socket, not network — works even though postgres isn't host-exposed
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "TRUNCATE meta_decks CASCADE;"

# Step 2: run seed in a temporary bun container on the pika network
# If .env.prod contains POSTGRES_URL or DATABASE_URL directly:
docker run --rm \
  --network pika \
  --env-file .env.prod \
  -v "$(pwd)/database:/database:ro" \
  oven/bun:1.3.8-alpine \
  bun run /database/seeds/meta_decks.ts

# If .env.prod uses separate POSTGRES_USER/PASSWORD/DB vars instead:
docker run --rm \
  --network pika \
  --env-file .env.prod \
  -v "$(pwd)/database:/database:ro" \
  oven/bun:1.3.8-alpine \
  sh -c 'POSTGRES_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" bun run /database/seeds/meta_decks.ts'
```

Note: hostname inside `pika` network is `postgres` (the container name), not `localhost`.

### Verify after seeding
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT name, tier, event_date FROM meta_decks ORDER BY tier, event_date DESC;"
```
Expected: 9 rows, all event_date >= 2026-01-23, no pre-rotation decks.

### New meta decks seeded
| Deck | Event | Tier |
|------|-------|------|
| Marnie's Grimmsnarl ex / Froslass | Regional Querétaro — 2nd | S |
| Team Rocket's Mewtwo ex | Champions League Osaka — 3rd | S |
| Mega Froslass ex / Mega Starmie ex | City League Tokyo — 1st | S |
| Greninja ex / Dusknoir | Champions League Osaka — 8th | A |
| N's Zoroark ex | Regional Querétaro — 13th | A |
| Dragapult ex / Dusknoir | Regional Houston — 37th | B |
| Raging Bolt ex / Teal Mask Ogerpon ex | Regional Querétaro — 19th | B |
| Slowking / Xatu | Korean League S3 — 22nd | B |
| Mega Lucario ex / Hariyama | Regional Querétaro — 49th | C |
