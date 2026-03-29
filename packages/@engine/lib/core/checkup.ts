import type { GameState, PlayerId, InPlayPokemon } from '../types/game';
import type { GameEvent } from '../types/event';
import { coinFlip } from '../rng';
import { removeSpecialCondition } from './conditions';
import { handleKnockOut, checkWinConditions } from './game';
import { getEffectiveHpById, getPoisonModifiers, checkConditionImmunity } from './modifiers';

function placeDamageCounters(
  state: GameState,
  playerId: PlayerId,
  counters: number,
  source: string
): GameState {
  const player = state.players[playerId];
  if (!player.active) return state;

  const pokemon = player.active;
  const newPokemon: InPlayPokemon = { ...pokemon, damageCounters: pokemon.damageCounters + counters };
  const events: GameEvent[] = [
    { type: 'DAMAGE_COUNTERS_PLACED', targetInstanceId: pokemon.instanceId, counters, source }
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, active: newPokemon }
    },
    eventLog: [...state.eventLog, ...events]
  };
}

export function performCheckup(state: GameState): GameState {
  let s = state;
  const activePlayerId = state.activePlayer;

  for (const playerId of ['player1', 'player2'] as PlayerId[]) {
    const player = s.players[playerId];
    if (!player.active) continue;

    // Check condition immunity (Festival Grounds, Ancient Booster Energy Capsule)
    const topId = player.active.evolutionStack[player.active.evolutionStack.length - 1] ?? player.active.instanceId;
    const topInst = s.cardRegistry.get(topId);
    const topDef = topInst ? s.definitionRegistry.get(topInst.definitionId) : undefined;
    const pokeDef = topDef?.cardType === 'Pokemon' ? topDef : null;

    if (pokeDef && checkConditionImmunity(s, player.active, pokeDef)) {
      // Remove all special conditions from immune Pokemon
      if (player.active.specialConditions.length > 0) {
        const cleansed = { ...player.active, specialConditions: [] as ReadonlyArray<import('../types/game').SpecialCondition> };
        s = {
          ...s,
          players: { ...s.players, [playerId]: { ...s.players[playerId], active: cleansed } }
        };
      }
      continue;
    }

    // 1. Poisoned → 1 damage counter + stadium modifiers (Perilous Jungle)
    if (player.active.specialConditions.includes('Poisoned')) {
      const extraCounters = pokeDef ? getPoisonModifiers(s, player.active, pokeDef) : 0;
      s = placeDamageCounters(s, playerId, 1 + extraCounters, 'poison');
    }

    // 2. Burned → 2 damage counters, then coin flip for removal
    if (s.players[playerId].active?.specialConditions.includes('Burned')) {
      s = placeDamageCounters(s, playerId, 2, 'burn');
      const { result, nextState: rng } = coinFlip(s.rngState);
      const events: GameEvent[] = [{ type: 'COIN_FLIPPED', result, reason: 'burn_check' }];
      s = { ...s, rngState: rng, eventLog: [...s.eventLog, ...events] };
      if (result === 'heads') {
        const poke = s.players[playerId].active!;
        const newPoke = removeSpecialCondition(poke, 'Burned');
        s = {
          ...s,
          players: { ...s.players, [playerId]: { ...s.players[playerId], active: newPoke } },
          eventLog: [...s.eventLog, { type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: poke.instanceId, condition: 'Burned' }]
        };
      }
    }

    // 3. Asleep → coin flip for removal
    if (s.players[playerId].active?.specialConditions.includes('Asleep')) {
      const { result, nextState: rng } = coinFlip(s.rngState);
      const events: GameEvent[] = [{ type: 'COIN_FLIPPED', result, reason: 'sleep_check' }];
      s = { ...s, rngState: rng, eventLog: [...s.eventLog, ...events] };
      if (result === 'heads') {
        const poke = s.players[playerId].active!;
        const newPoke = removeSpecialCondition(poke, 'Asleep');
        s = {
          ...s,
          players: { ...s.players, [playerId]: { ...s.players[playerId], active: newPoke } },
          eventLog: [...s.eventLog, { type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: poke.instanceId, condition: 'Asleep' }]
        };
      }
    }

    // 4. Paralyzed → remove only if this player just completed their turn
    if (s.players[playerId].active?.specialConditions.includes('Paralyzed')) {
      if (playerId === activePlayerId) {
        const poke = s.players[playerId].active!;
        const newPoke = removeSpecialCondition(poke, 'Paralyzed');
        s = {
          ...s,
          players: { ...s.players, [playerId]: { ...s.players[playerId], active: newPoke } },
          eventLog: [...s.eventLog, { type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: poke.instanceId, condition: 'Paralyzed' }]
        };
      }
    }
  }

  // Check for KOs from condition damage
  const kos: PlayerId[] = [];
  for (const playerId of ['player1', 'player2'] as PlayerId[]) {
    const player = s.players[playerId];
    if (!player.active) continue;
    const hp = getEffectiveHpById(s, player.active);
    if (player.active.damageCounters * 10 >= hp) {
      kos.push(playerId);
    }
  }

  for (const koPlayerId of kos) {
    const active = s.players[koPlayerId].active;
    if (!active) continue;
    s = handleKnockOut(s, active.instanceId);
    if (s.phase === 'finished') break;
  }

  if (s.phase !== 'finished') {
    s = checkWinConditions(s);
  }

  s = { ...s, eventLog: [...s.eventLog, { type: 'CHECKUP_COMPLETED' }] };
  return s;
}
