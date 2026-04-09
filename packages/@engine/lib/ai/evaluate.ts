import type { GameState, PlayerId, InPlayPokemon } from '../types/game';
import type { PokemonCardDefinition } from '../types/card';
import { otherPlayer } from '../core/game';
import { getEffectiveHpById } from '../core/modifiers';
import { calculateDamage } from '../core/combat';

export function resolveTopDef(state: GameState, pokemon: InPlayPokemon): PokemonCardDefinition | null {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return null;
  const def = state.definitionRegistry.get(instance.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

export function evalPrizeDifferential(state: GameState, playerId: PlayerId): number {
  const opponent = otherPlayer(playerId);
  const myPrizes = state.players[playerId].prizes.length;
  const theirPrizes = state.players[opponent].prizes.length;
  return (theirPrizes - myPrizes) * 20;
}

export function evalActiveHealth(state: GameState, playerId: PlayerId): number {
  const opponent = otherPlayer(playerId);
  const myActive = state.players[playerId].active;
  const oppActive = state.players[opponent].active;
  if (!myActive || !oppActive) return 0;

  const myHp = getEffectiveHpById(state, myActive);
  const oppHp = getEffectiveHpById(state, oppActive);
  if (myHp === 0 || oppHp === 0) return 0;

  const myPct = (myHp - myActive.damageCounters * 10) / myHp;
  const oppPct = (oppHp - oppActive.damageCounters * 10) / oppHp;
  return (myPct - oppPct) * 50;
}

export function evalKOPotential(state: GameState, playerId: PlayerId): number {
  const opponent = otherPlayer(playerId);
  const myActive = state.players[playerId].active;
  const oppActive = state.players[opponent].active;
  if (!myActive || !oppActive) return 0;

  const attackerDef = resolveTopDef(state, myActive);
  const defenderDef = resolveTopDef(state, oppActive);
  if (!attackerDef || !defenderDef) return 0;

  const defenderHp = getEffectiveHpById(state, oppActive);
  const defenderRemaining = defenderHp - oppActive.damageCounters * 10;
  if (defenderRemaining <= 0) return 0;

  let maxScore = 0;
  for (const attack of attackerDef.attacks) {
    const calc = calculateDamage(myActive, oppActive, attack, attackerDef, defenderDef, state);
    if (calc.finalDamage >= defenderRemaining) {
      maxScore = Math.max(maxScore, 100);
    } else if (calc.finalDamage >= defenderRemaining * 0.5) {
      maxScore = Math.max(maxScore, 30);
    }
  }
  return maxScore;
}

export function evalBenchStrength(state: GameState, playerId: PlayerId): number {
  const bench = state.players[playerId].bench;
  let score = 0;
  for (const pokemon of bench) {
    score += 5;
    const def = resolveTopDef(state, pokemon);
    if (def) {
      if (def.stage === 'Stage1') score += 5;
      if (def.stage === 'Stage2') score += 10;
    }
  }
  return score;
}

export function evalEnergyAdvantage(state: GameState, playerId: PlayerId): number {
  const opponent = otherPlayer(playerId);
  const myActive = state.players[playerId].active;
  const oppActive = state.players[opponent].active;
  if (!myActive || !oppActive) return 0;
  return (myActive.attachedEnergy.length - oppActive.attachedEnergy.length) * 5;
}

export function evalTypeAdvantage(state: GameState, playerId: PlayerId): number {
  const opponent = otherPlayer(playerId);
  const myActive = state.players[playerId].active;
  const oppActive = state.players[opponent].active;
  if (!myActive || !oppActive) return 0;

  const attackerDef = resolveTopDef(state, myActive);
  const defenderDef = resolveTopDef(state, oppActive);
  if (!attackerDef || !defenderDef) return 0;

  let score = 0;
  for (const aType of attackerDef.types) {
    if (defenderDef.weaknesses.some(w => w.type === aType)) score += 30;
    if (defenderDef.resistances.some(r => r.type === aType)) score -= 10;
  }
  return score;
}

export function evaluateBoard(state: GameState, playerId: PlayerId): number {
  if (state.phase === 'finished') {
    if (state.winner === playerId) return 10000;
    if (state.winner === 'draw') return 0;
    return -10000;
  }

  return (
    evalPrizeDifferential(state, playerId) +
    evalActiveHealth(state, playerId) +
    evalKOPotential(state, playerId) +
    evalBenchStrength(state, playerId) +
    evalEnergyAdvantage(state, playerId) +
    evalTypeAdvantage(state, playerId)
  );
}
