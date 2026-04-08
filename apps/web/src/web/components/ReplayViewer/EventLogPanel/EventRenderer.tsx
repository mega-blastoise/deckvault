import type { GameEvent } from '@pokemon/engine/browser';
import type { SerializedCardDefinition } from '../types';

function definitionIdFromInstanceId(instanceId: string): string {
  const lastUnderscore = instanceId.lastIndexOf('_');
  if (lastUnderscore === -1) return instanceId;
  return instanceId.slice(0, lastUnderscore);
}

function cardName(
  instanceId: string,
  definitions: Record<string, SerializedCardDefinition>
): string {
  const defId = definitionIdFromInstanceId(instanceId);
  return definitions[defId]?.name ?? defId;
}

function playerLabel(player: string, deck1Name: string, deck2Name: string): string {
  return player === 'player1' ? deck1Name : deck2Name;
}

export function renderEventText(
  event: GameEvent,
  definitions: Record<string, SerializedCardDefinition>,
  deck1Name: string,
  deck2Name: string
): string {
  const p = (id: string) => playerLabel(id, deck1Name, deck2Name);
  const c = (instanceId: string) => cardName(instanceId, definitions);

  switch (event.type) {
    case 'GAME_STARTED':
      return `Game started (seed: ${event.seed})`;

    case 'TURN_STARTED':
      return `--- Turn ${event.turnNumber} (${p(event.player)}) ---`;

    case 'TURN_ENDED':
      return `${p(event.player)} ended their turn`;

    case 'CARD_DRAWN':
      return `${p(event.player)} drew a card`;

    case 'BASIC_PLAYED': {
      const zone = event.zone === 'active' ? 'as Active' : 'to the bench';
      return `${p(event.player)} played ${c(event.cardInstanceId)} ${zone}`;
    }

    case 'POKEMON_EVOLVED': {
      const from = c(event.pokemonInstanceId);
      const into = c(event.evolutionInstanceId);
      return `${p(event.player)} evolved ${from} into ${into}`;
    }

    case 'ENERGY_ATTACHED': {
      const energyName = c(event.energyInstanceId);
      const target = c(event.targetInstanceId);
      return `${p(event.player)} attached ${energyName} to ${target}`;
    }

    case 'TOOL_ATTACHED': {
      const toolName = c(event.toolInstanceId);
      const target = c(event.targetInstanceId);
      return `${p(event.player)} attached ${toolName} to ${target}`;
    }

    case 'TRAINER_PLAYED':
      return `${p(event.player)} played ${c(event.cardInstanceId)}`;

    case 'ABILITY_USED':
      return `${p(event.player)}'s ${c(event.pokemonInstanceId)} used ability: ${event.abilityName}`;

    case 'ATTACK_DECLARED':
      return `${c(event.attackerInstanceId)} used ${event.attackName}`;

    case 'DAMAGE_DEALT':
      return `${c(event.targetInstanceId)} took ${event.amount} damage`;

    case 'DAMAGE_COUNTERS_PLACED':
      return `${event.counters} damage counter${event.counters !== 1 ? 's' : ''} placed on ${c(event.targetInstanceId)}`;

    case 'DAMAGE_HEALED':
      return `${c(event.targetInstanceId)} healed ${event.amount} damage`;

    case 'POKEMON_KNOCKED_OUT': {
      const name = c(event.pokemonInstanceId);
      const prizes = event.prizesAwarded;
      const opponent = event.player === 'player1' ? deck2Name : deck1Name;
      return `${name} was knocked out! ${opponent} takes ${prizes} prize${prizes !== 1 ? 's' : ''}`;
    }

    case 'PRIZE_TAKEN': {
      return `${p(event.player)} took a prize card`;
    }

    case 'SPECIAL_CONDITION_APPLIED':
      return `${c(event.pokemonInstanceId)} is now ${event.condition}`;

    case 'SPECIAL_CONDITION_REMOVED':
      return `${c(event.pokemonInstanceId)} recovered from ${event.condition}`;

    case 'RETREATED': {
      const oldActive = c(event.oldActiveId);
      const newActive = c(event.newActiveId);
      return `${p(event.player)} retreated ${oldActive}, sent in ${newActive}`;
    }

    case 'STADIUM_PLAYED':
      return `${p(event.player)} played ${c(event.cardInstanceId)}`;

    case 'STADIUM_DISCARDED':
      return `Stadium ${c(event.cardInstanceId)} was discarded`;

    case 'CARD_DISCARDED':
      return `${p(event.player)} discarded ${c(event.cardInstanceId)}`;

    case 'DECK_SHUFFLED':
      return `${p(event.player)} shuffled their deck`;

    case 'CARD_SEARCHED':
      return `${p(event.player)} searched their ${event.from} for ${c(event.cardInstanceId)}`;

    case 'CARD_MOVED': {
      const name = c(event.cardInstanceId);
      return `${name} moved from ${event.from} to ${event.to}`;
    }

    case 'MULLIGAN':
      return `${p(event.player)} took ${event.mulliganCount} mulligan${event.mulliganCount !== 1 ? 's' : ''}`;

    case 'COIN_FLIPPED':
      return `Coin flipped: ${event.result} (${event.reason})`;

    case 'CHECKUP_COMPLETED':
      return 'Between-turn checkup completed';

    case 'GAME_OVER': {
      if (event.winner === 'draw') return 'Game Over: Draw!';
      const winner = event.winner === 'player1' ? deck1Name : deck2Name;
      const reasons: Record<string, string> = {
        all_prizes_taken: 'by taking all prizes',
        no_pokemon_in_play: 'opponent has no Pokemon',
        deck_out: 'opponent decked out',
        tiebreaker: 'by tiebreaker'
      };
      return `Game Over! ${winner} wins ${reasons[event.reason] ?? event.reason}`;
    }

    default:
      return `[Unknown event]`;
  }
}
