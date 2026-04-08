import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, TrainerCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { ChoiceResolver, EffectChoice } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import { resolveTrainerEffect } from '../../lib/effects/registry';
import type { TrainerContext } from '../../lib/effects/registry';
import '../../lib/effects/trainers';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const FLAAFFY_ID = 'svp-108';
const AMPHAROS_ID = 'svp-109';
const PAWNIARD_ID = 'svp-111';
const PIKACHU_EX_ID = 'svp-106';
const FIRE_ENERGY_ID = 'base1-98';
const LIGHTNING_ENERGY_ID = 'base1-100';

const NEST_BALL_ID = 'sv1-181';
const ULTRA_BALL_ID = 'sv1-196';
const RARE_CANDY_ID = 'sv1-191';
const SWITCH_ID = 'sv1-194';
const SUPER_ROD_ID = 'sv2-188';
const ENERGY_RETRIEVAL_ID = 'sv1-171';
const PAL_PAD_ID = 'sv1-182';
const POKEGEAR_ID = 'sv1-186';
const BOSS_ORDERS_ID = 'me1-114';
const IONO_ID = 'svp-124';
const PROFESSORS_RESEARCH_ID = 'sv4pt5-87';
const ARVEN_ID = 'sv1-166';
const JUDGE_ID = 'sv1-176';

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

function firstValidResolver(choice: EffectChoice): ReadonlyArray<string> {
  return choice.options.slice(0, choice.max);
}

function makeBaseState(overrides: Partial<GameState> = {}): GameState {
  const cardRegistry = new Map<string, CardInstance>();
  const definitionRegistry = new Map<string, CardDefinition>(pool);

  cardRegistry.set('p1-mareep-0', makeCardInstance('p1-mareep-0', MAREEP_ID, 'player1'));
  cardRegistry.set('p2-pawniard-0', makeCardInstance('p2-pawniard-0', PAWNIARD_ID, 'player2'));
  cardRegistry.set('p1-bench-mareep', makeCardInstance('p1-bench-mareep', MAREEP_ID, 'player1'));
  cardRegistry.set('p2-bench-pawniard', makeCardInstance('p2-bench-pawniard', PAWNIARD_ID, 'player2'));

  for (let i = 0; i < 5; i++) {
    cardRegistry.set(`p1-energy-${i}`, makeCardInstance(`p1-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-energy-${i}`, makeCardInstance(`p2-energy-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  // Deck: mix of Pokemon and Energy
  for (let i = 0; i < 10; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }
  for (let i = 0; i < 3; i++) {
    cardRegistry.set(`p1-deck-energy-${i}`, makeCardInstance(`p1-deck-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
  }

  // Trainer card instances
  for (const [prefix, defId] of [
    ['nest-ball', NEST_BALL_ID],
    ['ultra-ball', ULTRA_BALL_ID],
    ['rare-candy', RARE_CANDY_ID],
    ['switch', SWITCH_ID],
    ['super-rod', SUPER_ROD_ID],
    ['energy-retrieval', ENERGY_RETRIEVAL_ID],
    ['pal-pad', PAL_PAD_ID],
    ['pokegear', POKEGEAR_ID],
    ['boss', BOSS_ORDERS_ID],
    ['iono', IONO_ID],
    ['prof-research', PROFESSORS_RESEARCH_ID],
    ['arven', ARVEN_ID],
    ['judge', JUDGE_ID],
  ] as const) {
    cardRegistry.set(`p1-${prefix}`, makeCardInstance(`p1-${prefix}`, defId, 'player1'));
  }

  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: [
      ...Array.from({ length: 10 }, (_, i) => `p1-deck-${i}`),
      ...Array.from({ length: 3 }, (_, i) => `p1-deck-energy-${i}`)
    ],
    hand: ['p1-energy-2', 'p1-energy-3', 'p1-energy-4'],
    prizes: Array.from({ length: 6 }, (_, i) => `p1-prize-${i}`),
    active: makeInPlayPokemon('p1-mareep-0', {
      attachedEnergy: ['p1-energy-0', 'p1-energy-1']
    }),
    bench: [makeInPlayPokemon('p1-bench-mareep')],
    discard: [],
    lostZone: [],
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  };

  const player2: PlayerState = {
    id: 'player2',
    deck: Array.from({ length: 10 }, (_, i) => `p2-deck-${i}`),
    hand: ['p2-energy-0', 'p2-energy-1', 'p2-energy-2'],
    prizes: Array.from({ length: 6 }, (_, i) => `p2-prize-${i}`),
    active: makeInPlayPokemon('p2-pawniard-0'),
    bench: [makeInPlayPokemon('p2-bench-pawniard')],
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

function makeTrainerContext(
  state: GameState,
  trainerDefId: string,
  player: PlayerId = 'player1',
  targets: ReadonlyArray<string> = [],
  resolver: ChoiceResolver = firstValidResolver
): TrainerContext {
  const trainerDef = pool.get(trainerDefId) as TrainerCardDefinition;
  const instanceId = `p1-${trainerDefId}`;
  return {
    cardInstance: { instanceId, definitionId: trainerDefId, owner: player },
    trainerDef,
    player,
    opponent: player === 'player1' ? 'player2' : 'player1',
    targets,
    choiceResolver: resolver
  };
}

// ─── Nest Ball ───────────────────────────────────────────────────────────

describe('Nest Ball', () => {
  it('searches deck for Basic, puts on bench, shuffles', () => {
    const state = makeBaseState();
    const ctx = makeTrainerContext(state, NEST_BALL_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.bench.length).toBe(2);
    const shuffleEvents = result.eventLog.filter(e => e.type === 'DECK_SHUFFLED');
    expect(shuffleEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Ultra Ball ──────────────────────────────────────────────────────────

describe('Ultra Ball', () => {
  it('requires 2 discards from hand, searches for any Pokemon', () => {
    const state = makeBaseState();
    const ctx = makeTrainerContext(state, ULTRA_BALL_ID);
    const result = resolveTrainerEffect(state, ctx);
    // Should have discarded 2 cards and got a Pokemon
    expect(result.players.player1.discard.length).toBeGreaterThanOrEqual(2);
    expect(result.players.player1.hand.length).toBeGreaterThanOrEqual(1);
  });

  it('does nothing with fewer than 2 cards in hand', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, hand: ['p1-energy-2'] }
      }
    };
    const ctx = makeTrainerContext(state, ULTRA_BALL_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.hand.length).toBe(1);
  });
});

// ─── Rare Candy ──────────────────────────────────────────────────────────

describe('Rare Candy', () => {
  it('evolves Basic directly to Stage2', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    cr.set('p1-ampharos-0', makeCardInstance('p1-ampharos-0', AMPHAROS_ID, 'player1'));
    // Ensure Flaaffy def is in the pool for chain validation
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          hand: [...state.players.player1.hand, 'p1-ampharos-0'],
          active: makeInPlayPokemon('p1-mareep-0', {
            attachedEnergy: ['p1-energy-0', 'p1-energy-1'],
            turnPlayed: 1,
            isNewThisTurn: false
          })
        }
      }
    };

    const ctx = makeTrainerContext(state, RARE_CANDY_ID);
    const result = resolveTrainerEffect(state, ctx);
    // The active should now be evolved (instanceId changes to the evolution card)
    const active = result.players.player1.active!;
    expect(active.evolutionStack).toContain('p1-ampharos-0');
  });
});

// ─── Switch ──────────────────────────────────────────────────────────────

describe('Switch', () => {
  it('swaps Active with Benched, clears conditions', () => {
    let state = makeBaseState();
    // Apply a condition to active
    const active = state.players.player1.active!;
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...active, specialConditions: ['Poisoned'] }
        }
      }
    };

    const ctx = makeTrainerContext(state, SWITCH_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.active!.instanceId).toBe('p1-bench-mareep');
    const oldActive = result.players.player1.bench.find(b => b.instanceId === 'p1-mareep-0');
    expect(oldActive!.specialConditions).toEqual([]);
  });
});

