# SPEC-06: Event Hooks and Ability Resolution System

## Context

SPEC_04B (Pipeline Hooks) wired passive modifiers into the damage, retreat, HP, and KO
pipelines via a centralized `modifiers.ts` query system. However, it explicitly deferred a
second class of triggered effects: cards whose logic fires in response to discrete game
events rather than being continuously polled during a calculation.

Five registered no-op handlers remain that require an event-driven architecture:

```
tools.ts:78    registerTrainerEffect('Patrol Cap', noOp);
tools.ts:79    registerTrainerEffect('Powerglass', noOp);
stadiums.ts:62 calamitousSnowyMountainHandler  → return state;
stadiums.ts:444 riskyRuinsHandler              → return state;
stadiums.ts:529 teamRocketsWatchtowerHandler   → return state;
```

The first four cards (Patrol Cap, Powerglass, Calamitous Snowy Mountain, Risky Ruins) require
**event listener hooks** — the ability to subscribe a callback to a specific game event so
that when the event fires, the side-effect logic runs automatically.

The fifth card (Team Rocket's Watchtower) requires an **ability resolution system** — a
mechanism for resolving whether a Pokemon's ability can fire at all, with suppression checks
consulting the active stadium and any other ability-lock effects before allowing the ability
to proceed.

This spec defines both systems and the three-phase delivery plan to implement them.

---

## Prerequisites

- SPEC_01 (Core Types) — `GameState`, `InPlayPokemon`, `GameEvent`, `TemporalEffect`
- SPEC_02 (Game Flow) — `applyAction`, `getLegalActions`, `endTurn`
- SPEC_03 (Combat) — `resolveAttack`, `checkKnockOuts`
- SPEC_04 (Card Effects) — registry, all handlers registered
- SPEC_04B (Pipeline Hooks) — `modifiers.ts`, modifier queries wired into all pipelines

This spec is a **parallel track** to SPEC_05 (AI Player). Neither depends on the other.

---

## Card Inventory

### Category A: Event Hook Cards (4 cards)

| Card | Type | Trigger Event | Effect |
|------|------|---------------|--------|
| Patrol Cap | Tool | `deck_discard_attempted` | While on Active: opponent cannot discard cards from your deck |
| Powerglass | Tool | `turn_ending` | While on Active: attach 1 Basic Energy from discard to this Pokemon |
| Calamitous Snowy Mountain | Stadium | `energy_attached` | When non-Water Basic has Energy attached: place 2 damage counters |
| Risky Ruins | Stadium | `pokemon_benched` | When non-Darkness Basic placed on Bench: place 2 damage counters |

### Category B: Ability Suppression Card (1 card)

| Card | Type | Mechanism | Effect |
|------|------|-----------|--------|
| Team Rocket's Watchtower | Stadium | Ability resolution check | Colorless Pokemon have no Abilities |

---

## System Architecture

### Event Hook System

```
┌───────────────────────────────────────────────────────────────────┐
│  Event Hook System (lib/core/events.ts)                           │
│                                                                   │
│  ┌─────────────────────┐     ┌─────────────────────────────────┐  │
│  │  EventHookRegistry  │     │  fireEventHooks(state, event)   │  │
│  │                     │     │                                 │  │
│  │  hooks: Map<        │     │  1. Look up handlers for event  │  │
│  │    EventHookType,   │────▶│  2. Check hook preconditions    │  │
│  │    EventHook[]      │     │  3. Apply each handler in order │  │
│  │  >                  │     │  4. Return accumulated state    │  │
│  └─────────────────────┘     └─────────────────────────────────┘  │
│                                          │                        │
│  Hook registration (index.ts side-effect import):                 │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────────┐   │
│  │  Patrol Cap    │  │  Powerglass    │  │ Snowy Mountain /  │   │
│  │  hook          │  │  hook          │  │ Risky Ruins hooks │   │
│  └────────────────┘  └────────────────┘  └───────────────────┘   │
└───────────────────────────────────────────────────────────────────┘

                         called from:
┌───────────────────────────────────────────────────────────────────┐
│  turn.ts                                                          │
│  ├── ATTACH_ENERGY action handler                                 │
│  │     fires: energy_attached                                     │
│  ├── PLAY_BASIC_TO_BENCH action handler                           │
│  │     fires: pokemon_benched                                     │
│  ├── endTurn (before TURN_ENDED event)                            │
│  │     fires: turn_ending                                         │
│  └── [future] deck discard actions                                │
│          fires: deck_discard_attempted                            │
└───────────────────────────────────────────────────────────────────┘
```

### Ability Resolution System

```
┌───────────────────────────────────────────────────────────────────┐
│  Ability Resolution (lib/core/abilities.ts)                       │
│                                                                   │
│  canUseAbility(state, player, pokemon, abilityName)               │
│        │                                                          │
│        ├── 1. Does the Pokemon have the named ability? → no: false│
│        ├── 2. Is abilityLock temporal effect active? → yes: false │
│        ├── 3. Is Team Rocket's Watchtower active AND               │
│        │       Pokemon type includes Colorless? → yes: false      │
│        └── 4. All checks pass → true                              │
│                                                                   │
│  resolveAbility(state, player, pokemon, abilityName, resolver)    │
│        │                                                          │
│        ├── canUseAbility check → false: return state (no-op)     │
│        └── dispatch to ability effect handler in registry         │
└───────────────────────────────────────────────────────────────────┘

           called from:
┌───────────────────────────────────────────────────────────────────┐
│  turn.ts — USE_ABILITY action handler                             │
│  (currently calls resolveEffect directly; must route through      │
│   resolveAbility to enforce suppression checks)                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Requirements

### 1. Event Hook Types

Define the four event hook types needed for this spec. These are distinct from `GameEvent`
(which is the audit log) — these are the names hooks subscribe to:

```typescript
// lib/core/events.ts

export type EventHookType =
  | 'energy_attached'           // ATTACH_ENERGY action completed
  | 'pokemon_benched'           // PLAY_BASIC_TO_BENCH action completed
  | 'turn_ending'               // endTurn called, before state flip
  | 'deck_discard_attempted';   // any action that would discard from a deck
```

These names intentionally parallel the `GameEvent` discriminants but are separate — `GameEvent`
is for the event log (read-only replay), while `EventHookType` is for live state mutation.

### 2. Event Hook Payload Types

Each hook fires with a typed payload carrying enough context for the handler:

```typescript
export interface EnergyAttachedPayload {
  readonly player: PlayerId;
  readonly energyInstanceId: string;
  readonly targetInstanceId: string;  // the Pokemon receiving energy
}

export interface PokemonBenchedPayload {
  readonly player: PlayerId;
  readonly pokemonInstanceId: string; // the Pokemon just placed on the bench
}

export interface TurnEndingPayload {
  readonly player: PlayerId;          // player whose turn is ending
}

export interface DeckDiscardAttemptedPayload {
  readonly requestingPlayer: PlayerId; // player attempting the discard
  readonly targetPlayer: PlayerId;     // player whose deck cards would be discarded
  readonly cardInstanceIds: ReadonlyArray<string>; // cards to be discarded
}

export type EventHookPayload =
  | { readonly type: 'energy_attached'; readonly data: EnergyAttachedPayload }
  | { readonly type: 'pokemon_benched'; readonly data: PokemonBenchedPayload }
  | { readonly type: 'turn_ending'; readonly data: TurnEndingPayload }
  | { readonly type: 'deck_discard_attempted'; readonly data: DeckDiscardAttemptedPayload };
```

### 3. Event Hook Interface and Registry

```typescript
export type EventHookResult =
  | { readonly handled: false }
  | { readonly handled: true; readonly newState: GameState }
  | { readonly handled: true; readonly newState: GameState; readonly prevented: true };
  // 'prevented' is used by Patrol Cap to block the discard action

export interface EventHook {
  readonly id: string;
  readonly hookType: EventHookType;
  readonly handler: (state: GameState, payload: EventHookPayload) => EventHookResult;
}

// The registry — populated via registerEventHook() calls in effects files
const eventHooks: Map<EventHookType, EventHook[]> = new Map();

export function registerEventHook(hook: EventHook): void {
  const list = eventHooks.get(hook.hookType) ?? [];
  eventHooks.set(hook.hookType, [...list, hook]);
}

export function fireEventHooks(
  state: GameState,
  payload: EventHookPayload
): { newState: GameState; prevented: boolean } {
  const hooks = eventHooks.get(payload.type) ?? [];
  let s = state;
  let prevented = false;
  for (const hook of hooks) {
    const result = hook.handler(s, payload);
    if (result.handled) {
      s = result.newState;
      if ('prevented' in result && result.prevented) {
        prevented = true;
        break;  // prevention short-circuits remaining hooks
      }
    }
  }
  return { newState: s, prevented };
}
```

### 4. Integration Points in turn.ts

Three call sites in `turn.ts` must fire hooks after completing their state mutations:

**ATTACH_ENERGY handler (turn.ts ~line 841):**

```typescript
// After building the post-attachment state `s`, before returning:
const energyPayload: EventHookPayload = {
  type: 'energy_attached',
  data: {
    player: state.activePlayer,
    energyInstanceId: action.cardInstanceId,
    targetInstanceId: action.targetInstanceId
  }
};
const hookResult = fireEventHooks(s, energyPayload);
s = hookResult.newState;
// (prevention is not meaningful here — energy is already attached)
```

**PLAY_BASIC_TO_BENCH handler (turn.ts ~line 770):**

```typescript
// After building the post-bench state `s`, before returning:
const benchPayload: EventHookPayload = {
  type: 'pokemon_benched',
  data: {
    player: state.activePlayer,
    pokemonInstanceId: action.cardInstanceId
  }
};
const hookResult = fireEventHooks(s, benchPayload);
s = hookResult.newState;
```

**endTurn function (turn.ts):**

```typescript
// At the start of endTurn, before the phase/activePlayer swap:
const endingPayload: EventHookPayload = {
  type: 'turn_ending',
  data: { player: state.activePlayer }
};
const hookResult = fireEventHooks(state, endingPayload);
state = hookResult.newState;
```

The `deck_discard_attempted` hook is used for Patrol Cap's prevention mechanic. It fires
before any action that discards cards from a player's deck (e.g., mill effects from attacks
or trainers). The hook handler returns `prevented: true` to signal the calling code to skip
the discard. See §6 for Patrol Cap's full handler.

### 5. Calamitous Snowy Mountain Implementation

Registered as an `energy_attached` hook in `stadiums.ts`:

```typescript
// In registerAllStadiums() or a new registerStadiumHooks() call:
registerEventHook({
  id: 'calamitous_snowy_mountain',
  hookType: 'energy_attached',
  handler(state, payload): EventHookResult {
    if (payload.type !== 'energy_attached') return { handled: false };

    // Must be the active stadium
    const stadiumDef = getStadiumDef(state);
    if (stadiumDef?.name !== 'Calamitous Snowy Mountain') return { handled: false };

    const { targetInstanceId, player } = payload.data;

    // Find the target Pokemon
    const playerState = state.players[player];
    const target =
      playerState.active?.instanceId === targetInstanceId
        ? playerState.active
        : playerState.bench.find(b => b.instanceId === targetInstanceId);

    if (!target) return { handled: false };

    const targetDef = getTopDef(state, target);
    if (!targetDef) return { handled: false };

    // Trigger only if: non-Water Basic Pokemon
    const isWater = targetDef.types.includes('Water');
    const isBasic = targetDef.stage === 'Basic';
    if (!isBasic || isWater) return { handled: false };

    // Place 2 damage counters
    const newState = placeDamageCounters(
      state, targetInstanceId, 2, 'Calamitous Snowy Mountain'
    );
    return { handled: true, newState };
  }
});
```

### 6. Risky Ruins Implementation

Registered as a `pokemon_benched` hook in `stadiums.ts`:

```typescript
registerEventHook({
  id: 'risky_ruins',
  hookType: 'pokemon_benched',
  handler(state, payload): EventHookResult {
    if (payload.type !== 'pokemon_benched') return { handled: false };

    const stadiumDef = getStadiumDef(state);
    if (stadiumDef?.name !== 'Risky Ruins') return { handled: false };

    const { pokemonInstanceId, player } = payload.data;

    // Find the newly benched Pokemon
    const playerState = state.players[player];
    const benched = playerState.bench.find(b => b.instanceId === pokemonInstanceId);
    if (!benched) return { handled: false };

    const benchedDef = getTopDef(state, benched);
    if (!benchedDef) return { handled: false };

    // Trigger only if: non-Darkness Basic Pokemon
    const isDarkness = benchedDef.types.includes('Darkness');
    const isBasic = benchedDef.stage === 'Basic';
    if (!isBasic || isDarkness) return { handled: false };

    // Place 2 damage counters
    const newState = placeDamageCounters(
      state, pokemonInstanceId, 2, 'Risky Ruins'
    );
    return { handled: true, newState };
  }
});
```

### 7. Powerglass Implementation

Registered as a `turn_ending` hook in `tools.ts`:

```typescript
registerEventHook({
  id: 'powerglass',
  hookType: 'turn_ending',
  handler(state, payload): EventHookResult {
    if (payload.type !== 'turn_ending') return { handled: false };

    const { player } = payload.data;
    const playerState = state.players[player];
    const active = playerState.active;
    if (!active) return { handled: false };

    // Must have Powerglass attached to the Active Pokemon
    const hasPowerglass = active.attachedTools.some(toolId => {
      const inst = state.cardRegistry.get(toolId);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' && def.name === 'Powerglass';
    });
    if (!hasPowerglass) return { handled: false };

    // Search discard for a Basic Energy
    const basicEnergyInDiscard = playerState.discard.filter(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Energy' && def.subtype === 'Basic';
    });
    if (basicEnergyInDiscard.length === 0) return { handled: false };

    // Auto-attach the first available Basic Energy (deterministic — no choice needed)
    // If the engine gains a ChoiceResolver here in future, prefer player choice.
    const energyId = basicEnergyInDiscard[0]!;
    const newState = attachEnergyFromDiscard(state, player, energyId, active.instanceId);
    return { handled: true, newState };
  }
});
```

`attachEnergyFromDiscard` is a new primitive in `primitives.ts` that moves an energy card
from the discard zone onto a Pokemon's `attachedEnergy` array. See §9.

### 8. Patrol Cap Implementation

Patrol Cap prevents the opponent from discarding cards from your deck. It uses the
`deck_discard_attempted` hook with `prevented: true`.

```typescript
registerEventHook({
  id: 'patrol_cap',
  hookType: 'deck_discard_attempted',
  handler(state, payload): EventHookResult {
    if (payload.type !== 'deck_discard_attempted') return { handled: false };

    const { requestingPlayer, targetPlayer } = payload.data;

    // Only applies when opponent attempts to discard from the Patrol Cap owner's deck
    if (requestingPlayer === targetPlayer) return { handled: false };

    // The Patrol Cap owner is the targetPlayer (their deck is being attacked)
    const ownerState = state.players[targetPlayer];
    const active = ownerState.active;
    if (!active) return { handled: false };

    // Patrol Cap must be attached to the Active Pokemon of the owner
    const hasPatrolCap = active.attachedTools.some(toolId => {
      const inst = state.cardRegistry.get(toolId);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' && def.name === 'Patrol Cap';
    });
    if (!hasPatrolCap) return { handled: false };

    // Also check Jamming Tower — if active, tools are suppressed
    if (isJammingTowerActive(state)) return { handled: false };

    // Block the discard
    return { handled: true, newState: state, prevented: true };
  }
});
```

Callers that discard from opponent decks (e.g., mill attacks) must fire the hook before
executing the discard and skip the action if `prevented` is true.

### 9. New Primitive: attachEnergyFromDiscard

```typescript
// lib/effects/primitives.ts

