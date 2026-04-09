import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition, EnergyType, WeaknessDefinition, ResistanceDefinition, AttackDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { GameEvent } from '../../lib/types/event';
import type { TemporalEffect } from '../../lib/types/effect';
import type { DamageCalculation } from '../../lib/core/combat';
import {
  calculateDamage,
  resolveWeakness,
  resolveResistance,
  resolveConfusion,
  dealBenchDamage,
  dealSelfDamage,
  discardEnergyFromPokemon,
  checkKnockOuts,
  placeDamageCountersOn,
  resolveAttack
} from '../../lib/core/combat';
import { createGame, otherPlayer, handleKnockOut } from '../../lib/core/game';
import { applyAction, getLegalActions, startTurn } from '../../lib/core/turn';
import { createRngState } from '../../lib/rng';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

const MAREEP_ID = 'svp-107';
const FLAAFFY_ID = 'svp-108';
const PIKACHU_EX_ID = 'svp-106';
const PAWNIARD_ID = 'svp-111';
const FIRE_ENERGY_ID = 'base1-98';
const LIGHTNING_ENERGY_ID = 'base1-100';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
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

  // Add energy instances
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

  // Deck card registrations
  for (let i = 0; i < 3; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }
  // Prize card registrations
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

function getMareepDef(): PokemonCardDefinition {
  return pool.get(MAREEP_ID) as PokemonCardDefinition;
}

function getPawniardDef(): PokemonCardDefinition {
  return pool.get(PAWNIARD_ID) as PokemonCardDefinition;
}

function getPikachuExDef(): PokemonCardDefinition {
  return pool.get(PIKACHU_EX_ID) as PokemonCardDefinition;
}

function makeSyntheticDef(overrides: Partial<PokemonCardDefinition> = {}): PokemonCardDefinition {
  return {
    cardType: 'Pokemon',
    id: 'synthetic-001',
    name: 'Synthetic Pokemon',
    stage: 'Basic',
    subtypes: [],
    hp: 100,
    types: ['Fire'],
    evolvesFrom: null,
    attacks: [{ name: 'Tackle', cost: [], damage: 30, damageModifier: null, text: '', effectId: null }],
    abilities: [],
    weaknesses: [],
    resistances: [],
    retreatCost: 1,
    rules: [],
    prizeValue: 1,
    regulationMark: 'H',
    ...overrides
  };
}

// ─── Damage Pipeline Tests ────────────────────────────────────────────────

