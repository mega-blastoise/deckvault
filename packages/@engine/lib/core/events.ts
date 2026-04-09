import type { GameState, PlayerId } from '../types/game';

export type EventHookType =
  | 'energy_attached'
  | 'pokemon_benched'
  | 'turn_ending'
  | 'deck_discard_attempted';

export interface EnergyAttachedPayload {
  readonly player: PlayerId;
  readonly energyInstanceId: string;
  readonly targetInstanceId: string;
}

export interface PokemonBenchedPayload {
  readonly player: PlayerId;
  readonly pokemonInstanceId: string;
}

export interface TurnEndingPayload {
  readonly player: PlayerId;
}

export interface DeckDiscardAttemptedPayload {
  readonly requestingPlayer: PlayerId;
  readonly targetPlayer: PlayerId;
  readonly cardInstanceIds: ReadonlyArray<string>;
}

export type EventHookPayload =
  | { readonly type: 'energy_attached'; readonly data: EnergyAttachedPayload }
  | { readonly type: 'pokemon_benched'; readonly data: PokemonBenchedPayload }
  | { readonly type: 'turn_ending'; readonly data: TurnEndingPayload }
  | { readonly type: 'deck_discard_attempted'; readonly data: DeckDiscardAttemptedPayload };

export type EventHookResult =
  | { readonly handled: false }
  | { readonly handled: true; readonly newState: GameState }
  | { readonly handled: true; readonly newState: GameState; readonly prevented: true };

export interface EventHook {
  readonly id: string;
  readonly hookType: EventHookType;
  readonly handler: (state: GameState, payload: EventHookPayload) => EventHookResult;
}

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
        break;
      }
    }
  }
  return { newState: s, prevented };
}

export function clearEventHooks(): void {
  eventHooks.clear();
}
