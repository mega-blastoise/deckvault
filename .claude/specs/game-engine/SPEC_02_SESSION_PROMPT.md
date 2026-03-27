# SPEC_02 Session Prompt

Copy everything below this line as your opening message.

---

You are implementing SPEC_02 (Game Flow) of a headless Pokemon TCG game engine for
the Project Johto monorepo at `/home/nicks-dgx/dev/.Project-Johto/Pokemon`.

Before writing any code, read the following files in full:

1. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_02_IMPL_CONTEXT.md`
   — Complete implementation context, design decisions, and pitfall guide for this session.

2. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_02_GAME_FLOW.md`
   — The authoritative spec (already audited and corrected across 3 passes — trust it).

3. The already-implemented SPEC_01 files you will depend on:
   - `packages/@engine/lib/types/game.ts`
   - `packages/@engine/lib/types/card.ts`
   - `packages/@engine/lib/types/action.ts`
   - `packages/@engine/lib/types/event.ts`
   - `packages/@engine/lib/types/effect.ts`
   - `packages/@engine/lib/rng.ts`
   - `packages/@engine/lib/adapter.ts`
   - `packages/@engine/lib/core/conditions.ts`
   - `packages/@engine/lib/index.ts`

Then verify the foundation is clean before touching anything:

```bash
bun test --cwd packages/@engine          # must show 45 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output
```

Your deliverables for this session are:

```
packages/@engine/lib/core/game.ts         createGame, checkWinConditions, handleKnockOut, promoteFromBench
packages/@engine/lib/core/setup.ts        hasBasicPokemon (setupGame logic lives in applyAction/getLegalActions)
packages/@engine/lib/core/turn.ts         startTurn, applyAction, getLegalActions, endTurn
packages/@engine/lib/core/energy.ts       canPayEnergyCost, canPayRetreatCost
packages/@engine/lib/core/evolution.ts    canEvolve, evolvePokemon
packages/@engine/lib/core/checkup.ts      performCheckup
packages/@engine/lib/core/validation.ts   validateDeck
packages/@engine/lib/effects/registry.ts  EffectHandler stub (empty registry, SPEC_04 fills it)
packages/@engine/__tests__/core/game-flow.test.ts  All acceptance criteria from §14 of context doc
packages/@engine/lib/index.ts             Updated to re-export all new public functions
```

Key design decisions already made (do not re-litigate):

1. **Result<T, E> error pattern** — never throw. Use `GameResult<T>` with `ok()` and `err()`
   helpers. `createGame` and `applyAction` return `GameResult<GameState>`.

2. **Setup is action-driven** — the game loop (`getLegalActions` → `applyAction`) is uniform
   across setup and main phases. `COIN_FLIP_CHOICE`, `MULLIGAN_REDRAW`, `SELECT_ACTIVE`,
   `SELECT_BENCH` are all handled via `applyAction`.

3. **Effect registry stub** — create `lib/effects/registry.ts` with an empty `Map<string, EffectHandler>`.
   `PLAY_TRAINER` and `USE_ABILITY` dispatch to it; no-op until SPEC_04 registers handlers.

4. **`ATTACK` action stub** — validate legality, emit `ATTACK_DECLARED`, set `attackUsed`, call
   stub `resolveAttack` (returns state unchanged), then transition to 'checkup'. SPEC_03 fills
   the resolution logic.

5. **Simulation AI coin flip preference** — going second is strictly better (can play Supporters
   + attack on turn 1). The `COIN_FLIP_CHOICE` action handler records the choice; the AI layer
   (SPEC_05) makes the decision. For test purposes, always choose 'second' in test helpers.

All rules in the context document supersede any ambiguity in the spec itself. The spec has
been audited across 3 passes — the context document reflects the corrected rulebook-accurate
behavior for every edge case.

Implement completely. Do not leave TODOs or stub implementations except where explicitly
noted above (effect registry, attack resolution). Run `bun test --cwd packages/@engine` and
`bun run --cwd packages/@engine check-types` at the end. Both must be clean.
