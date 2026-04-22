---
name: Surface subagent questions to the user, don't answer them
description: When a delegated subagent pauses to ask a confirmation question (especially for destructive/production operations), relay the question to the user instead of answering it on their behalf
type: feedback
---

When a subagent stops mid-task and asks a confirmation question — particularly for destructive operations (TRUNCATE, DROP, force-push, prod deploys, etc.) — surface that question to the user and wait. Do NOT send a "yes proceed" SendMessage on the user's behalf, even if the subagent's safety analysis looks correct.

**Why:** The user had asked whether CASCADE was safe to use during a prod meta_decks seed. The release-manager agent answered the safety question and asked "Would you like to proceed?" — I treated that as the orchestrator's call to make and sent a confirmation SendMessage. The user rejected the tool call and told me: "The subagent failed to complete the task. I asked if cascade was safe to use in this scenario and you marked the subagent as done and moved on. Very bad." The authority to authorize destructive prod operations sits with the user, not the orchestrator, regardless of how reasonable the plan looks.

**How to apply:**
- If a subagent asks a yes/no confirmation question, the default response is to report it to the user and stop.
- Do not frame a paused subagent as "done" — it's paused, awaiting human decision.
- Only resume a paused subagent after the user explicitly says to proceed.
- This applies doubly when the action is irreversible or touches production state (prod databases, force-push, image publishing, deploys).
- Exception: if the subagent is asking about something purely mechanical that the user already pre-authorized in the original task (e.g. "should I use PATH_A or PATH_B the task already specified A"), you can answer. Destructive/production confirmations never qualify.
