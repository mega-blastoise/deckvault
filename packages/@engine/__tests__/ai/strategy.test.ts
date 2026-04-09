import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { PlayerAction } from '../../lib/types/action';
import { createRngState } from '../../lib/rng';
import { GreedyStrategy, RandomStrategy, handleSetupAction } from '../../lib/ai/strategy';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const PAWNIARD_ID = 'svp-111';
const LIGHTNING_ENERGY_ID = 'base1-100';
const FIRE_ENERGY_ID = 'base1-98';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

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
    phase: 'main',
    stadium: null,
    cardRegistry,
    definitionRegistry,
    eventLog: [],
    winner: null,
    rngState: createRngState(42),
    turnFlags: {
      attackUsed: false,
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

describe('strategy', () => {
  it('GreedyStrategy prefers EVOLVE over PASS', () => {
    const state = makeBaseState();
    const greedy = new GreedyStrategy();
    const actions: PlayerAction[] = [
      { type: 'PASS' },
      { type: 'EVOLVE_POKEMON', cardInstanceId: 'p1-flaaffy-0', targetInstanceId: 'p1-mareep-0' }
    ];
    const chosen = greedy.chooseAction(state, actions, 'player1');
    expect(chosen.type).toBe('EVOLVE_POKEMON');
  });

  it('RandomStrategy never returns PASS when other actions exist', () => {
    for (let seed = 0; seed < 10; seed++) {
      const state = makeBaseState({ rngState: createRngState(seed) });
      const random = new RandomStrategy();
      const actions: PlayerAction[] = [
        { type: 'PASS' },
        { type: 'PLAY_BASIC_TO_BENCH', cardInstanceId: 'p1-mareep-1' },
        { type: 'ATTACK', attackIndex: 0 }
      ];
      const chosen = random.chooseAction(state, actions, 'player1');
      expect(chosen.type).not.toBe('PASS');
    }
  });

  it('handleSetupAction returns COIN_FLIP_CHOICE with first', () => {
    const state = makeBaseState({ phase: 'setup' });
    const actions: PlayerAction[] = [
      { type: 'COIN_FLIP_CHOICE', choice: 'first' },
      { type: 'COIN_FLIP_CHOICE', choice: 'second' }
    ];
    const chosen = handleSetupAction(state, actions, 'player1');
    expect(chosen.type).toBe('COIN_FLIP_CHOICE');
    if (chosen.type === 'COIN_FLIP_CHOICE') {
      expect(chosen.choice).toBe('first');
    }
  });

  it('handleSetupAction returns MULLIGAN_REDRAW when available', () => {
    const state = makeBaseState({ phase: 'setup' });
    const actions: PlayerAction[] = [
      { type: 'MULLIGAN_REDRAW' },
      { type: 'PASS' }
    ];
    const chosen = handleSetupAction(state, actions, 'player1');
    expect(chosen.type).toBe('MULLIGAN_REDRAW');
  });
});
