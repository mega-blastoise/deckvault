# SPEC_05 Session Prompt

Copy everything below this line as your opening message.

---

You are implementing SPEC_05 (Heuristic AI Player) of a headless Pokemon TCG game engine
for the Project Johto monorepo at `/home/nicks-dgx/dev/.Project-Johto/Pokemon`.

Before writing any code, read the following files in full:

1. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_05_IMPL_CONTEXT.md`
   — Complete implementation context, architecture design, scoring heuristics, pitfall guide,
   and test strategy for this session. This is the most important document to read.

2. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/OVERVIEW.md`
   — Broader project context and the dependency graph showing where SPEC_05 sits.

3. The existing engine files you will consume (do NOT modify these):
   - `packages/@engine/lib/types/game.ts`          — GameState, PlayerState, InPlayPokemon, TurnFlags
   - `packages/@engine/lib/types/action.ts`         — PlayerAction (14 variants, full union)
   - `packages/@engine/lib/types/card.ts`           — PokemonCardDefinition, AttackDefinition
   - `packages/@engine/lib/core/turn.ts`            — getLegalActions, applyAction, startTurn, endTurn
   - `packages/@engine/lib/core/game.ts`            — createGame, otherPlayer, checkWinConditions
   - `packages/@engine/lib/core/modifiers.ts`       — getEffectiveHpById, getEffectiveRetreatCost, etc.
   - `packages/@engine/lib/core/combat.ts`          — calculateDamage, DamageCalculation
   - `packages/@engine/lib/rng.ts`                  — randomInt, RngState
   - `packages/@engine/lib/index.ts`                — full public API surface (to know what is exported)
   - `packages/@engine/__tests__/core/combat.test.ts` — lines 1–140 for test helper patterns

Then verify the foundation is clean before touching anything:

```bash
bun test --cwd packages/@engine          # must show 307 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output
```

Your deliverables for this session are:

```
packages/@engine/lib/ai/types.ts          NEW — AiStrategy interface, AiConfig, ScoredAction
packages/@engine/lib/ai/evaluate.ts       NEW — pure board evaluation functions:
                                                 resolveTopDef, evalPrizeDifferential,
                                                 evalActiveHealth, evalKOPotential,
                                                 evalBenchStrength, evalEnergyAdvantage,
                                                 evalTypeAdvantage, evaluateBoard
packages/@engine/lib/ai/strategy.ts       NEW — handleSetupAction, selectBestActive,
                                                 scoreTrainer, scoreEnergyAttach, scoreRetreat,
                                                 scoreTool, scoreAction, scoreActions,
                                                 RandomStrategy, GreedyStrategy
packages/@engine/lib/ai/player.ts         NEW — playTurn, runSetupPhase, simulateGame
packages/@engine/lib/ai/index.ts          NEW — barrel re-exports
packages/@engine/lib/index.ts             MODIFY — add AI exports
packages/@engine/__tests__/ai/evaluate.test.ts  NEW — unit tests for each eval function
packages/@engine/__tests__/ai/strategy.test.ts  NEW — action scoring and selection tests
packages/@engine/__tests__/ai/player.test.ts    NEW — integration tests (full game)
```

Key design decisions already made (do not re-litigate):

1. **The AI is a pure consumer of the existing API** — it calls `getLegalActions` and
   `applyAction` and reads `GameState`. It does NOT modify any core engine files, add
   new game state fields, or create new action types.

2. **`AiStrategy` is a single-method interface** — `chooseAction(state, legalActions, playerId)`
   returns one `PlayerAction`. This is the only entry point for all strategy implementations.

3. **`playTurn` drives the full turn loop** — call `getLegalActions`, let the strategy choose,
   call `applyAction`, repeat until `legal.length === 0` or only `PASS` remains. Include a
   `maxActionsPerTurn` guard (default 100) to prevent infinite loops.

4. **Setup phase is handled separately** — when `state.phase === 'setup'`, use deterministic
   logic (always go first on coin flip, pick highest-HP Basic for Active, fill bench maximally).
   Do NOT apply the main-game scoring heuristics to setup actions.

5. **RandomStrategy uses `state.rngState` as a read-only seed** — call
   `randomInt(0, pool.length - 1, state.rngState)` to pick a random action. Do NOT thread
   the returned `nextState` back into the game — only `applyAction` owns RNG state progression.

6. **GreedyStrategy simulates ATTACK actions** — call `applyAction(state, attackAction)` for
   each attack option and evaluate the resulting state with `evaluateBoard`. For all other
   action types, use direct score heuristics (no simulation needed).

7. **`evaluateBoard` must handle `phase === 'finished'`** — return 10000 if
   `state.winner === playerId`, -10000 if opponent won, 0 for a draw. This is critical
   because `applyAction` after a game-ending ATTACK will return `phase === 'finished'`.

8. **RETREAT action passes `energyToDiscard: []`** — the engine defaults to discarding the
   first N energy from the Active. Do not try to optimize which energy to discard in v1.

9. **`simulateGame` includes a 200-turn guard** — if the game has not ended after 200 turns,
   return the current state. This prevents runaway simulations in degenerate edge cases.

10. **No modifications to core engine files** — the AI is additive only. All new code goes
    under `lib/ai/`. The only existing file that changes is `lib/index.ts` (add AI exports).

All rules in the context document supersede any ambiguity here. The context document
contains exact TypeScript signatures and code examples for every component — use them.

Implement completely. Do not leave TODO stubs. Run both commands at the end:

```bash
bun test --cwd packages/@engine
bun run --cwd packages/@engine check-types
```

Both must be clean (307+ tests passing, 0 type errors) before considering this session done.
