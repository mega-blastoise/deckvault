import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import {
  registerEventHook,
  fireEventHooks,
  clearEventHooks
} from '../../lib/core/events';
import type { EventHook, EventHookPayload } from '../../lib/core/events';
import { createRngState } from '../../lib/rng';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const PAWNIARD_ID = 'svp-111';
const LIGHTNING_ENERGY_ID = 'base1-100';
const FIRE_ENERGY_ID = 'base1-98';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

beforeEach(() => {
  clearEventHooks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeInPlayPokemon(instanceId: string, overrides: Partial<InPlayPokemon> = {}): InPlayPokemon {
  return {
    instanceId,
    evolutionStack: [instanceId],
    attachedEnergy: [],
    attachedTools: [],
    damageCounters: 0,
    specialConditions: [],
    turnPlayed: 1,
    turnEvolved: null,
    isNewThisTurn: false,
    ...overrides
  };
}

function makeCardInstance(instanceId: string, definitionId: string, owner: PlayerId): CardInstance {
  return { instanceId, definitionId, owner };
}

function makeBaseState(overrides: Partial<GameState> = {}): GameState {
  const cardRegistry = new Map<string, CardInstance>();
  const definitionRegistry = new Map<string, CardDefinition>(pool);

  const p1Active = makeInPlayPokemon('p1-mareep-0');
  const p2Active = makeInPlayPokemon('p2-pawniard-0');

  cardRegistry.set('p1-mareep-0', makeCardInstance('p1-mareep-0', MAREEP_ID, 'player1'));
  cardRegistry.set('p2-pawniard-0', makeCardInstance('p2-pawniard-0', PAWNIARD_ID, 'player2'));

  for (let i = 0; i < 5; i++) {
    cardRegistry.set(`p1-energy-${i}`, makeCardInstance(`p1-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-energy-${i}`, makeCardInstance(`p2-energy-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: ['p1-deck-0', 'p1-deck-1', 'p1-deck-2'],
    hand: [],
    prizes: ['p1-prize-0', 'p1-prize-1', 'p1-prize-2', 'p1-prize-3', 'p1-prize-4', 'p1-prize-5'],
    active: { ...p1Active, attachedEnergy: ['p1-energy-0', 'p1-energy-1'] },
    bench: [],
    discard: [],
    lostZone: [],
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  };

  const player2: PlayerState = {
    id: 'player2',
    deck: ['p2-deck-0', 'p2-deck-1', 'p2-deck-2'],
    hand: [],
    prizes: ['p2-prize-0', 'p2-prize-1', 'p2-prize-2', 'p2-prize-3', 'p2-prize-4', 'p2-prize-5'],
    active: p2Active,
    bench: [],
    discard: [],
    lostZone: [],
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  };

  for (let i = 0; i < 3; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }
  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  return {
    players: { player1, player2 },
    activePlayer: 'player1',
    startingPlayer: 'player1',
    turnNumber: 2,
    phase: 'attack',
    stadium: null,
    cardRegistry,
    definitionRegistry,
    eventLog: [],
    winner: null,
    rngState: createRngState(42),
    turnFlags: {
      attackUsed: true,
      isStartingPlayerFirstTurn: false,
      turnEndedByEffect: false,
      abilitiesUsedThisTurn: [],
      mulliganCounts: { player1: 0, player2: 0 },
      extraDrawsRemaining: { player1: 0, player2: 0 },
      setupBenchSelected: { player1: false, player2: false }
    },
    temporalEffects: [],
    ...overrides
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Event Hook System', () => {
  const energyPayload: EventHookPayload = {
    type: 'energy_attached',
    data: {
      player: 'player1',
      energyInstanceId: 'p1-energy-0',
      targetInstanceId: 'p1-mareep-0'
    }
  };

  it('no hooks registered returns state unchanged', () => {
    const state = makeBaseState();
    const result = fireEventHooks(state, energyPayload);
    expect(result.newState).toBe(state);
    expect(result.prevented).toBe(false);
  });

  it('hook returning handled: false leaves state unchanged', () => {
    const state = makeBaseState();
    const hook: EventHook = {
      id: 'noop-hook',
      hookType: 'energy_attached',
      handler: () => ({ handled: false })
    };
    registerEventHook(hook);
    const result = fireEventHooks(state, energyPayload);
    expect(result.newState).toBe(state);
    expect(result.prevented).toBe(false);
  });

  it('hook returning handled: true applies new state', () => {
    const state = makeBaseState();
    const hook: EventHook = {
      id: 'modify-turn',
      hookType: 'energy_attached',
      handler: (s) => ({
        handled: true,
        newState: { ...s, turnNumber: s.turnNumber + 1 }
      })
    };
    registerEventHook(hook);
    const result = fireEventHooks(state, energyPayload);
    expect(result.newState.turnNumber).toBe(state.turnNumber + 1);
    expect(result.prevented).toBe(false);
  });

  it('multiple hooks fire in registration order', () => {
    const state = makeBaseState();
    const hookA: EventHook = {
      id: 'inc-a',
      hookType: 'energy_attached',
      handler: (s) => ({
        handled: true,
        newState: { ...s, turnNumber: s.turnNumber + 1 }
      })
    };
    const hookB: EventHook = {
      id: 'inc-b',
      hookType: 'energy_attached',
      handler: (s) => ({
        handled: true,
        newState: { ...s, turnNumber: s.turnNumber + 1 }
      })
    };
    registerEventHook(hookA);
    registerEventHook(hookB);
    const result = fireEventHooks(state, energyPayload);
    expect(result.newState.turnNumber).toBe(state.turnNumber + 2);
    expect(result.prevented).toBe(false);
  });

  it('prevention short-circuits remaining hooks', () => {
    const state = makeBaseState();
    const hookA: EventHook = {
      id: 'prevent',
      hookType: 'energy_attached',
      handler: (s) => ({
        handled: true,
        newState: { ...s, turnNumber: s.turnNumber + 10 },
        prevented: true
      })
    };
    const hookB: EventHook = {
      id: 'should-not-run',
      hookType: 'energy_attached',
      handler: (s) => ({
        handled: true,
        newState: { ...s, turnNumber: s.turnNumber + 100 }
      })
    };
    registerEventHook(hookA);
    registerEventHook(hookB);
    const result = fireEventHooks(state, energyPayload);
    expect(result.newState.turnNumber).toBe(state.turnNumber + 10);
    expect(result.prevented).toBe(true);
  });

  it('hook with wrong hookType is not triggered', () => {
    const state = makeBaseState();
    let called = false;
    const hook: EventHook = {
      id: 'energy-only',
      hookType: 'energy_attached',
      handler: (s) => {
        called = true;
        return { handled: true, newState: { ...s, turnNumber: 999 } };
      }
    };
    registerEventHook(hook);
    const benchPayload: EventHookPayload = {
      type: 'pokemon_benched',
      data: { player: 'player1', pokemonInstanceId: 'p1-mareep-0' }
    };
    const result = fireEventHooks(state, benchPayload);
    expect(called).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.prevented).toBe(false);
  });
});
