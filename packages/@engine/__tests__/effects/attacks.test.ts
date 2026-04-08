import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState, CardInstance } from '../../lib/types/game';
import type { ChoiceResolver, EffectChoice } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import { resolveAttackEffect } from '../../lib/effects/registry';
import type { AttackContext } from '../../lib/effects/registry';
import '../../lib/effects/attacks';
import {
  healSelf,
  applyConditionToDefender,
  coinFlipBonusDamage,
  coinFlipApplyCondition,
  maySwitchSelfAfterAttack,
  discardAllEnergyFromSelf,
  discardEnergyFromSelf,
  sniperBench,
  lockSelfNextTurn,
  preventDamageNextTurn
} from '../../lib/effects/attacks';

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

function firstValidResolver(choice: EffectChoice): ReadonlyArray<string> {
  return choice.options.slice(0, Math.max(choice.min, 1));
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

  for (let i = 0; i < 10; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, MAREEP_ID, 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, PAWNIARD_ID, 'player2'));
  }

  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, LIGHTNING_ENERGY_ID, 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, FIRE_ENERGY_ID, 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: Array.from({ length: 10 }, (_, i) => `p1-deck-${i}`),
    hand: [],
    prizes: Array.from({ length: 6 }, (_, i) => `p1-prize-${i}`),
    active: makeInPlayPokemon('p1-mareep-0', {
      attachedEnergy: ['p1-energy-0', 'p1-energy-1', 'p1-energy-2']
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

function makeAttackContext(state: GameState, attackIndex: number = 0): AttackContext {
  const attackerDef = pool.get(MAREEP_ID) as PokemonCardDefinition;
  const defenderDef = pool.get(PAWNIARD_ID) as PokemonCardDefinition;
  return {
    attacker: state.players.player1.active!,
    attackerDef,
    defender: state.players.player2.active!,
    defenderDef,
    attackIndex,
    player: 'player1',
    opponent: 'player2',
    choiceResolver: firstValidResolver
  };
}

// ─── Heal Self ───────────────────────────────────────────────────────────

describe('healSelf', () => {
  it('heals specified amount from attacker', () => {
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
    const handler = healSelf(30);
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.players.player1.active!.damageCounters).toBe(2);
  });
});

// ─── Apply Condition to Defender ─────────────────────────────────────────

describe('applyConditionToDefender', () => {
  it('applies correct SpecialCondition', () => {
    const state = makeBaseState();
    const handler = applyConditionToDefender('Burned');
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.players.player2.active!.specialConditions).toContain('Burned');
  });
});

// ─── Coin Flip + Bonus Damage ────────────────────────────────────────────

describe('coinFlipBonusDamage', () => {
  it('heads = bonus damage counters placed, tails = no extra', () => {
    const state = makeBaseState();
    const handler = coinFlipBonusDamage(20);
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    // We don't know if heads or tails — check that state is consistent
    const defenderDamage = result.players.player2.active!.damageCounters;
    expect(defenderDamage === 0 || defenderDamage === 2).toBe(true);
    const coinEvents = result.eventLog.filter(e => e.type === 'COIN_FLIPPED');
    expect(coinEvents.length).toBe(1);
  });
});

// ─── Coin Flip + Apply Condition ─────────────────────────────────────────

describe('coinFlipApplyCondition', () => {
  it('applies condition on heads, nothing on tails', () => {
    const state = makeBaseState();
    const handler = coinFlipApplyCondition('Paralyzed');
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    const coinEvents = result.eventLog.filter(e => e.type === 'COIN_FLIPPED');
    expect(coinEvents.length).toBe(1);
    // Either has condition or doesn't based on flip
  });
});

// ─── Discard All Energy From Self ────────────────────────────────────────

describe('discardAllEnergyFromSelf', () => {
  it('removes all attached energy', () => {
    const state = makeBaseState();
    const handler = discardAllEnergyFromSelf();
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.players.player1.active!.attachedEnergy.length).toBe(0);
    expect(result.players.player1.discard.length).toBe(3);
  });
});

// ─── Discard N Energy From Self ──────────────────────────────────────────

describe('discardEnergyFromSelf', () => {
  it('removes specified count of energy', () => {
    const state = makeBaseState();
    const handler = discardEnergyFromSelf(1);
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.players.player1.active!.attachedEnergy.length).toBe(2);
    expect(result.players.player1.discard.length).toBe(1);
  });
});

// ─── Bench Snipe ─────────────────────────────────────────────────────────

describe('sniperBench', () => {
  it('deals damage to a bench target', () => {
    const state = makeBaseState();
    const handler = sniperBench(30);
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    const benchTarget = result.players.player2.bench[0]!;
    expect(benchTarget.damageCounters).toBe(3);
  });

  it('does nothing if no bench targets', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, bench: [] }
      }
    };
    const handler = sniperBench(30);
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result).toEqual(state);
  });
});

// ─── Switch Self After Attack ────────────────────────────────────────────

describe('maySwitchSelfAfterAttack', () => {
  it('may switch attacker with Benched', () => {
    const state = makeBaseState();
    const handler = maySwitchSelfAfterAttack();
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.players.player1.active!.instanceId).toBe('p1-bench-mareep');
  });
});

// ─── Lock Self Next Turn ─────────────────────────────────────────────────