export function attachEnergyFromDiscard(
  state: GameState,
  player: PlayerId,
  energyInstanceId: string,
  targetPokemonInstanceId: string
): GameState {
  const playerState = state.players[player];

  // Validate: energy is in discard
  if (!playerState.discard.includes(energyInstanceId)) return state;

  // Find the target Pokemon (active or bench)
  const isActive = playerState.active?.instanceId === targetPokemonInstanceId;
  const benchIdx = playerState.bench.findIndex(
    b => b.instanceId === targetPokemonInstanceId
  );
  if (!isActive && benchIdx === -1) return state;

  const updatedDiscard = playerState.discard.filter(id => id !== energyInstanceId);

  const attachEnergy = (p: InPlayPokemon): InPlayPokemon => ({
    ...p,
    attachedEnergy: [...p.attachedEnergy, energyInstanceId]
  });

  const updatedPlayer: PlayerState = {
    ...playerState,
    discard: updatedDiscard,
    active: isActive && playerState.active
      ? attachEnergy(playerState.active)
      : playerState.active,
    bench: benchIdx !== -1
      ? playerState.bench.map((b, i) => i === benchIdx ? attachEnergy(b) : b)
      : playerState.bench
  };

  return {
    ...state,
    players: { ...state.players, [player]: updatedPlayer },
    eventLog: [
      ...state.eventLog,
      {
        type: 'ENERGY_ATTACHED',
        player,
        energyInstanceId,
        targetInstanceId: targetPokemonInstanceId
      }
    ]
  };
}
```

### 10. Ability Resolution System

Create `lib/core/abilities.ts` with suppression checks before ability dispatch:

```typescript
// lib/core/abilities.ts

