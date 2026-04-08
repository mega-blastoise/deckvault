import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type {
  CardDefinition,
  PokemonCardDefinition,
  TrainerCardDefinition,
  EnergyType,
  AttackDefinition
} from '../../lib/types/card';
import type {
  GameState,
  InPlayPokemon,
  PlayerId,
  PlayerState,
  CardInstance,
  StadiumState
} from '../../lib/types/game';
import type { TemporalEffect } from '../../lib/types/effect';
import { createRngState } from '../../lib/rng';
import {
  getDamageOutputModifiers,
  getDamageInputModifiers,
  getRetreatCostModifiers,
  getEffectiveRetreatCost,
  getAttackCostModifiers,
  getEffectiveAttackCost,
  getHpModifiers,
  getEffectiveHp,
  getEffectiveHpById,
  modifyPrizeCount,
  checkSurvivalEffects,
  resolveOnDamageTriggers,
  resolveOnKOTriggers,
  getPoisonModifiers,
  checkConditionImmunity,
  isJammingTowerActive,
  isNeutralizationZoneActive
} from '../../lib/core/modifiers';
import { calculateDamage } from '../../lib/core/combat';
import { performCheckup } from '../../lib/core/checkup';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

// ─── Test Helpers ─────────────────────────────────────────────────────────

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

function makeToolDef(name: string): TrainerCardDefinition {
  return {
    cardType: 'Trainer',
    id: `tool-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    name,
    subtypes: ['Pokemon Tool'],
    rules: [],
    effectId: name,
    regulationMark: 'H',
    setId: 'test',
    setName: 'Test Set',
    releaseDate: '2025-01-01',
    isAceSpec: false
  } as TrainerCardDefinition;
}

function makeStadiumDef(name: string): TrainerCardDefinition {
  return {
    cardType: 'Trainer',
    id: `stadium-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    name,
    subtypes: ['Stadium'],
    rules: [],
    effectId: name,
    regulationMark: 'H',
    setId: 'test',
    setName: 'Test Set',
    releaseDate: '2025-01-01',
    isAceSpec: false
  } as TrainerCardDefinition;
}

function makePokemonDef(overrides: Partial<PokemonCardDefinition> = {}): PokemonCardDefinition {
  return {
    cardType: 'Pokemon',
    id: 'test-pokemon',
    name: 'Test Pokemon',
    stage: 'Basic',
    subtypes: [],
    hp: 100,
    types: ['Colorless'],
    attacks: [{ name: 'Tackle', cost: ['Colorless'], damage: 30, damageModifier: null, effectId: null, text: '' }],
    abilities: [],
    weaknesses: [],
    resistances: [],
    retreatCost: 2,
    prizeValue: 1,
    regulationMark: 'H',
    evolvesFrom: null,
    setId: 'test',
    setName: 'Test Set',
    releaseDate: '2025-01-01',
    ...overrides
  } as PokemonCardDefinition;
}

