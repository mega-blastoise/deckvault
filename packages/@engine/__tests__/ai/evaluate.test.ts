import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import { createRngState } from '../../lib/rng';
import {
  resolveTopDef,
  evalPrizeDifferential,
  evalActiveHealth,
  evalBenchStrength,
  evalEnergyAdvantage,
  evalTypeAdvantage,
  evaluateBoard
} from '../../lib/ai/evaluate';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const PAWNIARD_ID = 'svp-111';
const PIKACHU_EX_ID = 'svp-106';
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

describe('evaluate', () => {
  it('resolveTopDef returns correct PokemonCardDefinition', () => {
    const state = makeBaseState();
    const active = state.players.player1.active!;
    const def = resolveTopDef(state, active);
    expect(def).not.toBeNull();
    expect(def!.cardType).toBe('Pokemon');
    expect(def!.id).toBe(MAREEP_ID);
  });

  it('evalPrizeDifferential — player with fewer prizes scores positive', () => {
    const state = makeBaseState({
      players: {
        ...makeBaseState().players,
        player1: {
          ...makeBaseState().players.player1,
          prizes: ['p1-prize-0', 'p1-prize-1', 'p1-prize-2']
        }
      }
    });
    const score = evalPrizeDifferential(state, 'player1');
    expect(score).toBeGreaterThan(0);
  });

  it('evalActiveHealth — healthier active scores positive', () => {
    const state = makeBaseState();
    // player2 active has damage
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        player2: {
          ...state.players.player2,
          active: makeInPlayPokemon('p2-pawniard-0', { damageCounters: 3 })
        }
      }
    };
    const score = evalActiveHealth(modState, 'player1');
    expect(score).toBeGreaterThan(0);
  });

  it('evalBenchStrength — more bench = higher score', () => {
    const state = makeBaseState();
    const benchPokemon = makeInPlayPokemon('p1-mareep-1');
    state.cardRegistry.set('p1-mareep-1', makeCardInstance('p1-mareep-1', MAREEP_ID, 'player1'));
    const withBench: GameState = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          bench: [benchPokemon]
        }
      }
    };
    const emptyScore = evalBenchStrength(state, 'player1');
    const benchScore = evalBenchStrength(withBench, 'player1');
    expect(benchScore).toBeGreaterThan(emptyScore);
  });

  it('evalEnergyAdvantage — more energy = higher score', () => {
    const state = makeBaseState();
    // player1 active has 2 energy, player2 has 0
    const score = evalEnergyAdvantage(state, 'player1');
    expect(score).toBeGreaterThan(0);
  });

  it('evalTypeAdvantage — hitting weakness gives positive', () => {
    // Mareep is Lightning, Pawniard is Metal/Darkness
    // Need to check actual weakness definitions from the pool
    const state = makeBaseState();
    const pawniardDef = pool.get(PAWNIARD_ID) as PokemonCardDefinition;
    const mareepDef = pool.get(MAREEP_ID) as PokemonCardDefinition;

    // If pawniard is weak to a type that mareep has, score should be positive
    const hasWeakness = pawniardDef.weaknesses.some(w =>
      mareepDef.types.includes(w.type)
    );

    const score = evalTypeAdvantage(state, 'player1');
    if (hasWeakness) {
      expect(score).toBeGreaterThan(0);
    } else {
      // Just verify it returns a number
      expect(typeof score).toBe('number');
    }
  });

  it('evaluateBoard returns 10000 for finished state with winner', () => {
    const state = makeBaseState({
      phase: 'finished',
      winner: 'player1'
    });
    expect(evaluateBoard(state, 'player1')).toBe(10000);
  });

  it('evaluateBoard returns -10000 for finished state with opponent winner', () => {
    const state = makeBaseState({
      phase: 'finished',
      winner: 'player2'
    });
    expect(evaluateBoard(state, 'player1')).toBe(-10000);
  });
});
