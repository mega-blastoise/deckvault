import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import { createRngState } from '../../lib/rng';
import { fireEventHooks, clearEventHooks } from '../../lib/core/events';
import type { EventHookPayload } from '../../lib/core/events';

// Side-effect imports to register hooks
import '../../lib/effects/stadiums';
import '../../lib/effects/tools';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107'; // Lightning Basic
const PAWNIARD_ID = 'svp-111'; // Darkness Basic
const LIGHTNING_ENERGY_ID = 'base1-100';
const FIRE_ENERGY_ID = 'base1-98';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

const SNOWY_MOUNTAIN_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-snowy-mountain', name: 'Calamitous Snowy Mountain',
  subtypes: ['Stadium'], rules: [], effectId: 'snowy-mountain-effect'
};

const RISKY_RUINS_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-risky-ruins', name: 'Risky Ruins',
  subtypes: ['Stadium'], rules: [], effectId: 'risky-ruins-effect'
};

const POWERGLASS_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-powerglass', name: 'Powerglass',
  subtypes: ['PokemonTool'], rules: [], effectId: 'powerglass-effect'
};

const PATROL_CAP_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-patrol-cap', name: 'Patrol Cap',
  subtypes: ['PokemonTool'], rules: [], effectId: 'patrol-cap-effect'
};

const WATER_BASIC: PokemonCardDefinition = {
  cardType: 'Pokemon', id: 'test-water', name: 'Test Water',
  stage: 'Basic', subtypes: [], hp: 60, types: ['Water'],
  evolvesFrom: null, attacks: [], abilities: [],
  weaknesses: [], resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
};

const DIFFERENT_STADIUM_DEF: TrainerCardDefinition = {
  cardType: 'Trainer', id: 'test-other-stadium', name: 'Some Other Stadium',
  subtypes: ['Stadium'], rules: [], effectId: 'other-stadium-effect'
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

describe('Calamitous Snowy Mountain hook', () => {
  it('non-Water Basic gets 2 damage counters on energy attach', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-snowy-mountain', SNOWY_MOUNTAIN_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('stadium-sm', makeCardInstance('stadium-sm', 'test-snowy-mountain', 'player1'));

    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      stadium: { cardInstanceId: 'stadium-sm', playedBy: 'player1' }
    };

    const payload: EventHookPayload = {
      type: 'energy_attached',
      data: { player: 'player1', energyInstanceId: 'p1-energy-0', targetInstanceId: 'p1-mareep-0' }
    };

    const result = fireEventHooks(state, payload);
    const active = result.newState.players.player1.active!;
    expect(active.damageCounters).toBe(2);
  });

  it('Water Basic gets no damage counters', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-snowy-mountain', SNOWY_MOUNTAIN_DEF);
    defReg.set('test-water', WATER_BASIC);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('stadium-sm', makeCardInstance('stadium-sm', 'test-snowy-mountain', 'player1'));
    cardReg.set('p1-water', makeCardInstance('p1-water', 'test-water', 'player1'));

    const waterPokemon = makeInPlayPokemon('p1-water');
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, active: waterPokemon }
      },
      stadium: { cardInstanceId: 'stadium-sm', playedBy: 'player1' }
    };

    const payload: EventHookPayload = {
      type: 'energy_attached',
      data: { player: 'player1', energyInstanceId: 'p1-energy-0', targetInstanceId: 'p1-water' }
    };

    const result = fireEventHooks(state, payload);
    const active = result.newState.players.player1.active!;
    expect(active.damageCounters).toBe(0);
  });

  it('wrong stadium has no effect', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-other-stadium', DIFFERENT_STADIUM_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('stadium-other', makeCardInstance('stadium-other', 'test-other-stadium', 'player1'));

    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      stadium: { cardInstanceId: 'stadium-other', playedBy: 'player1' }
    };

    const payload: EventHookPayload = {
      type: 'energy_attached',
      data: { player: 'player1', energyInstanceId: 'p1-energy-0', targetInstanceId: 'p1-mareep-0' }
    };

    const result = fireEventHooks(state, payload);
    const active = result.newState.players.player1.active!;
    expect(active.damageCounters).toBe(0);
  });
});

