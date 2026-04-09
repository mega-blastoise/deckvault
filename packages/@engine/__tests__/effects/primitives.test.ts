import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { TemporalEffect } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import {
  drawCards,
  discardFromHand,
  searchDeck,
  shuffleDeck,
  moveToHand,
  moveToDeck,
  discardEnergy,
  discardAllEnergy,
  moveEnergy,
  attachEnergyFromDeck,
  switchActive,
  putOnBench,
  flipCoin,
  flipCoins,
  healDamage,
  healAllDamage,
  applyCondition,
  removeCondition
} from '../../lib/effects/primitives';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const PAWNIARD_ID = 'svp-111';
const PIKACHU_EX_ID = 'svp-106';
const FIRE_ENERGY_ID = 'base1-98';
const LIGHTNING_ENERGY_ID = 'base1-100';

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

  cardRegistry.set('p1-mareep-0', makeCardInstance('p1-mareep-0', MAREEP_ID, 'player1'));
  cardRegistry.set('p2-pawniard-0', makeCardInstance('p2-pawniard-0', PAWNIARD_ID, 'player2'));
  cardRegistry.set('p1-bench-mareep', makeCardInstance('p1-bench-mareep', MAREEP_ID, 'player1'));

  for (let i = 0; i < 5; i++) {
    cardRegistry.set(`p1-energy-${i}`, makeCardInstance(`p1-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-energy-${i}`, makeCardInstance(`p2-energy-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  for (let i = 0; i < 10; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }

  for (let i = 0; i < 3; i++) {
    cardRegistry.set(`p1-deck-energy-${i}`, makeCardInstance(`p1-deck-energy-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
  }

  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: Array.from({ length: 10 }, (_, i) => `p1-deck-${i}`),
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
    hand: [],
    prizes: Array.from({ length: 6 }, (_, i) => `p2-prize-${i}`),
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

// ─── drawCards ────────────────────────────────────────────────────────────

describe('drawCards', () => {
  it('draws the correct number of cards', () => {
    const state = makeBaseState();
    const result = drawCards(state, 'player1', 3);
    expect(result.players.player1.hand.length).toBe(6); // 3 original + 3 drawn
    expect(result.players.player1.deck.length).toBe(7); // 10 - 3
  });

  it('draws 0 from empty deck without triggering deck-out', () => {
    const state = makeBaseState();
    const emptyDeckState: GameState = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, deck: [] }
      }
    };
    const result = drawCards(emptyDeckState, 'player1', 5);
    expect(result.players.player1.hand.length).toBe(3); // unchanged
    expect(result.winner).toBeNull();
    expect(result.phase).toBe('main');
  });

  it('draws remaining cards if deck has fewer than requested', () => {
    const state = makeBaseState();
    const smallDeckState: GameState = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, deck: ['p1-deck-0', 'p1-deck-1'] }
      }
    };
    const result = drawCards(smallDeckState, 'player1', 5);
    expect(result.players.player1.hand.length).toBe(5); // 3 + 2
    expect(result.players.player1.deck.length).toBe(0);
  });

  it('emits CARD_DRAWN events', () => {
    const state = makeBaseState();
    const result = drawCards(state, 'player1', 2);
    const drawEvents = result.eventLog.filter(e => e.type === 'CARD_DRAWN');
    expect(drawEvents.length).toBe(2);
  });
});

// ─── discardFromHand ─────────────────────────────────────────────────────

describe('discardFromHand', () => {
  it('removes specified cards from hand and adds to discard', () => {
    const state = makeBaseState();
    const result = discardFromHand(state, 'player1', ['p1-energy-2', 'p1-energy-3']);
    expect(result.players.player1.hand).toEqual(['p1-energy-4']);
    expect(result.players.player1.discard).toContain('p1-energy-2');
    expect(result.players.player1.discard).toContain('p1-energy-3');
  });

  it('emits CARD_DISCARDED events', () => {
    const state = makeBaseState();
    const result = discardFromHand(state, 'player1', ['p1-energy-2']);
    const events = result.eventLog.filter(e => e.type === 'CARD_DISCARDED');
    expect(events.length).toBe(1);
  });
});