describe('calculateDamage', () => {
  it('base damage flows through pipeline correctly (no modifiers)', () => {
    const state = makeBaseState();
    const attacker = state.players.player1.active!;
    const defender = state.players.player2.active!;
    const attackerDef = getMareepDef();
    const defenderDef = getPawniardDef();
    // Mareep Headbutt = 10 damage, no modifiers
    const attack = attackerDef.attacks[0]!;

    const calc = calculateDamage(attacker, defender, attack, attackerDef, defenderDef, state);

    expect(calc.baseDamage).toBe(10);
    expect(calc.attackModifier).toBe(0);
    expect(calc.selfEffectModifier).toBe(0);
    expect(calc.weaknessMultiplier).toBe(1);
    expect(calc.weaknessFlat).toBe(0);
    expect(calc.resistanceReduction).toBe(0);
    expect(calc.targetEffectReduction).toBe(0);
    expect(calc.finalDamage).toBe(10);
  });

  it('0-damage attack skips Weakness/Resistance entirely', () => {
    const attackerDef = makeSyntheticDef({
      id: 'syn-attacker',
      types: ['Fighting'],
      attacks: [{ name: 'Leer', cost: [], damage: 0, damageModifier: null, text: 'Lower defense', effectId: 'leer' }]
    });
    const defenderDef = makeSyntheticDef({
      id: 'syn-defender',
      weaknesses: [{ type: 'Fighting', value: 'x2' }]
    });
    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-attacker', attackerDef);
    defRegistry.set('syn-defender', defenderDef);

    const cardRegistry = new Map<string, CardInstance>();
    cardRegistry.set('atk-0', makeCardInstance('atk-0', 'syn-attacker', 'player1'));
    cardRegistry.set('def-0', makeCardInstance('def-0', 'syn-defender', 'player2'));

    const state = makeBaseState({
      cardRegistry: new Map([...makeBaseState().cardRegistry, ...cardRegistry]),
      definitionRegistry: defRegistry
    });

    const attacker = makeInPlayPokemon('atk-0');
    const defender = makeInPlayPokemon('def-0');
    const attack = attackerDef.attacks[0]!;

    const calc = calculateDamage(attacker, defender, attack, attackerDef, defenderDef, state);
    expect(calc.finalDamage).toBe(0);
    expect(calc.weaknessMultiplier).toBe(1); // W/R not applied
    expect(calc.weaknessFlat).toBe(0);
  });

  it('Step 2 is a single step: selfEffectModifier applied before 0-check', () => {
    const attackerDef = makeSyntheticDef({
      id: 'syn-atk-mod',
      types: ['Fire'],
      attacks: [{ name: 'Boost Attack', cost: [], damage: 0, damageModifier: null, text: '', effectId: null }]
    });
    const defenderDef = makeSyntheticDef({ id: 'syn-def-mod' });

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-atk-mod', attackerDef);
    defRegistry.set('syn-def-mod', defenderDef);

    const cardRegistry = new Map<string, CardInstance>(makeBaseState().cardRegistry);
    cardRegistry.set('boosted-atk', makeCardInstance('boosted-atk', 'syn-atk-mod', 'player1'));
    cardRegistry.set('target-def', makeCardInstance('target-def', 'syn-def-mod', 'player2'));

    const temporalEffects: TemporalEffect[] = [{
      id: 'boost-1',
      type: 'damage_modifier',
      sourceInstanceId: 'other-source',
      targetInstanceId: 'boosted-atk',
      expiresOnTurn: null,
      payload: { amount: 40 }
    }];

    const state = makeBaseState({
      cardRegistry,
      definitionRegistry: defRegistry,
      temporalEffects
    });

    const attacker = makeInPlayPokemon('boosted-atk');
    const defender = makeInPlayPokemon('target-def');
    const attack = attackerDef.attacks[0]!;

    const calc = calculateDamage(attacker, defender, attack, attackerDef, defenderDef, state);
    expect(calc.baseDamage).toBe(0);
    expect(calc.selfEffectModifier).toBe(40);
    expect(calc.finalDamage).toBe(40);
  });

  it('Weakness x2 doubles the step-2 total', () => {
    // Mareep (Lightning) attacks Pawniard — no weakness match (Grass weakness)
    // Use synthetic: Fighting attacker vs Pawniard (weak to Grass) — no match
    // Better: use something that matches. Pawniard is weak to Grass.
    const attackerDef = makeSyntheticDef({
      id: 'syn-grass',
      types: ['Grass'],
      attacks: [{ name: 'Vine Whip', cost: [], damage: 40, damageModifier: null, text: '', effectId: null }]
    });
    const defenderDef = getPawniardDef(); // Weak to Grass x2

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-grass', attackerDef);

    const cardRegistry = new Map<string, CardInstance>(makeBaseState().cardRegistry);
    cardRegistry.set('grass-atk', makeCardInstance('grass-atk', 'syn-grass', 'player1'));

    const state = makeBaseState({ cardRegistry, definitionRegistry: defRegistry });

    const attacker = makeInPlayPokemon('grass-atk');
    const defender = state.players.player2.active!;

    const calc = calculateDamage(attacker, defender, attackerDef.attacks[0]!, attackerDef, defenderDef, state);
    expect(calc.weaknessMultiplier).toBe(2);
    expect(calc.finalDamage).toBe(80); // 40 * 2
  });

  it('Weakness +20 (flat) adds 20 to the step-2 total', () => {
    const attackerDef = makeSyntheticDef({
      id: 'syn-flat-atk',
      types: ['Water'],
      attacks: [{ name: 'Splash', cost: [], damage: 30, damageModifier: null, text: '', effectId: null }]
    });
    const defenderDef = makeSyntheticDef({
      id: 'syn-flat-def',
      weaknesses: [{ type: 'Water', value: '+20' }]
    });

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-flat-atk', attackerDef);
    defRegistry.set('syn-flat-def', defenderDef);

    const cardRegistry = new Map<string, CardInstance>(makeBaseState().cardRegistry);
    cardRegistry.set('flat-atk', makeCardInstance('flat-atk', 'syn-flat-atk', 'player1'));
    cardRegistry.set('flat-def', makeCardInstance('flat-def', 'syn-flat-def', 'player2'));

    const state = makeBaseState({ cardRegistry, definitionRegistry: defRegistry });

    const attacker = makeInPlayPokemon('flat-atk');
    const defender = makeInPlayPokemon('flat-def');

    const calc = calculateDamage(attacker, defender, attackerDef.attacks[0]!, attackerDef, defenderDef, state);
    expect(calc.weaknessMultiplier).toBe(1);
    expect(calc.weaknessFlat).toBe(20);
    expect(calc.finalDamage).toBe(50); // 30 + 20
  });

  it('Resistance -30 subtracts from post-weakness total, floor at 0', () => {
    const attackerDef = makeSyntheticDef({
      id: 'syn-res-atk',
      types: ['Fire'],
      attacks: [{ name: 'Ember', cost: [], damage: 20, damageModifier: null, text: '', effectId: null }]
    });
    const defenderDef = makeSyntheticDef({
      id: 'syn-res-def',
      resistances: [{ type: 'Fire', value: '-30' }]
    });

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-res-atk', attackerDef);
    defRegistry.set('syn-res-def', defenderDef);

    const cardRegistry = new Map<string, CardInstance>(makeBaseState().cardRegistry);
    cardRegistry.set('res-atk', makeCardInstance('res-atk', 'syn-res-atk', 'player1'));
    cardRegistry.set('res-def', makeCardInstance('res-def', 'syn-res-def', 'player2'));

    const state = makeBaseState({ cardRegistry, definitionRegistry: defRegistry });

    const attacker = makeInPlayPokemon('res-atk');
    const defender = makeInPlayPokemon('res-def');

    const calc = calculateDamage(attacker, defender, attackerDef.attacks[0]!, attackerDef, defenderDef, state);
    expect(calc.resistanceReduction).toBe(30);
    expect(calc.finalDamage).toBe(0); // max(0, 20 - 30)
  });

  it('Dual-type attacker: weakness to type A AND resistance to type B both apply', () => {
    const attackerDef = makeSyntheticDef({
      id: 'syn-dual',
      types: ['Fire', 'Water'],
      attacks: [{ name: 'Dual Strike', cost: [], damage: 50, damageModifier: null, text: '', effectId: null }]
    });
    const defenderDef = makeSyntheticDef({
      id: 'syn-dual-def',
      weaknesses: [{ type: 'Fire', value: 'x2' }],
      resistances: [{ type: 'Water', value: '-30' }]
    });

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-dual', attackerDef);
    defRegistry.set('syn-dual-def', defenderDef);

    const cardRegistry = new Map<string, CardInstance>(makeBaseState().cardRegistry);
    cardRegistry.set('dual-atk', makeCardInstance('dual-atk', 'syn-dual', 'player1'));
    cardRegistry.set('dual-def', makeCardInstance('dual-def', 'syn-dual-def', 'player2'));

    const state = makeBaseState({ cardRegistry, definitionRegistry: defRegistry });

    const attacker = makeInPlayPokemon('dual-atk');
    const defender = makeInPlayPokemon('dual-def');

    const calc = calculateDamage(attacker, defender, attackerDef.attacks[0]!, attackerDef, defenderDef, state);
    expect(calc.weaknessMultiplier).toBe(2);
    expect(calc.resistanceReduction).toBe(30);
    // 50 * 2 = 100, 100 - 30 = 70
    expect(calc.finalDamage).toBe(70);
  });
});

