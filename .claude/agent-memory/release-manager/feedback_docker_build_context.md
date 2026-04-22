---
name: Docker build context must be monorepo root
description: All three service Dockerfiles require repo root as build context — use -f flag, not the app directory
type: feedback
---

Always use `-f apps/<service>/Dockerfile .` (repo root as context) when building any of the three deckvault images. Never pass `apps/<service>` as the build context directly.

**Why:** All three Dockerfiles COPY from `./packages`, `./bun.lock`, `./turbo.json`, etc. — paths that only exist relative to the monorepo root. Passing `apps/<service>` as the context makes those paths unreachable and fails with `"/packages": not found`.

**How to apply:** Replace `apps/web` (or `apps/rest-api`, `apps/graphql-api`) at the end of every `docker build` command with `-f apps/<service>/Dockerfile .`, run from the repo root.