// ─── searchDeck ──────────────────────────────────────────────────────────

describe('searchDeck', () => {
  it('returns matching candidates based on filter', () => {
    const state = makeBaseState();
    const { candidates } = searchDeck(state, 'player1', { supertype: 'Pokemon' }, 5);
    expect(candidates.length).toBeGreaterThan(0);
    for (const id of candidates) {
      const def = state.definitionRegistry.get(state.cardRegistry.get(id)!.definitionId);
      expect(def?.cardType).toBe('Pokemon');
    }
  });

  it('limits results to count', () => {
    const state = makeBaseState();
    const { candidates } = searchDeck(state, 'player1', { supertype: 'Pokemon' }, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('returns empty for no matches', () => {
    const state = makeBaseState();
    const { candidates } = searchDeck(state, 'player1', { name: 'nonexistent_card_name' }, 5);
    expect(candidates.length).toBe(0);
  });
});

// ─── shuffleDeck ─────────────────────────────────────────────────────────

describe('shuffleDeck', () => {
  it('shuffles using seeded RNG', () => {
    const state = makeBaseState();
    const result = shuffleDeck(state, 'player1');
    expect(result.players.player1.deck.length).toBe(state.players.player1.deck.length);
    expect(result.rngState).not.toEqual(state.rngState);
  });

  it('emits DECK_SHUFFLED event', () => {
    const state = makeBaseState();
    const result = shuffleDeck(state, 'player1');
    const events = result.eventLog.filter(e => e.type === 'DECK_SHUFFLED');
    expect(events.length).toBe(1);
  });
});

// ─── moveToHand ──────────────────────────────────────────────────────────

describe('moveToHand', () => {
  it('moves card from deck to hand', () => {
    const state = makeBaseState();
    const cardId = state.players.player1.deck[0]!;
    const result = moveToHand(state, 'player1', cardId, 'deck');
    expect(result.players.player1.hand).toContain(cardId);
    expect(result.players.player1.deck).not.toContain(cardId);
  });

  it('moves card from discard to hand', () => {
    let state = makeBaseState();
    state = discardFromHand(state, 'player1', ['p1-energy-2']);
    const result = moveToHand(state, 'player1', 'p1-energy-2', 'discard');
    expect(result.players.player1.hand).toContain('p1-energy-2');
    expect(result.players.player1.discard).not.toContain('p1-energy-2');
  });
});

// ─── discardEnergy ───────────────────────────────────────────────────────

describe('discardEnergy', () => {
  it('removes N energy from Pokemon', () => {
    const state = makeBaseState();
    const result = discardEnergy(state, 'player1', 'p1-mareep-0', 1);
    expect(result.players.player1.active!.attachedEnergy.length).toBe(1);
    expect(result.players.player1.discard.length).toBe(1);
  });

  it('removes only specified type of energy', () => {
    const state = makeBaseState();
    // All energy on p1-mareep-0 is Lightning. Asking to discard Fire should be no-op.
    const result = discardEnergy(state, 'player1', 'p1-mareep-0', 1, 'Fire');
    expect(result.players.player1.active!.attachedEnergy.length).toBe(2);
  });
});

// ─── discardAllEnergy ────────────────────────────────────────────────────

describe('discardAllEnergy', () => {
  it('removes all energy from Pokemon', () => {
    const state = makeBaseState();
    const result = discardAllEnergy(state, 'player1', 'p1-mareep-0');
    expect(result.players.player1.active!.attachedEnergy.length).toBe(0);
    expect(result.players.player1.discard.length).toBe(2);
  });
});

// ─── moveEnergy ──────────────────────────────────────────────────────────

describe('moveEnergy', () => {
  it('transfers energy between two Pokemon', () => {
    const state = makeBaseState();
    const result = moveEnergy(state, 'player1', 'p1-mareep-0', 'p1-bench-mareep', 'p1-energy-0');
    expect(result.players.player1.active!.attachedEnergy).not.toContain('p1-energy-0');
    expect(result.players.player1.bench[0]!.attachedEnergy).toContain('p1-energy-0');
  });
});

// ─── attachEnergyFromDeck ────────────────────────────────────────────────

describe('attachEnergyFromDeck', () => {
  it('searches deck for energy and attaches it', () => {
    const state = makeBaseState({
      players: {
        ...makeBaseState().players,
        player1: {
          ...makeBaseState().players.player1,
          deck: ['p1-deck-energy-0', 'p1-deck-0', 'p1-deck-1']
        }
      }
    });
    // Register the deck energy card instances
    const cr = new Map(state.cardRegistry);
    cr.set('p1-deck-energy-0', makeCardInstance('p1-deck-energy-0', LIGHTNING_ENERGY_ID, 'player1'));
    const s = { ...state, cardRegistry: cr };

    const result = attachEnergyFromDeck(s, 'player1', 'p1-mareep-0', 'Lightning');
    expect(result.players.player1.active!.attachedEnergy).toContain('p1-deck-energy-0');
    expect(result.players.player1.deck).not.toContain('p1-deck-energy-0');
  });
});

// ─── switchActive ────────────────────────────────────────────────────────

describe('switchActive', () => {
  it('swaps active and bench Pokemon', () => {
    const state = makeBaseState();
    const result = switchActive(state, 'player1', 'p1-bench-mareep');
    expect(result.players.player1.active!.instanceId).toBe('p1-bench-mareep');
    expect(result.players.player1.bench.some(b => b.instanceId === 'p1-mareep-0')).toBe(true);
  });

  it('clears special conditions on benched Pokemon', () => {
    let state = makeBaseState();
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Poisoned');
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Burned');
    const result = switchActive(state, 'player1', 'p1-bench-mareep');
    const oldActive = result.players.player1.bench.find(b => b.instanceId === 'p1-mareep-0');
    expect(oldActive!.specialConditions).toEqual([]);
  });

  it('removes only attack-sourced temporal effects', () => {
    const attackEffect: TemporalEffect = {
      id: 'attack-eff',
      type: 'damage_modifier',
      sourceInstanceId: 'p2-pawniard-0',
      sourceType: 'attack',
      targetInstanceId: 'p1-mareep-0',
      expiresOnTurn: null,
      expiresAt: 'end_of_opponent_turn',
      payload: { amount: -20 }
    };
    const trainerEffect: TemporalEffect = {
      id: 'trainer-eff',
      type: 'damage_reduction',
      sourceInstanceId: 'some-tool',
      sourceType: 'trainer',
      targetInstanceId: 'p1-mareep-0',
      expiresOnTurn: null,
      expiresAt: 'permanent',
      payload: { amount: -10 }
    };
    const state = makeBaseState({ temporalEffects: [attackEffect, trainerEffect] });
    const result = switchActive(state, 'player1', 'p1-bench-mareep');
    expect(result.temporalEffects).not.toContainEqual(expect.objectContaining({ id: 'attack-eff' }));
    expect(result.temporalEffects).toContainEqual(expect.objectContaining({ id: 'trainer-eff' }));
  });
});

// ─── putOnBench ──────────────────────────────────────────────────────────

describe('putOnBench', () => {
  it('places a Basic Pokemon from hand onto bench', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    cr.set('p1-energy-2', makeCardInstance('p1-energy-2', MAREEP_ID, 'player1'));
    state = { ...state, cardRegistry: cr };

    const result = putOnBench(state, 'player1', 'p1-energy-2');
    expect(result.players.player1.bench.length).toBe(2);
    expect(result.players.player1.hand).not.toContain('p1-energy-2');
  });

  it('does not place if bench is full', () => {
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    for (let i = 0; i < 5; i++) {
      cr.set(`p1-bench-${i}`, makeCardInstance(`p1-bench-${i}`, MAREEP_ID, 'player1'));
    }
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          bench: Array.from({ length: 5 }, (_, i) => makeInPlayPokemon(`p1-bench-${i}`))
        }
      }
    };
    const result = putOnBench(state, 'player1', 'p1-energy-2');
    expect(result.players.player1.bench.length).toBe(5);
  });
});