import type { GameState, InPlayPokemon, PlayerId } from '../types/game';
import type { PokemonCardDefinition } from '../types/card';
import { getTopDef } from '../effects/primitives';
import { isJammingTowerActive } from './modifiers';

function getStadiumName(state: GameState): string | null {
  if (!state.stadium) return null;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' ? def.name : null;
}

export function canUseAbility(
  state: GameState,
  player: PlayerId,
  pokemon: InPlayPokemon,
  abilityName: string
): boolean {
  const def = getTopDef(state, pokemon);
  if (!def) return false;

  // Does the Pokemon actually have this ability?
  const hasAbility = def.abilities.some(a => a.name === abilityName);
  if (!hasAbility) return false;

  // Check: is there a global ability_lock temporal effect?
  const hasAbilityLock = state.temporalEffects.some(
    e => e.type === 'ability_lock' && (e.targetInstanceId === null || e.targetInstanceId === pokemon.instanceId)
  );
  if (hasAbilityLock) return false;

  // Check: Team Rocket's Watchtower suppresses Colorless Pokemon abilities
  if (getStadiumName(state) === "Team Rocket's Watchtower") {
    const isColorless = def.types.includes('Colorless');
    if (isColorless) return false;
  }

  return true;
}
```

**Integration into `turn.ts` USE_ABILITY handler:**

The `USE_ABILITY` action handler currently calls `resolveEffect` directly. It must first
call `canUseAbility` and return an error if the ability is suppressed:

```typescript
// turn.ts — USE_ABILITY handler (before calling resolveEffect)
if (action.type === 'USE_ABILITY') {
  const pokemon = findPokemonInPlay(state, state.activePlayer, action.pokemonInstanceId);
  if (!pokemon) return err('ILLEGAL_ACTION', 'Pokemon not in play');

  if (!canUseAbility(state, state.activePlayer, pokemon, action.abilityName)) {
    return err('ILLEGAL_ACTION', 'Ability is suppressed or unavailable');
  }

  // ... proceed with resolveEffect
}
```

`getLegalActions` must also filter out abilities that fail `canUseAbility` so they are
never presented as legal moves:

```typescript
// In getLegalActions, when enumerating USE_ABILITY actions:
for (const poke of allPokemonInPlay) {
  const def = getTopDef(state, poke);
  if (!def) continue;
  for (const ability of def.abilities) {
    if (canUseAbility(state, state.activePlayer, poke, ability.name)) {
      actions.push({ type: 'USE_ABILITY', pokemonInstanceId: poke.instanceId, abilityName: ability.name });
    }
  }
}
```

---

## File Structure

```
packages/@engine/
├── lib/
│   ├── core/
│   │   ├── events.ts          ◀── NEW: EventHookType, payload types, registry, fireEventHooks
│   │   ├── abilities.ts       ◀── NEW: canUseAbility, ability suppression checks
│   │   ├── turn.ts            ◀── MODIFY: fire energy_attached, pokemon_benched, turn_ending hooks
│   │   │                              MODIFY: USE_ABILITY handler calls canUseAbility
│   │   │                              MODIFY: getLegalActions filters suppressed abilities
│   │   └── modifiers.ts       ◀── no change (Jamming Tower check reused by abilities.ts)
│   ├── effects/
│   │   ├── stadiums.ts        ◀── MODIFY: register Calamitous Snowy Mountain + Risky Ruins hooks
│   │   ├── tools.ts           ◀── MODIFY: register Patrol Cap + Powerglass hooks
│   │   └── primitives.ts      ◀── MODIFY: add attachEnergyFromDiscard
│   ├── index.ts               ◀── MODIFY: import './core/events' for hook side-effects (if needed)
│   └── types/
│       └── event.ts           ◀── no change (existing ENERGY_ATTACHED/BASIC_PLAYED events reused)
└── __tests__/
    ├── core/
    │   ├── events.test.ts     ◀── NEW: hook registry, fireEventHooks, prevention
    │   └── abilities.test.ts  ◀── NEW: canUseAbility suppression scenarios
    └── effects/
        └── event-hooks.test.ts ◀── NEW: Patrol Cap, Powerglass, Snowy Mountain, Risky Ruins