function makeBaseState(overrides: Partial<GameState> = {}): GameState {
  const cardRegistry = new Map<string, CardInstance>();
  const definitionRegistry = new Map<string, CardDefinition>(pool);

  const p1Active = makeInPlayPokemon('p1-active-0');
  const p2Active = makeInPlayPokemon('p2-active-0');

  const p1Def = makePokemonDef({ id: 'p1-pokemon', name: 'Attacker', types: ['Lightning'], hp: 120 });
  const p2Def = makePokemonDef({ id: 'p2-pokemon', name: 'Defender', types: ['Water'], hp: 100, weaknesses: [{ type: 'Lightning', value: 'x2' }] });

  definitionRegistry.set('p1-pokemon', p1Def);
  definitionRegistry.set('p2-pokemon', p2Def);
  cardRegistry.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-pokemon', 'player1'));
  cardRegistry.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-pokemon', 'player2'));

  // Deck + prize cards
  for (let i = 0; i < 6; i++) {
    cardRegistry.set(`p1-deck-${i}`, makeCardInstance(`p1-deck-${i}`, 'p1-pokemon', 'player1'));
    cardRegistry.set(`p2-deck-${i}`, makeCardInstance(`p2-deck-${i}`, 'p2-pokemon', 'player2'));
    cardRegistry.set(`p1-prize-${i}`, makeCardInstance(`p1-prize-${i}`, 'p1-pokemon', 'player1'));
    cardRegistry.set(`p2-prize-${i}`, makeCardInstance(`p2-prize-${i}`, 'p2-pokemon', 'player2'));
  }

  const player1: PlayerState = {
    id: 'player1',
    deck: Array.from({ length: 6 }, (_, i) => `p1-deck-${i}`),
    hand: [],
    prizes: Array.from({ length: 6 }, (_, i) => `p1-prize-${i}`),
    active: p1Active,
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
    deck: Array.from({ length: 6 }, (_, i) => `p2-deck-${i}`),
    hand: [],
    prizes: Array.from({ length: 6 }, (_, i) => `p2-prize-${i}`),
    active: p2Active,
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
    phase: 'attack',
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

function addTool(state: GameState, pokemonInstanceId: string, toolName: string, toolInstanceId: string, owner: PlayerId): GameState {
  const toolDef = makeToolDef(toolName);
  const newDefReg = new Map(state.definitionRegistry);
  newDefReg.set(toolDef.id, toolDef);
  const newCardReg = new Map(state.cardRegistry);
  newCardReg.set(toolInstanceId, makeCardInstance(toolInstanceId, toolDef.id, owner));

  let s: GameState = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };

  // Attach tool to Pokemon
  const newPlayers = { ...s.players };
  for (const pid of ['player1', 'player2'] as PlayerId[]) {
    const ps = newPlayers[pid]!;
    if (ps.active?.instanceId === pokemonInstanceId) {
      newPlayers[pid] = {
        ...ps,
        active: { ...ps.active, attachedTools: [...ps.active.attachedTools, toolInstanceId] }
      };
      break;
    }
    const benchIdx = ps.bench.findIndex(b => b.instanceId === pokemonInstanceId);
    if (benchIdx !== -1) {
      const newBench = [...ps.bench];
      newBench[benchIdx] = { ...ps.bench[benchIdx]!, attachedTools: [...ps.bench[benchIdx]!.attachedTools, toolInstanceId] };
      newPlayers[pid] = { ...ps, bench: newBench };
      break;
    }
  }
  return { ...s, players: newPlayers };
}

function addStadium(state: GameState, stadiumName: string, playedBy: PlayerId): GameState {
  const stadiumDef = makeStadiumDef(stadiumName);
  const instanceId = `stadium-inst-${stadiumName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const newDefReg = new Map(state.definitionRegistry);
  newDefReg.set(stadiumDef.id, stadiumDef);
  const newCardReg = new Map(state.cardRegistry);
  newCardReg.set(instanceId, makeCardInstance(instanceId, stadiumDef.id, playedBy));

  return {
    ...state,
    cardRegistry: newCardReg,
    definitionRegistry: newDefReg,
    stadium: { cardInstanceId: instanceId, playedBy }
  };
}

function getP1Def(state: GameState): PokemonCardDefinition {
  return state.definitionRegistry.get('p1-pokemon') as PokemonCardDefinition;
}

function getP2Def(state: GameState): PokemonCardDefinition {
  return state.definitionRegistry.get('p2-pokemon') as PokemonCardDefinition;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Jamming Tower', () => {
  it('is not active when no stadium', () => {
    const state = makeBaseState();
    expect(isJammingTowerActive(state)).toBe(false);
  });

  it('is active when Jamming Tower is in play', () => {
    const state = addStadium(makeBaseState(), 'Jamming Tower', 'player1');
    expect(isJammingTowerActive(state)).toBe(true);
  });

  it('is not active for other stadiums', () => {
    const state = addStadium(makeBaseState(), 'Beach Court', 'player1');
    expect(isJammingTowerActive(state)).toBe(false);
  });
});

describe('getDamageOutputModifiers', () => {
  it('returns 0 bonus with no tools or stadiums', () => {
    const state = makeBaseState();
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(0);
  });

  it('Vitality Band adds +10 to opponent Active', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Vitality Band', 'tool-vb-0', 'player1');
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(10);
  });

  it('Defiance Band adds +30 when attacker has more prizes', () => {
    let state = makeBaseState();
    // Player1 has 6 prizes, player2 has 3 — player1 has MORE remaining
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: state.players.player2.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p1-active-0', 'Defiance Band', 'tool-db-0', 'player1');
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(30);
  });

  it('Defiance Band does NOT add bonus when fewer prizes', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, prizes: state.players.player1.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p1-active-0', 'Defiance Band', 'tool-db-0', 'player1');
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(0);
  });

  it('Maximum Belt adds +50 when target is ex', () => {
    let state = makeBaseState();
    const exDef = makePokemonDef({ id: 'p2-ex', name: 'Charizard ex', subtypes: ['ex'], hp: 330, prizeValue: 2 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-ex', exDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-ex', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Maximum Belt', 'tool-mb-0', 'player1');

    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, exDef, 'player1'
    );
    expect(result.flatBonus).toBe(50);
  });

  it('Maximum Belt does NOT add bonus to non-ex', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Maximum Belt', 'tool-mb-0', 'player1');
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(0);
  });

  it('Brave Bangle adds +30 when attacker has no Rule Box and target is ex', () => {
    let state = makeBaseState();
    const exDef = makePokemonDef({ id: 'p2-ex', name: 'Charizard ex', subtypes: ['ex'], hp: 330, prizeValue: 2 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-ex', exDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-ex', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Brave Bangle', 'tool-bb-0', 'player1');

    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, exDef, 'player1'
    );
    expect(result.flatBonus).toBe(30);
  });

  it('Binding Mochi adds +40 when attacker is Poisoned', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, specialConditions: ['Poisoned'] }
        }
      }
    };
    state = addTool(state, 'p1-active-0', 'Binding Mochi', 'tool-bm-0', 'player1');
    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(40);
  });

  it('Practice Studio adds +10 for Stage 1', () => {
    let state = makeBaseState();
    const s1Def = makePokemonDef({ id: 'p1-s1', name: 'Stage 1 Mon', stage: 'Stage1' });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-s1', s1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-s1', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addStadium(state, 'Practice Studio', 'player1');

    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, s1Def,
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(10);
  });

  it('Jamming Tower suppresses tool bonuses', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Vitality Band', 'tool-vb-0', 'player1');
    state = addStadium(state, 'Jamming Tower', 'player2');

    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(0);
  });

  it('multiple tools stack bonuses', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Vitality Band', 'tool-vb-0', 'player1');
    // Bind mochi with poison
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, specialConditions: ['Poisoned'] }
        }
      }
    };
    state = addTool(state, 'p1-active-0', 'Binding Mochi', 'tool-bm-0', 'player1');

    const result = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(result.flatBonus).toBe(50); // 10 + 40
  });
});

describe('getDamageInputModifiers', () => {
  it('returns 0 with no tools or stadiums', () => {
    const state = makeBaseState();
    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(0);
    expect(result.removeWeakness).toBe(false);
    expect(result.toolsToDiscard).toEqual([]);
  });

  it('Defiance Vest reduces by 40 when more prizes', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: state.players.player2.prizes } // 6 prizes
      }
    };
    // Opponent (player1) has fewer prizes
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, prizes: state.players.player1.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p2-active-0', 'Defiance Vest', 'tool-dv-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(40);
  });

  it('Rigid Band reduces by 30 for Stage 1', () => {
    let state = makeBaseState();
    const s1Def = makePokemonDef({ id: 'p2-s1', name: 'Stage 1 Defender', stage: 'Stage1', types: ['Water'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-s1', s1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-s1', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Rigid Band', 'tool-rb-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, s1Def,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(30);
  });

  it('Rock Chestplate reduces by 30 for Fighting', () => {
    let state = makeBaseState();
    const fDef = makePokemonDef({ id: 'p2-fight', name: 'Fighter', types: ['Fighting'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-fight', fDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-fight', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Rock Chestplate', 'tool-rc-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, fDef,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(30);
  });

  it('Babiri Berry reduces by 60 from Metal and marks for discard', () => {
    let state = makeBaseState();
    const metalDef = makePokemonDef({ id: 'p1-metal', name: 'Metal Mon', types: ['Metal'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-metal', metalDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-metal', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Babiri Berry', 'tool-babiri-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, metalDef, 'player2'
    );
    expect(result.flatReduction).toBe(60);
    expect(result.toolsToDiscard).toEqual(['tool-babiri-0']);
  });

  it('Babiri Berry does NOT trigger from non-Metal', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Babiri Berry', 'tool-babiri-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, getP1Def(state), 'player2' // Lightning attacker
    );
    expect(result.flatReduction).toBe(0);
    expect(result.toolsToDiscard).toEqual([]);
  });

  it('Protective Goggles removes weakness for Basic', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Protective Goggles', 'tool-pg-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.removeWeakness).toBe(true);
  });

  it('Protective Goggles does NOT remove weakness for Stage 1', () => {
    let state = makeBaseState();
    const s1Def = makePokemonDef({ id: 'p2-s1', name: 'Stage 1', stage: 'Stage1', types: ['Water'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-s1', s1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-s1', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Protective Goggles', 'tool-pg-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, s1Def,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.removeWeakness).toBe(false);
  });

  it('Full Metal Lab reduces by 30 for Metal Pokemon', () => {
    let state = makeBaseState();
    const metalDef = makePokemonDef({ id: 'p2-metal', name: 'Metal Defender', types: ['Metal'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-metal', metalDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-metal', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addStadium(state, 'Full Metal Lab', 'player1');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, metalDef,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(30);
  });

  it('Jamming Tower suppresses tool reductions', () => {
    let state = makeBaseState();
    const s1Def = makePokemonDef({ id: 'p2-s1', name: 'Stage 1 Defender', stage: 'Stage1', types: ['Water'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-s1', s1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-s1', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Rigid Band', 'tool-rb-0', 'player2');
    state = addStadium(state, 'Jamming Tower', 'player1');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, s1Def,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(0);
  });
});

describe('getRetreatCostModifiers', () => {
  it('Air Balloon reduces by 2', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Air Balloon', 'tool-ab-0', 'player1');

    const result = getRetreatCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatReduction).toBe(2);
    expect(result.setToZero).toBe(false);
  });

  it('Big Air Balloon sets to zero for Stage 2', () => {
    let state = makeBaseState();
    const s2Def = makePokemonDef({ id: 'p1-s2', name: 'Stage 2 Mon', stage: 'Stage2', retreatCost: 3 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-s2', s2Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-s2', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Big Air Balloon', 'tool-bab-0', 'player1');

    const result = getRetreatCostModifiers(state, state.players.player1.active!, s2Def, 'player1');
    expect(result.setToZero).toBe(true);
  });

  it('Big Air Balloon does NOT affect Basic', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Big Air Balloon', 'tool-bab-0', 'player1');

    const result = getRetreatCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.setToZero).toBe(false);
  });

  it('Beach Court reduces by 1 for Basic', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Beach Court', 'player1');

    const result = getRetreatCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatReduction).toBe(1);
  });

  it('Calamitous Wasteland adds +1 for non-Fighting Basic', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Calamitous Wasteland', 'player1');

    const result = getRetreatCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatIncrease).toBe(1);
  });

  it('getEffectiveRetreatCost with Air Balloon', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Air Balloon', 'tool-ab-0', 'player1');

    const cost = getEffectiveRetreatCost(state, 'player1', state.players.player1.active!, getP1Def(state));
    expect(cost).toBe(0); // 2 - 2 = 0
  });

  it('Jamming Tower suppresses Air Balloon', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Air Balloon', 'tool-ab-0', 'player1');
    state = addStadium(state, 'Jamming Tower', 'player2');

    const cost = getEffectiveRetreatCost(state, 'player1', state.players.player1.active!, getP1Def(state));
    expect(cost).toBe(2); // Air Balloon suppressed
  });
});

describe('getAttackCostModifiers', () => {
  it('Counter Gain reduces by 1 when more prizes', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: state.players.player2.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p1-active-0', 'Counter Gain', 'tool-cg-0', 'player1');

    const result = getAttackCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.colorlessReduction).toBe(1);
  });

  it('Counter Gain does NOT reduce when fewer prizes', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, prizes: state.players.player1.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p1-active-0', 'Counter Gain', 'tool-cg-0', 'player1');

    const result = getAttackCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.colorlessReduction).toBe(0);
  });

  it('Pokemon League Headquarters adds +1 for Basic', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Pokemon League Headquarters', 'player1');

    const result = getAttackCostModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.colorlessIncrease).toBe(1);
  });

  it('getEffectiveAttackCost removes Colorless cost with Counter Gain', () => {
    let state = makeBaseState();
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: state.players.player2.prizes.slice(0, 3) }
      }
    };
    state = addTool(state, 'p1-active-0', 'Counter Gain', 'tool-cg-0', 'player1');
    const attack: AttackDefinition = { name: 'Test', cost: ['Lightning', 'Colorless'], damage: 50, damageModifier: null, effectId: null, text: '' };

    const cost = getEffectiveAttackCost(state, state.players.player1.active!, getP1Def(state), attack, 'player1');
    expect(cost).toEqual(['Lightning']);
  });

  it('getEffectiveAttackCost adds Colorless with PLH', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Pokemon League Headquarters', 'player1');
    const attack: AttackDefinition = { name: 'Test', cost: ['Colorless'], damage: 30, damageModifier: null, effectId: null, text: '' };

    const cost = getEffectiveAttackCost(state, state.players.player1.active!, getP1Def(state), attack, 'player1');
    expect(cost).toEqual(['Colorless', 'Colorless']);
  });
});

describe('getHpModifiers', () => {
  it("Hero's Cape adds +100 HP", () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', "Hero's Cape", 'tool-hc-0', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatBonus).toBe(100);
  });

  it('Bravery Charm adds +50 for Basic', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Bravery Charm', 'tool-bc-0', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatBonus).toBe(50);
  });

  it('Bravery Charm does NOT add HP for Stage 1', () => {
    let state = makeBaseState();
    const s1Def = makePokemonDef({ id: 'p1-s1', name: 'Stage 1', stage: 'Stage1' });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-s1', s1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-s1', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Bravery Charm', 'tool-bc-0', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, s1Def, 'player1');
    expect(result.flatBonus).toBe(0);
  });

  it('Luxurious Cape adds +100 for non-Rule-Box', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Luxurious Cape', 'tool-lc-0', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatBonus).toBe(100);
  });

  it('Luxurious Cape does NOT add HP for ex', () => {
    let state = makeBaseState();
    const exDef = makePokemonDef({ id: 'p1-ex', name: 'Test ex', subtypes: ['ex'], prizeValue: 2 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-ex', exDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-ex', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Luxurious Cape', 'tool-lc-0', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, exDef, 'player1');
    expect(result.flatBonus).toBe(0);
  });

  it('Lively Stadium adds +30 for Basic', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Lively Stadium', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(result.flatBonus).toBe(30);
  });

  it('Gravity Mountain reduces by 30 for Stage 2', () => {
    let state = makeBaseState();
    const s2Def = makePokemonDef({ id: 'p1-s2', name: 'Stage 2', stage: 'Stage2' });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-s2', s2Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-s2', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addStadium(state, 'Gravity Mountain', 'player1');

    const result = getHpModifiers(state, state.players.player1.active!, s2Def, 'player1');
    expect(result.flatBonus).toBe(-30);
  });

  it('getEffectiveHp includes tool bonus', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', "Hero's Cape", 'tool-hc-0', 'player1');

    const hp = getEffectiveHp(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(hp).toBe(220); // 120 base + 100
  });

  it('getEffectiveHpById resolves def internally', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Bravery Charm', 'tool-bc-0', 'player1');

    const hp = getEffectiveHpById(state, state.players.player1.active!);
    expect(hp).toBe(170); // 120 base + 50
  });

  it('Jamming Tower suppresses HP tool bonuses', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', "Hero's Cape", 'tool-hc-0', 'player1');
    state = addStadium(state, 'Jamming Tower', 'player2');

    const hp = getEffectiveHp(state, state.players.player1.active!, getP1Def(state), 'player1');
    expect(hp).toBe(120); // No bonus
  });
});

describe('modifyPrizeCount', () => {
  it("Lillie's Pearl reduces by 1 for Lillie's Pokemon", () => {
    let state = makeBaseState();
    const lillieDef = makePokemonDef({ id: 'p1-lillie', name: "Lillie's Clefairy", prizeValue: 1 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-lillie', lillieDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-lillie', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', "Lillie's Pearl", 'tool-lp-0', 'player1');

    const prizeCount = modifyPrizeCount(state, state.players.player1.active!, lillieDef, 1, 'player1');
    expect(prizeCount).toBe(1); // min 1
  });

  it('Luxurious Cape adds +1 for non-Rule-Box KO', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Luxurious Cape', 'tool-lc-0', 'player1');

    const prizeCount = modifyPrizeCount(state, state.players.player1.active!, getP1Def(state), 1, 'player1');
    expect(prizeCount).toBe(2); // 1 + 1
  });

  it("Lillie's Pearl does NOT reduce for non-Lillie Pokemon", () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', "Lillie's Pearl", 'tool-lp-0', 'player1');

    const prizeCount = modifyPrizeCount(state, state.players.player1.active!, getP1Def(state), 1, 'player1');
    expect(prizeCount).toBe(1); // No change
  });
});

describe('resolveOnDamageTriggers', () => {
  it('Rocky Helmet places 2 counters on attacker', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Rocky Helmet', 'tool-rh-0', 'player2');

    const s = resolveOnDamageTriggers(state, 'p2-active-0', 'p1-active-0', 30);
    const attacker = s.players.player1.active!;
    expect(attacker.damageCounters).toBe(2);
  });

  it('Lucky Helmet draws 2 cards', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Lucky Helmet', 'tool-lh-0', 'player2');

    const s = resolveOnDamageTriggers(state, 'p2-active-0', 'p1-active-0', 30);
    const defender = s.players.player2;
    expect(defender.hand.length).toBe(2);
    expect(defender.deck.length).toBe(4);
  });

  it('does NOT trigger for benched target', () => {
    let state = makeBaseState();
    const benchPoke = makeInPlayPokemon('p2-bench-0');
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-bench-0', makeCardInstance('p2-bench-0', 'p2-pokemon', 'player2'));
    state = {
      ...state,
      cardRegistry: newCardReg,
      players: {
        ...state.players,
        player2: { ...state.players.player2, bench: [benchPoke] }
      }
    };
    state = addTool(state, 'p2-bench-0', 'Rocky Helmet', 'tool-rh-0', 'player2');

    const s = resolveOnDamageTriggers(state, 'p2-bench-0', 'p1-active-0', 30);
    const attacker = s.players.player1.active!;
    expect(attacker.damageCounters).toBe(0);
  });

  it('Jamming Tower suppresses on-damage triggers', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Rocky Helmet', 'tool-rh-0', 'player2');
    state = addStadium(state, 'Jamming Tower', 'player1');

    const s = resolveOnDamageTriggers(state, 'p2-active-0', 'p1-active-0', 30);
    const attacker = s.players.player1.active!;
    expect(attacker.damageCounters).toBe(0);
  });

  it('Deluxe Bomb places 12 counters and discards itself', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Deluxe Bomb', 'tool-db-0', 'player2');

    const s = resolveOnDamageTriggers(state, 'p2-active-0', 'p1-active-0', 30);
    const attacker = s.players.player1.active!;
    expect(attacker.damageCounters).toBe(12);
    // Tool should be removed
    const defender = s.players.player2.active!;
    expect(defender.attachedTools).not.toContain('tool-db-0');
  });
});

describe('checkSurvivalEffects', () => {
  it('Survival Brace prevents KO when at full HP', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Survival Brace', 'tool-sb-0', 'player1');
    // Pokemon took 12 damage counters (120 damage) this hit, was at full HP
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, damageCounters: 12 }
        }
      }
    };

    const result = checkSurvivalEffects(
      state, state.players.player1.active!, getP1Def(state), true, 'player1'
    );
    expect(result.survived).toBe(true);
    // Should have damageCounters set so only 10 HP remains (120 HP, so 11 counters = 110 damage)
    const pokemon = result.newState.players.player1.active!;
    expect(pokemon.damageCounters).toBe(11); // 120 - 10 = 110, 110/10 = 11
    // Tool should be discarded
    expect(pokemon.attachedTools).not.toContain('tool-sb-0');
  });

  it('Survival Brace does NOT trigger when not at full HP', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Survival Brace', 'tool-sb-0', 'player1');
    // Pokemon had prior damage before this hit
    state = {
      ...state,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, damageCounters: 15 }
        }
      }
    };

    const result = checkSurvivalEffects(
      state, state.players.player1.active!, getP1Def(state), false, 'player1'
    );
    expect(result.survived).toBe(false);
  });
});

describe('getPoisonModifiers', () => {
  it('Perilous Jungle adds 2 extra counters for non-Darkness', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Perilous Jungle', 'player1');

    const extra = getPoisonModifiers(state, state.players.player1.active!, getP1Def(state));
    expect(extra).toBe(2);
  });

  it('Perilous Jungle does NOT add counters for Darkness', () => {
    let state = makeBaseState();
    const darkDef = makePokemonDef({ id: 'p1-dark', name: 'Dark Mon', types: ['Darkness'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-dark', darkDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-dark', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addStadium(state, 'Perilous Jungle', 'player1');

    const extra = getPoisonModifiers(state, state.players.player1.active!, darkDef);
    expect(extra).toBe(0);
  });

  it('returns 0 with no stadium', () => {
    const state = makeBaseState();
    const extra = getPoisonModifiers(state, state.players.player1.active!, getP1Def(state));
    expect(extra).toBe(0);
  });
});

describe('checkConditionImmunity', () => {
  it('Festival Grounds grants immunity when Energy attached', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Festival Grounds', 'player1');
    // Attach energy
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-energy-0', makeCardInstance('p1-energy-0', 'base1-100', 'player1'));
    state = {
      ...state,
      cardRegistry: newCardReg,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, attachedEnergy: ['p1-energy-0'] }
        }
      }
    };

    const immune = checkConditionImmunity(state, state.players.player1.active!, getP1Def(state));
    expect(immune).toBe(true);
  });

  it('Festival Grounds does NOT grant immunity without Energy', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Festival Grounds', 'player1');

    const immune = checkConditionImmunity(state, state.players.player1.active!, getP1Def(state));
    expect(immune).toBe(false);
  });
});

describe('isNeutralizationZoneActive', () => {
  it('blocks ex damage to non-Rule-Box', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Neutralization Zone', 'player1');

    const exDef = makePokemonDef({ id: 'atk-ex', subtypes: ['ex'], prizeValue: 2 });
    const defDef = makePokemonDef({ id: 'def-basic' });

    expect(isNeutralizationZoneActive(state, exDef, defDef)).toBe(true);
  });

  it('does NOT block non-ex damage', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Neutralization Zone', 'player1');

    const atkDef = makePokemonDef({ id: 'atk-basic' });
    const defDef = makePokemonDef({ id: 'def-basic' });

    expect(isNeutralizationZoneActive(state, atkDef, defDef)).toBe(false);
  });

  it('does NOT block ex vs ex damage', () => {
    let state = makeBaseState();
    state = addStadium(state, 'Neutralization Zone', 'player1');

    const atkDef = makePokemonDef({ id: 'atk-ex', subtypes: ['ex'], prizeValue: 2 });
    const defDef = makePokemonDef({ id: 'def-ex', subtypes: ['ex'], prizeValue: 2 });

    expect(isNeutralizationZoneActive(state, atkDef, defDef)).toBe(false);
  });
});

describe('calculateDamage integration', () => {
  it('includes tool output bonus in final damage', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Vitality Band', 'tool-vb-0', 'player1');
    const attack: AttackDefinition = { name: 'Tackle', cost: ['Colorless'], damage: 30, damageModifier: null, effectId: null, text: '' };

    const calc = calculateDamage(
      state.players.player1.active!, state.players.player2.active!,
      attack, getP1Def(state), getP2Def(state), state
    );

    expect(calc.toolAndStadiumOutputBonus).toBe(10);
    // 30 + 10 = 40, x2 weakness = 80 (Water weak to Lightning)
    expect(calc.finalDamage).toBe(80);
  });

  it('includes tool input reduction in final damage', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Defiance Vest', 'tool-dv-0', 'player2');
    // Player2 has more prizes
    state = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, prizes: state.players.player1.prizes.slice(0, 3) }
      }
    };
    const attack: AttackDefinition = { name: 'Tackle', cost: ['Colorless'], damage: 100, damageModifier: null, effectId: null, text: '' };

    const calc = calculateDamage(
      state.players.player1.active!, state.players.player2.active!,
      attack, getP1Def(state), getP2Def(state), state
    );

    expect(calc.toolAndStadiumInputReduction).toBe(40);
    // 100 x2 weakness = 200 - 40 = 160
    expect(calc.finalDamage).toBe(160);
  });

  it('Protective Goggles removes weakness', () => {
    let state = makeBaseState();
    state = addTool(state, 'p2-active-0', 'Protective Goggles', 'tool-pg-0', 'player2');
    const attack: AttackDefinition = { name: 'Tackle', cost: ['Colorless'], damage: 30, damageModifier: null, effectId: null, text: '' };

    const calc = calculateDamage(
      state.players.player1.active!, state.players.player2.active!,
      attack, getP1Def(state), getP2Def(state), state
    );

    expect(calc.weaknessRemoved).toBe(true);
    expect(calc.weaknessMultiplier).toBe(1);
    // 30 without weakness = 30
    expect(calc.finalDamage).toBe(30);
  });

  it('Neutralization Zone zeroes damage from ex to non-Rule-Box', () => {
    let state = makeBaseState();
    const exDef = makePokemonDef({ id: 'p1-ex', name: 'Attack ex', subtypes: ['ex'], types: ['Lightning'], prizeValue: 2 });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-ex', exDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-ex', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addStadium(state, 'Neutralization Zone', 'player1');
    const attack: AttackDefinition = { name: 'Big Attack', cost: ['Lightning'], damage: 200, damageModifier: null, effectId: null, text: '' };

    const calc = calculateDamage(
      state.players.player1.active!, state.players.player2.active!,
      attack, exDef, getP2Def(state), state
    );

    expect(calc.finalDamage).toBe(0);
  });
});

describe('resolveOnKOTriggers', () => {
  it('Exp. Share moves Basic Energy to benched Pokemon', () => {
    let state = makeBaseState();
    // Add energy to active
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-energy-0', makeCardInstance('p1-energy-0', 'base1-100', 'player1'));
    // Add benched Pokemon with Exp. Share
    const benchPoke = makeInPlayPokemon('p1-bench-0');
    newCardReg.set('p1-bench-0', makeCardInstance('p1-bench-0', 'p1-pokemon', 'player1'));
    state = {
      ...state,
      cardRegistry: newCardReg,
      players: {
        ...state.players,
        player1: {
          ...state.players.player1,
          active: { ...state.players.player1.active!, attachedEnergy: ['p1-energy-0'] },
          bench: [benchPoke]
        }
      }
    };
    state = addTool(state, 'p1-bench-0', 'Exp. Share', 'tool-es-0', 'player1');

    const koedPokemon = state.players.player1.active!;
    const s = resolveOnKOTriggers(state, koedPokemon, getP1Def(state), 'player1', null);

    // Energy should have moved
    const benchAfter = s.players.player1.bench[0]!;
    expect(benchAfter.attachedEnergy).toContain('p1-energy-0');
  });

  it('Cursed Duster discards from opponent hand', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Cursed Duster', 'tool-cd-0', 'player1');
    // Give opponent a card in hand
    state = {
      ...state,
      players: {
        ...state.players,
        player2: { ...state.players.player2, hand: ['p2-deck-0'] }
      }
    };

    const koedPokemon = state.players.player1.active!;
    const s = resolveOnKOTriggers(state, koedPokemon, getP1Def(state), 'player1', null);

    expect(s.players.player2.hand.length).toBe(0);
    expect(s.players.player2.discard).toContain('p2-deck-0');
  });
});

describe('Future Booster Energy Capsule', () => {
  it('grants +20 damage, free retreat for Future Pokemon', () => {
    let state = makeBaseState();
    const futureDef = makePokemonDef({
      id: 'p1-future', name: 'Iron Valiant', subtypes: ['Future'], types: ['Psychic'], retreatCost: 2
    });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-future', futureDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-future', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Future Booster Energy Capsule', 'tool-fbec-0', 'player1');

    // Damage
    const dmgResult = getDamageOutputModifiers(
      state, state.players.player1.active!, futureDef,
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(dmgResult.flatBonus).toBe(20);

    // Retreat
    const retreatCost = getEffectiveRetreatCost(state, 'player1', state.players.player1.active!, futureDef);
    expect(retreatCost).toBe(0);
  });

  it('does NOT apply to non-Future Pokemon', () => {
    let state = makeBaseState();
    state = addTool(state, 'p1-active-0', 'Future Booster Energy Capsule', 'tool-fbec-0', 'player1');

    const dmgResult = getDamageOutputModifiers(
      state, state.players.player1.active!, getP1Def(state),
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(dmgResult.flatBonus).toBe(0);

    const retreatCost = getEffectiveRetreatCost(state, 'player1', state.players.player1.active!, getP1Def(state));
    expect(retreatCost).toBe(2); // Unchanged
  });
});

describe("Hop's Choice Band multi-effect", () => {
  it("grants +30 damage, -1 retreat, -1 attack cost for Hop's Pokemon", () => {
    let state = makeBaseState();
    const hopDef = makePokemonDef({
      id: 'p1-hop', name: "Hop's Wooloo", types: ['Colorless'], retreatCost: 1
    });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-hop', hopDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-hop', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', "Hop's Choice Band", 'tool-hcb-0', 'player1');

    // Damage
    const dmgResult = getDamageOutputModifiers(
      state, state.players.player1.active!, hopDef,
      state.players.player2.active!, getP2Def(state), 'player1'
    );
    expect(dmgResult.flatBonus).toBe(30);

    // Retreat
    const retreatCost = getEffectiveRetreatCost(state, 'player1', state.players.player1.active!, hopDef);
    expect(retreatCost).toBe(0); // 1 - 1 = 0

    // Attack cost
    const costMods = getAttackCostModifiers(state, state.players.player1.active!, hopDef, 'player1');
    expect(costMods.colorlessReduction).toBe(1);
  });
});

describe('Ancient Booster Energy Capsule', () => {
  it('grants +60 HP and condition immunity for Ancient Pokemon', () => {
    let state = makeBaseState();
    const ancientDef = makePokemonDef({
      id: 'p1-ancient', name: 'Roaring Moon', subtypes: ['Ancient'], types: ['Darkness'], hp: 140
    });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-ancient', ancientDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-ancient', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p1-active-0', 'Ancient Booster Energy Capsule', 'tool-abec-0', 'player1');

    // HP
    const hp = getEffectiveHp(state, state.players.player1.active!, ancientDef, 'player1');
    expect(hp).toBe(200); // 140 + 60

    // Condition immunity
    const immune = checkConditionImmunity(state, state.players.player1.active!, ancientDef);
    expect(immune).toBe(true);
  });
});

describe('Thick Scale', () => {
  it('reduces by 50 for Dragon from Grass/Fire/Water/Lightning', () => {
    let state = makeBaseState();
    const dragonDef = makePokemonDef({ id: 'p2-dragon', name: 'Dragon Mon', types: ['Dragon'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-dragon', dragonDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-dragon', 'player2'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Thick Scale', 'tool-ts-0', 'player2');

    // Lightning attacker (one of the reduced types)
    const result = getDamageInputModifiers(
      state, state.players.player2.active!, dragonDef,
      state.players.player1.active!, getP1Def(state), 'player2'
    );
    expect(result.flatReduction).toBe(50);
  });

  it('does NOT reduce for Dragon from Psychic', () => {
    let state = makeBaseState();
    const dragonDef = makePokemonDef({ id: 'p2-dragon', name: 'Dragon Mon', types: ['Dragon'] });
    const psychicDef = makePokemonDef({ id: 'p1-psychic', name: 'Psychic Mon', types: ['Psychic'] });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p2-dragon', dragonDef);
    newDefReg.set('p1-psychic', psychicDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-active-0', makeCardInstance('p2-active-0', 'p2-dragon', 'player2'));
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-psychic', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Thick Scale', 'tool-ts-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, dragonDef,
      state.players.player1.active!, psychicDef, 'player2'
    );
    expect(result.flatReduction).toBe(0);
  });
});

describe('Sacred Charm', () => {
  it('reduces by 30 when attacker has Abilities', () => {
    let state = makeBaseState();
    const abilityDef = makePokemonDef({
      id: 'p1-ability', name: 'Ability Mon', types: ['Lightning'],
      abilities: [{ name: 'Test Ability', type: 'Ability', category: 'activated' as const, text: '', effectId: 'test-ability-effect' }]
    });
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set('p1-ability', abilityDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-active-0', makeCardInstance('p1-active-0', 'p1-ability', 'player1'));
    state = { ...state, cardRegistry: newCardReg, definitionRegistry: newDefReg };
    state = addTool(state, 'p2-active-0', 'Sacred Charm', 'tool-sc-0', 'player2');

    const result = getDamageInputModifiers(
      state, state.players.player2.active!, getP2Def(state),
      state.players.player1.active!, abilityDef, 'player2'
    );
    expect(result.flatReduction).toBe(30);
  });
});

// ─── Passive Ability Modifiers ────────────────────────────────────────────

function makeSkylinerDef(): PokemonCardDefinition {
  return makePokemonDef({
    id: 'latias-ex-test',
    name: 'Latias ex',
    stage: 'Basic',
    subtypes: ['ex'],
    types: ['Psychic'],
    abilities: [{
      name: 'Skyliner',
      text: 'Your Basic Pokémon in play have no retreat cost.',
      type: 'Ability',
      category: 'passive',
      effectId: 'latias-ex-test:ability:Skyliner'
    }]
  });
}

function makeSeasonedSkillDef(): PokemonCardDefinition {
  return makePokemonDef({
    id: 'ursaluna-ex-test',
    name: 'Bloodmoon Ursaluna ex',
    stage: 'Basic',
    subtypes: ['ex'],
    types: ['Colorless'],
    retreatCost: 2,
    attacks: [{
      name: 'Calamity Dig',
      cost: ['Colorless', 'Colorless', 'Colorless'],
      damage: 180,
      damageModifier: null,
      text: '',
      effectId: null
    }],
    abilities: [{
      name: 'Seasoned Skill',
      text: "This Pokémon's attacks cost [C] less for each Prize card your opponent has taken.",
      type: 'Ability',
      category: 'passive',
      effectId: 'ursaluna-ex-test:ability:Seasoned Skill'
    }]
  });
}

function addBenchPokemon(
  state: GameState,
  player: PlayerId,
  instanceId: string,
  definitionId: string
): GameState {
  const newCardReg = new Map(state.cardRegistry);
  newCardReg.set(instanceId, makeCardInstance(instanceId, definitionId, player));
  const ps = state.players[player];
  const benchPokemon = makeInPlayPokemon(instanceId);
  return {
    ...state,
    cardRegistry: newCardReg,
    players: {
      ...state.players,
      [player]: { ...ps, bench: [...ps.bench, benchPokemon] }
    }
  };
}

describe('Skyliner passive ability', () => {
  it('sets retreat cost to zero for Basic Pokemon when Latias ex is in play', () => {
    let state = makeBaseState();
    const skylinerDef = makeSkylinerDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(skylinerDef.id, skylinerDef);
    state = { ...state, definitionRegistry: newDefReg };
    state = addBenchPokemon(state, 'player1', 'p1-latias', skylinerDef.id);

    const basicDef = makePokemonDef({ id: 'p1-basic', stage: 'Basic', retreatCost: 2 });
    const newDefReg2 = new Map(state.definitionRegistry);
    newDefReg2.set(basicDef.id, basicDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-basic-inst', makeCardInstance('p1-basic-inst', basicDef.id, 'player1'));
    state = { ...state, definitionRegistry: newDefReg2, cardRegistry: newCardReg };

    const basicPokemon = makeInPlayPokemon('p1-basic-inst');
    const result = getRetreatCostModifiers(state, basicPokemon, basicDef, 'player1');
    expect(result.setToZero).toBe(true);
  });

  it('does not affect non-Basic Pokemon retreat cost', () => {
    let state = makeBaseState();
    const skylinerDef = makeSkylinerDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(skylinerDef.id, skylinerDef);
    state = { ...state, definitionRegistry: newDefReg };
    state = addBenchPokemon(state, 'player1', 'p1-latias', skylinerDef.id);

    const stage1Def = makePokemonDef({ id: 'p1-stage1', stage: 'Stage1', retreatCost: 2 });
    const newDefReg2 = new Map(state.definitionRegistry);
    newDefReg2.set(stage1Def.id, stage1Def);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-stage1-inst', makeCardInstance('p1-stage1-inst', stage1Def.id, 'player1'));
    state = { ...state, definitionRegistry: newDefReg2, cardRegistry: newCardReg };

    const stage1Pokemon = makeInPlayPokemon('p1-stage1-inst');
    const result = getRetreatCostModifiers(state, stage1Pokemon, stage1Def, 'player1');
    expect(result.setToZero).toBe(false);
  });

  it('does not apply when Skyliner ability is locked', () => {
    let state = makeBaseState();
    const skylinerDef = makeSkylinerDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(skylinerDef.id, skylinerDef);
    state = { ...state, definitionRegistry: newDefReg };
    state = addBenchPokemon(state, 'player1', 'p1-latias', skylinerDef.id);

    const lockEffect: TemporalEffect = {
      id: 'lock-1',
      type: 'ability_lock',
      sourceInstanceId: 'some-source',
      sourceType: 'attack',
      targetInstanceId: 'p1-latias',
      expiresOnTurn: null,
      expiresAt: 'end_of_turn',
      payload: {}
    };
    state = { ...state, temporalEffects: [lockEffect] };

    const basicDef = makePokemonDef({ id: 'p1-basic', stage: 'Basic', retreatCost: 2 });
    const newDefReg2 = new Map(state.definitionRegistry);
    newDefReg2.set(basicDef.id, basicDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-basic-inst', makeCardInstance('p1-basic-inst', basicDef.id, 'player1'));
    state = { ...state, definitionRegistry: newDefReg2, cardRegistry: newCardReg };

    const basicPokemon = makeInPlayPokemon('p1-basic-inst');
    const result = getRetreatCostModifiers(state, basicPokemon, basicDef, 'player1');
    expect(result.setToZero).toBe(false);
  });

  it('does not apply to the opponent side', () => {
    let state = makeBaseState();
    const skylinerDef = makeSkylinerDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(skylinerDef.id, skylinerDef);
    state = { ...state, definitionRegistry: newDefReg };
    // Latias ex is on player1's bench
    state = addBenchPokemon(state, 'player1', 'p1-latias', skylinerDef.id);

    // Player2's Basic Pokemon should not benefit
    const basicDef = makePokemonDef({ id: 'p2-basic', stage: 'Basic', retreatCost: 2 });
    const newDefReg2 = new Map(state.definitionRegistry);
    newDefReg2.set(basicDef.id, basicDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p2-basic-inst', makeCardInstance('p2-basic-inst', basicDef.id, 'player2'));
    state = { ...state, definitionRegistry: newDefReg2, cardRegistry: newCardReg };

    const basicPokemon = makeInPlayPokemon('p2-basic-inst');
    const result = getRetreatCostModifiers(state, basicPokemon, basicDef, 'player2');
    expect(result.setToZero).toBe(false);
  });
});

describe('Seasoned Skill passive ability', () => {
  it('reduces attack cost by 1 per opponent prize taken (2 prizes taken)', () => {
    let state = makeBaseState();
    const ursalunaDef = makeSeasonedSkillDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(ursalunaDef.id, ursalunaDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-ursaluna-inst', makeCardInstance('p1-ursaluna-inst', ursalunaDef.id, 'player1'));
    // Opponent has taken 2 prizes (4 remaining)
    state = {
      ...state,
      definitionRegistry: newDefReg,
      cardRegistry: newCardReg,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: ['p2-prize-0', 'p2-prize-1', 'p2-prize-2', 'p2-prize-3'] }
      }
    };

    const ursalunaPokemon = makeInPlayPokemon('p1-ursaluna-inst');
    const result = getAttackCostModifiers(state, ursalunaPokemon, ursalunaDef, 'player1');
    expect(result.colorlessReduction).toBe(2);
  });

  it('gives no reduction when opponent has taken no prizes', () => {
    let state = makeBaseState();
    const ursalunaDef = makeSeasonedSkillDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(ursalunaDef.id, ursalunaDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-ursaluna-inst', makeCardInstance('p1-ursaluna-inst', ursalunaDef.id, 'player1'));
    // Opponent has all 6 prizes (0 taken)
    state = { ...state, definitionRegistry: newDefReg, cardRegistry: newCardReg };

    const ursalunaPokemon = makeInPlayPokemon('p1-ursaluna-inst');
    const result = getAttackCostModifiers(state, ursalunaPokemon, ursalunaDef, 'player1');
    expect(result.colorlessReduction).toBe(0);
  });

  it('gives full reduction when opponent has taken all 6 prizes', () => {
    let state = makeBaseState();
    const ursalunaDef = makeSeasonedSkillDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(ursalunaDef.id, ursalunaDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-ursaluna-inst', makeCardInstance('p1-ursaluna-inst', ursalunaDef.id, 'player1'));
    state = {
      ...state,
      definitionRegistry: newDefReg,
      cardRegistry: newCardReg,
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: [] }
      }
    };

    const ursalunaPokemon = makeInPlayPokemon('p1-ursaluna-inst');
    const result = getAttackCostModifiers(state, ursalunaPokemon, ursalunaDef, 'player1');
    expect(result.colorlessReduction).toBe(6);
  });

  it('does not apply when ability is locked', () => {
    let state = makeBaseState();
    const ursalunaDef = makeSeasonedSkillDef();
    const newDefReg = new Map(state.definitionRegistry);
    newDefReg.set(ursalunaDef.id, ursalunaDef);
    const newCardReg = new Map(state.cardRegistry);
    newCardReg.set('p1-ursaluna-inst', makeCardInstance('p1-ursaluna-inst', ursalunaDef.id, 'player1'));
    const lockEffect: TemporalEffect = {
      id: 'lock-1',
      type: 'ability_lock',
      sourceInstanceId: 'some-source',
      sourceType: 'attack',
      targetInstanceId: 'p1-ursaluna-inst',
      expiresOnTurn: null,
      expiresAt: 'end_of_turn',
      payload: {}
    };
    state = {
      ...state,
      definitionRegistry: newDefReg,
      cardRegistry: newCardReg,
      temporalEffects: [lockEffect],
      players: {
        ...state.players,
        player2: { ...state.players.player2, prizes: ['p2-prize-0', 'p2-prize-1', 'p2-prize-2'] }
      }
    };

    const ursalunaPokemon = makeInPlayPokemon('p1-ursaluna-inst');
    const result = getAttackCostModifiers(state, ursalunaPokemon, ursalunaDef, 'player1');
    expect(result.colorlessReduction).toBe(0);
  });
});