// ─── flipCoin ────────────────────────────────────────────────────────────

describe('flipCoin', () => {
  it('uses seeded RNG and emits COIN_FLIPPED event', () => {
    const state = makeBaseState();
    const { result, newState } = flipCoin(state, 'test_flip');
    expect(['heads', 'tails']).toContain(result);
    expect(newState.rngState).not.toEqual(state.rngState);
    const events = newState.eventLog.filter(e => e.type === 'COIN_FLIPPED');
    expect(events.length).toBe(1);
  });

  it('produces deterministic results with same seed', () => {
    const state1 = makeBaseState();
    const state2 = makeBaseState();
    const { result: r1 } = flipCoin(state1, 'test');
    const { result: r2 } = flipCoin(state2, 'test');
    expect(r1).toBe(r2);
  });
});

// ─── flipCoins ───────────────────────────────────────────────────────────

describe('flipCoins', () => {
  it('returns correct number of results', () => {
    const state = makeBaseState();
    const { results, newState } = flipCoins(state, 5, 'multi_flip');
    expect(results.length).toBe(5);
    expect(newState.rngState).not.toEqual(state.rngState);
  });

  it('advances RNG state correctly', () => {
    const state = makeBaseState();
    const { newState: after3 } = flipCoins(state, 3, 'test');
    const { newState: after1a } = flipCoin(state, 'test');
    const { newState: after1b } = flipCoin(after1a, 'test');
    const { newState: after1c } = flipCoin(after1b, 'test');
    expect(after3.rngState).toEqual(after1c.rngState);
  });
});