```

---

## Implementation Phases

### Phase 1: Event System Foundation

Create `lib/core/events.ts` with all types, the registry, and `fireEventHooks`. No card
logic yet — just the infrastructure.

```
┌──────────────────────────────────────────────────────┐
│  Phase 1 Deliverables                                │
│                                                      │
│  events.ts: EventHookType, payload types             │
│             EventHook interface                       │
│             registerEventHook()                      │
│             fireEventHooks()                         │
│                                                      │
│  __tests__/core/events.test.ts:                      │
│    - register a hook, fire it, assert state change   │
│    - prevention short-circuits remaining hooks       │
│    - no hooks registered → state unchanged           │
└──────────────────────────────────────────────────────┘
```

**Phase 1 exit criteria:**
- [ ] `lib/core/events.ts` exists and exports `registerEventHook` and `fireEventHooks`
- [ ] `fireEventHooks` with no registered hooks returns the original state unchanged
- [ ] A registered hook that returns `{ handled: true, newState }` applies the state change
- [ ] A hook returning `{ prevented: true }` causes `fireEventHooks` to return `prevented: true`
- [ ] Subsequent hooks do not run after a prevention
- [ ] `bun run check-types` reports 0 errors

### Phase 2: Wire the Four Event-Hook Cards

Register Calamitous Snowy Mountain, Risky Ruins, Powerglass, and Patrol Cap hooks. Wire
the three `fireEventHooks` call sites into `turn.ts`. Add `attachEnergyFromDiscard` to
`primitives.ts`.

```
turn.ts                    stadiums.ts             tools.ts
  │                            │                      │
  ├── ATTACH_ENERGY             ├── register            ├── register
  │   fires energy_attached ───▶│   SnowyMountain hook  │   Powerglass hook
  │                            └── register            └── register
  ├── PLAY_BASIC_TO_BENCH           RiskyRuins hook         PatrolCap hook
  │   fires pokemon_benched
  │
  └── endTurn
      fires turn_ending
