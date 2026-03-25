# Migration Context — AWS → DGX Spark Self-Host

**Last updated:** 2026-03-23
**Status:** IN PROGRESS — Phase 1 (Cloudflare setup) starting

---

## Objective

Migrate DeckVault production stack from AWS (EC2 + RDS + CloudFront) to self-hosted
on NVIDIA DGX Spark, routed through Cloudflare Tunnel.

**Motivation:** ~$25/mo AWS bill → ~$1–3/mo marginal electricity cost on hardware already running.

---

## Network facts

| Key | Value |
| --- | --- |
| Machine | NVIDIA DGX Spark |
| LAN IP (ethernet) | `10.0.0.11` |
| LAN IP (wifi) | `10.0.0.155` |
| Router gateway | `10.0.0.1` |
| Public IP | `75.71.208.15` (Comcast, confirmed no CGNAT) |
| WAN IP confirmed | `75.71.208.15` (matches public, no CGNAT) |
| Upload bandwidth | 35 Mbps |

---

## Target architecture

```text
Browser → Cloudflare DNS → Tunnel → nginx (:80, container) → pika network
                                                               ├── web     (:3000)
                                                               ├── rest-api (:3001) → postgres (local container)
                                                               └── graphql-api (:3002) → SQLite (volume)
```

TLS terminates at Cloudflare edge. nginx is HTTP-only internally.
`CF-Connecting-IP` header carries the real client IP to nginx.

---

## Files changed in this migration

| File | Change |
| --- | --- |
| `docker-compose.prod.yml` | Added `cloudflared` + `postgres` services; removed 443/letsencrypt from nginx |
| `docker/nginx/conf.d/default.conf` | Removed SSL block; use `CF-Connecting-IP` for real IP; `X-Forwarded-Proto: https` |
| `.claude/guides/SELF_HOST_MIGRATION.md` | Full migration runbook |
| `.env.prod` (on Spark, not in repo) | `DATABASE_URL` → `postgres:5432`; add `POSTGRES_*` and `CLOUDFLARE_TUNNEL_TOKEN` |

---

## .env.prod changes needed

Current `.env.prod` on EC2 must be updated on the Spark before cutover.
Do NOT commit this file — it contains credentials.

```bash
# Remove / replace:
DATABASE_URL=postgresql://user:pass@your-rds-endpoint.rds.amazonaws.com:5432/pokemon

# Add:
DATABASE_URL=postgresql://postgres:<PASSWORD>@postgres:5432/pokemon
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<PASSWORD>          # choose a strong password
POSTGRES_DB=pokemon
CLOUDFLARE_TUNNEL_TOKEN=<token>       # from: cloudflared tunnel token deckvault
```

---

## Phase tracker

| Phase | Description | Status |
| ----- | ----------- | ------ |
| 1 | Cloudflare account + DNS delegation + nameserver update | ✅ Complete |
| 2 | Create Cloudflare Tunnel, get token, configure public hostnames | ✅ Complete |
| 3 | Export RDS data via pg_dump | ✅ Complete |
| 4 | Start local postgres, import dump, verify row counts | ✅ Complete |
| 5 | Pull images, start full stack, smoke test via tunnel domain | ✅ Complete |
| 6 | Verify DNS cutover end-to-end (domain → Cloudflare → tunnel) | ✅ Complete — 2026-03-24, all 6 containers healthy, HTTP/2 200 via Cloudflare |
| 7 | Terminate EC2, RDS, Elastic IP, Route 53 hosted zone | ⬜ Not started |

Update status to ✅ as each phase completes.

---

## Key values to fill in during migration

| Value | Where to find it | Recorded here |
| --- | --- | --- |
| Cloudflare nameservers (×2) | Cloudflare dashboard → your domain | `ben.ns.cloudflare.com`, `elisabeth.ns.cloudflare.com` |
| Tunnel ID | `cloudflared tunnel create deckvault` output | `2c46aae5-b852-44de-848d-70270744a156` |
| Tunnel token | `cloudflared tunnel token deckvault` | (do not record — goes straight to .env.prod) |
| RDS instance identifier | AWS Console → RDS | — |
| EC2 instance ID | AWS Console → EC2 | — |
| Elastic IP allocation ID | AWS Console → EC2 → Elastic IPs | — |

