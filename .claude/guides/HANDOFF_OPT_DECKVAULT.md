# Handoff — /opt/deckvault production setup

**Date:** 2026-03-24
**Status:** One step from done. The domain is live, the systemd unit is installed and correct, but the service won't start due to a resolved SQLite issue that needs a one-time file fix.

---

## What is complete

- ✅ `deckvault.gg` is live end-to-end through Cloudflare Tunnel (`curl -sI https://deckvault.gg/nginx-health` → HTTP/2 200, server: cloudflare)
- ✅ `deckvault` system user created (uid=996, in `docker` group, shell `/sbin/nologin`)
- ✅ `/opt/deckvault/` directory populated with all 5 required files
- ✅ `/etc/systemd/system/deckvault.service` installed and correct, including `Environment=COMPOSE_PROJECT_NAME=pokemon` (critical — ensures the existing `pokemon_postgres_data` Docker volume is used, not a new empty one)
- ✅ Bug fixed in `packages/@database/lib/sqlite.ts`: `PRAGMA journal_mode = WAL` is now gated behind `if (!options.readonly)` — images rebuilt and pushed to GHCR

## The one remaining blocker

### Root cause

`pokemon-data.sqlite3.db` was previously opened in WAL journal mode. That mode is stored in the file header. Even when opened `readonly: true`, SQLite requires write access to the database directory to create a `-shm` (shared memory) file for WAL coordination.

In `/opt/deckvault/database/`, the files are owned by `deckvault` (uid=996). The container processes run as `bun` (uid=1000), which is "other" — read-only, no write. So even `SELECT 1` fails with `SQLITE_READONLY_DIRECTORY`.

The code fix prevents *future* connections from setting WAL mode on readonly opens. But the existing file header still declares WAL mode. It needs to be reset once.

### The fix (3 commands)

```bash
# 1. Reset journal mode — run from workspace where nicks-dgx (uid=1000) has write access
cd /home/nicks-dgx/dev/.Project-Johto/Pokemon
bun -e "import {Database} from 'bun:sqlite'; const db = new Database('./database/pokemon-data.sqlite3.db'); db.run('PRAGMA journal_mode = DELETE'); console.log('done');"

# 2. Re-copy the reset file to /opt/deckvault
sudo cp database/pokemon-data.sqlite3.db /opt/deckvault/database/pokemon-data.sqlite3.db
sudo chown deckvault:deckvault /opt/deckvault/database/pokemon-data.sqlite3.db
sudo chmod 644 /opt/deckvault/database/pokemon-data.sqlite3.db

# 3. Start the stack via systemd
sudo systemctl start deckvault
sudo systemctl status deckvault
```

Expected output from `systemctl status`: `active (exited)` with `Result: success` — this is correct for `Type=oneshot RemainAfterExit=yes`.

### Verify end-to-end after start

```bash
curl -sI https://deckvault.gg/nginx-health
# Expect: HTTP/2 200, server: cloudflare

docker ps --format "table {{.Names}}\t{{.Status}}" | grep pokemon
# Expect: all 6 containers Up (healthy)
```

---

## Useful commands going forward

```bash
# Logs
sudo journalctl -u deckvault -f
docker logs pokemon-rest-api -f --tail=50

# Stop / restart
sudo systemctl stop deckvault
sudo systemctl restart deckvault

# After compose or nginx config changes in the repo
sudo cp docker-compose.prod.yml /opt/deckvault/
sudo chown deckvault:deckvault /opt/deckvault/docker-compose.prod.yml
sudo systemctl restart deckvault
```

---

## After /opt/deckvault is confirmed stable (24–48h)

Phase 7 — AWS teardown:
1. Stop EC2 instance → wait 48h → terminate
2. Delete RDS instance (take final snapshot first)
3. Release Elastic IP
4. Delete Route 53 hosted zone

Rollback at any point before Phase 7: in Cloudflare DNS, swap CNAME tunnel records back to A records pointing to the EC2 Elastic IP. Near-instant since Cloudflare is already authoritative.

---

## Key file locations

| Item | Path |
|------|------|
| Repo | `/home/nicks-dgx/dev/.Project-Johto/Pokemon/` |
| Prod directory | `/opt/deckvault/` |
| Compose file | `/opt/deckvault/docker-compose.prod.yml` |
| Secrets | `/opt/deckvault/.env.prod` (chmod 600) |
| systemd unit | `/etc/systemd/system/deckvault.service` |
| SQLite card data | `/opt/deckvault/database/pokemon-data.sqlite3.db` |
| Postgres data | Docker named volume `pokemon_postgres_data` |
| Migration runbook | `.claude/guides/MIGRATION_CONTEXT.md` |
| Prod setup guide | `.claude/guides/SPARK_PROD_SETUP.md` |