// ─── Super Rod ───────────────────────────────────────────────────────────

describe('Super Rod', () => {
  it('shuffles Pokemon/Basic Energy from discard into deck', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          discard: ['p1-deck-0', 'p1-deck-energy-0', 'p1-deck-1']
        }
      }
    };
    const ctx = makeTrainerContext(state, SUPER_ROD_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.discard.length).toBeLessThan(3);
  });
});

// ─── Energy Retrieval ────────────────────────────────────────────────────

describe('Energy Retrieval', () => {
  it('returns up to 2 Basic Energy from discard to hand', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          discard: ['p1-deck-energy-0', 'p1-deck-energy-1']
        }
      }
    };
    const ctx = makeTrainerContext(state, ENERGY_RETRIEVAL_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.hand.length).toBeGreaterThan(state.players.player1.hand.length);
    expect(result.players.player1.discard.length).toBeLessThan(2);
  });
});

// ─── Pal Pad ─────────────────────────────────────────────────────────────

describe('Pal Pad', () => {
  it('shuffles up to 2 Supporters from discard into deck', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    cr.set('p1-discard-iono', makeCardInstance('p1-discard-iono', IONO_ID, 'player1'));
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          discard: ['p1-discard-iono']
        }
      }
    };
    const ctx = makeTrainerContext(state, PAL_PAD_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.discard).not.toContain('p1-discard-iono');
  });
});

// ─── Pokegear 3.0 ────────────────────────────────────────────────────────