---

## Issues resolved this session

| Issue | Fix |
| --- | --- |
| RDS running Postgres 17, compose used `postgres:16-alpine` | Changed to `postgres:17-alpine` in `docker-compose.prod.yml` |
| `DECK_DATABASE_PATH` missing from compose — rest-api tried to `mkdir ./database` and got EACCES | Added `DECK_DATABASE_PATH=/tmp/decks.sqlite3.db` to rest-api environment |
| `cloudflared` restarting — `TUNNEL_TOKEN` resolved to empty string via compose interpolation | Removed `environment` block from cloudflared; `env_file` passes `TUNNEL_TOKEN` directly |
| `CLOUDFLARE_TUNNEL_TOKEN` was the key name in `.env.prod`; cloudflared expects `TUNNEL_TOKEN` | User renamed key in `.env.prod` to `TUNNEL_TOKEN` |

## Current stack state (as of 2026-03-24)

All 6 containers running healthy on the Spark:
- `pokemon-cloudflared` — tunnel connected to Cloudflare
- `pokemon-nginx` — reverse proxy on port 80
- `pokemon-web` — SSR frontend (verified returning HTML)
- `pokemon-rest-api` — REST API connected to local postgres
- `pokemon-graphql-api` — Apollo GraphQL connected to SQLite
- `pokemon-postgres` — Postgres 17, RDS data imported (26KB dump)

NS propagation: still pending as of session end — AWS nameservers still resolving.
Run `dig NS deckvault.gg +short` to check; expect `ben.ns.cloudflare.com` and `elisabeth.ns.cloudflare.com`.

## Next session — continuation steps

**1. Verify NS propagation**
```bash
dig NS deckvault.gg +short
# Expect: ben.ns.cloudflare.com, elisabeth.ns.cloudflare.com
```

**2. Phase 6 — smoke test via actual domain (once NS propagated)**
```bash
curl -sI https://deckvault.gg/nginx-health | head -5
# Expect: HTTP/2 200, server: cloudflare
curl -s https://deckvault.gg/api/v1/health
curl -sI https://www.deckvault.gg/ | head -3
```

**3. Set up /opt/deckvault production directory**
Full spec in `.claude/guides/SPARK_PROD_SETUP.md`.
Summary: create `deckvault` system user (no-login shell), copy 5 items to `/opt/deckvault/`,
install systemd unit at `/etc/systemd/system/deckvault.service`, enable + start.
Do this before Phase 7 so the stack is running from the stable directory before AWS is torn down.

**4. Phase 7 — terminate AWS resources** (only after 24–48h of verified prod traffic)
- Stop EC2 instance → wait 48h → terminate
- Delete RDS instance (with final snapshot)
- Release Elastic IP
- Delete Route 53 hosted zone

## Decisions log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-03-23 | Use Cloudflare Tunnel over direct port-forward | Dynamic ISP IP, no open inbound ports, free TLS, no cert maintenance |
| 2026-03-23 | Keep Docker Compose for isolation | DGX Spark is a shared-use machine; containers provide OS isolation |
| 2026-03-23 | Local postgres container over bare-metal install | Keeps all services in the same compose file; easier backup/restore |
| 2026-03-23 | Remove 443/letsencrypt from nginx | Cloudflare terminates TLS; nginx is internal HTTP only |

---

## Rollback path

EC2 and RDS remain running through Phase 6. To roll back at any point before Phase 7:
1. In Cloudflare DNS: delete the CNAME tunnel records, add A records pointing to `75.71.208.15`
2. Propagation is near-instant (Cloudflare is already authoritative)
3. Old stack resumes serving traffic with no changes needed on AWS side