```

**Phase 2 exit criteria:**
- [ ] Calamitous Snowy Mountain: attaching Energy to a non-Water Basic places 2 counters
- [ ] Calamitous Snowy Mountain: attaching Energy to a Water Pokemon places no counters
- [ ] Calamitous Snowy Mountain: attaching Energy to a Stage 1 places no counters
- [ ] Calamitous Snowy Mountain: no effect when a different stadium is in play
- [ ] Risky Ruins: placing a non-Darkness Basic on Bench places 2 counters
- [ ] Risky Ruins: placing a Darkness Basic on Bench places no counters
- [ ] Risky Ruins: placing a Stage 1 on Bench places no counters (cannot play Stage 1 to Bench directly, but guard still applies)
- [ ] Powerglass: at end of turn, if Active has Powerglass and discard has Basic Energy, it is attached
- [ ] Powerglass: no effect if Active has no Basic Energy in discard
- [ ] Powerglass: no effect if Powerglass is not on Active (only on Bench)
- [ ] Patrol Cap: opponent mill attack is prevented when Patrol Cap is on Active
- [ ] Patrol Cap: own-deck discard (e.g., Cycling Road) is not prevented
- [ ] Patrol Cap: suppressed by Jamming Tower
- [ ] `attachEnergyFromDiscard` correctly moves energy from discard to target Pokemon
- [ ] `bun test packages/@engine` passes with 0 failures

### Phase 3: Ability Resolution System

Create `lib/core/abilities.ts`. Wire `canUseAbility` into the `USE_ABILITY` action handler
and `getLegalActions` in `turn.ts`.

```
getLegalActions               applyAction / USE_ABILITY
      │                               │
      ▼                               ▼
