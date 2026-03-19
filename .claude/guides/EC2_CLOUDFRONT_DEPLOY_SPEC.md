# SPEC: Dockerized Web App Deployment — EC2 + CloudFront + Route 53

## Context

This spec describes how to deploy a Dockerized web app to EC2, expose it over HTTPS via
CloudFront, and map it to an owned domain via Route 53. It is intentionally generic — no
assumptions are made about the app's tech stack, beyond that it listens on a TCP port.

Use this as a checklist/recipe any time you need to ship a new containerized service
with a custom domain.

---

## Variables

Replace these throughout:

| Placeholder | Example | Description |
|---|---|---|
| `APP_NAME` | `my-app` | Short name for tagging resources |
| `DOMAIN` | `example.com` | Root domain you own |
| `SUBDOMAIN` | `app.example.com` | Full subdomain for this app |
| `APP_PORT` | `3000` | Port the container listens on internally |
| `REGION` | `us-east-1` | AWS region (ACM **must** be us-east-1 for CloudFront) |
| `GHCR_REPO` | `ghcr.io/org/repo/APP_NAME` | Container registry path |
| `EC2_USER` | `ec2-user` | SSH user for the instance |
| `EC2_KEY` | `~/.ssh/APP_NAME.pem` | Path to SSH private key |

---

## Architecture

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                         Client Browser                           │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │ HTTPS
                                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                     Route 53 Hosted Zone                         │
 │   SUBDOMAIN  A alias ────────────────────────────────────────┐   │
 └──────────────────────────────────────────────────────────────┼───┘
                                                                │
                                 ┌──────────────────────────────▼───┐
                                 │         CloudFront Distribution  │
                                 │  - ACM cert (*.DOMAIN)           │
                                 │  - Viewer: redirect HTTP→HTTPS   │
                                 │  - Origin: EC2 Elastic IP :80    │
                                 │  - Cache: disabled (dynamic app) │
                                 │  - Methods: all                  │
                                 │  - Policy: AllViewerExceptHost   │
                                 └──────────────────┬───────────────┘
                                                    │ HTTP :80
                                                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                    EC2 Instance (APP_NAME)                       │
 │  ┌──────────────────────────────────────────────────────────┐   │
 │  │  Docker: APP_NAME container                              │   │
 │  │  host :80 ──▶ container :APP_PORT                       │   │
 │  └──────────────────────────────────────────────────────────┘   │
 │  Elastic IP (stable, survives reboots)                           │
 └──────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- AWS account with CLI configured (`aws sts get-caller-identity` succeeds)
- Domain registered and a Route 53 hosted zone exists for `DOMAIN`
- Docker installed locally
- GitHub repo with GHCR access (`GITHUB_TOKEN` with `write:packages`)

---

## Phase 1 — ACM Certificate

ACM must be provisioned in `us-east-1` regardless of where your EC2 lives —
CloudFront only reads certs from that region.

```bash
# Request a public cert covering root + wildcard
# Do this in the AWS Console or via CLI:
aws acm request-certificate \
  --domain-name "DOMAIN" \
  --subject-alternative-names "*.DOMAIN" \
  --validation-method DNS \
  --region us-east-1
```

In the Console:
1. Certificate Manager → Request → Public certificate
2. Add `DOMAIN` and `*.DOMAIN`
3. Select **DNS validation**
4. Click **Create records in Route 53** (auto-creates CNAME validation records)
5. Wait for status → **Issued** (2–15 min)
6. Copy the **Certificate ARN** — needed in Phase 3

### Exit criteria
- [ ] `aws acm list-certificates --region us-east-1` shows status `ISSUED` for `DOMAIN`

---

## Phase 2 — EC2 Instance

### 2a. Launch

1. EC2 → Launch instance
   - Name: `APP_NAME`
   - AMI: Amazon Linux 2023
     - `t4g.small` (arm64, 2 vCPU, 2 GB) — better value
     - `t3.micro` (x86_64) — free tier eligible
   - Key pair: create/select, save `.pem` to `EC2_KEY`
   - Security group (new):
     - SSH (22) from your IP only
     - HTTP (80) from `0.0.0.0/0, ::/0`
     - HTTPS (443) from anywhere — only if terminating SSL on EC2 directly
   - Storage: 20 GB gp3

