import { describe, it, expect } from 'bun:test';
import type { GameEvent } from '@pokemon/engine/browser';
import type { CapturedReplay } from '../../../../workers/simulation.worker';
import type { SerializedCardDefinition } from '../types';
import {
  buildInitialState,
  applyEvent,
  buildStateAtEvent,
  buildStateCache,
  computeKeyMoments,
  findNextTurnEventIndex,
  findPrevTurnEventIndex
} from '../replay-state';

const DEFS: Record<string, SerializedCardDefinition> = {
  'sv3-125': { id: 'sv3-125', name: 'Charizard ex', cardType: 'Pokemon', hp: 330, stage: 'Stage2' },
  'sv1-001': { id: 'sv1-001', name: 'Charmander', cardType: 'Pokemon', hp: 70, stage: 'Basic' },
  'sv1-002': { id: 'sv1-002', name: 'Charmeleon', cardType: 'Pokemon', hp: 90, stage: 'Stage1' },
  'en-fire': { id: 'en-fire', name: 'Fire Energy', cardType: 'Energy', provides: ['Fire'] },
  'tr-turo': { id: 'tr-turo', name: "Professor Turo's Scenario", cardType: 'Trainer' },
  'tool-mmt': { id: 'tool-mmt', name: 'Magma Basin', cardType: 'Trainer' }
};

function makeReplay(events: ReadonlyArray<GameEvent>): CapturedReplay {
  return {
    gameIndex: 0,
    seed: 42,
    eventLog: events,
    winner: 'player1',
    winReason: 'all_prizes_taken',
    totalTurns: 5
  };
}

describe('buildInitialState', () => {
  it('starts with 60 deck, 0 hand, 6 prizes for each player', () => {
    const state = buildInitialState();
    expect(state.player1.deckCount).toBe(60);
    expect(state.player1.handCount).toBe(0);
    expect(state.player1.prizesRemaining).toBe(6);
    expect(state.player2.deckCount).toBe(60);
    expect(state.player2.handCount).toBe(0);
    expect(state.player2.prizesRemaining).toBe(6);
  });

  it('starts with no active Pokemon', () => {
    const state = buildInitialState();
    expect(state.player1.active).toBeNull();
    expect(state.player2.active).toBeNull();
  });

  it('starts with empty bench', () => {
    const state = buildInitialState();
    expect(state.player1.bench).toHaveLength(0);
    expect(state.player2.bench).toHaveLength(0);
  });

  it('starts with no stadium', () => {
    expect(buildInitialState().stadium).toBeNull();
  });
});

describe('applyEvent — CARD_DRAWN', () => {
  it('increments handCount and decrements deckCount', () => {
    const state = buildInitialState();
    const next = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' }, DEFS);
    expect(next.player1.handCount).toBe(1);
    expect(next.player1.deckCount).toBe(59);
    expect(next.player2.handCount).toBe(0);
  });

  it('does not go below 0 deck', () => {
    let state = buildInitialState();
    for (let i = 0; i < 65; i++) {
      state = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: `sv1-001_${i}` }, DEFS);
    }
    expect(state.player1.deckCount).toBe(0);
  });
});

describe('applyEvent — BASIC_PLAYED', () => {
  it('places Pokemon on bench and decrements hand', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' }, DEFS);
    const next = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'bench' }, DEFS);
    expect(next.player1.bench).toHaveLength(1);
    expect(next.player1.bench[0]?.name).toBe('Charmander');
    expect(next.player1.handCount).toBe(0);
  });

  it('places Pokemon as active', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' }, DEFS);
    const next = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'active' }, DEFS);
    expect(next.player1.active?.name).toBe('Charmander');
    expect(next.player1.active?.hp).toBe(70);
  });
});

describe('applyEvent — DAMAGE_DEALT', () => {
  it('adds damage counters and reduces currentHp', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    const next = applyEvent(state, { type: 'DAMAGE_DEALT', targetInstanceId: 'sv3-125_0', amount: 180, source: 'attack' }, DEFS);
    expect(next.player1.active?.damageCounters).toBe(18);
    expect(next.player1.active?.currentHp).toBe(150);
  });

  it('does not go below 0 HP', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    const next = applyEvent(state, { type: 'DAMAGE_DEALT', targetInstanceId: 'sv3-125_0', amount: 9999, source: 'attack' }, DEFS);
    expect(next.player1.active?.currentHp).toBe(0);
  });
});

