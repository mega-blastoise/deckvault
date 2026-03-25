# DGX Spark — Production Directory Setup

## Goal

Move the production stack out of the development workspace into a stable, isolated directory owned by a dedicated system user. The workspace (`/home/nicks-dgx/dev/.Project-Johto/Pokemon/`) continues as a development environment. Production runs from `/opt/deckvault/` and is managed via systemd.

---

## Why

- Git operations, branch switches, or `bun install` in the workspace cannot destabilize the running stack
- Production runs under a dedicated user — a compromised container's escape path does not reach the developer's home directory
- systemd handles auto-start on boot, restart on failure, and log aggregation via `journalctl`

---

## Production directory contents

Only five things are needed — no source code, no `node_modules`, no git history:

```text
/opt/deckvault/
├── docker-compose.prod.yml
├── .env.prod                    # chmod 600, owned by deckvault:deckvault
├── docker/
│   └── nginx/
│       ├── nginx.conf
│       └── conf.d/
│           └── default.conf
└── database/
    └── pokemon-data.sqlite3.db  # read-only SQLite volume mount
```

---

## Step 1 — Create the dedicated system user

```bash
sudo useradd \
  --system \
  --home-dir /opt/deckvault \
  --create-home \
  --shell /sbin/nologin \
  deckvault

sudo chown -R deckvault:deckvault /opt/deckvault
```

`--system` creates a system account (no login, no password, UID in system range).
`--shell /sbin/nologin` prevents interactive login even if credentials were compromised.

Add your user to the `deckvault` group so you can manage files without sudo:

```bash
sudo usermod -aG deckvault $USER
# Log out and back in for group membership to take effect
```

---

## Step 2 — Copy production files

From the repo root on the Spark:

```bash
PROD=/opt/deckvault

# Compose file
sudo cp docker-compose.prod.yml $PROD/

# Nginx config
sudo mkdir -p $PROD/docker/nginx/conf.d
sudo cp docker/nginx/nginx.conf $PROD/docker/nginx/
sudo cp docker/nginx/conf.d/default.conf $PROD/docker/nginx/conf.d/

# SQLite card data
sudo mkdir -p $PROD/database
sudo cp database/pokemon-data.sqlite3.db $PROD/database/

# Secrets — copy and immediately lock down permissions
sudo cp .env.prod $PROD/.env.prod
sudo chmod 600 $PROD/.env.prod

# Fix ownership
sudo chown -R deckvault:deckvault $PROD
```

---

## Step 3 — Install the systemd unit

```bash
sudo tee /etc/systemd/system/deckvault.service > /dev/null <<'EOF'
[Unit]
Description=DeckVault production stack
Documentation=https://github.com/mega-blastoise/deckvault
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=deckvault
Group=deckvault
WorkingDirectory=/opt/deckvault

ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.prod.yml pull && \
           /usr/bin/docker compose -f docker-compose.prod.yml up -d --remove-orphans

TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable deckvault
sudo systemctl start deckvault
sudo systemctl status deckvault
```

---

## Lifecycle commands

```bash
# Status
sudo systemctl status deckvault

# Logs (all containers via journald)
sudo journalctl -u deckvault -f

# Per-container logs (more useful for debugging)
docker logs pokemon-rest-api -f --tail=50

# Stop
sudo systemctl stop deckvault

# Restart (after config change)
sudo systemctl restart deckvault

# Deploy new images
cd /opt/deckvault
sudo -u deckvault docker compose -f docker-compose.prod.yml pull
sudo systemctl restart deckvault
```

---

## Updating production files

When `docker-compose.prod.yml` or nginx config changes in the repo:

```bash
# From the workspace
sudo cp docker-compose.prod.yml /opt/deckvault/
sudo cp docker/nginx/conf.d/default.conf /opt/deckvault/docker/nginx/conf.d/
sudo chown deckvault:deckvault /opt/deckvault/docker-compose.prod.yml
sudo chown deckvault:deckvault /opt/deckvault/docker/nginx/conf.d/default.conf
sudo systemctl restart deckvault
```

When `.env.prod` changes:

```bash
sudo cp .env.prod /opt/deckvault/.env.prod
sudo chmod 600 /opt/deckvault/.env.prod
sudo chown deckvault:deckvault /opt/deckvault/.env.prod
sudo systemctl restart deckvault
```

---

## Verifying the deckvault user cannot log in

```bash
sudo -u deckvault whoami   # should work (run commands as the user)
su - deckvault             # should fail: "This account is currently not available"
```

---

## Docker volume ownership

The `postgres_data` Docker named volume is managed by Docker, not by the filesystem. It persists across `systemctl stop/start`. To confirm:

```bash
docker volume inspect pokemon_postgres_data
```

The volume is not inside `/opt/deckvault/` — Docker stores it in `/var/lib/docker/volumes/`. It survives the systemd service stopping and starting.
