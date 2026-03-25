# Self-Host Migration Runbook
## AWS → DGX Spark + Cloudflare Tunnel

**Target architecture:**
```text
Browser → Cloudflare DNS → Tunnel → nginx (:80) → containers → PostgreSQL (local)
```

**Machine:** NVIDIA DGX Spark — `10.0.0.11` on LAN
**Public IP:** `75.71.208.15` (Comcast, confirmed no CGNAT)
**Tunnel traffic:** outbound-only from Spark → Cloudflare edge (no open inbound ports required)

---

## Pre-flight checklist

- [ ] Docker and Docker Compose installed on the Spark
- [ ] Repo cloned to the Spark at the same path as production
- [ ] GHCR access confirmed (`docker pull ghcr.io/mega-blastoise/deckvault-web:latest` succeeds)
- [ ] AWS CLI configured with access to the RDS instance
- [ ] `pg_dump` available locally (`bun x pg_dump` or `apt install postgresql-client`)
- [ ] Cloudflare account created (free plan)
- [ ] Domain's nameservers pointed to Cloudflare (see Phase 1)

---

## Phase 1 — Cloudflare account + DNS setup

### 1a. Create Cloudflare account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Sign Up** (free plan)
2. Click **Add a site** → enter your domain → select **Free** plan
3. Cloudflare scans your existing DNS records and imports them
4. Copy the two **Cloudflare nameservers** shown (e.g. `aria.ns.cloudflare.com`, `tim.ns.cloudflare.com`)

### 1b. Update nameservers at your registrar

Log into wherever your domain is registered (Route 53, Namecheap, etc.) and replace the existing nameservers with the two Cloudflare provides. DNS propagation takes 5 minutes to 24 hours — your site continues serving from AWS throughout this window since you haven't changed any A records yet.

### 1c. Verify delegation

```bash
dig NS yourdomain.com +short
# Should return the two Cloudflare nameserver hostnames
```

### Exit criteria
- [ ] `dig NS yourdomain.com` returns Cloudflare nameservers
- [ ] Cloudflare dashboard shows domain status as **Active**

---

## Phase 2 — Create Cloudflare Tunnel

### 2a. Create the tunnel in Cloudflare Zero Trust dashboard

All `cloudflared` operations happen inside the Docker container — no host binary install.
The tunnel is created and configured entirely through the Cloudflare web UI.

1. Cloudflare dashboard → **Zero Trust** (left sidebar)
2. **Networks** → **Tunnels** → **Create a tunnel**
3. Choose **Cloudflared** as the connector type
4. Name the tunnel: `deckvault` → **Save tunnel**
5. On the next screen, Cloudflare shows installation instructions — **ignore them**.
   Instead, click the **Docker** tab to reveal the `docker run` command.
   The command contains `--token <TUNNEL_TOKEN>` — copy that token value only.
6. Add to `.env.prod` on the Spark:

```bash
CLOUDFLARE_TUNNEL_TOKEN=<token-from-above>
```

### 2b. Configure public hostname in Cloudflare dashboard

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels**
2. Click your `deckvault` tunnel → **Configure** → **Public Hostname** tab
3. Add hostname:
   - **Subdomain:** (leave blank for apex, or `www`)
   - **Domain:** `yourdomain.com`
   - **Service:** `http://nginx:80`
4. Repeat for `www` if needed

### Exit criteria
- [ ] `cloudflared tunnel info deckvault` shows the tunnel as healthy
- [ ] CNAME records appear in Cloudflare DNS dashboard for your domain

---

## Phase 3 — Export data from RDS

Do this while the EC2 stack is still running. This is the zero-risk window.

```bash
# On EC2 (only host permitted to reach RDS), run via Docker to avoid host installs.
# RDS is Postgres 17 — use postgres:17-alpine to match.
docker run --rm \
  postgres:17-alpine \
  pg_dump \
  --no-owner \
  --no-acl \
  --format=custom \
  "$POSTGRES_URL" \
  > ~/deckvault-rds-backup.dump

ls -lh ~/deckvault-rds-backup.dump

# SCP back to Spark from the Spark:
# scp -i ~/.ssh/<key>.pem ec2-user@<EC2_IP>:~/deckvault-rds-backup.dump ./deckvault-rds-backup.dump
```

Keep this dump file. It is the source of truth for the migration.

---

## Phase 4 — Prepare local PostgreSQL

### 4a. Start only postgres first

```bash
cd /path/to/Pokemon

# Start just postgres to do the import
docker compose -f docker-compose.prod.yml up -d postgres

# Wait for it to be healthy
docker compose -f docker-compose.prod.yml ps
```

### 4b. Update .env.prod for local postgres

The `.env.prod` file on the Spark needs these values changed from RDS to local:

```bash
# Old (RDS)
DATABASE_URL=postgresql://user:pass@your-rds-endpoint.rds.amazonaws.com:5432/pokemon

# New (local container — hostname is the service name on the pika network)
DATABASE_URL=postgresql://postgres:yourpassword@postgres:5432/pokemon
POSTGRES_USER=postgres
POSTGRES_PASSWORD=yourpassword
POSTGRES_DB=pokemon
```

Choose a strong password for `POSTGRES_PASSWORD`. The postgres container is not exposed outside Docker — it's only reachable on the `pika` network.

### 4c. Import the RDS dump

```bash
# Copy dump into the running postgres container and restore
docker cp deckvault-rds-backup.dump pokemon-postgres:/tmp/backup.dump

docker exec -it pokemon-postgres pg_restore \
  --no-owner \
  --no-acl \
  --dbname="$POSTGRES_DB" \
  --username="$POSTGRES_USER" \
  /tmp/backup.dump

# Verify row counts match RDS
docker exec -it pokemon-postgres psql \
  -U postgres -d pokemon \
  -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

Cross-reference against RDS row counts before proceeding.

### Exit criteria
- [ ] `pg_stat_user_tables` row counts match RDS
- [ ] No errors in `pg_restore` output (warnings about extensions are acceptable)

---

## Phase 5 — Bring up the full stack

```bash
# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Start everything
docker compose -f docker-compose.prod.yml up -d

# Watch logs for errors
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### Smoke test before DNS cutover

The tunnel is live but DNS hasn't propagated yet. Test by temporarily adding the Cloudflare tunnel domain directly:

```bash
# Get the raw tunnel domain from the Cloudflare dashboard
# It looks like: <TUNNEL_ID>.cfargotunnel.com
curl -sI https://<TUNNEL_ID>.cfargotunnel.com/nginx-health
# Expect: HTTP/2 200
```

Also verify the rest-api and graphql-api are reachable through nginx:

```bash
curl -s https://<TUNNEL_ID>.cfargotunnel.com/health
curl -s https://<TUNNEL_ID>.cfargotunnel.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Exit criteria
- [ ] All four containers running (`docker compose ps` shows healthy)
- [ ] nginx-health returns 200 through tunnel domain
- [ ] rest-api `/health` returns 200
- [ ] No database connection errors in rest-api logs

---

## Phase 6 — DNS cutover

At this point the new stack is verified. Cutover is instant — Cloudflare DNS is already authoritative, and the CNAME records point to your tunnel. The cutover already happened in Phase 2c; this phase is about verifying it end-to-end.

```bash
# DNS resolves to Cloudflare (CNAME to tunnel)
dig yourdomain.com +short
# Returns Cloudflare edge IPs — NOT 75.71.208.15

# HTTPS works end to end through your domain
curl -sI https://yourdomain.com/nginx-health | head -5
# HTTP/2 200
# server: cloudflare

# Real IP header passes through
curl -s https://yourdomain.com/api/v1/health
# Healthy response from rest-api
```

---

## Phase 7 — Terminate AWS resources

Only after Phase 6 is verified and you've monitored for 24–48h.

```bash
# In AWS Console or CLI:

# 1. Stop EC2 instance first (keeps data, lets you roll back)
aws ec2 stop-instances --instance-ids <INSTANCE_ID>

# 2. After 48h with no issues, terminate EC2
aws ec2 terminate-instances --instance-ids <INSTANCE_ID>

# 3. Release Elastic IP (immediately stops the $0.005/hr charge if it was unattached)
aws ec2 release-address --allocation-id <ALLOCATION_ID>

# 4. Delete RDS instance (creates a final snapshot by default — keep it for 30 days)
aws rds delete-db-instance \
  --db-instance-identifier your-rds-identifier \
  --final-db-snapshot-identifier deckvault-rds-final-snapshot

# 5. Delete Route 53 hosted zone (if migrated DNS to Cloudflare)
# Do this last — only after confirming DNS has been fully delegated to Cloudflare
```

### Final cost verification

After termination, check the AWS billing console the following month. Expected charges should drop to $0.50 (Route 53, if kept) or $0 if you deleted the hosted zone.

---

## Rollback plan

If anything goes wrong before Phase 7:

1. EC2 and RDS are still running — just point DNS back
2. In Cloudflare dashboard: delete the CNAME records for your domain and recreate A records pointing to `75.71.208.15`
3. Propagation: near-instant since Cloudflare is authoritative

---

## Maintenance notes

### Deploying new images

```bash
# On the Spark, from the repo root
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
# Zero-downtime if only app containers change; nginx stays running
```

### Database backups

The `postgres_data` Docker volume persists across container restarts. For off-machine backups:

```bash
# Daily dump (add to crontab or systemd timer)
docker exec pokemon-postgres pg_dump \
  -U postgres -d pokemon \
  --format=custom \
  > ~/backups/deckvault-$(date +%Y%m%d).dump
```

### Cloudflare Tunnel health

The cloudflared container reconnects automatically on failure (`restart: unless-stopped`). To check tunnel status:

```bash
cloudflared tunnel info deckvault
```