// ─── Weakness / Resistance Unit Tests ─────────────────────────────────────

describe('resolveWeakness', () => {
  it('returns x2 multiplier for matching type', () => {
    const result = resolveWeakness(30, ['Fighting'], [{ type: 'Fighting', value: 'x2' }]);
    expect(result).toEqual({ multiplier: 2, flat: 0 });
  });

  it('returns flat bonus for +N weakness', () => {
    const result = resolveWeakness(30, ['Fire'], [{ type: 'Fire', value: '+20' }]);
    expect(result).toEqual({ multiplier: 1, flat: 20 });
  });

  it('returns neutral when no type match', () => {
    const result = resolveWeakness(30, ['Water'], [{ type: 'Fire', value: 'x2' }]);
    expect(result).toEqual({ multiplier: 1, flat: 0 });
  });

  it('returns first match only for dual-type attacker', () => {
    const result = resolveWeakness(30, ['Fire', 'Water'], [
      { type: 'Fire', value: 'x2' },
      { type: 'Water', value: '+30' }
    ]);
    expect(result).toEqual({ multiplier: 2, flat: 0 }); // Fire matched first
  });
});

describe('resolveResistance', () => {
  it('returns reduction for matching type', () => {
    const result = resolveResistance(30, ['Fire'], [{ type: 'Fire', value: '-30' }]);
    expect(result).toBe(30);
  });

  it('returns 0 when no type match', () => {
    const result = resolveResistance(30, ['Water'], [{ type: 'Fire', value: '-30' }]);
    expect(result).toBe(0);
  });

  it('returns first match only for dual-type attacker', () => {
    const result = resolveResistance(30, ['Fire', 'Water'], [
      { type: 'Fire', value: '-20' },
      { type: 'Water', value: '-30' }
    ]);
    expect(result).toBe(20); // Fire matched first
  });
});

