import type { GameState, PlayerId } from '../types/game';
import type { PlayerAction } from '../types/action';
import type { AiStrategy, ScoredAction } from './types';
import { otherPlayer } from '../core/game';
import { getEffectiveHpById } from '../core/modifiers';
import { applyAction } from '../core/turn';
import { randomInt } from '../rng';
import { evaluateBoard, resolveTopDef } from './evaluate';

function selectBestActive(
  state: GameState,
  candidates: ReadonlyArray<PlayerAction>,
  _playerId: PlayerId
): PlayerAction {
  let bestAction = candidates[0]!;
  let bestHp = -1;

  for (const action of candidates) {
    if (action.type !== 'SELECT_ACTIVE') continue;
    const instance = state.cardRegistry.get(action.cardInstanceId);
    if (!instance) continue;
    const def = state.definitionRegistry.get(instance.definitionId);
    if (def?.cardType === 'Pokemon' && def.hp > bestHp) {
      bestHp = def.hp;
      bestAction = action;
    }
  }
  return bestAction;
}

export function handleSetupAction(
  state: GameState,
  legal: ReadonlyArray<PlayerAction>,
  playerId: PlayerId
): PlayerAction {
  const coinFlip = legal.find(a => a.type === 'COIN_FLIP_CHOICE');
  if (coinFlip) {
    return { type: 'COIN_FLIP_CHOICE', choice: 'first' };
  }

  const mulligan = legal.find(a => a.type === 'MULLIGAN_REDRAW');
  if (mulligan) return mulligan;

  const selectActives = legal.filter(a => a.type === 'SELECT_ACTIVE');
  if (selectActives.length > 0) {
    return selectBestActive(state, selectActives, playerId);
  }

  const selectBench = legal.find(a => a.type === 'SELECT_BENCH');
  if (selectBench) return selectBench;

  return legal[0]!;
}

function scoreTrainer(state: GameState, cardInstanceId: string, _playerId: PlayerId): number {
  const instance = state.cardRegistry.get(cardInstanceId);
  if (!instance) return 0;
  const def = state.definitionRegistry.get(instance.definitionId);
  if (!def || def.cardType !== 'Trainer') return 0;

  const hand = state.players[state.activePlayer].hand;
  if (def.subtypes.includes('Supporter')) {
    if (hand.length <= 3) return 90;
    if (hand.length <= 5) return 60;
    return 30;
  }
  if (def.subtypes.includes('Item')) return 50;
  if (def.subtypes.includes('Stadium')) return 35;
  return 25;
}

function scoreEnergyAttach(
  state: GameState,
  _cardInstanceId: string,
  targetInstanceId: string,
  playerId: PlayerId
): number {
  const myActive = state.players[playerId].active;
  if (!myActive || myActive.instanceId !== targetInstanceId) return 10;

  const def = resolveTopDef(state, myActive);
  if (!def) return 10;

  const currentEnergy = myActive.attachedEnergy.length + 1;
  for (const attack of def.attacks) {
    if (attack.cost.length <= currentEnergy) return 40;
  }
  return 25;
}

function scoreRetreat(
  state: GameState,
  newActiveInstanceId: string,
  playerId: PlayerId
): number {
  const opponent = otherPlayer(playerId);
  const myActive = state.players[playerId].active;
  if (!myActive) return 0;

  const myHp = getEffectiveHpById(state, myActive);
  const myPct = myHp > 0 ? (myHp - myActive.damageCounters * 10) / myHp : 0;
  if (myPct > 0.6) return -30;

  let score = 0;
  const oppActive = state.players[opponent].active;
  if (oppActive) {
    const oppDef = resolveTopDef(state, oppActive);
    const newPokemon = state.players[playerId].bench.find(b => b.instanceId === newActiveInstanceId);
    if (newPokemon && oppDef) {
      const newDef = resolveTopDef(state, newPokemon);
      if (newDef) {
        for (const aType of newDef.types) {
          if (oppDef.weaknesses.some(w => w.type === aType)) score += 40;
        }
        for (const aType of oppDef.types) {
          if (newDef.weaknesses.some(w => w.type === aType)) score -= 20;
        }
      }
    }
  }
  return score;
}

function scoreTool(state: GameState, cardInstanceId: string): number {
  const instance = state.cardRegistry.get(cardInstanceId);
  if (!instance) return 15;
  const def = state.definitionRegistry.get(instance.definitionId);
  if (!def || def.cardType !== 'Trainer') return 15;
  if (def.subtypes.includes('PokemonTool')) return 20;
  return 15;
}

function scoreAction(state: GameState, action: PlayerAction, playerId: PlayerId): number {
  switch (action.type) {
    case 'ATTACK': {
      const result = applyAction(state, action);
      if (!result.ok) return -1000;
      return evaluateBoard(result.value, playerId);
    }
    case 'EVOLVE_POKEMON':
      return 80;
    case 'PLAY_TRAINER':
      return scoreTrainer(state, action.cardInstanceId, playerId);
    case 'ATTACH_ENERGY':
      return scoreEnergyAttach(state, action.cardInstanceId, action.targetInstanceId, playerId);
    case 'RETREAT':
      return scoreRetreat(state, action.newActiveInstanceId, playerId);
    case 'PLAY_BASIC_TO_BENCH':
      return 20;
    case 'USE_ABILITY': {
      const result = applyAction(state, action);
      if (!result.ok) return -1000;
      return evaluateBoard(result.value, playerId) + 5;
    }
    case 'ATTACH_TOOL':
      return scoreTool(state, action.cardInstanceId);
    case 'PASS':
      return 0;
    default:
      return 5;
  }
}

export function scoreActions(
  state: GameState,
  actions: ReadonlyArray<PlayerAction>,
  playerId: PlayerId
): ScoredAction[] {
  return actions.map(action => ({
    action,
    score: scoreAction(state, action, playerId)
  }));
}

export class RandomStrategy implements AiStrategy {
  chooseAction(state: GameState, legalActions: ReadonlyArray<PlayerAction>, playerId: PlayerId): PlayerAction {
    if (state.phase === 'setup') {
      return handleSetupAction(state, legalActions, playerId);
    }

    const nonPass = legalActions.filter(a => a.type !== 'PASS');
    const pool = nonPass.length > 0 ? nonPass : legalActions;

    const { result } = randomInt(0, pool.length - 1, state.rngState);
    return pool[result]!;
  }
}

export class GreedyStrategy implements AiStrategy {
  chooseAction(state: GameState, legalActions: ReadonlyArray<PlayerAction>, playerId: PlayerId): PlayerAction {
    if (state.phase === 'setup') {
      return handleSetupAction(state, legalActions, playerId);
    }

    const scored = scoreActions(state, legalActions, playerId);
    scored.sort((a, b) => b.score - a.score);
    return scored[0]!.action;
  }
}
