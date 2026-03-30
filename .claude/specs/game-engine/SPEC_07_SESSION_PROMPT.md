# SPEC_07 Session Prompt

Copy everything below this line as your opening message.

---

You are implementing SPEC_07 (Simulation Runner & Metrics) of a headless Pokemon TCG game engine
for the Project Johto monorepo at `/home/nicks-dgx/dev/.Project-Johto/Pokemon`.

Before writing any code, read the following files in full:

1. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_07_IMPL_CONTEXT.md`
   — Complete implementation context, type signatures, per-component design, pitfall guide,
   and test strategy. This is the most important document to read.

2. The existing engine files you will consume or extend (do NOT modify these unless noted):
   - `packages/@engine/lib/ai/player.ts`           — `simulateGame` (the single-game runner you wrap)
   - `packages/@engine/lib/ai/types.ts`             — `AiConfig`, `AiStrategy`
   - `packages/@engine/lib/ai/strategy.ts`          — `RandomStrategy`, `GreedyStrategy`
   - `packages/@engine/lib/core/game.ts`            — `GameConfig`, `createGame`
   - `packages/@engine/lib/core/validation.ts`      — `validateDeck`
   - `packages/@engine/lib/adapter.ts`              — `loadStandardCardPool`, `CardDefinition`
   - `packages/@engine/lib/rng.ts`                  — `createRngState`, `shuffle`, `randomInt`
   - `packages/@engine/lib/types/event.ts`          — `WinReason`, `GameEvent`
   - `packages/@engine/lib/types/game.ts`           — `GameState`, `PlayerId`
   - `packages/@engine/lib/types/card.ts`           — `PokemonCardDefinition`, `CardDefinition`
   - `packages/@engine/lib/index.ts`                — full public API (you will MODIFY this)

Then verify the foundation is clean before touching anything:

```bash
bun test --cwd packages/@engine          # must show 342 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output
```

Your deliverables for this session are:

```
packages/@engine/lib/simulation/runner.ts    NEW — runSimulation, runMatchupMatrix,
                                                   serializeResult, serializeResultSummary,
                                                   expandDeck helper (not exported)
packages/@engine/lib/simulation/opening.ts  NEW — analyzeOpeningHands, OpeningHandStats
packages/@engine/lib/simulation/metrics.ts  NEW — calculateConsistency, computeDeckStats
packages/@engine/lib/index.ts               MODIFY — add simulation exports (see IMPL_CONTEXT §8)
packages/@engine/__tests__/simulation/runner.test.ts   NEW
packages/@engine/__tests__/simulation/opening.test.ts  NEW
packages/@engine/__tests__/simulation/metrics.test.ts  NEW
```

Key design decisions already made (do not re-litigate):

1. **`simulateGame` already exists** — `runSimulation` is a loop that calls `simulateGame` N
   times. Do not reimplement game logic. Import `simulateGame` from `../ai/player`.

2. **`DeckInput` uses `{cardId, count}` pairs** — expand to a flat `ReadonlyArray<string>`
   before passing to `validateDeck` or `GameConfig`. See IMPL_CONTEXT §5.2.

3. **Per-game seed = master seed + gameIndex** — ensures determinism and variety.

4. **Stats come from `eventLog`**, not from `GameState.players` fields directly:
   - Winner/reason: find `GAME_OVER` event
   - Prizes taken: count `PRIZE_TAKEN` events by player
   - Pokemon KO'd: count `POKEMON_KNOCKED_OUT` events; `player` = owner of KO'd Pokemon

5. **`analyzeOpeningHands` runs without the full game engine** — it only calls `shuffle` +
   draws 7 cards N times, tracking mulligan and hand composition statistics.

6. **`loadStandardCardPool` is called once** before the game loop, not per game.

7. **`GameResult` naming conflict** — the simulation's `GameResult` interface must be exported
   as `SimGameResult` from `lib/index.ts` to avoid clashing with `GameResult<T>` in `core/result`.

8. **`simulateGame` may return non-`'finished'` state** (200-turn guard hit) — default winner
   to `'draw'` and winReason to `'tiebreaker'` when `state.winner` is null.

9. **All consistency score components are in [0, 1]** — average of 4 equal-weight factors.
   See IMPL_CONTEXT §5.7 for the exact formula.

10. **No new game state fields, action types, or core modifications** — all new code goes
    under `lib/simulation/`. The only existing file that changes is `lib/index.ts`.

All rules in the context document supersede any ambiguity here. The context document contains
exact TypeScript signatures and implementation examples for every component — use them.

Implement completely. Do not leave TODO stubs. Run both commands at the end:

```bash
bun test --cwd packages/@engine
bun run --cwd packages/@engine check-types
```

Both must be clean (342+ tests passing, 0 type errors) before considering this session done.