2. Allocate an **Elastic IP** and associate with the instance
   - EC2 → Elastic IPs → Allocate → Associate → select `APP_NAME`
   - Note the IP — this is `ELASTIC_IP`

### 2b. Install Docker

```bash
ssh -i EC2_KEY EC2_USER@ELASTIC_IP

sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker EC2_USER

exit  # log out so group membership takes effect
ssh -i EC2_KEY EC2_USER@ELASTIC_IP

docker --version  # verify
```

### Exit criteria
- [ ] `ssh -i EC2_KEY EC2_USER@ELASTIC_IP docker ps` returns without error

---

## Phase 3 — Container Registry + First Deploy

### 3a. Build and push image

```bash
# From the directory containing your Dockerfile
docker build -t APP_NAME .

docker tag APP_NAME GHCR_REPO:latest

echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GH_USERNAME --password-stdin

docker push GHCR_REPO:latest
```

### 3b. Pull and run on EC2

```bash
ssh -i EC2_KEY EC2_USER@ELASTIC_IP

echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GH_USERNAME --password-stdin

docker pull GHCR_REPO:latest

docker run -d \
  --name APP_NAME \
  --restart unless-stopped \
  -p 80:APP_PORT \
  GHCR_REPO:latest
```

The `--restart unless-stopped` policy means the container comes back after an EC2 reboot.

