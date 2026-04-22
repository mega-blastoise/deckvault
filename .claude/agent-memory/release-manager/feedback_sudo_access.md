---
name: No sudo access — prod commands are user-run
description: Agent does not have sudo access; all prod deployment commands requiring sudo must be handed off to the user to run
type: feedback
---

Do not attempt to run commands prefixed with `sudo`. The user runs all privileged prod commands themselves.

**Why:** Agent does not have sudo access on this machine.

**How to apply:** When a prod deployment step requires sudo (docker compose on /opt/deckvault, systemctl, etc.), provide the exact command for the user to run and wait for them to confirm before proceeding.