canUseAbility ────────────────▶ canUseAbility
  │                                   │
  ├── has the ability?                 ├── false → err('ILLEGAL_ACTION')
  ├── ability_lock temporal?           └── true → resolveEffect (existing)
  └── Watchtower + Colorless?
```

**Phase 3 exit criteria:**
- [ ] `lib/core/abilities.ts` exports `canUseAbility`
- [ ] Colorless Pokemon ability is suppressed when Team Rocket's Watchtower is active
- [ ] Non-Colorless Pokemon ability is NOT suppressed by Watchtower
- [ ] `ability_lock` temporal effect suppresses the targeted ability
- [ ] Global `ability_lock` (targetInstanceId: null) suppresses all abilities
- [ ] `USE_ABILITY` action on a suppressed ability returns `err('ILLEGAL_ACTION')`
- [ ] `getLegalActions` excludes suppressed abilities from results
- [ ] `bun test packages/@engine` passes with 0 failures
- [ ] `bun run check-types` reports 0 errors

---

## Acceptance Criteria

- [ ] `lib/core/events.ts` exists and exports `EventHookType`, `EventHookPayload`, `EventHook`, `registerEventHook`, `fireEventHooks`
- [ ] `lib/core/abilities.ts` exists and exports `canUseAbility`
- [ ] `lib/effects/primitives.ts` exports `attachEnergyFromDiscard`
- [ ] `fireEventHooks` is called after `ATTACH_ENERGY`, `PLAY_BASIC_TO_BENCH`, and in `endTurn`
- [ ] Calamitous Snowy Mountain correctly triggers on non-Water Basic energy attachment
- [ ] Risky Ruins correctly triggers on non-Darkness Basic bench placement
- [ ] Powerglass correctly attaches Basic Energy from discard at end of turn
- [ ] Patrol Cap correctly prevents opponent deck discard when on Active
- [ ] Team Rocket's Watchtower suppresses Colorless abilities via `canUseAbility`
- [ ] `ability_lock` temporal effects (from SPEC_04B and future cards) are respected
- [ ] No ability logic is duplicated between `abilities.ts` and `turn.ts`
- [ ] `bun test packages/@engine` passes with 0 failures
- [ ] `bun run check-types` reports 0 errors

---

## Dependencies

- SPEC_04B (Pipeline Hooks) — provides `modifiers.ts` with `isJammingTowerActive`, `getStadiumDef`, and the `TemporalEffect` `ability_lock` type
- SPEC_01 (Core Types) — `GameState`, `InPlayPokemon`, `GameEvent`
- SPEC_02 (Game Flow) — `applyAction`, `getLegalActions`

This spec does NOT block SPEC_05 (AI Player). Both can proceed in parallel.

---

## Test Strategy

### events.test.ts — Unit tests for the hook infrastructure

```typescript
// packages/@engine/__tests__/core/events.test.ts

