# SPEC_03 Session Prompt

Copy everything below this line as your opening message.

---

You are implementing SPEC_03 (Combat System) of a headless Pokemon TCG game engine for
the Project Johto monorepo at `/home/nicks-dgx/dev/.Project-Johto/Pokemon`.

Before writing any code, read the following files in full:

1. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_03_IMPL_CONTEXT.md`
   — Complete implementation context, design decisions, and pitfall guide for this session.

2. `/home/nicks-dgx/dev/.Project-Johto/Pokemon/.claude/specs/game-engine/SPEC_03_COMBAT.md`
   — The authoritative spec.

3. The SPEC_01 + SPEC_02 files you will depend on or modify:
   - `packages/@engine/lib/types/card.ts`
   - `packages/@engine/lib/types/game.ts`
   - `packages/@engine/lib/types/event.ts`
   - `packages/@engine/lib/types/effect.ts`
   - `packages/@engine/lib/core/result.ts`
   - `packages/@engine/lib/core/game.ts`
   - `packages/@engine/lib/core/turn.ts`
   - `packages/@engine/lib/core/checkup.ts`
   - `packages/@engine/lib/core/energy.ts`
   - `packages/@engine/lib/core/conditions.ts`
   - `packages/@engine/lib/effects/registry.ts`
   - `packages/@engine/lib/index.ts`

Then verify the foundation is clean before touching anything:

```bash
bun test --cwd packages/@engine          # must show 128 pass, 0 fail
bun run --cwd packages/@engine check-types  # must show no output
```

Your deliverables for this session are:

```
packages/@engine/lib/core/combat.ts        NEW — resolveAttack, calculateDamage, resolveWeakness,
                                                  resolveResistance, resolveConfusion,
                                                  dealBenchDamage, dealSelfDamage,
                                                  discardEnergyFromPokemon, checkKnockOuts,
                                                  DamageCalculation (interface)
packages/@engine/lib/core/turn.ts          MODIFY — import resolveAttack; un-stub ATTACK handler
packages/@engine/lib/core/game.ts          MODIFY — extend handleKnockOut to handle bench KOs
packages/@engine/lib/index.ts              MODIFY — re-export new public functions from combat.ts
packages/@engine/__tests__/core/combat.test.ts  NEW — all acceptance criteria from §8 of context doc
```

Key design decisions already made (do not re-litigate):

1. **Damage pipeline is pure** — `calculateDamage` returns a `DamageCalculation` record and
   does not mutate state. State mutation (counter placement) happens once after calculation.

2. **Two distinct damage paths** — "deal damage" goes through the full pipeline (W/R/modifiers);
   "place damage counters" bypasses it entirely. They emit different events: `DAMAGE_DEALT` vs
   `DAMAGE_COUNTERS_PLACED`. This distinction is load-bearing — tests verify it.

3. **Step 2 is a SINGLE step** — attack text modifiers (`damageModifier` field) and temporal
   self-effects are combined into one step BEFORE the 0-check. A 0-base attack with a +40
   temporal modifier results in 40 damage, not 0.

4. **`resolveAttack` hook in `turn.ts`** — The existing ATTACK handler has a stub comment:
   `// s = resolveAttack(s, action.attackIndex);`
   SPEC_03 un-stubs this. Import `resolveAttack` from `./combat` and call it.

5. **`handleKnockOut` extension** — The SPEC_02 implementation only finds Pokemon in the active
   slot. Bench KOs (from spread attacks) silently no-op. SPEC_03 extends `handleKnockOut` in
   `game.ts` to also search bench positions. Bench KOs: discard Pokemon + attachments, award
   prizes, NO promotion (bench just shrinks).

6. **Auto-promotion** — There is no `PROMOTE_FROM_BENCH` action type. SPEC_03 continues the
   SPEC_02 pattern of auto-promoting the first bench Pokemon after an active KO. SPEC_05 (AI)
   will make promotion choice smarter.

7. **Effect registry no-op** — All `resolveEffect` calls in combat return `ok(state)` until
   SPEC_04 registers handlers. This is correct. Do not work around it.

8. **Tera immunity is hard-coded** — Tera Pokemon ex take no bench damage. Check
   `subtypes.includes('Tera')` directly in `dealBenchDamage`. Do not route through the
   effect registry.

All rules in the context document supersede any ambiguity in the spec itself. The context
document reflects the corrected rulebook-accurate behaviour for every edge case.

Implement completely. Do not leave TODOs or stub implementations except where explicitly
noted above (effect calls in attack side-effects). Run `bun test --cwd packages/@engine`
and `bun run --cwd packages/@engine check-types` at the end. Both must be clean.