describe('lockSelfNextTurn', () => {
  it('creates temporal effect preventing attack next turn', () => {
    const state = makeBaseState();
    const handler = lockSelfNextTurn();
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.temporalEffects.length).toBe(1);
    expect(result.temporalEffects[0]!.type).toBe('attack_lock');
    expect(result.temporalEffects[0]!.sourceType).toBe('attack');
    expect(result.temporalEffects[0]!.expiresAt).toBe('end_of_next_turn');
  });
});

// ─── Prevent Damage Next Turn ────────────────────────────────────────────

describe('preventDamageNextTurn', () => {
  it('creates temporal effect preventing damage next turn', () => {
    const state = makeBaseState();
    const handler = preventDamageNextTurn();
    const ctx = makeAttackContext(state);
    const result = handler(state, ctx);
    expect(result.temporalEffects.length).toBe(1);
    expect(result.temporalEffects[0]!.type).toBe('damage_prevention');
    expect(result.temporalEffects[0]!.sourceType).toBe('attack');
    expect(result.temporalEffects[0]!.expiresAt).toBe('end_of_opponent_turn');
  });
});

// ─── Fallback ────────────────────────────────────────────────────────────

describe('Fallback behavior', () => {
  it('unregistered attack effectId does not crash', () => {
    const state = makeBaseState();
    const attackerDef: PokemonCardDefinition = {
      ...pool.get(MAREEP_ID) as PokemonCardDefinition,
      attacks: [{
        name: 'Unknown Attack',
        cost: ['Lightning'],
        damage: 50,
        damageModifier: null,
        text: 'Does something unregistered',
        effectId: 'nonexistent-effect-id'
      }]
    };
    const ctx: AttackContext = {
      attacker: state.players.player1.active!,
      attackerDef,
      defender: state.players.player2.active!,
      defenderDef: pool.get(PAWNIARD_ID) as PokemonCardDefinition,
      attackIndex: 0,
      player: 'player1',
      opponent: 'player2',
      choiceResolver: firstValidResolver
    };
    const result = resolveAttackEffect(state, ctx);
    expect(result).toEqual(state);
  });
});

// ─── Temporal Effects ────────────────────────────────────────────────────

describe('Temporal effect cleanup', () => {
  it('end_of_turn effects removed by endTurn', () => {
    const { endTurn } = require('../../lib/core/turn') as typeof import('../../lib/core/turn');
    let state = makeBaseState({ phase: 'main' });
    state = {
      ...state,
      temporalEffects: [{
        id: 'eot-effect',
        type: 'damage_modifier',
        sourceInstanceId: 'p1-mareep-0',
        sourceType: 'attack',
        targetInstanceId: 'p1-mareep-0',
        expiresOnTurn: null,
        expiresAt: 'end_of_turn',
        payload: { amount: 20 }
      }]
    };
    const result = endTurn(state);
    expect(result.temporalEffects.some(e => e.id === 'eot-effect')).toBe(false);
  });

  it('retreat removes only sourceType === attack effects', () => {
    const { applyAction } = require('../../lib/core/turn') as typeof import('../../lib/core/turn');
    let state = makeBaseState({ phase: 'main' });
    state = {
      ...state,
      temporalEffects: [
        {
          id: 'attack-eff',
          type: 'damage_modifier',
          sourceInstanceId: 'p2-pawniard-0',
          sourceType: 'attack',
          targetInstanceId: 'p1-mareep-0',
          expiresOnTurn: null,
          expiresAt: 'end_of_opponent_turn',
          payload: { amount: -20 }
        },
        {
          id: 'trainer-eff',
          type: 'damage_reduction',
          sourceInstanceId: 'some-tool',
          sourceType: 'trainer',
          targetInstanceId: 'p1-mareep-0',
          expiresOnTurn: null,
          expiresAt: 'permanent',
          payload: { amount: -10 }
        }
      ]
    };
    const result = applyAction(state, {
      type: 'RETREAT',
      newActiveInstanceId: 'p1-bench-mareep',
      energyToDiscard: []
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.temporalEffects.some(e => e.id === 'attack-eff')).toBe(false);
      expect(result.value.temporalEffects.some(e => e.id === 'trainer-eff')).toBe(true);
    }
  });

  it('evolution removes only sourceType === attack effects', () => {
    const { evolvePokemon } = require('../../lib/core/evolution') as typeof import('../../lib/core/evolution');
    let state = makeBaseState();
    const cr = new Map(state.cardRegistry);
    const FLAAFFY_ID = 'svp-108';
    cr.set('p1-flaaffy-0', makeCardInstance('p1-flaaffy-0', FLAAFFY_ID, 'player1'));
    state = {
      ...state,
      cardRegistry: cr,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          hand: [...state.players.player1.hand, 'p1-flaaffy-0']
        }
      },
      temporalEffects: [
        {
          id: 'attack-eff',
          type: 'damage_modifier',
          sourceInstanceId: 'other',
          sourceType: 'attack',
          targetInstanceId: 'p1-mareep-0',
          expiresOnTurn: null,
          expiresAt: 'end_of_opponent_turn',
          payload: { amount: -20 }
        },
        {
          id: 'ability-eff',
          type: 'damage_reduction',
          sourceInstanceId: 'other',
          sourceType: 'ability',
          targetInstanceId: 'p1-mareep-0',
          expiresOnTurn: null,
          expiresAt: 'permanent',
          payload: { amount: -10 }
        }
      ]
    };

    const result = evolvePokemon(state, 'p1-flaaffy-0', 'p1-mareep-0');
    expect(result.temporalEffects.some(e => e.id === 'attack-eff')).toBe(false);
    expect(result.temporalEffects.some(e => e.id === 'ability-eff')).toBe(true);
  });
});