import { describe, test, expect, beforeEach } from 'bun:test';
import { registerEventHook, fireEventHooks } from '../../lib/core/events';
import type { EventHook, EventHookPayload } from '../../lib/core/events';

// Tests:
// 1. No hooks registered → state returned unchanged
// 2. Hook returns { handled: false } → state unchanged
// 3. Hook returns { handled: true, newState } → new state used
// 4. Multiple hooks → all fire in registration order, each receives prior state
// 5. Hook returns { prevented: true } → subsequent hooks do not run
// 6. Hook with wrong hookType → not triggered by unrelated event
```

### abilities.test.ts — Unit tests for ability suppression

```typescript
// packages/@engine/__tests__/core/abilities.test.ts

// Tests:
// 1. Pokemon with ability, no suppressors → canUseAbility returns true
// 2. Pokemon without the named ability → returns false
// 3. Team Rocket's Watchtower active + Colorless Pokemon → returns false
// 4. Team Rocket's Watchtower active + Fire Pokemon → returns true
// 5. ability_lock temporal (targeted) on this Pokemon → returns false
// 6. ability_lock temporal (global, null target) → returns false
// 7. Watchtower + non-Colorless → ability still works
```

### event-hooks.test.ts — Integration tests per card

```typescript
// packages/@engine/__tests__/effects/event-hooks.test.ts