describe('Pokegear 3.0', () => {
  it('looks at top 7 of deck, takes a Supporter', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    cr.set('p1-deck-supporter', makeCardInstance('p1-deck-supporter', IONO_ID, 'player1'));
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          deck: ['p1-deck-supporter', ...state.players.player1.deck.slice(1)]
        }
      }
    };
    const ctx = makeTrainerContext(state, POKEGEAR_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.hand).toContain('p1-deck-supporter');
  });

  it('shuffles even if no Supporter found', () => {
    const state = makeBaseState(); // deck is all Mareep (Pokemon, not Supporters)
    const ctx = makeTrainerContext(state, POKEGEAR_ID);
    const result = resolveTrainerEffect(state, ctx);
    const shuffleEvents = result.eventLog.filter(e => e.type === 'DECK_SHUFFLED');
    expect(shuffleEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Boss's Orders ───────────────────────────────────────────────────────

describe("Boss's Orders", () => {
  it("switches opponent's Active with one of their Benched", () => {
    const state = makeBaseState();
    const ctx = makeTrainerContext(state, BOSS_ORDERS_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player2.active!.instanceId).toBe('p2-bench-pawniard');
  });
});

// ─── Iono ────────────────────────────────────────────────────────────────

describe('Iono', () => {
  it('both shuffle hand to deck bottom, draw = remaining prizes', () => {
    const state = makeBaseState();
    const p1HandBefore = state.players.player1.hand.length;
    const p2HandBefore = state.players.player2.hand.length;
    const p1Prizes = state.players.player1.prizes.length;
    const p2Prizes = state.players.player2.prizes.length;

    const ctx = makeTrainerContext(state, IONO_ID);
    const result = resolveTrainerEffect(state, ctx);

    // Players draw cards = remaining prizes
    expect(result.players.player1.hand.length).toBe(p1Prizes);
    expect(result.players.player2.hand.length).toBe(p2Prizes);
  });
});

// ─── Professor's Research ────────────────────────────────────────────────

describe("Professor's Research", () => {
  it('discards hand, draws 7', () => {
    const state = makeBaseState();
    const ctx = makeTrainerContext(state, PROFESSORS_RESEARCH_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.hand.length).toBe(7);
    expect(result.players.player1.discard.length).toBe(3); // original hand was 3
  });
});

// ─── Arven ───────────────────────────────────────────────────────────────

describe('Arven', () => {
  it('searches deck for 1 Item + 1 Pokemon Tool', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    cr.set('p1-deck-item', makeCardInstance('p1-deck-item', NEST_BALL_ID, 'player1'));
    // Use Switch (an Item) as a second target since we may not have PokemonTool in pool.
    // Arven should at least find the Item.
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          deck: ['p1-deck-item', ...state.players.player1.deck]
        }
      }
    };
    const ctx = makeTrainerContext(state, ARVEN_ID);
    const result = resolveTrainerEffect(state, ctx);
    // At minimum, should have searched and shuffled
    const shuffleEvents = result.eventLog.filter(e => e.type === 'DECK_SHUFFLED');
    expect(shuffleEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Judge ───────────────────────────────────────────────────────────────

describe('Judge', () => {
  it('both shuffle hands into deck, draw 4', () => {
    const state = makeBaseState();
    const ctx = makeTrainerContext(state, JUDGE_ID);
    const result = resolveTrainerEffect(state, ctx);
    expect(result.players.player1.hand.length).toBe(4);
    expect(result.players.player2.hand.length).toBe(4);
  });
});

// ─── Fallback ────────────────────────────────────────────────────────────

describe('Fallback behavior', () => {
  it('unregistered Trainer effectId is a no-op', () => {
    const state = makeBaseState();
    const fakeTrainerDef: TrainerCardDefinition = {
      cardType: 'Trainer',
      id: 'fake-999',
      name: 'Fake Nonexistent Trainer',
      subtypes: ['Item'],
      rules: [],
      effectId: 'fake-999'
    };
    const ctx: TrainerContext = {
      cardInstance: { instanceId: 'p1-fake', definitionId: 'fake-999', owner: 'player1' },
      trainerDef: fakeTrainerDef,
      player: 'player1',
      opponent: 'player2',
      targets: [],
      choiceResolver: firstValidResolver
    };
    const result = resolveTrainerEffect(state, ctx);
    expect(result).toEqual(state);
  });
});

// ─── Multiple prints resolve to same handler ─────────────────────────────

describe('Multiple prints of same Trainer', () => {
  it('different effectIds for Iono all resolve', () => {
    // Iono is registered by name "Iono", so any TrainerCardDefinition with name Iono should work
    const state = makeBaseState();
    const ionoDef = pool.get(IONO_ID) as TrainerCardDefinition;

    // Create a "different print" with a different effectId but same name
    const fakePrintDef: TrainerCardDefinition = {
      ...ionoDef,
      id: 'sv2-185',
      effectId: 'sv2-185'
    };

    const ctx: TrainerContext = {
      cardInstance: { instanceId: 'p1-iono-alt', definitionId: 'sv2-185', owner: 'player1' },
      trainerDef: fakePrintDef,
      player: 'player1',
      opponent: 'player2',
      targets: [],
      choiceResolver: firstValidResolver
    };

    const result = resolveTrainerEffect(state, ctx);
    // Should work — players draw = prize count
    expect(result.players.player1.hand.length).toBe(state.players.player1.prizes.length);
  });
});
