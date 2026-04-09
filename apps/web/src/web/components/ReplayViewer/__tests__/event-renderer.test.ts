import { describe, it, expect } from 'bun:test';
import type { GameEvent } from '@pokemon/engine/browser';
import type { SerializedCardDefinition } from '../types';
import { renderEventText } from '../EventLogPanel/EventRenderer';

const DEFS: Record<string, SerializedCardDefinition> = {
  'sv3-125': { id: 'sv3-125', name: 'Charizard ex', cardType: 'Pokemon', hp: 330, stage: 'Stage2' },
  'sv1-001': { id: 'sv1-001', name: 'Charmander', cardType: 'Pokemon', hp: 70, stage: 'Basic' },
  'en-fire': { id: 'en-fire', name: 'Fire Energy', cardType: 'Energy', provides: ['Fire'] },
  'tr-turo': { id: 'tr-turo', name: "Professor Turo's Scenario", cardType: 'Trainer' },
  'tr-iono': { id: 'tr-iono', name: "Iono", cardType: 'Trainer' },
  'tool-mmt': { id: 'tool-mmt', name: 'Magma Basin', cardType: 'Trainer' }
};

const D1 = 'Charizard Deck';
const D2 = 'Dragapult Deck';

function render(event: GameEvent): string {
  return renderEventText(event, DEFS, D1, D2);
}

