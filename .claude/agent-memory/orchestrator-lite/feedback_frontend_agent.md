---
name: Use token-minimalist for frontend work
description: Always dispatch token-minimalist for frontend/React tasks in this project, not bun-react-frontend
type: feedback
---

Use `token-minimalist` for all frontend implementation work on this project, including React components, CSS, routing, and TypeScript files in `apps/web/`.

**Why:** User explicitly corrected an agent dispatch that used `bun-react-frontend`.

**How to apply:** Even when the task is clearly frontend (components, hooks, CSS, routes), reach for `token-minimalist` as the implementation agent. `bun-react-frontend` is off the table for this project.