// For each card: build a minimal GameState with the stadium/tool in play,
// fire the relevant event hook, assert the expected state change.

// Calamitous Snowy Mountain (4 cases): non-Water Basic, Water Basic, Stage 1, wrong stadium
// Risky Ruins (3 cases): non-Darkness Basic, Darkness Basic, wrong stadium
// Powerglass (3 cases): Basic Energy in discard, no Basic Energy, Powerglass on Bench only
// Patrol Cap (3 cases): opponent mill blocked, self-discard allowed, blocked by Jamming Tower
```

---

## Verification

```bash
# Type check
bun run --cwd packages/@engine check-types

# Run all engine tests
bun test --cwd packages/@engine

# Verify new files exist
ls packages/@engine/lib/core/events.ts
ls packages/@engine/lib/core/abilities.ts

# Verify hook call sites are wired in turn.ts
grep -n "fireEventHooks" packages/@engine/lib/core/turn.ts

# Verify canUseAbility is called in the USE_ABILITY handler
grep -n "canUseAbility" packages/@engine/lib/core/turn.ts

# Verify the no-op comments are replaced with hook registration calls
grep -n "Patrol Cap\|Powerglass" packages/@engine/lib/effects/tools.ts
grep -n "Calamitous Snowy Mountain\|Risky Ruins\|Watchtower" packages/@engine/lib/effects/stadiums.ts
```