describe('renderEventText — basic events', () => {
  it('GAME_STARTED includes seed', () => {
    const text = render({ type: 'GAME_STARTED', seed: 12345 });
    expect(text).toContain('12345');
  });

  it('TURN_STARTED includes turn number and player name', () => {
    const text = render({ type: 'TURN_STARTED', player: 'player1', turnNumber: 3 });
    expect(text).toContain('Turn 3');
    expect(text).toContain(D1);
  });

  it('TURN_STARTED player2 uses deck2 name', () => {
    const text = render({ type: 'TURN_STARTED', player: 'player2', turnNumber: 5 });
    expect(text).toContain(D2);
  });

  it('TURN_ENDED includes player name', () => {
    const text = render({ type: 'TURN_ENDED', player: 'player1' });
    expect(text).toContain(D1);
  });

  it('CARD_DRAWN references player name', () => {
    const text = render({ type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' });
    expect(text).toContain(D1);
    expect(text.toLowerCase()).toContain('drew');
  });
});

describe('renderEventText — Pokemon events', () => {
  it('BASIC_PLAYED bench includes card name and "bench"', () => {
    const text = render({ type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'bench' });
    expect(text).toContain('Charmander');
    expect(text.toLowerCase()).toContain('bench');
  });

  it('BASIC_PLAYED active includes "Active"', () => {
    const text = render({ type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'active' });
    expect(text.toLowerCase()).toContain('active');
  });

  it('POKEMON_EVOLVED includes from and into names', () => {
    const text = render({
      type: 'POKEMON_EVOLVED',
      player: 'player1',
      pokemonInstanceId: 'sv1-001_0',
      evolutionInstanceId: 'sv3-125_0'
    });
    expect(text).toContain('Charmander');
    expect(text).toContain('Charizard ex');
  });

  it('RETREATED includes old and new active names', () => {
    const text = render({
      type: 'RETREATED',
      player: 'player2',
      oldActiveId: 'sv3-125_0',
      newActiveId: 'sv1-001_0'
    });
    expect(text).toContain('Charizard ex');
    expect(text).toContain('Charmander');
    expect(text).toContain(D2);
  });

  it('POKEMON_KNOCKED_OUT includes Pokemon name and prizes', () => {
    const text = render({
      type: 'POKEMON_KNOCKED_OUT',
      player: 'player1',
      pokemonInstanceId: 'sv3-125_0',
      prizesAwarded: 2
    });
    expect(text).toContain('Charizard ex');
    expect(text).toContain('2');
    expect(text.toLowerCase()).toContain('prize');
  });
});

describe('renderEventText — Trainer events', () => {
  it('TRAINER_PLAYED includes card name', () => {
    const text = render({ type: 'TRAINER_PLAYED', player: 'player1', cardInstanceId: 'tr-turo_0' });
    expect(text).toContain("Professor Turo's Scenario");
    expect(text).toContain(D1);
  });

  it('STADIUM_PLAYED includes stadium name', () => {
    const text = render({ type: 'STADIUM_PLAYED', player: 'player2', cardInstanceId: 'tool-mmt_0' });
    expect(text).toContain('Magma Basin');
  });

  it('STADIUM_DISCARDED mentions stadium', () => {
    const text = render({ type: 'STADIUM_DISCARDED', cardInstanceId: 'tool-mmt_0' });
    expect(text).toContain('Magma Basin');
  });
});

describe('renderEventText — damage events', () => {
  it('ATTACK_DECLARED includes attack name', () => {
    const text = render({
      type: 'ATTACK_DECLARED',
      player: 'player1',
      attackName: 'Burning Dark',
      attackerInstanceId: 'sv3-125_0'
    });
    expect(text).toContain('Burning Dark');
    expect(text).toContain('Charizard ex');
  });

  it('DAMAGE_DEALT includes amount', () => {
    const text = render({ type: 'DAMAGE_DEALT', targetInstanceId: 'sv3-125_0', amount: 180, source: 'attack' });
    expect(text).toContain('180');
    expect(text).toContain('Charizard ex');
  });

  it('DAMAGE_COUNTERS_PLACED includes counter count', () => {
    const text = render({ type: 'DAMAGE_COUNTERS_PLACED', targetInstanceId: 'sv3-125_0', counters: 3, source: 'poison' });
    expect(text).toContain('3');
  });

  it('DAMAGE_HEALED includes amount', () => {
    const text = render({ type: 'DAMAGE_HEALED', targetInstanceId: 'sv3-125_0', amount: 60 });
    expect(text).toContain('60');
  });
});

describe('renderEventText — condition events', () => {
  it('SPECIAL_CONDITION_APPLIED includes condition', () => {
    const text = render({ type: 'SPECIAL_CONDITION_APPLIED', pokemonInstanceId: 'sv3-125_0', condition: 'Burned' });
    expect(text).toContain('Burned');
    expect(text).toContain('Charizard ex');
  });

  it('SPECIAL_CONDITION_REMOVED includes condition', () => {
    const text = render({ type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: 'sv3-125_0', condition: 'Burned' });
    expect(text).toContain('Burned');
  });
});

describe('renderEventText — other events', () => {
  it('PRIZE_TAKEN references player', () => {
    const text = render({ type: 'PRIZE_TAKEN', player: 'player2', cardInstanceId: 'sv1-001_0' });
    expect(text).toContain(D2);
    expect(text.toLowerCase()).toContain('prize');
  });

  it('CARD_SEARCHED references source zone', () => {
    const text = render({ type: 'CARD_SEARCHED', player: 'player1', cardInstanceId: 'sv1-001_0', from: 'deck' });
    expect(text.toLowerCase()).toContain('deck');
    expect(text).toContain('Charmander');
  });

  it('GAME_OVER player1 win includes deck name', () => {
    const text = render({ type: 'GAME_OVER', winner: 'player1', reason: 'all_prizes_taken' });
    expect(text).toContain(D1);
    expect(text.toLowerCase()).toContain('prize');
  });

  it('GAME_OVER draw mentions Draw', () => {
    const text = render({ type: 'GAME_OVER', winner: 'draw', reason: 'tiebreaker' });
    expect(text.toLowerCase()).toContain('draw');
  });

  it('MULLIGAN includes count', () => {
    const text = render({ type: 'MULLIGAN', player: 'player1', mulliganCount: 2 });
    expect(text).toContain('2');
    expect(text.toLowerCase()).toContain('mulligan');
  });

  it('ENERGY_ATTACHED includes energy and target name', () => {
    const text = render({
      type: 'ENERGY_ATTACHED',
      player: 'player1',
      energyInstanceId: 'en-fire_0',
      targetInstanceId: 'sv3-125_0'
    });
    expect(text).toContain('Fire Energy');
    expect(text).toContain('Charizard ex');
  });

  it('TOOL_ATTACHED includes tool name', () => {
    const text = render({
      type: 'TOOL_ATTACHED',
      player: 'player1',
      toolInstanceId: 'tool-mmt_0',
      targetInstanceId: 'sv3-125_0'
    });
    expect(text).toContain('Magma Basin');
  });
});
