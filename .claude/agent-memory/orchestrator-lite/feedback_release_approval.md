---
name: Release requires explicit user approval
description: Never execute a release, version tag, or merge to dev/main without the user explicitly approving first — even when the plan includes it
type: feedback
---

Never perform a release, create a version tag, or merge a feature branch into dev/main autonomously.

**Why:** User explicitly stopped a release mid-execution to enforce this. Releases are a user-gated action, not an orchestrator decision.

**How to apply:** When a task includes merge + tag steps, do the preparatory work (staging, commits, PR draft) then pause and present the state for user approval before touching dev, main, or any tags. Always confirm before the final merge/tag step.