describe('applyEvent — DAMAGE_HEALED', () => {
  it('reduces damage counters and increases currentHp', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    state = applyEvent(state, { type: 'DAMAGE_DEALT', targetInstanceId: 'sv3-125_0', amount: 180, source: 'attack' }, state.player1.active ? DEFS : DEFS);
    const next = applyEvent(state, { type: 'DAMAGE_HEALED', targetInstanceId: 'sv3-125_0', amount: 60 }, DEFS);
    expect(next.player1.active?.damageCounters).toBe(12);
    expect(next.player1.active?.currentHp).toBe(210);
  });
});

describe('applyEvent — POKEMON_KNOCKED_OUT', () => {
  it('removes active Pokemon and decrements opponent prizes', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    const next = applyEvent(state, { type: 'POKEMON_KNOCKED_OUT', player: 'player1', pokemonInstanceId: 'sv3-125_0', prizesAwarded: 2 }, DEFS);
    expect(next.player1.active).toBeNull();
    expect(next.player2.prizesRemaining).toBe(4);
  });

  it('removes bench Pokemon', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'bench' }, DEFS);
    const next = applyEvent(state, { type: 'POKEMON_KNOCKED_OUT', player: 'player1', pokemonInstanceId: 'sv1-001_0', prizesAwarded: 1 }, DEFS);
    expect(next.player1.bench).toHaveLength(0);
    expect(next.player2.prizesRemaining).toBe(5);
  });
});

describe('applyEvent — ENERGY_ATTACHED', () => {
  it('adds energy to target and decrements hand', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'en-fire_0' }, DEFS);
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    const next = applyEvent(state, { type: 'ENERGY_ATTACHED', player: 'player1', energyInstanceId: 'en-fire_0', targetInstanceId: 'sv3-125_0' }, DEFS);
    expect(next.player1.active?.attachedEnergy).toHaveLength(1);
    expect(next.player1.active?.attachedEnergy[0]?.type).toBe('Fire');
  });
});

describe('applyEvent — SPECIAL_CONDITION_APPLIED / REMOVED', () => {
  it('adds and removes special conditions', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    state = applyEvent(state, { type: 'SPECIAL_CONDITION_APPLIED', pokemonInstanceId: 'sv3-125_0', condition: 'Burned' }, DEFS);
    expect(state.player1.active?.specialConditions).toContain('Burned');
    const next = applyEvent(state, { type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: 'sv3-125_0', condition: 'Burned' }, DEFS);
    expect(next.player1.active?.specialConditions).not.toContain('Burned');
  });
});

describe('applyEvent — TURN_STARTED', () => {
  it('updates turnNumber and activePlayer', () => {
    const state = buildInitialState();
    const next = applyEvent(state, { type: 'TURN_STARTED', player: 'player2', turnNumber: 3 }, DEFS);
    expect(next.turnNumber).toBe(3);
    expect(next.activePlayer).toBe('player2');
  });
});

describe('applyEvent — RETREATED', () => {
  it('swaps active and bench Pokemon, clears conditions on new active', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv1-001_0', zone: 'bench' }, DEFS);
    state = applyEvent(state, { type: 'SPECIAL_CONDITION_APPLIED', pokemonInstanceId: 'sv1-001_0', condition: 'Burned' }, DEFS);
    const next = applyEvent(state, { type: 'RETREATED', player: 'player1', oldActiveId: 'sv3-125_0', newActiveId: 'sv1-001_0' }, DEFS);
    expect(next.player1.active?.instanceId).toBe('sv1-001_0');
    expect(next.player1.active?.specialConditions).toHaveLength(0);
    expect(next.player1.bench.some((s) => s.instanceId === 'sv3-125_0')).toBe(true);
  });
});

describe('applyEvent — STADIUM_PLAYED / DISCARDED', () => {
  it('sets and clears stadium', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'tool-mmt_0' }, DEFS);
    state = applyEvent(state, { type: 'STADIUM_PLAYED', player: 'player1', cardInstanceId: 'tool-mmt_0' }, DEFS);
    expect(state.stadium?.name).toBe('Magma Basin');
    const next = applyEvent(state, { type: 'STADIUM_DISCARDED', cardInstanceId: 'tool-mmt_0' }, DEFS);
    expect(next.stadium).toBeNull();
  });
});

