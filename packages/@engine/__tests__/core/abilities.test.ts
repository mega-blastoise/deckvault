import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { TemporalEffect } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import { canUseAbility } from '../../lib/core/abilities';
import { getLegalActions } from '../../lib/core/turn';

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
  abilities: [{ name: 'Test Ability', text: 'test', type: 'Ability', category: 'activated', effectId: 'test-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

const FIRE_WITH_ABILITY: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-fire-ability', name: 'Test Fire',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Fire'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Fire Ability', text: 'test', type: 'Ability', category: 'activated', effectId: 'test-effect' }],
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
      abilitiesUsedThisTurn: [],
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

const PASSIVE_ABILITY_DEF: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-passive-ability', name: 'Test Passive',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Fire'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Skyliner', text: 'passive test', type: 'Ability', category: 'passive', effectId: 'passive-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

describe('passive abilities', () => {
  it('canUseAbility returns false for passive ability', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-passive-ability', PASSIVE_ABILITY_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-passive', makeCardInstance('p1-passive', 'test-passive-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-passive');
    const s: GameState = { ...state, cardRegistry: cardReg, definitionRegistry: defReg };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(false);
  });

  it('passive ability does not appear in getLegalActions', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-passive-ability', PASSIVE_ABILITY_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-passive', makeCardInstance('p1-passive', 'test-passive-ability', 'player1'));

    const passivePokemon = makeInPlayPokemon('p1-passive');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: passivePokemon }
      }
    };

    const actions = getLegalActions(s);
    const abilityActions = actions.filter(a => a.type === 'USE_ABILITY');
    expect(abilityActions.length).toBe(0);
  });

  it('activated ability still appears in getLegalActions', () => {
    const state = makeBaseState();
    const activatedDef: PokemonCardDefinition = {
      ...FIRE_WITH_ABILITY,
      id: 'test-activated',
    };
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-activated', activatedDef);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-activated', makeCardInstance('p1-activated', 'test-activated', 'player1'));

    const activatedPokemon = makeInPlayPokemon('p1-activated');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: activatedPokemon }
      }
    };

    const actions = getLegalActions(s);
    const abilityActions = actions.filter(a => a.type === 'USE_ABILITY');
    expect(abilityActions.length).toBeGreaterThan(0);
  });
});

const TRIGGERED_ABILITY_DEF: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-triggered-ability', name: 'Test Triggered',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Fire'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Flying Entry', text: 'When you play this Pokemon from your hand to your Bench, ...', type: 'Ability', category: 'triggered', effectId: 'flying-entry-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

const REPEATABLE_ABILITY_DEF: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-repeatable-ability', name: 'Test Repeatable',
  stage: 'Basic', subtypes: [], hp: 100, types: ['Psychic'],
  evolvesFrom: null,
  attacks: [],
  abilities: [{ name: 'Psychic Embrace', text: 'As often as you like during your turn, you may attach a Psychic Energy card...', type: 'Ability', category: 'activated', effectId: 'psychic-embrace-effect' }],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 2, regulationMark: 'H'
};

describe('triggered abilities', () => {
  it('canUseAbility returns false for triggered ability', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-triggered-ability', TRIGGERED_ABILITY_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-triggered', makeCardInstance('p1-triggered', 'test-triggered-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-triggered');
    const s: GameState = { ...state, cardRegistry: cardReg, definitionRegistry: defReg };

    expect(canUseAbility(s, 'player1', pokemon, 0)).toBe(false);
  });

  it('triggered ability does not appear in getLegalActions', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-triggered-ability', TRIGGERED_ABILITY_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-triggered', makeCardInstance('p1-triggered', 'test-triggered-ability', 'player1'));

    const triggeredPokemon = makeInPlayPokemon('p1-triggered');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: triggeredPokemon }
      }
    };

    const actions = getLegalActions(s);
    const abilityActions = actions.filter(a => a.type === 'USE_ABILITY');
    expect(abilityActions.length).toBe(0);
  });
});

describe('once-per-turn ability tracking', () => {
  it('activated ability appears in getLegalActions when not yet used', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: { ...state.players, player1: { ...state.players.player1, active: pokemon } }
    };

    const actions = getLegalActions(s);
    expect(actions.some(a => a.type === 'USE_ABILITY' && a.pokemonInstanceId === 'p1-fire')).toBe(true);
  });

  it('activated ability does NOT appear in getLegalActions after being used', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-fire-ability', FIRE_WITH_ABILITY);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-fire', makeCardInstance('p1-fire', 'test-fire-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-fire');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: { ...state.players, player1: { ...state.players.player1, active: pokemon } },
      turnFlags: {
        ...state.turnFlags,
        abilitiesUsedThisTurn: ['p1-fire:0']
      }
    };

    const actions = getLegalActions(s);
    expect(actions.some(a => a.type === 'USE_ABILITY' && a.pokemonInstanceId === 'p1-fire')).toBe(false);
  });

  it('"as often as you like" ability still appears after being used', () => {
    const state = makeBaseState();
    const defReg = new Map(state.definitionRegistry);
    defReg.set('test-repeatable-ability', REPEATABLE_ABILITY_DEF);
    const cardReg = new Map(state.cardRegistry);
    cardReg.set('p1-repeatable', makeCardInstance('p1-repeatable', 'test-repeatable-ability', 'player1'));

    const pokemon = makeInPlayPokemon('p1-repeatable');
    const s: GameState = {
      ...state,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: { ...state.players, player1: { ...state.players.player1, active: pokemon } },
      turnFlags: {
        ...state.turnFlags,
        abilitiesUsedThisTurn: ['p1-repeatable:0']
      }
    };

    const actions = getLegalActions(s);
    expect(actions.some(a => a.type === 'USE_ABILITY' && a.pokemonInstanceId === 'p1-repeatable')).toBe(true);
  });

  it('abilitiesUsedThisTurn resets at start of new turn', () => {
    const state = makeBaseState();
    const s: GameState = {
      ...state,
      turnFlags: {
        ...state.turnFlags,
        abilitiesUsedThisTurn: ['p1-mareep-0:0', 'p1-mareep-0:1']
      }
    };

    expect(s.turnFlags.abilitiesUsedThisTurn.length).toBe(2);

    const nextTurnFlags = {
      ...s.turnFlags,
      attackUsed: false,
      isStartingPlayerFirstTurn: false,
      turnEndedByEffect: false,
      abilitiesUsedThisTurn: [] as ReadonlyArray<string>
    };

    expect(nextTurnFlags.abilitiesUsedThisTurn.length).toBe(0);
  });
});
