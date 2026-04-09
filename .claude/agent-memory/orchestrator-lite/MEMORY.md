# Orchestrator-Lite Memory

## Project Architecture
- [SSR + TanStack Query Pattern](project_ssr_query_pattern.md) — Validated SSR data layer: per-request QueryClient, HydrationBoundary, Cloudflare streaming headers. Phase 2 (route prefetching) not yet built.

## Feedback
- [Never use git worktrees](feedback_no_worktrees.md) — `isolation: "worktree"` is forbidden on all agent dispatches; work directly on the current branch
- [Releases require explicit user approval](feedback_release_approval.md) — never merge to dev/main or create a version tag without the user explicitly saying to go ahead
- [Use token-minimalist for frontend](feedback_frontend_agent.md) — never dispatch bun-react-frontend; use token-minimalist for all web/React work in this project