### Exit criteria
- [ ] `curl http://ELASTIC_IP/` returns a 200 response (or expected status for your app's root)

---

## Phase 4 — CloudFront Distribution

CloudFront provides SSL termination without requiring certbot or Nginx on the instance.
It also gives you a global CDN edge if needed later.

1. CloudFront → Create distribution
2. **Origin:**
   - Origin domain: `ELASTIC_IP` (enter the IP directly — no S3, no OAC)
   - Protocol: **HTTP only**
   - HTTP port: 80
   - Origin path: leave empty
3. **Default cache behavior:**
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
   - Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
     (use GET/HEAD only if your app is read-only)
   - Cache policy: **CachingDisabled** (for dynamic apps)
   - Origin request policy: **AllViewerExceptHostHeader**
     (forwards all request headers/cookies to EC2 except `Host`,
     which EC2 would reject if it doesn't match its own hostname)
4. **Settings:**
   - Alternate domain names (CNAME): `SUBDOMAIN`
   - Custom SSL certificate: select the ACM cert from Phase 1
   - Default root object: leave empty (let your app handle `/`)
5. Create distribution → copy the **Distribution ID** and **CloudFront domain** (e.g., `d1234.cloudfront.net`)

> **WebSocket support**: no extra config needed. `AllViewerExceptHostHeader` passes the
> `Upgrade: websocket` and `Connection: Upgrade` headers through automatically.

> **SPA routing** (optional): if your app uses client-side routing and the server returns
> 404 for deep links, add custom error responses:
> - 403 → `/index.html` → 200
> - 404 → `/index.html` → 200

### Exit criteria
- [ ] `curl -sI https://CLOUDFRONT_DOMAIN/` returns HTTP/2 200 (using the raw CloudFront domain)
- [ ] Response includes `via: 1.1 cloudfront`

---

## Phase 5 — Route 53 DNS

1. Route 53 → Hosted zones → `DOMAIN`
2. Create record:
   - Record name: `SUBDOMAIN` (just the subdomain part, e.g., `app`)
   - Record type: **A**
   - Toggle **Alias** on
   - Route traffic to: **Alias to CloudFront distribution**
   - Select the distribution from the dropdown
3. Create record

Use Alias (not CNAME) — Alias records are free, resolve at the DNS layer, and work at
the zone apex (`DOMAIN` itself) where CNAME is not allowed.

### Exit criteria
- [ ] `dig SUBDOMAIN +short` returns CloudFront IP addresses (not `ELASTIC_IP` directly)
- [ ] `curl -sI https://SUBDOMAIN/` returns HTTP/2 200

---

## Phase 6 — CI/CD Automation (GitHub Actions)

### Workflow: `.github/workflows/deploy-APP_NAME.yml`

```yaml
name: Deploy APP_NAME

on:
  push:
    branches: [main]
    paths:
      - 'path/to/your/app/**'
      - '.github/workflows/deploy-APP_NAME.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build and push image
        run: |
          docker build -t GHCR_REPO:latest .
          docker push GHCR_REPO:latest

      - name: Deploy to EC2
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.APP_EC2_HOST }}
          username: ${{ secrets.APP_EC2_USER }}
          key: ${{ secrets.APP_EC2_KEY }}
          script: |
            docker pull GHCR_REPO:latest
            docker stop APP_NAME || true
            docker rm APP_NAME || true
            docker run -d \
              --name APP_NAME \
              --restart unless-stopped \
              -p 80:APP_PORT \
              GHCR_REPO:latest
```

### Required secrets

| Secret | Value |
|---|---|
| `APP_EC2_HOST` | `ELASTIC_IP` |
| `APP_EC2_USER` | `EC2_USER` |
| `APP_EC2_KEY` | Full contents of `EC2_KEY` (including BEGIN/END lines) |

Add at: GitHub repo → Settings → Secrets and variables → Actions

> No CloudFront invalidation step needed — `CachingDisabled` means every request
> is forwarded to EC2, so old responses are never served from edge cache.

### Exit criteria
- [ ] Push to `main` triggers the workflow
- [ ] Workflow completes without error
- [ ] `curl https://SUBDOMAIN/` reflects the new deploy within 60 seconds

---

## Phase 7 — Verification Checklist

Run after all phases are complete:

```bash
# DNS resolves to CloudFront (not EC2 directly)
dig SUBDOMAIN +short
# Returns CloudFront edge IPs — NOT ELASTIC_IP

# HTTPS works end to end
curl -sI https://SUBDOMAIN/ | head -5
# HTTP/2 200
# via: 1.1 cloudfront

# HTTP redirects to HTTPS
curl -sI http://SUBDOMAIN/ | grep location
# location: https://SUBDOMAIN/

# App responds correctly
curl -s https://SUBDOMAIN/YOUR_HEALTH_ENDPOINT
# Expected response from your app

# EC2 container is running
ssh -i EC2_KEY EC2_USER@ELASTIC_IP docker ps
# APP_NAME   Up X minutes   0.0.0.0:80->APP_PORT/tcp

# Container restarts on reboot (optional — requires a reboot to test)
ssh -i EC2_KEY EC2_USER@ELASTIC_IP sudo reboot
# wait ~60s, then:
curl -s https://SUBDOMAIN/YOUR_HEALTH_ENDPOINT
# Still responds
```

---

## Order of Operations

```
Phase 1: ACM cert
  └── must be ISSUED before CloudFront can attach it
        │
        ▼
Phase 2: EC2 + Docker
  └── must have ELASTIC_IP before configuring CloudFront origin
        │
        ▼
Phase 3: Container build + first manual deploy
  └── verify the app works on HTTP before adding CloudFront
        │
        ▼
Phase 4: CloudFront distribution
  └── must exist before Route 53 alias can reference it
        │
        ▼
Phase 5: Route 53 DNS
  └── final step — points traffic at CloudFront
        │
        ▼
Phase 6: CI/CD
  └── automates future deploys (no infrastructure dependency)
        │
        ▼
Phase 7: Verify all endpoints
```

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| ACM cert in wrong region | Always provision in `us-east-1` for CloudFront |
| CloudFront `Host` header forwarding | Use `AllViewerExceptHostHeader` — EC2 rejects requests where `Host` != its own hostname |
| WebSocket not connecting | Confirm `AllViewerExceptHostHeader` is set — it passes `Upgrade` headers through |
| 504 from CloudFront | EC2 security group is blocking port 80 from CloudFront IPs — open port 80 to `0.0.0.0/0` |
| Container not starting after reboot | Missing `--restart unless-stopped` on `docker run` |
| Old image cached on EC2 | `docker pull` before `docker run` — old layer cache is not automatically invalidated |
| GitHub Actions can't SSH | Paste entire `.pem` content including `-----BEGIN/END-----` lines into the secret |
