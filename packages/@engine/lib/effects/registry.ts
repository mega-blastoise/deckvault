import type { GameState, PlayerId } from '../types/game';
import type { GameResult } from '../core/result';
import { ok } from '../core/result';

export type EffectContext = {
  readonly state: GameState;
  readonly actingPlayer: PlayerId;
  readonly targets: ReadonlyArray<string>;
};

export type EffectHandler = (context: EffectContext) => GameResult<GameState>;

const registry = new Map<string, EffectHandler>();

export function registerEffect(effectId: string, handler: EffectHandler): void {
  registry.set(effectId, handler);
}

export function resolveEffect(effectId: string, context: EffectContext): GameResult<GameState> {
  const handler = registry.get(effectId);
  if (!handler) {
    return ok(context.state);
  }
  return handler(context);
}