// ─── healDamage ──────────────────────────────────────────────────────────

describe('healDamage', () => {
  it('reduces damage counters', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, damageCounters: 5 }
        }
      }
    };
    const result = healDamage(state, 'player1', 'p1-mareep-0', 30);
    expect(result.players.player1.active!.damageCounters).toBe(2);
  });

  it('does not heal below 0', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, damageCounters: 1 }
        }
      }
    };
    const result = healDamage(state, 'player1', 'p1-mareep-0', 50);
    expect(result.players.player1.active!.damageCounters).toBe(0);
  });

  it('emits DAMAGE_HEALED event', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, damageCounters: 3 }
        }
      }
    };
    const result = healDamage(state, 'player1', 'p1-mareep-0', 20);
    const events = result.eventLog.filter(e => e.type === 'DAMAGE_HEALED');
    expect(events.length).toBe(1);
  });
});

// ─── applyCondition ──────────────────────────────────────────────────────

describe('applyCondition', () => {
  it('applies condition with mutual exclusivity enforced', () => {
    let state = makeBaseState();
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Asleep');
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Paralyzed');
    const conditions = state.players.player1.active!.specialConditions;
    expect(conditions).toContain('Paralyzed');
    expect(conditions).not.toContain('Asleep');
  });

  it('allows Burned + rotation condition', () => {
    let state = makeBaseState();
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Burned');
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Confused');
    const conditions = state.players.player1.active!.specialConditions;
    expect(conditions).toContain('Burned');
    expect(conditions).toContain('Confused');
  });
});

// ─── removeCondition ─────────────────────────────────────────────────────

describe('removeCondition', () => {
  it('removes a specific condition', () => {
    let state = makeBaseState();
    state = applyCondition(state, 'player1', 'p1-mareep-0', 'Poisoned');
    state = removeCondition(state, 'player1', 'p1-mareep-0', 'Poisoned');
    expect(state.players.player1.active!.specialConditions).not.toContain('Poisoned');
  });
});