// ─── Bench Damage ─────────────────────────────────────────────────────────

describe('dealBenchDamage', () => {
  it('bypasses Weakness/Resistance and places counters directly', () => {
    const state = makeBaseState();
    // Add a bench Pokemon for player2
    const benchPokemon = makeInPlayPokemon('p2-bench-0');
    const newState = {
      ...state,
      players: {
        ...state.players,
        player2: {
          ...state.players.player2,
          bench: [benchPokemon]
        }
      }
    };
    newState.cardRegistry.set('p2-bench-0', makeCardInstance('p2-bench-0', PAWNIARD_ID, 'player2'));

    const result = dealBenchDamage(newState, 'p2-bench-0', 20);

    const p2Bench = result.players.player2.bench[0]!;
    expect(p2Bench.damageCounters).toBe(2); // 20/10 = 2 counters
    const dcpEvent = result.eventLog.find(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    expect(dcpEvent).toBeDefined();
    expect(dcpEvent!.type).toBe('DAMAGE_COUNTERS_PLACED');
  });

  it('Tera Pokemon ex take 0 bench damage', () => {
    const teraDef = makeSyntheticDef({
      id: 'syn-tera',
      subtypes: ['ex', 'Tera'],
      hp: 300
    });

    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-tera', teraDef);

    const baseState = makeBaseState({ definitionRegistry: defRegistry });
    const benchPokemon = makeInPlayPokemon('tera-bench');
    baseState.cardRegistry.set('tera-bench', makeCardInstance('tera-bench', 'syn-tera', 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          bench: [benchPokemon]
        }
      }
    };

    const result = dealBenchDamage(state, 'tera-bench', 40);
    const p2Bench = result.players.player2.bench[0]!;
    expect(p2Bench.damageCounters).toBe(0); // No damage
    expect(result.eventLog.filter(e => e.type === 'DAMAGE_COUNTERS_PLACED').length).toBe(0);
  });
});

// ─── Confusion ────────────────────────────────────────────────────────────

