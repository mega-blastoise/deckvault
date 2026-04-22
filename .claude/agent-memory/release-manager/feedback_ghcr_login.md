---
name: GHCR login is user-owned
description: User handles docker login to GHCR themselves; agent should not attempt commands that require the GitHub token
type: feedback
---

Defer all GHCR authentication steps (`docker login ghcr.io`) to the user — they hold the token and will run that command themselves.

**Why:** Token is sensitive and user-managed; they will prompt when login is needed.

**How to apply:** When a release requires GHCR login, explicitly ask the user to run it and wait for confirmation before proceeding with push steps.
