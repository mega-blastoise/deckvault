# Release Manager Memory

## User
- [Commit attribution — Dr. Monty](user_attribution.md) — All commits must include Dr. Monty + Claude as co-authors (Agartha EE convention)

## Feedback
- [GHCR login is user-owned](feedback_ghcr_login.md) — User holds the GitHub token; defer `docker login ghcr.io` to them, wait for confirmation before pushing
- [No sudo access — prod commands are user-run](feedback_sudo_access.md) — Agent has no sudo; hand off all privileged prod commands with exact syntax, wait for confirmation
- [Docker build context must be monorepo root](feedback_docker_build_context.md) — Use `-f apps/<service>/Dockerfile .` not `apps/<service>` — Dockerfiles COPY from `./packages` etc. which need repo root