describe('resolveConfusion', () => {
  it('attack proceeds normally if not confused', () => {
    const state = makeBaseState();
    const attacker = state.players.player1.active!;
    const result = resolveConfusion(state, attacker);
    expect(result.proceed).toBe(true);
  });

  it('confused + heads: attack proceeds normally', () => {
    // Use a seed that produces heads
    let state = makeBaseState();
    const confusedAttacker = makeInPlayPokemon('p1-mareep-0', {
      specialConditions: ['Confused'],
      attachedEnergy: ['p1-energy-0', 'p1-energy-1']
    });
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: confusedAttacker }
      }
    };

    // Try multiple seeds to find one that gives heads
    let result;
    let seedState = state;
    for (let seed = 0; seed < 100; seed++) {
      seedState = { ...state, rngState: createRngState(seed) };
      result = resolveConfusion(seedState, confusedAttacker);
      if (result.proceed) break;
    }
    expect(result!.proceed).toBe(true);
    const coinEvent = result!.newState.eventLog.find(e => e.type === 'COIN_FLIPPED');
    expect(coinEvent).toBeDefined();
  });

  it('confused + tails: places 3 damage counters on attacker, attack cancelled', () => {
    let state = makeBaseState();
    const confusedAttacker = makeInPlayPokemon('p1-mareep-0', {
      specialConditions: ['Confused'],
      attachedEnergy: ['p1-energy-0', 'p1-energy-1']
    });
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: confusedAttacker }
      }
    };

    // Find a seed that gives tails
    let result;
    for (let seed = 0; seed < 100; seed++) {
      const seedState = { ...state, rngState: createRngState(seed) };
      result = resolveConfusion(seedState, confusedAttacker);
      if (!result.proceed) break;
    }
    expect(result!.proceed).toBe(false);

    // Check 3 damage counters placed
    const updatedAttacker = result!.newState.players.player1.active!;
    expect(updatedAttacker.damageCounters).toBe(3);

    // Check event type is DAMAGE_COUNTERS_PLACED, NOT DAMAGE_DEALT
    const dcpEvent = result!.newState.eventLog.find(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    expect(dcpEvent).toBeDefined();
    if (dcpEvent && dcpEvent.type === 'DAMAGE_COUNTERS_PLACED') {
      expect(dcpEvent.counters).toBe(3);
      expect(dcpEvent.source).toBe('confusion');
    }

    const dealEvent = result!.newState.eventLog.find(e => e.type === 'DAMAGE_DEALT');
    expect(dealEvent).toBeUndefined();
  });
});

// ─── KO Processing ───────────────────────────────────────────────────────

describe('checkKnockOuts', () => {
  it('KO check triggers when damageCounters * 10 >= hp', () => {
    const state = makeBaseState();
    // Pawniard has 70 HP — 7 damage counters = KO
    const koPokemon = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 7 });
    const koState = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, active: koPokemon }
      }
    };

    const result = checkKnockOuts(koState);

    const koEvent = result.eventLog.find(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvent).toBeDefined();
  });

  it('prize cards match prizeValue (1 for basic)', () => {
    const state = makeBaseState();
    const koPokemon = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 7 });
    const koState = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, active: koPokemon }
      }
    };

    const result = checkKnockOuts(koState);
    const koEvent = result.eventLog.find(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvent).toBeDefined();
    if (koEvent && koEvent.type === 'POKEMON_KNOCKED_OUT') {
      expect(koEvent.prizesAwarded).toBe(1);
    }
  });

  it('prize cards match prizeValue (2 for ex)', () => {
    const baseState = makeBaseState();
    const exPokemon = makeInPlayPokemon('p2-pikaex-0', { damageCounters: 20 }); // 200 HP for ex
    baseState.cardRegistry.set('p2-pikaex-0', makeCardInstance('p2-pikaex-0', PIKACHU_EX_ID, 'player2'));

    const koState = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: { ...baseState.players.player2, active: exPokemon }
      }
    };

    const result = checkKnockOuts(koState);
    const koEvent = result.eventLog.find(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvent).toBeDefined();
    if (koEvent && koEvent.type === 'POKEMON_KNOCKED_OUT') {
      expect(koEvent.prizesAwarded).toBe(2);
    }
  });

  it('bench KO: Pokemon removed from bench, prizes awarded, no promotion', () => {
    const baseState = makeBaseState();
    const benchPokemon = makeInPlayPokemon('p2-bench-ko', { damageCounters: 7 }); // 70 HP
    baseState.cardRegistry.set('p2-bench-ko', makeCardInstance('p2-bench-ko', PAWNIARD_ID, 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          bench: [benchPokemon]
        }
      }
    };

    const result = checkKnockOuts(state);

    // Bench Pokemon removed
    expect(result.players.player2.bench.length).toBe(0);
    // Active still present
    expect(result.players.player2.active).not.toBeNull();
    // Prize awarded to opponent
    const prizeEvent = result.eventLog.find(e => e.type === 'PRIZE_TAKEN');
    expect(prizeEvent).toBeDefined();
  });

  it('active KO: Pokemon removed, bench auto-promoted, prizes awarded', () => {
    const baseState = makeBaseState();
    const koPokemon = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 7 });
    const benchReplacement = makeInPlayPokemon('p2-bench-rep');
    baseState.cardRegistry.set('p2-bench-rep', makeCardInstance('p2-bench-rep', PAWNIARD_ID, 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          active: koPokemon,
          bench: [benchReplacement]
        }
      }
    };

    const result = checkKnockOuts(state);

    // Active promoted from bench
    expect(result.players.player2.active?.instanceId).toBe('p2-bench-rep');
    expect(result.players.player2.bench.length).toBe(0);
    // KO event emitted
    const koEvent = result.eventLog.find(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvent).toBeDefined();
  });

  it('multiple KOs: Active + bench snipe all processed; prizes cumulative', () => {
    const baseState = makeBaseState();
    const koActive = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 7 });
    const koBench = makeInPlayPokemon('p2-bench-ko2', { damageCounters: 7 });
    const healthyBench = makeInPlayPokemon('p2-healthy');
    baseState.cardRegistry.set('p2-bench-ko2', makeCardInstance('p2-bench-ko2', PAWNIARD_ID, 'player2'));
    baseState.cardRegistry.set('p2-healthy', makeCardInstance('p2-healthy', PAWNIARD_ID, 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          active: koActive,
          bench: [koBench, healthyBench]
        }
      }
    };

    const result = checkKnockOuts(state);

    const koEvents = result.eventLog.filter(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvents.length).toBe(2);
    const prizeEvents = result.eventLog.filter(e => e.type === 'PRIZE_TAKEN');
    expect(prizeEvents.length).toBe(2); // 1 + 1 prizes for two basic KOs
  });

  it('all KOs collected before promotion', () => {
    const baseState = makeBaseState();
    // Both active and bench KO'd
    const koActive = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 7 });
    const koBench1 = makeInPlayPokemon('p2-bench-a', { damageCounters: 7 });
    const healthyBench = makeInPlayPokemon('p2-healthy-b');
    baseState.cardRegistry.set('p2-bench-a', makeCardInstance('p2-bench-a', PAWNIARD_ID, 'player2'));
    baseState.cardRegistry.set('p2-healthy-b', makeCardInstance('p2-healthy-b', PAWNIARD_ID, 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          active: koActive,
          bench: [koBench1, healthyBench]
        }
      }
    };

    const result = checkKnockOuts(state);

    // Active should have been promoted from the healthy bench Pokemon
    // (after all KOs processed)
    expect(result.players.player2.active?.instanceId).toBe('p2-healthy-b');
    expect(result.players.player2.bench.length).toBe(0);
  });
});

