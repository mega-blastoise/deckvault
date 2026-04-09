# SPEC_04 Session Prompt

Copy everything below this line as your opening message.

---

You are implementing SPEC_04 (Card Effect System) of a headless Pokemon TCG game engine for
the Project Johto monorepo at `/home/nicks-dgx/dev/.Project-Johto/Pokemon`.

Before writing any code, read the following files in full:

1. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_04_IMPL_CONTEXT.md`
   — Complete implementation context, design decisions, and pitfall guide for this session.

2. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_04_CARD_EFFECTS.md`
   — The authoritative spec.

3. The SPEC_01 + SPEC_02 + SPEC_03 files you will depend on or modify:
   - `packages/@engine/lib/types/card.ts`
   - `packages/@engine/lib/types/game.ts`
   - `packages/@engine/lib/types/event.ts`
   - `packages/@engine/lib/types/effect.ts`
   - `packages/@engine/lib/types/action.ts`
   - `packages/@engine/lib/core/result.ts`
   - `packages/@engine/lib/core/game.ts`
   - `packages/@engine/lib/core/turn.ts`
   - `packages/@engine/lib/core/combat.ts`
   - `packages/@engine/lib/core/checkup.ts`
   - `packages/@engine/lib/core/energy.ts`
   - `packages/@engine/lib/core/conditions.ts`
   - `packages/@engine/lib/core/evolution.ts`
   - `packages/@engine/lib/effects/registry.ts`
   - `packages/@engine/lib/rng.ts`
   - `packages/@engine/lib/index.ts`

Then verify the foundation is clean before touching anything:

```bash
bun test --cwd packages/@engine          # must show 165 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output
```

Your deliverables for this session are:

```
packages/@engine/lib/types/effect.ts          MODIFY — expand TemporalEffect with sourceType,
                                                        expiresAt, typed effect types; add EffectChoice
packages/@engine/lib/effects/registry.ts      MODIFY — typed registries (attack/ability/trainer),
                                                        richer context types, name-based lookup,
                                                        fallback behavior
packages/@engine/lib/effects/primitives.ts    NEW — reusable state-transformation primitives:
                                                     drawCards, discardFromHand, searchDeck,
                                                     shuffleDeck, moveToHand, discardEnergy,
                                                     discardAllEnergy, moveEnergy, switchActive,
                                                     putOnBench, flipCoin, flipCoins, healDamage,
                                                     healAllDamage, applyCondition, removeCondition,
                                                     attachEnergyFromDeck, CardFilter, SearchResult, Zone
packages/@engine/lib/effects/trainers.ts      NEW — handlers for 15 format-staple Trainers
packages/@engine/lib/effects/attacks.ts       NEW — 10+ generic attack effect pattern handlers
packages/@engine/lib/core/turn.ts             MODIFY — temporal effect expiry in endTurn;
                                                        narrow retreat cleanup to sourceType === 'attack'
packages/@engine/lib/core/evolution.ts        MODIFY — narrow temporal effect cleanup to
                                                        sourceType === 'attack' only
packages/@engine/lib/index.ts                 MODIFY — re-export new types, primitives, context types
packages/@engine/__tests__/effects/primitives.test.ts  NEW — unit tests for each primitive
packages/@engine/__tests__/effects/trainers.test.ts    NEW — integration tests for Trainer handlers
packages/@engine/__tests__/effects/attacks.test.ts     NEW — integration tests for attack patterns
```

Key design decisions already made (do not re-litigate):

1. **Typed registries replace the generic one** — `AttackEffectHandler`, `AbilityEffectHandler`,
   `TrainerEffectHandler` each get their own Map and context type. The existing `resolveEffect`
   function is kept as a backwards-compatible facade that dispatches to the typed registries.
   Enrich `EffectContext` with optional typed sub-contexts (`attackContext?`, `abilityContext?`,
   `trainerContext?`) so existing call sites in `combat.ts` and `turn.ts` don't need to change
   their function signature — they just pass richer context.

2. **Primitives are pure state transforms** — every function in `primitives.ts` takes
   `GameState` (+ parameters) and returns `GameState`. No mutation. No exceptions. Effect
   handlers compose these primitives — no handler directly manipulates player state.

3. **`drawCards` does NOT trigger deck-out** — card-effect draws from an empty deck draw 0
   and continue. Only the mandatory start-of-turn draw in `startTurn` triggers deck-out.

4. **Name-based handler registration** — different prints of the same Trainer (e.g. Iono
   has effectIds `svp-124`, `sv2-185`, `sv4pt5-80`, etc.) must all resolve to the same
   handler. Register by card name, resolve by looking up the card name from the effectId
   via the definition registry.

5. **TemporalEffect expansion** — add `sourceType` (`'attack' | 'ability' | 'trainer' | 'stadium'`)
   and `expiresAt` (`'end_of_turn' | 'end_of_opponent_turn' | 'end_of_next_turn' | 'permanent'`).
   Retreat and evolution cleanup must be narrowed to `sourceType === 'attack'` only. The current
   code removes ALL temporal effects on zone change — fix this.

6. **`endTurn` gets temporal effect expiry** — filter out effects that have expired based on
   `expiresAt` and `expiresOnTurn`. This does not exist today.

7. **`switchActive` is a primitive** — it handles moving Active to bench, promoting new Active,
   clearing Special Conditions, and removing `sourceType === 'attack'` temporal effects. Both
   the retreat handler in `turn.ts` and Trainer effects (Switch, Boss's Orders) should use this
   primitive for consistency.

8. **Stadium effects need a separate trigger mechanism** — the PLAY_TRAINER handler early-returns
   for Stadiums without calling `resolveEffect`. Stadium effects like Artazon ("once per turn,
   search for Basic") act as ability-like actions while the Stadium is in play. Consider whether
   to wire them through the USE_ABILITY action or create a new action type.

9. **AI choices are resolved inline** — for v1, pass a `choiceResolver` function that picks
   randomly or uses first-valid. No deferred/async choice flow.

10. **Ultra Ball has a play precondition** — requires 2 other cards in hand besides itself.
    This must be checked in `getLegalActions` (in the Trainer legality section of `getMainActions`),
    not just in the handler. Similarly, any Trainer with a "you can use this card only if..."
    clause needs a legality check.

All rules in the context document supersede any ambiguity in the spec itself. The context
document reflects the corrected rulebook-accurate behaviour for every edge case.

Implement completely. Do not leave TODOs or stub implementations except where explicitly
noted (Lost Zone cards fall back to no-op, individual Pokemon abilities deferred to v2).
Run `bun test --cwd packages/@engine` and `bun run --cwd packages/@engine check-types`
at the end. Both must be clean.