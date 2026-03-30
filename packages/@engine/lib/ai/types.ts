import type { GameState, PlayerId } from '../types/game';
import type { PlayerAction } from '../types/action';

export interface AiStrategy {
  chooseAction(state: GameState, legalActions: ReadonlyArray<PlayerAction>, playerId: PlayerId): PlayerAction;
}

export interface AiConfig {
  readonly strategy: AiStrategy;
  readonly playerId: PlayerId;
  readonly maxActionsPerTurn?: number;
}

export interface ScoredAction {
  readonly action: PlayerAction;
  readonly score: number;
}