describe('buildStateAtEvent', () => {
  it('returns initial state for eventIndex -1', () => {
    const replay = makeReplay([{ type: 'TURN_STARTED', player: 'player1', turnNumber: 1 }]);
    const state = buildStateAtEvent(replay, -1, DEFS);
    expect(state.currentEventIndex).toBe(-1);
    expect(state.turnNumber).toBe(0);
  });

  it('applies events up to the given index', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_1' },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_2' }
    ];
    const replay = makeReplay(events);
    const state = buildStateAtEvent(replay, 1, DEFS);
    expect(state.player1.handCount).toBe(2);
    expect(state.currentEventIndex).toBe(1);
  });

  it('clamps to last event when index exceeds log length', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 }
    ];
    const replay = makeReplay(events);
    const state = buildStateAtEvent(replay, 999, DEFS);
    expect(state.currentEventIndex).toBe(0);
  });
});

describe('buildStateCache', () => {
  it('caches state at turn boundaries', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' },
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_1' },
      { type: 'TURN_STARTED', player: 'player2', turnNumber: 2 }
    ];
    const replay = makeReplay(events);
    const cache = buildStateCache(replay, DEFS);
    expect(cache.turnStates.has(1)).toBe(true);
    expect(cache.turnStates.has(2)).toBe(true);
  });
});

describe('computeKeyMoments', () => {
  it('finds first KO, prize takens, and game over', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'POKEMON_KNOCKED_OUT', player: 'player1', pokemonInstanceId: 'sv1-001_0', prizesAwarded: 1 },
      { type: 'PRIZE_TAKEN', player: 'player2', cardInstanceId: 'sv1-001_0' },
      { type: 'PRIZE_TAKEN', player: 'player2', cardInstanceId: 'sv1-001_1' },
      { type: 'GAME_OVER', winner: 'player2', reason: 'all_prizes_taken' }
    ];
    const moments = computeKeyMoments(events);
    expect(moments.some((m) => m.type === 'ko')).toBe(true);
    expect(moments.filter((m) => m.type === 'prize')).toHaveLength(2);
    expect(moments.some((m) => m.type === 'game_over')).toBe(true);
  });

  it('only records first KO', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'POKEMON_KNOCKED_OUT', player: 'player1', pokemonInstanceId: 'sv1-001_0', prizesAwarded: 1 },
      { type: 'POKEMON_KNOCKED_OUT', player: 'player1', pokemonInstanceId: 'sv1-001_1', prizesAwarded: 1 }
    ];
    const moments = computeKeyMoments(events);
    expect(moments.filter((m) => m.type === 'ko')).toHaveLength(1);
    expect(moments[0]?.eventIndex).toBe(0);
  });
});

describe('findNextTurnEventIndex', () => {
  it('finds the next TURN_STARTED', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' },
      { type: 'TURN_STARTED', player: 'player2', turnNumber: 2 },
      { type: 'CARD_DRAWN', player: 'player2', cardInstanceId: 'sv1-001_0' }
    ];
    expect(findNextTurnEventIndex(events, 0)).toBe(1);
  });

  it('returns last event index when no next turn exists', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' }
    ];
    expect(findNextTurnEventIndex(events, 0)).toBe(0);
  });
});

describe('findPrevTurnEventIndex', () => {
  it('finds the previous TURN_STARTED', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_1' }
    ];
    expect(findPrevTurnEventIndex(events, 2)).toBe(0);
  });

  it('returns 0 when no previous turn exists', () => {
    const events: ReadonlyArray<GameEvent> = [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'sv1-001_0' }
    ];
    expect(findPrevTurnEventIndex(events, 0)).toBe(0);
  });
});

describe('instanceId parsing', () => {
  it('correctly derives definitionId from sv3-125_0', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_0', zone: 'active' }, DEFS);
    expect(state.player1.active?.name).toBe('Charizard ex');
    expect(state.player1.active?.cardId).toBe('sv3-125');
  });

  it('correctly derives definitionId from multi-segment id sv3-125_12', () => {
    let state = buildInitialState();
    state = applyEvent(state, { type: 'BASIC_PLAYED', player: 'player1', cardInstanceId: 'sv3-125_12', zone: 'active' }, DEFS);
    expect(state.player1.active?.cardId).toBe('sv3-125');
  });
});
