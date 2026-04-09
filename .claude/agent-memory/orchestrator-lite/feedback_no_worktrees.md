---
name: Never use git worktrees
description: User explicitly forbids use of git worktrees (isolation: "worktree") on any agent dispatch
type: feedback
---

Never pass `isolation: "worktree"` to any Agent tool call.

**Why:** The user found this disruptive and unacceptable. Worktrees create isolated git branches that diverge from the working branch, causing confusion and wasted work.

**How to apply:** All implementation agents must work directly on the current branch. Never set `isolation: "worktree"` regardless of task size or parallelism. If multiple agents are dispatched in parallel, they should coordinate via the file system on the active branch.
