import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { TemporalEffect } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import { canUseAbility } from '../../lib/core/abilities';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const PAWNIARD_ID = 'svp-111';
const LIGHTNING_ENERGY_ID = 'base1-100';
const FIRE_ENERGY_ID = 'base1-98';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

const COLORLESS_WITH_ABILITY: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-colorless-ability', name: 'Test Colorless',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Colorless'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Test Ability', text: 'test', type: 'Ability', effectId: 'test-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

const FIRE_WITH_ABILITY: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-fire-ability', name: 'Test Fire',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Fire'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Fire Ability', text: 'test', type: 'Ability', effectId: 'test-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

const WATCHTOWER_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-watchtower', name: "Team Rocket's Watchtower",
  subtypes: ['Stadium'], rules: [], effectId: 'watchtower-effect'
};

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

  cardRegistry.set('p1-mareep-0', makeCardInstance('p1-mareep-0', MAREEP_ID, 'player1'));
  cardRegistry.set('p2-pawniard-0', makeCardInstance('p2-pawniard-0', PAWNIARD_ID, 'player2'));

  for (let i = 0; i < 5; i++) {
    cardRegistry.set(`p1-energy-${i}`, makeCardInstance(`p1-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-energy-${i}`, makeCardInstance(`p2-energy-${i}`, FIRE_ENERGY_ID, 'player2'));
  }
  for (let i = 0; i < 3; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }
  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: ['p1-deck-0', 'p1-deck-1', 'p1-deck-2'],
    hand: [],
    prizes: ['p1-prize-0', 'p1-prize-1', 'p1-prize-2', 'p1-prize-3', 'p1-prize-4', 'p1-prize-5'],
    active: makeInPlayPokemon('p1-mareep-0'),
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
    active: makeInPlayPokemon('p2-pawniard-0'),
    bench: [],
    discard: [],
    lostZone: [],
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  };

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
      mulliganCounts: { player1: 0, player2: 0 },
      extraDrawsRemaining: { player1: 0, player2: 0 },
      setupBenchSelected: { player1: false, player2: false }
    },
    temporalEffects: [],
    ...overrides
  };
}

describe('canUseAbility', () => {
  it('returns true with no suppressors', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const s: GameState = { ...state, cardRegistry: cardReg, definitionRegistry: defReg };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(true);
  });

  it('returns false for invalid ability index', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const s: GameState = { ...state, cardRegistry: cardReg, definitionRegistry: defReg };

    expect(canUseAbility(s, 'player1', pokemon, 1)).toBe(false);
  });

  it('Watchtower suppresses Colorless abilities', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-colorless-ability', COLORLESS_WITH_ABILITY);
    defReg.set('test-watchtower', WATCHTOWER_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-colorless', makeCardInstance('p1-colorless', 'test-colorless-ability', 'player1'));
    cardReg.set('stadium-wt', makeCardInstance('stadium-wt', 'test-watchtower', 'player1'));

    const pokemon = makeInPlayPokemon('p1-colorless');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      stadium: { cardInstanceId: 'stadium-wt', playedBy: 'player1' }
    };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(false);
  });

  it('Watchtower does not suppress non-Colorless abilities', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    defReg.set('test-watchtower', WATCHTOWER_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));
    cardReg.set('stadium-wt', makeCardInstance('stadium-wt', 'test-watchtower', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      stadium: { cardInstanceId: 'stadium-wt', playedBy: 'player1' }
    };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(true);
  });

  it('ability_lock temporal effect suppresses ability', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const lockEffect: TemporalEffect = {
      id: 'lock-1',
      type: 'ability_lock',
      sourceInstanceId: 'some-source',
      sourceType: 'attack',
      targetInstanceId: 'p1-fire',
      expiresOnTurn: null,
      expiresAt: 'end_of_turn',
      payload: {}
    };

    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      temporalEffects: [lockEffect]
    };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(false);
  });
});
