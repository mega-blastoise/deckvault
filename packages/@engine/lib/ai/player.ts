import type { GameState } from '../types/game';
import type { AiConfig } from './types';
import type { GameConfig } from '../core/game';
import { createGame } from '../core/game';
import { getLegalActions, applyAction, startTurn } from '../core/turn';

export function playTurn(state: GameState, config: AiConfig): GameState {
  let s = state;
  const maxActions = config.maxActionsPerTurn ?? 100;
  let iterations = 0;

  while (s.phase !== 'finished' && iterations < maxActions) {
    iterations++;
    const legal = getLegalActions(s);
    if (legal.length === 0) break;
    if (legal.length === 1 && legal[0]!.type === 'PASS') break;

    const chosen = config.strategy.chooseAction(s, legal, config.playerId);
    const result = applyAction(s, chosen);
    if (!result.ok) break;
    s = result.value;
    if (s.phase === 'checkup' || s.phase === 'finished') break;
  }

  return s;
}

export function runSetupPhase(state: GameState, config1: AiConfig, config2: AiConfig): GameState {
  let s = state;
  let iterations = 0;
  while (s.phase === 'setup' && iterations < 100) {
    iterations++;
    const legal = getLegalActions(s);
    if (legal.length === 0) break;
    const activeConfig = s.activePlayer === 'player1' ? config1 : config2;
    const chosen = activeConfig.strategy.chooseAction(s, legal, activeConfig.playerId);
    const result = applyAction(s, chosen);
    if (!result.ok) break;
    s = result.value;
  }
  return s;
}

export function simulateGame(config1: AiConfig, config2: AiConfig, gameConfig: GameConfig): GameState {
  const result = createGame(gameConfig);
  if (!result.ok) throw new Error(result.error.message);
  let state = result.value;
  state = runSetupPhase(state, config1, config2);
  let iterations = 0;
  while (state.phase !== 'finished' && iterations < 200) {
    iterations++;
    state = startTurn(state);
    const activeConfig = state.activePlayer === 'player1' ? config1 : config2;
    state = playTurn(state, activeConfig);
  }
  return state;
}