describe('Risky Ruins hook', () => {
  it('non-Darkness Basic gets 2 damage counters on bench', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-risky-ruins', RISKY_RUINS_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('stadium-rr', makeCardInstance('stadium-rr', 'test-risky-ruins', 'player1'));
    cardReg.set('p1-bench-mareep', makeCardInstance('p1-bench-mareep', MAREEP_ID, 'player1'));

    const benchPokemon = makeInPlayPokemon('p1-bench-mareep');
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, bench: [benchPokemon] }
      },
      stadium: { cardInstanceId: 'stadium-rr', playedBy: 'player1' }
    };

    const payload: EventHookPayload = {
      type: 'pokemon_benched',
      data: { player: 'player1', pokemonInstanceId: 'p1-bench-mareep' }
    };

    const result = fireEventHooks(state, payload);
    const benched = result.newState.players.player1.bench[0]!;
    expect(benched.damageCounters).toBe(2);
  });

  it('Darkness Basic gets no damage counters', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-risky-ruins', RISKY_RUINS_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('stadium-rr', makeCardInstance('stadium-rr', 'test-risky-ruins', 'player1'));
    cardReg.set('p1-bench-pawniard', makeCardInstance('p1-bench-pawniard', PAWNIARD_ID, 'player1'));

    const benchPokemon = makeInPlayPokemon('p1-bench-pawniard');
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, bench: [benchPokemon] }
      },
      stadium: { cardInstanceId: 'stadium-rr', playedBy: 'player1' }
    };

    const payload: EventHookPayload = {
      type: 'pokemon_benched',
      data: { player: 'player1', pokemonInstanceId: 'p1-bench-pawniard' }
    };

    const result = fireEventHooks(state, payload);
    const benched = result.newState.players.player1.bench[0]!;
    expect(benched.damageCounters).toBe(0);
  });
});

describe('Powerglass hook', () => {
  it('attaches Basic Energy from discard at turn end', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-powerglass', POWERGLASS_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('tool-pg', makeCardInstance('tool-pg', 'test-powerglass', 'player1'));
    cardReg.set('discard-energy-0', makeCardInstance('discard-energy-0', LIGHTNING_ENERGY_ID, 'player1'));

    const active = makeInPlayPokemon('p1-mareep-0', { attachedTools: ['tool-pg'] });
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, active, discard: ['discard-energy-0'] }
      }
    };

    const payload: EventHookPayload = {
      type: 'turn_ending',
      data: { player: 'player1' }
    };

    const result = fireEventHooks(state, payload);
    const p1 = result.newState.players.player1;
    expect(p1.active!.attachedEnergy).toContain('discard-energy-0');
    expect(p1.discard).not.toContain('discard-energy-0');
  });

  it('no effect without energy in discard', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-powerglass', POWERGLASS_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('tool-pg', makeCardInstance('tool-pg', 'test-powerglass', 'player1'));

    const active = makeInPlayPokemon('p1-mareep-0', { attachedTools: ['tool-pg'] });
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, active, discard: [] }
      }
    };

    const payload: EventHookPayload = {
      type: 'turn_ending',
      data: { player: 'player1' }
    };

    const result = fireEventHooks(state, payload);
    expect(result.newState.players.player1.active!.attachedEnergy).toEqual([]);
  });
});

describe('Patrol Cap hook', () => {
  it('prevents opponent deck discard', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-patrol-cap', PATROL_CAP_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('tool-pc', makeCardInstance('tool-pc', 'test-patrol-cap', 'player2'));

    const p2Active = makeInPlayPokemon('p2-pawniard-0', { attachedTools: ['tool-pc'] });
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player2: { ...base.players.player2, active: p2Active }
      }
    };

    const payload: EventHookPayload = {
      type: 'deck_discard_attempted',
      data: { requestingPlayer: 'player1', targetPlayer: 'player2', cardInstanceIds: ['p2-deck-0'] }
    };

    const result = fireEventHooks(state, payload);
    expect(result.prevented).toBe(true);
  });

  it('allows self-discard', () => {
    const base = makeBaseState();
    const defReg = new Map(base.definitionRegistry);
    defReg.set('test-patrol-cap', PATROL_CAP_DEF);
    const cardReg = new Map(base.cardRegistry);
    cardReg.set('tool-pc', makeCardInstance('tool-pc', 'test-patrol-cap', 'player1'));

    const p1Active = makeInPlayPokemon('p1-mareep-0', { attachedTools: ['tool-pc'] });
    const state: GameState = {
      ...base,
      cardRegistry: cardReg,
      definitionRegistry: defReg,
      players: {
        ...base.players,
        player1: { ...base.players.player1, active: p1Active }
      }
    };

    const payload: EventHookPayload = {
      type: 'deck_discard_attempted',
      data: { requestingPlayer: 'player1', targetPlayer: 'player1', cardInstanceIds: ['p1-deck-0'] }
    };

    const result = fireEventHooks(state, payload);
    expect(result.prevented).toBe(false);
  });
});
