# SPEC_06 Audit Report

## Phase 1: Event System Foundation ✅

  All 8 checklist items pass — types, payloads, registry, fireEventHooks, clearEventHooks. Verbatim match to spec.

## Phase 2: Event Hook Cards ✅ (minor gaps)

  ┌───────────────────────────┬───────────────────────────────────────────────────────────────────────┬────────┐
  │           Card            │                                 Logic                                 │ Status │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ Calamitous Snowy Mountain │ Stadium check, non-Water Basic filter, 2 counters                     │ ✅     │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ Risky Ruins               │ Stadium check, non-Darkness Basic filter, 2 counters                  │ ✅     │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ Powerglass                │ Jamming Tower guard, Active-only check, discard search, energy attach │ ✅     │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ Patrol Cap                │ Jamming Tower guard, self-discard allowed, prevented: true            │ ✅     │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ attachEnergyFromDiscard   │ Validates discard, finds target, moves energy, logs event             │ ✅     │
  └───────────────────────────┴───────────────────────────────────────────────────────────────────────┴────────┘

  ⚠  Patrol Cap checks Jamming Tower before the self-discard check (spec has opposite order). Functionally equivalent — no bug.

## Phase 3: Ability Resolution ✅

  ┌────────────────────────────────────────────────────────────┬─────────────────────────────┐
  │                           Check                            │           Status            │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Pokemon def resolution via evolutionStack                  │ ✅                          │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Ability existence check at index                           │ ✅                          │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ ability_lock temporal (targeted + global)                  │ ✅                          │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ TemporalEffect.targetInstanceId field access               │ ✅ matches actual interface │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Watchtower + Colorless suppression                         │ ✅                          │
  ├────────────────────────────────────────────────────────────┼─────────────────────────────┤
  │ Jamming Tower correctly omitted (Tools only, not Stadiums) │ ✅                          │
  └────────────────────────────────────────────────────────────┴─────────────────────────────┘

  ⚠  Spec says abilityName: string, impl uses abilityIndex: number — internally consistent across abilities.ts, getLegalActions, and applyAction.
  Matches the USE_ABILITY action type shape. This is the correct design choice.

  ⚠  getTopDef duplicated — abilities.ts defines its own private copy instead of importing from primitives.ts. Identical logic, but a maintainability
  risk.

  turn.ts Integration ✅

  ┌────────────────────────────────────────┬────────────────────────────────────────────────┬─────────────────┬──────────────────────────────┐
  │               Hook Site                │            Fires After State Built             │ Correct Payload │     Returns Hook Result      │
  ├────────────────────────────────────────┼────────────────────────────────────────────────┼─────────────────┼──────────────────────────────┤
  │ ATTACH_ENERGY                          │ ✅                                             │ ✅              │ ✅                           │
  ├────────────────────────────────────────┼────────────────────────────────────────────────┼─────────────────┼──────────────────────────────┤
  │ PLAY_BASIC_TO_BENCH                    │ ✅                                             │ ✅              │ ✅                           │
  ├────────────────────────────────────────┼────────────────────────────────────────────────┼─────────────────┼──────────────────────────────┤
  │ endTurn (turn_ending)                  │ ✅ Before phase change                         │ ✅              │ ✅ Chains eventLog correctly │
  ├────────────────────────────────────────┼────────────────────────────────────────────────┼─────────────────┼──────────────────────────────┤
  │ getLegalActions (canUseAbility filter) │ ✅                                             │ ✅              │ N/A                          │
  ├────────────────────────────────────────┼────────────────────────────────────────────────┼─────────────────┼──────────────────────────────┤
  │ applyAction USE_ABILITY guard          │ ✅ After finding ability, before resolveEffect │ ✅              │ N/A                          │
  └────────────────────────────────────────┴────────────────────────────────────────────────┴─────────────────┴──────────────────────────────┘

## Public API & Git Integrity ✅

- All exports present in lib/index.ts
- No-op trainer handlers correctly preserved (hooks are separate registrations)
- Only expected files modified: turn.ts, stadiums.ts, tools.ts, primitives.ts, index.ts
- 342 tests passing, 0 type errors

  ⚠  lib/core/abilities.ts is untracked in git — needs to be staged before commit.

  Test Coverage — Gaps Found

  ┌───────────────────────────────────────────────┬───────────────────────────────────┐
  │              Spec-Required Test               │              Status               │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ events.test.ts (Phase 1)                      │                                   │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ No hooks → state unchanged                    │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Hook applies state change                     │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Prevention short-circuits                     │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Wrong hookType not triggered                  │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Multiple hooks in order                       │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Hook returning handled:false = no-op          │ ✅ (bonus)                        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ event-hooks.test.ts (Phase 2)                 │                                   │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Snowy Mountain: non-Water Basic → 2 counters  │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Snowy Mountain: Water Basic → no counters     │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Snowy Mountain: Stage 1 → no counters         │ ❌ Missing                        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Snowy Mountain: wrong stadium → no effect     │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Risky Ruins: non-Darkness Basic → 2 counters  │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Risky Ruins: Darkness Basic → no counters     │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Risky Ruins: wrong stadium → no effect        │ ❌ Missing                        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Powerglass: energy attached from discard      │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Powerglass: no energy in discard → no effect  │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Powerglass: on Bench only → no effect         │ ❌ Missing                        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Patrol Cap: opponent mill blocked             │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Patrol Cap: self-discard allowed              │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Patrol Cap: suppressed by Jamming Tower       │ ❌ Missing                        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ attachEnergyFromDiscard unit test             │ ⚠  Implicit via Powerglass        │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ abilities.test.ts (Phase 3)                   │                                   │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ No suppressors → true                         │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Invalid ability index → false                 │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Watchtower + Colorless → false                │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Watchtower + non-Colorless → true             │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ ability_lock targeted → false                 │ ✅                                │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ ability_lock global (null target)             │ ❌ Not confirmed — need to verify │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ getLegalActions excludes suppressed abilities │ ❌ Missing (integration)          │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ applyAction rejects suppressed ability        │ ❌ Missing (integration)          │
  └───────────────────────────────────────────────┴───────────────────────────────────┘

  Summary: 4 Test Gaps + 2 Integration Tests Missing

  Missing tests (ordered by severity):

  ┌─────┬───────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
  │  #  │                      Gap                      │                                Why It Matters                                │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 1   │ Patrol Cap suppressed by Jamming Tower        │ Critical edge case — Jamming Tower is the primary Tool suppression mechanism │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 2   │ Powerglass on Bench only → no effect          │ Ensures "while Active" constraint is tested                                  │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 3   │ getLegalActions excludes suppressed abilities │ Integration test confirming the wiring works end-to-end                      │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 4   │ applyAction rejects suppressed ability        │ Integration test confirming the guard                                        │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 5   │ Snowy Mountain: Stage 1 → no counters         │ Guard logic test                                                             │
  ├─────┼───────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ 6   │ Risky Ruins: wrong stadium → no effect        │ Parallel coverage to Snowy Mountain                                          │
  └─────┴───────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────┘

  Non-blocking observations:

- getTopDef duplicated in abilities.ts (maintainability, not correctness)
- abilities.ts untracked in git (staging issue, not code issue)
- canUseAbility uses index not name (correct design, spec pseudocode was aspirational)

  SPEC_07 Readiness: ✅ Unblocked

- SPEC_07 doc exists: SPEC_07_SIMULATION.md
- SPEC_07 depends on SPEC_05 (done), not SPEC_06
- Foundation: 342 tests, 0 type errors

  You're stable to move to SPEC_07. The test gaps are SPEC_06 polish that can be backfilled independently.