// ─── Event Emission ───────────────────────────────────────────────────────

describe('event emission', () => {
  it('DAMAGE_DEALT emitted for pipeline damage', () => {
    const state = makeBaseState();
    // Use resolveAttack — Mareep Headbutt (10 damage) vs Pawniard
    const result = resolveAttack(state, 0);

    const dealEvent = result.eventLog.find(e => e.type === 'DAMAGE_DEALT');
    expect(dealEvent).toBeDefined();
    if (dealEvent && dealEvent.type === 'DAMAGE_DEALT') {
      expect(dealEvent.amount).toBe(10);
    }
  });

  it('DAMAGE_COUNTERS_PLACED emitted for direct counter placement', () => {
    const state = makeBaseState();
    const result = placeDamageCountersOn(state, 'p2-pawniard-0', 3, 'test_source');
    const dcpEvent = result.eventLog.find(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    expect(dcpEvent).toBeDefined();
    if (dcpEvent && dcpEvent.type === 'DAMAGE_COUNTERS_PLACED') {
      expect(dcpEvent.counters).toBe(3);
      expect(dcpEvent.source).toBe('test_source');
    }
  });

  it('events are distinct (DAMAGE_DEALT vs DAMAGE_COUNTERS_PLACED)', () => {
    const state = makeBaseState();
    // Pipeline damage via resolveAttack
    const pipelineResult = resolveAttack(state, 0);

    const dealEvents = pipelineResult.eventLog.filter(e => e.type === 'DAMAGE_DEALT');
    const counterEvents = pipelineResult.eventLog.filter(e => e.type === 'DAMAGE_COUNTERS_PLACED');

    // Pipeline produces DAMAGE_DEALT, not DAMAGE_COUNTERS_PLACED
    expect(dealEvents.length).toBe(1);
    expect(counterEvents.length).toBe(0);

    // Direct placement produces DAMAGE_COUNTERS_PLACED, not DAMAGE_DEALT
    const directResult = placeDamageCountersOn(state, 'p2-pawniard-0', 2, 'poison');
    const directDeal = directResult.eventLog.filter(e => e.type === 'DAMAGE_DEALT');
    const directCounter = directResult.eventLog.filter(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    expect(directDeal.length).toBe(0);
    expect(directCounter.length).toBe(1);
  });
});

// ─── Pre-attack Effects ───────────────────────────────────────────────────

describe('pre-attack effects', () => {
  it('prevention effect applies when targetInstanceId matches current Active', () => {
    const state = makeBaseState({
      temporalEffects: [{
        id: 'prevent-1',
        type: 'attack_prevention',
        sourceInstanceId: 'p2-pawniard-0',
        targetInstanceId: 'p1-mareep-0', // matches attacker
        expiresOnTurn: null,
        payload: {}
      }]
    });

    const result = resolveAttack(state, 0);

    // Attack should be cancelled — no damage dealt
    const dealEvent = result.eventLog.find(e => e.type === 'DAMAGE_DEALT');
    expect(dealEvent).toBeUndefined();
    // Effect should be removed
    expect(result.temporalEffects.length).toBe(0);
  });

  it('prevention effect does NOT apply when Active has changed (zone change)', () => {
    const state = makeBaseState({
      temporalEffects: [{
        id: 'prevent-2',
        type: 'attack_prevention',
        sourceInstanceId: 'p2-pawniard-0',
        targetInstanceId: 'p1-some-other-pokemon', // does NOT match current Active
        expiresOnTurn: null,
        payload: {}
      }]
    });

    const result = resolveAttack(state, 0);

    // Attack should proceed — damage dealt
    const dealEvent = result.eventLog.find(e => e.type === 'DAMAGE_DEALT');
    expect(dealEvent).toBeDefined();
  });
});

// ─── Energy Discard ───────────────────────────────────────────────────────

describe('discardEnergyFromPokemon', () => {
  it('removes energy from Pokemon and moves to discard pile', () => {
    const state = makeBaseState();
    const result = discardEnergyFromPokemon(state, 'p1-mareep-0', ['p1-energy-0']);

    // Energy removed from Pokemon
    const active = result.players.player1.active!;
    expect(active.attachedEnergy).not.toContain('p1-energy-0');
    expect(active.attachedEnergy).toContain('p1-energy-1');

    // Energy added to discard pile
    expect(result.players.player1.discard).toContain('p1-energy-0');

    // Event emitted
    const discardEvent = result.eventLog.find(
      e => e.type === 'CARD_DISCARDED' && e.type === 'CARD_DISCARDED' && 'cardInstanceId' in e && e.cardInstanceId === 'p1-energy-0'
    );
    expect(discardEvent).toBeDefined();
  });
});

// ─── Self-Damage ──────────────────────────────────────────────────────────

describe('dealSelfDamage', () => {
  it('recoil places counters on attacker, bypasses pipeline', () => {
    const state = makeBaseState();
    const result = dealSelfDamage(state, 'p1-mareep-0', 30);

    const active = result.players.player1.active!;
    expect(active.damageCounters).toBe(3); // 30/10

    // Uses DAMAGE_COUNTERS_PLACED, not DAMAGE_DEALT
    const dcpEvent = result.eventLog.find(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    expect(dcpEvent).toBeDefined();
    if (dcpEvent && dcpEvent.type === 'DAMAGE_COUNTERS_PLACED') {
      expect(dcpEvent.source).toBe('self_damage');
    }

    const dealEvent = result.eventLog.find(e => e.type === 'DAMAGE_DEALT');
    expect(dealEvent).toBeUndefined();
  });
});

// ─── Full Attack Flow (Integration) ───────────────────────────────────────

describe('full attack flow', () => {
  it('ATTACK action goes through resolveAttack, checkKnockOuts, endTurn', () => {
    const state = makeBaseState({ phase: 'main', turnFlags: { ...makeBaseState().turnFlags, attackUsed: false } });

    const result = applyAction(state, { type: 'ATTACK', attackIndex: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Attack was declared
      const declaredEvent = result.value.eventLog.find(e => e.type === 'ATTACK_DECLARED');
      expect(declaredEvent).toBeDefined();
      // Damage was dealt (Mareep Headbutt = 10)
      const dealEvent = result.value.eventLog.find(e => e.type === 'DAMAGE_DEALT');
      expect(dealEvent).toBeDefined();
      // Defender took damage
      const defender = result.value.players.player2.active;
      expect(defender?.damageCounters).toBe(1); // 10/10
    }
  });

  it('attack with 0 damage does not emit DAMAGE_DEALT', () => {
    const zeroDamageDef = makeSyntheticDef({
      id: 'syn-zero-atk',
      types: ['Lightning'],
      attacks: [{ name: 'Growl', cost: [], damage: 0, damageModifier: null, text: 'Lower power', effectId: 'growl-effect' }]
    });

    const baseState = makeBaseState({ phase: 'main', turnFlags: { ...makeBaseState().turnFlags, attackUsed: false } });
    const defRegistry = new Map<string, CardDefinition>(pool);
    defRegistry.set('syn-zero-atk', zeroDamageDef);

    baseState.cardRegistry.set('p1-zero', makeCardInstance('p1-zero', 'syn-zero-atk', 'player1'));
    const zeroAttacker = makeInPlayPokemon('p1-zero');

    const state = {
      ...baseState,
      definitionRegistry: defRegistry,
      players: {
        ...baseState.players,
        player1: { ...baseState.players.player1, active: zeroAttacker }
      }
    };

    const result = applyAction(state, { type: 'ATTACK', attackIndex: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const dealEvent = result.value.eventLog.find(e => e.type === 'DAMAGE_DEALT');
      expect(dealEvent).toBeUndefined();
    }
  });

  it('game ends correctly when attack KO drains prize pile', () => {
    const baseState = makeBaseState({ phase: 'main', turnFlags: { ...makeBaseState().turnFlags, attackUsed: false } });

    // Set player1 down to 1 prize remaining
    // Make Mareep do enough damage to KO Pawniard (70 HP)
    // Use Lightning Ball = 20 damage. Pawniard already has 5 counters (50 damage), 20 more = 70 = KO
    const weakPawniard = makeInPlayPokemon('p2-pawniard-0', { damageCounters: 5 });
    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player1: {
          ...baseState.players.player1,
          prizes: ['p1-prize-0'], // 1 prize left
          active: { ...baseState.players.player1.active!, attachedEnergy: ['p1-energy-0', 'p1-energy-1'] }
        },
        player2: {
          ...baseState.players.player2,
          active: weakPawniard
        }
      }
    };

    // Use attack index 1 (Lightning Ball = 20 damage)
    const result = applyAction(state, { type: 'ATTACK', attackIndex: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phase).toBe('finished');
      expect(result.value.winner).toBe('player1');
    }
  });
});

// ─── handleKnockOut bench extension ───────────────────────────────────────

describe('handleKnockOut bench extension', () => {
  it('bench KO: discard Pokemon + attachments, award prizes, no promotion', () => {
    const baseState = makeBaseState();
    const benchPokemon = makeInPlayPokemon('p2-bench-hko', {
      damageCounters: 7,
      attachedEnergy: ['p2-energy-0', 'p2-energy-1']
    });
    baseState.cardRegistry.set('p2-bench-hko', makeCardInstance('p2-bench-hko', PAWNIARD_ID, 'player2'));

    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player2: {
          ...baseState.players.player2,
          bench: [benchPokemon]
        }
      }
    };

    const result = handleKnockOut(state, 'p2-bench-hko');

    // Bench Pokemon removed
    expect(result.players.player2.bench.length).toBe(0);
    // Active unchanged
    expect(result.players.player2.active?.instanceId).toBe('p2-pawniard-0');
    // Discarded
    expect(result.players.player2.discard).toContain('p2-bench-hko');
    // Prize awarded
    const koEvent = result.eventLog.find(e => e.type === 'POKEMON_KNOCKED_OUT');
    expect(koEvent).toBeDefined();
    const prizeEvent = result.eventLog.find(e => e.type === 'PRIZE_TAKEN');
    expect(prizeEvent).toBeDefined();
  });
});
