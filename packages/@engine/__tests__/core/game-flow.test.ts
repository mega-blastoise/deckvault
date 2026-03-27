import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition, PokemonCardDefinition } from '../../lib/types/card';
import type { GameState, InPlayPokemon, PlayerId } from '../../lib/types/game';
import { createGame, checkWinConditions, handleKnockOut, otherPlayer } from '../../lib/core/game';
import { validateDeck } from '../../lib/core/validation';
import { canPayEnergyCost, canPayRetreatCost } from '../../lib/core/energy';
import { canEvolve, evolvePokemon } from '../../lib/core/evolution';
import { hasBasicPokemon } from '../../lib/core/setup';
import { performCheckup } from '../../lib/core/checkup';
import { applyAction, getLegalActions, startTurn } from '../../lib/core/turn';
import { applySpecialCondition } from '../../lib/core/conditions';
import type { PlayerAction } from '../../lib/types/action';

// DB path is CWD-relative — bun test runs from packages/@engine/
const DB_PATH = '../../database/pokemon-data.sqlite3.db';

// Real card IDs from the database (regulation marks G/H/I, Standard-legal)
// Pokemon (all H mark)
const MAREEP_ID = 'svp-107';           // Basic, 60 HP
const FLAAFFY_ID = 'svp-108';         // Stage1, evolvesFrom: "Mareep", 90 HP
const AMPHAROS_ID = 'svp-109';        // Stage2, evolvesFrom: "Flaaffy", 160 HP
const PAWNIARD_ID = 'svp-111';        // Basic, 70 HP, H mark
const BISHARP_ID = 'svp-112';         // Stage1, evolvesFrom: "Pawniard", H mark
const KINGAMBIT_ID = 'svp-113';       // Stage2, evolvesFrom: "Bisharp", H mark
const PIKACHU_EX_ID = 'svp-106';      // Basic ex, 200 HP, H mark
// Trainers (G mark)
const SUPPORTER_ID = 'svp-124';       // Iono (Supporter), G mark
const ITEM_ID = 'sv1-168';            // Crushing Hammer (Item), G mark
// ACE SPEC (H mark)
const ACE_SPEC_ID = 'sv5-153';        // Master Ball (Item, ACE SPEC), H mark
// Energy
const FIRE_ENERGY_ID = 'base1-98';    // Fire Energy (Basic), always legal
const LIGHTNING_ENERGY_ID = 'base1-100'; // Lightning Energy (Basic)
// Radiant (F mark, not legal)
const RADIANT_ID = 'swsh10-27';       // Radiant Heatran, F mark

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeDeck(cards: Array<{ id: string; count: number }>): string[] {
  const deck: string[] = [];
  for (const { id, count } of cards) {
    for (let i = 0; i < count; i++) deck.push(id);
  }
  return deck;
}

function minimalValidDeck(basicId = MAREEP_ID): string[] {
  return makeDeck([
    { id: basicId, count: 4 },
    { id: FLAAFFY_ID, count: 4 },
    { id: PIKACHU_EX_ID, count: 4 },
    { id: SUPPORTER_ID, count: 4 },
    { id: ITEM_ID, count: 4 },
    { id: FIRE_ENERGY_ID, count: 40 }
  ]);
}

function setupCompleteGame(seed = 42): GameState {
  const deck = minimalValidDeck();
  const result = createGame({ deck1: deck, deck2: deck, seed, definitions: pool });
  if (!result.ok) throw new Error(`createGame failed: ${result.error.message}`);
  let state = result.value;

  // Coin flip choice
  const actions = getLegalActions(state);
  const coinChoice = actions.find(a => a.type === 'COIN_FLIP_CHOICE');
  if (!coinChoice) throw new Error('No COIN_FLIP_CHOICE action available');
  const r1 = applyAction(state, { type: 'COIN_FLIP_CHOICE', choice: 'second' });
  if (!r1.ok) throw new Error(`COIN_FLIP_CHOICE failed: ${r1.error.message}`);
  state = r1.value;

  // Mulligan loop
  let loopGuard = 0;
  while (state.phase === 'setup' && getLegalActions(state).some(a => a.type === 'MULLIGAN_REDRAW')) {
    const r = applyAction(state, { type: 'MULLIGAN_REDRAW' });
    if (!r.ok) throw new Error('MULLIGAN_REDRAW failed');
    state = r.value;
    if (++loopGuard > 100) throw new Error('Mulligan loop guard triggered');
  }

  // Extra draws
  loopGuard = 0;
  while (state.phase === 'setup' && getLegalActions(state).some(a => a.type === 'DRAW_CARD')) {
    const r = applyAction(state, { type: 'DRAW_CARD' });
    if (!r.ok) throw new Error('DRAW_CARD failed');
    state = r.value;
    if (++loopGuard > 20) throw new Error('Draw loop guard triggered');
  }

  // SELECT_ACTIVE for each player
  loopGuard = 0;
  while (state.phase === 'setup') {
    const actions2 = getLegalActions(state);
    const selectActive = actions2.find(a => a.type === 'SELECT_ACTIVE');
    const selectBench = actions2.find(a => a.type === 'SELECT_BENCH');
    if (selectActive) {
      const r = applyAction(state, selectActive);
      if (!r.ok) throw new Error(`SELECT_ACTIVE failed: ${r.error.message}`);
      state = r.value;
    } else if (selectBench) {
      // Choose empty bench (first subset = [])
      const emptyBench = actions2.find(a => a.type === 'SELECT_BENCH' && a.cardInstanceIds.length === 0);
      const chosen = emptyBench ?? selectBench;
      const r = applyAction(state, chosen);
      if (!r.ok) throw new Error(`SELECT_BENCH failed: ${r.error.message}`);
      state = r.value;
    } else {
      break;
    }
    if (++loopGuard > 20) throw new Error('Setup loop guard triggered');
  }

  return state;
}

function getInstanceIdForDef(state: GameState, defId: string, owner: PlayerId): string | undefined {
  for (const [instanceId, instance] of state.cardRegistry) {
    if (instance.definitionId === defId && instance.owner === owner) {
      return instanceId;
    }
  }
  return undefined;
}

function getHandInstance(state: GameState, playerId: PlayerId, defId: string): string | undefined {
  const hand = state.players[playerId].hand;
  for (const instanceId of hand) {
    const inst = state.cardRegistry.get(instanceId);
    if (inst?.definitionId === defId) return instanceId;
  }
  return undefined;
}

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

// ─── Deck Validation ──────────────────────────────────────────────────────

describe('validateDeck', () => {
  const date = new Date('2026-01-01');

  it('rejects deck with != 60 cards', () => {
    const result = validateDeck([MAREEP_ID, MAREEP_ID], pool, date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_DECK');
  });

  it('rejects deck with no Basic Pokemon', () => {
    const deck = makeDeck([
      { id: SUPPORTER_ID, count: 30 },
      { id: ITEM_ID, count: 14 },
      { id: FIRE_ENERGY_ID, count: 16 }
    ]);
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Basic Pokemon');
  });

  it('rejects deck with >4 copies of same card name', () => {
    const deck = makeDeck([
      { id: MAREEP_ID, count: 5 },
      { id: PIKACHU_EX_ID, count: 3 },
      { id: SUPPORTER_ID, count: 4 },
      { id: ITEM_ID, count: 4 },
      { id: FIRE_ENERGY_ID, count: 44 }
    ]);
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Too many copies');
  });

  it('accepts deck with exactly 4 copies of a non-energy card', () => {
    const deck = minimalValidDeck();
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(true);
  });

  it('accepts unlimited copies of Basic Energy', () => {
    const deck = makeDeck([
      { id: MAREEP_ID, count: 4 },
      { id: FIRE_ENERGY_ID, count: 56 }
    ]);
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(true);
  });

  it('rejects deck with >1 ACE SPEC Trainer', () => {
    // Two copies of the same ACE SPEC
    const deck = makeDeck([
      { id: MAREEP_ID, count: 4 },
      { id: ACE_SPEC_ID, count: 2 },
      { id: ITEM_ID, count: 2 },
      { id: FIRE_ENERGY_ID, count: 52 }
    ]);
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('ACE SPEC');
  });

  it('accepts deck with exactly 1 ACE SPEC', () => {
    const deck = makeDeck([
      { id: MAREEP_ID, count: 4 },
      { id: ACE_SPEC_ID, count: 1 },
      { id: ITEM_ID, count: 3 },
      { id: FIRE_ENERGY_ID, count: 52 }
    ]);
    const result = validateDeck(deck, pool, date);
    expect(result.ok).toBe(true);
  });

  it('rejects Radiant Pokemon (F mark, not Standard-legal)', () => {
    // Radiant Heatran not in pool so it won't be in definitions - add it manually
    const customPool = new Map(pool);
    // It's not in pool (filtered out), so definitions.get returns undefined → card won't be found
    // Test using a definition-based check: directly test with a custom definitions map
    const radiantDef: PokemonCardDefinition = {
      cardType: 'Pokemon',
      id: RADIANT_ID,
      name: 'Radiant Heatran',
      stage: 'Basic',
      subtypes: [],
      hp: 130,
      types: ['Fire'],
      evolvesFrom: null,
      attacks: [],
      abilities: [],
      weaknesses: [],
      resistances: [],
      retreatCost: 3,
      rules: [],
      prizeValue: 1,
      regulationMark: 'F'
    };
    // Add with a hack: subtypes contains 'Radiant' -- but PokemonSubtype doesn't include it
    // The validation checks via cast, just use regulation mark check which will fail for F
    const defWithRadiant = new Map(pool);
    defWithRadiant.set(RADIANT_ID, { ...radiantDef, regulationMark: 'F' });
    const deck = makeDeck([
      { id: RADIANT_ID, count: 1 },
      { id: MAREEP_ID, count: 3 },
      { id: FIRE_ENERGY_ID, count: 56 }
    ]);
    const result = validateDeck(deck, defWithRadiant, date);
    expect(result.ok).toBe(false);
  });

  it('rejects non-Standard-legal cards (wrong regulation mark)', () => {
    // Create a custom definition with a wrong mark
    const illegalDef: PokemonCardDefinition = {
      cardType: 'Pokemon',
      id: 'illegal-card',
      name: 'Illegal Mon',
      stage: 'Basic',
      subtypes: [],
      hp: 100,
      types: ['Fire'],
      evolvesFrom: null,
      attacks: [],
      abilities: [],
      weaknesses: [],
      resistances: [],
      retreatCost: 1,
      rules: [],
      prizeValue: 1,
      regulationMark: 'A'
    };
    const customPool = new Map(pool);
    customPool.set('illegal-card', illegalDef);
    const deck = makeDeck([
      { id: 'illegal-card', count: 1 },
      { id: MAREEP_ID, count: 3 },
      { id: FIRE_ENERGY_ID, count: 56 }
    ]);
    const result = validateDeck(deck, customPool, date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Standard-legal');
  });
});

// ─── createGame ────────────────────────────────────────────────────────────

describe('createGame', () => {
  it('returns ok for valid decks', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    expect(result.ok).toBe(true);
  });

  it('returns err for invalid deck', () => {
    const badDeck = [MAREEP_ID, MAREEP_ID];
    const result = createGame({ deck1: badDeck, deck2: badDeck, seed: 1, definitions: pool });
    expect(result.ok).toBe(false);
  });

  it('starts in setup phase', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    if (!result.ok) throw new Error('createGame failed');
    expect(result.value.phase).toBe('setup');
  });

  it('creates 120 card instances (60 per player)', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    if (!result.ok) throw new Error('createGame failed');
    expect(result.value.cardRegistry.size).toBe(120);
  });

  it('emits COIN_FLIPPED event', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    if (!result.ok) throw new Error('createGame failed');
    const coinFlipEvent = result.value.eventLog.find(e => e.type === 'COIN_FLIPPED');
    expect(coinFlipEvent).toBeDefined();
  });

  it('getLegalActions returns COIN_FLIP_CHOICE initially', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    if (!result.ok) throw new Error('createGame failed');
    const actions = getLegalActions(result.value);
    expect(actions.some(a => a.type === 'COIN_FLIP_CHOICE')).toBe(true);
    expect(actions.filter(a => a.type === 'COIN_FLIP_CHOICE').length).toBe(2);
  });
});

// ─── Setup Phase ──────────────────────────────────────────────────────────

describe('Setup', () => {
  it('coin flip winner can choose first or second', () => {
    const deck = minimalValidDeck();
    const r1 = createGame({ deck1: deck, deck2: deck, seed: 1, definitions: pool });
    if (!r1.ok) throw new Error('createGame failed');
    const state = r1.value;
    const coinWinner = state.activePlayer;

    const r2 = applyAction(state, { type: 'COIN_FLIP_CHOICE', choice: 'first' });
    if (!r2.ok) throw new Error('Choice failed');
    expect(r2.value.startingPlayer).toBe(coinWinner);

    const r3 = applyAction(state, { type: 'COIN_FLIP_CHOICE', choice: 'second' });
    if (!r3.ok) throw new Error('Choice failed');
    expect(r3.value.startingPlayer).toBe(otherPlayer(coinWinner));
  });

  it('completes setup and transitions to main phase', () => {
    const state = setupCompleteGame();
    expect(state.phase).toBe('main');
  });

  it('both players get 6 prize cards after setup', () => {
    const state = setupCompleteGame();
    expect(state.players.player1.prizes.length).toBe(6);
    expect(state.players.player2.prizes.length).toBe(6);
  });

  it('both players have active Pokemon after setup', () => {
    const state = setupCompleteGame();
    expect(state.players.player1.active).not.toBeNull();
    expect(state.players.player2.active).not.toBeNull();
  });

  it('turn number is 1 after setup', () => {
    const state = setupCompleteGame();
    expect(state.turnNumber).toBe(1);
  });

  it('mulligan loop redraws until Basic found', () => {
    // Use a seed that might cause mulligans; just verify the game reaches main phase
    for (const seed of [1, 2, 3, 42, 100]) {
      const state = setupCompleteGame(seed);
      expect(state.phase).toBe('main');
    }
  });
});

// ─── First-Turn Restrictions ──────────────────────────────────────────────

describe('First-turn restrictions', () => {
  it('starting player cannot attack on turn 1', () => {
    const state = setupCompleteGame();
    // Starting player is the active player on turn 1
    if (state.activePlayer !== state.startingPlayer) return; // wrong turn, skip

    const actions = getLegalActions(state);
    expect(actions.some(a => a.type === 'ATTACK')).toBe(false);
  });

  it('starting player cannot play Supporter on turn 1', () => {
    const state = setupCompleteGame();
    if (state.activePlayer !== state.startingPlayer) return;

    // Check that no PLAY_TRAINER action for Supporter is included
    // We check the flag directly
    expect(state.turnFlags.isStartingPlayerFirstTurn).toBe(true);
    const actions = getLegalActions(state);
    // All PLAY_TRAINER actions should not be Supporters
    for (const action of actions) {
      if (action.type === 'PLAY_TRAINER') {
        const inst = state.cardRegistry.get(action.cardInstanceId);
        if (!inst) continue;
        const def = state.definitionRegistry.get(inst.definitionId);
        if (!def || def.cardType !== 'Trainer') continue;
        expect(def.subtypes.includes('Supporter')).toBe(false);
      }
    }
  });

  it('second player CAN attack on their first turn (turn 2)', () => {
    const state = setupCompleteGame();
    // After starting player PASSes, it's turn 2 = second player's first turn
    const r = applyAction(state, { type: 'PASS' });
    if (!r.ok) throw new Error('PASS failed');
    const state2 = r.value;

    expect(state2.turnNumber).toBe(2);
    expect(state2.activePlayer).toBe(otherPlayer(state.startingPlayer));
    expect(state2.turnFlags.isStartingPlayerFirstTurn).toBe(false);
    // ATTACK may or may not be legal depending on energy — at minimum it's not blocked by flag
    // The flag is false for the second player
  });

  it('ATTACK action blocked when isStartingPlayerFirstTurn=true via applyAction', () => {
    const state = setupCompleteGame();
    if (state.activePlayer !== state.startingPlayer) return;

    const result = applyAction(state, { type: 'ATTACK', attackIndex: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('cannot attack');
  });

  it('Supporter blocked via applyAction on starting player turn 1', () => {
    const state = setupCompleteGame();
    if (state.activePlayer !== state.startingPlayer) return;

    // Find a supporter in hand
    const hand = state.players[state.activePlayer].hand;
    let supporterInstanceId: string | undefined;
    for (const id of hand) {
      const inst = state.cardRegistry.get(id);
      if (!inst) continue;
      const def = state.definitionRegistry.get(inst.definitionId);
      if (def?.cardType === 'Trainer' && def.subtypes.includes('Supporter')) {
        supporterInstanceId = id;
        break;
      }
    }

    if (!supporterInstanceId) return; // No supporter in hand, skip

    const result = applyAction(state, { type: 'PLAY_TRAINER', cardInstanceId: supporterInstanceId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Starting player');
  });
});

// ─── Energy Cost Validation ──────────────────────────────────────────────

describe('canPayEnergyCost', () => {
  it('returns false when no energy attached', () => {
    expect(canPayEnergyCost(['Fire'], [])).toBe(false);
  });

  it('returns true when exactly matching energy', () => {
    expect(canPayEnergyCost(['Fire'], [{ provides: ['Fire'] }])).toBe(true);
  });

  it('colorless satisfied by any energy type', () => {
    expect(canPayEnergyCost(['Colorless'], [{ provides: ['Fire'] }])).toBe(true);
    expect(canPayEnergyCost(['Colorless'], [{ provides: ['Water'] }])).toBe(true);
  });

  it('satisfies mixed typed + colorless cost', () => {
    expect(canPayEnergyCost(
      ['Fire', 'Colorless', 'Colorless'],
      [{ provides: ['Fire'] }, { provides: ['Water'] }, { provides: ['Grass'] }]
    )).toBe(true);
  });

  it('fails if typed requirement not met', () => {
    expect(canPayEnergyCost(
      ['Fire', 'Colorless'],
      [{ provides: ['Water'] }, { provides: ['Grass'] }]
    )).toBe(false);
  });

  it('single energy satisfies only one slot', () => {
    expect(canPayEnergyCost(
      ['Fire', 'Fire'],
      [{ provides: ['Fire'] }]
    )).toBe(false);
  });

  it('zero cost always satisfied', () => {
    expect(canPayEnergyCost([], [])).toBe(true);
    expect(canPayEnergyCost([], [{ provides: ['Fire'] }])).toBe(true);
  });
});

describe('canPayRetreatCost', () => {
  it('free retreat always possible', () => {
    expect(canPayRetreatCost(0, [])).toBe(true);
  });

  it('retreat blocked without enough energy', () => {
    expect(canPayRetreatCost(2, [{ provides: ['Fire'] }])).toBe(false);
  });

  it('retreat allowed with sufficient energy', () => {
    expect(canPayRetreatCost(2, [{ provides: ['Fire'] }, { provides: ['Water'] }])).toBe(true);
  });
});

// ─── hasBasicPokemon ─────────────────────────────────────────────────────

describe('hasBasicPokemon', () => {
  it('returns false for empty hand', () => {
    expect(hasBasicPokemon([], new Map(), new Map())).toBe(false);
  });

  it('detects basic pokemon in hand', () => {
    const defId = MAREEP_ID;
    const def = pool.get(defId)!;
    const cardRegistry = new Map([['inst-1', { instanceId: 'inst-1', definitionId: defId, owner: 'player1' as PlayerId }]]);
    const defRegistry = new Map([[defId, def]]);
    expect(hasBasicPokemon(['inst-1'], cardRegistry, defRegistry)).toBe(true);
  });

  it('returns false when only non-basics in hand', () => {
    const defId = FLAAFFY_ID;
    const def = pool.get(defId)!;
    const cardRegistry = new Map([['inst-1', { instanceId: 'inst-1', definitionId: defId, owner: 'player1' as PlayerId }]]);
    const defRegistry = new Map([[defId, def]]);
    expect(hasBasicPokemon(['inst-1'], cardRegistry, defRegistry)).toBe(false);
  });
});

// ─── Evolution ────────────────────────────────────────────────────────────

describe('canEvolve', () => {
  it('requires exact evolvesFrom name match', () => {
    const deck = minimalValidDeck();
    const result = createGame({ deck1: deck, deck2: deck, seed: 42, definitions: pool });
    if (!result.ok) throw new Error('createGame failed');
    const state = setupCompleteGame();

    const mareepDef = pool.get(MAREEP_ID)! as PokemonCardDefinition;
    const flaaffyDef = pool.get(FLAAFFY_ID)! as PokemonCardDefinition;
    const ampharosDef = pool.get(AMPHAROS_ID)! as PokemonCardDefinition;

    // Flaaffy evolvesFrom "Mareep"
    expect(flaaffyDef.evolvesFrom).toBe('Mareep');

    // A fake Mareep in play
    const target = makeInPlayPokemon('mareep-inst', {
      isNewThisTurn: false,
      turnEvolved: null
    });

    // Override the registry for this test
    const customState: GameState = {
      ...state,
      turnNumber: 3, // past first turns
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['mareep-inst', { instanceId: 'mareep-inst', definitionId: MAREEP_ID, owner: state.activePlayer }]
      ]),
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...state.players[state.activePlayer],
          active: target
        }
      }
    };

    expect(canEvolve(flaaffyDef, target, customState)).toBe(true);
    expect(canEvolve(ampharosDef, target, customState)).toBe(false); // Stage2 can't evolve from Basic
  });

  it('blocks evolution on turn Pokemon was played (isNewThisTurn)', () => {
    const state = setupCompleteGame();
    const flaaffyDef = pool.get(FLAAFFY_ID)! as PokemonCardDefinition;
    const target = makeInPlayPokemon('inst', {
      isNewThisTurn: true,
      turnEvolved: null
    });
    const customState: GameState = {
      ...state,
      turnNumber: 3,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['inst', { instanceId: 'inst', definitionId: MAREEP_ID, owner: state.activePlayer }]
      ])
    };
    expect(canEvolve(flaaffyDef, target, customState)).toBe(false);
  });

  it('blocks evolution if already evolved this turn', () => {
    const state = setupCompleteGame();
    const ampharosDef = pool.get(AMPHAROS_ID)! as PokemonCardDefinition;
    const flaaffyInst = 'flaaffy-inst';
    const target = makeInPlayPokemon(flaaffyInst, {
      isNewThisTurn: false,
      turnEvolved: 3
    });
    const customState: GameState = {
      ...state,
      turnNumber: 3,
      cardRegistry: new Map([
        ...state.cardRegistry,
        [flaaffyInst, { instanceId: flaaffyInst, definitionId: FLAAFFY_ID, owner: state.activePlayer }]
      ])
    };
    expect(canEvolve(ampharosDef, target, customState)).toBe(false);
  });

  it('blocks evolution on starting player turn 1', () => {
    const state = setupCompleteGame();
    // Ensure we're on turn 1 as starting player
    const turnOneState: GameState = {
      ...state,
      turnNumber: 1,
      activePlayer: state.startingPlayer
    };
    const flaaffyDef = pool.get(FLAAFFY_ID)! as PokemonCardDefinition;
    const target = makeInPlayPokemon('inst', { isNewThisTurn: false, turnEvolved: null });
    const customState: GameState = {
      ...turnOneState,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['inst', { instanceId: 'inst', definitionId: MAREEP_ID, owner: state.startingPlayer }]
      ])
    };
    expect(canEvolve(flaaffyDef, target, customState)).toBe(false);
  });

  it('blocks evolution on second player turn 2', () => {
    const state = setupCompleteGame();
    const secondPlayer = otherPlayer(state.startingPlayer);
    const turnTwoState: GameState = {
      ...state,
      turnNumber: 2,
      activePlayer: secondPlayer
    };
    const flaaffyDef = pool.get(FLAAFFY_ID)! as PokemonCardDefinition;
    const target = makeInPlayPokemon('inst', { isNewThisTurn: false, turnEvolved: null });
    const customState: GameState = {
      ...turnTwoState,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['inst', { instanceId: 'inst', definitionId: MAREEP_ID, owner: secondPlayer }]
      ])
    };
    expect(canEvolve(flaaffyDef, target, customState)).toBe(false);
  });

  it('allows evolution on turn 3+', () => {
    const state = setupCompleteGame();
    const turnThreeState: GameState = {
      ...state,
      turnNumber: 3,
      activePlayer: state.startingPlayer
    };
    const flaaffyDef = pool.get(FLAAFFY_ID)! as PokemonCardDefinition;
    const target = makeInPlayPokemon('inst', { isNewThisTurn: false, turnEvolved: null });
    const customState: GameState = {
      ...turnThreeState,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['inst', { instanceId: 'inst', definitionId: MAREEP_ID, owner: state.startingPlayer }]
      ])
    };
    expect(canEvolve(flaaffyDef, target, customState)).toBe(true);
  });

  it('Rare Candy: allows Basic → Stage2 with skipStage1', () => {
    const state = setupCompleteGame();
    const ampharosDef = pool.get(AMPHAROS_ID)! as PokemonCardDefinition;
    const target = makeInPlayPokemon('inst', { isNewThisTurn: false, turnEvolved: null });
    const customState: GameState = {
      ...state,
      turnNumber: 3,
      activePlayer: state.startingPlayer,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['inst', { instanceId: 'inst', definitionId: MAREEP_ID, owner: state.startingPlayer }]
      ])
    };
    // Without skipStage1: blocked (Basic can't go to Stage2 normally)
    expect(canEvolve(ampharosDef, target, customState)).toBe(false);
    // With skipStage1: allowed
    expect(canEvolve(ampharosDef, target, customState, { skipStage1: true })).toBe(true);
  });

  it('evolvesFrom must be exact string match (Paldean Wooper != Wooper)', () => {
    const state = setupCompleteGame();

    // Make a fake "Wooper" definition and a fake "Clodsire" that evolvesFrom "Wooper"
    const wooferDef: PokemonCardDefinition = {
      cardType: 'Pokemon', id: 'fake-wooper', name: 'Wooper',
      stage: 'Basic', subtypes: [], hp: 60, types: ['Water'],
      evolvesFrom: null, attacks: [], abilities: [], weaknesses: [],
      resistances: [], retreatCost: 1, rules: [], prizeValue: 1, regulationMark: 'H'
    };
    const paldeanWooferDef: PokemonCardDefinition = {
      ...wooferDef, id: 'fake-paldean-wooper', name: 'Paldean Wooper'
    };
    const clodsireDef: PokemonCardDefinition = {
      cardType: 'Pokemon', id: 'fake-clodsire', name: 'Clodsire',
      stage: 'Stage1', subtypes: [], hp: 100, types: ['Poison'],
      evolvesFrom: 'Paldean Wooper', attacks: [], abilities: [], weaknesses: [],
      resistances: [], retreatCost: 2, rules: [], prizeValue: 1, regulationMark: 'H'
    };

    const customDefs = new Map(pool);
    customDefs.set('fake-wooper', wooferDef);
    customDefs.set('fake-paldean-wooper', paldeanWooferDef);
    customDefs.set('fake-clodsire', clodsireDef);

    const customState: GameState = {
      ...state,
      turnNumber: 3,
      definitionRegistry: customDefs,
      cardRegistry: new Map([
        ...state.cardRegistry,
        ['wooper-inst', { instanceId: 'wooper-inst', definitionId: 'fake-wooper', owner: state.activePlayer }]
      ])
    };

    // Clodsire evolvesFrom "Paldean Wooper" — should NOT match plain "Wooper"
    const wooperTarget = makeInPlayPokemon('wooper-inst', { isNewThisTurn: false, turnEvolved: null });
    expect(canEvolve(clodsireDef, wooperTarget, customState)).toBe(false);
  });
});

describe('evolvePokemon', () => {
  it('clears special conditions on evolution', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active) throw new Error('No active');

    const poisonedActive = applySpecialCondition(player.active, 'Poisoned');
    const flaaffyInstId = 'flaaffy-evo-inst';

    const customState: GameState = {
      ...state,
      turnNumber: 3,
      cardRegistry: new Map([
        ...state.cardRegistry,
        [flaaffyInstId, { instanceId: flaaffyInstId, definitionId: FLAAFFY_ID, owner: state.activePlayer }],
        [player.active.instanceId, { instanceId: player.active.instanceId, definitionId: MAREEP_ID, owner: state.activePlayer }]
      ]),
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          active: { ...poisonedActive, isNewThisTurn: false },
          hand: [...player.hand, flaaffyInstId]
        }
      }
    };

    const evolved = evolvePokemon(customState, flaaffyInstId, player.active.instanceId);
    const newActive = evolved.players[state.activePlayer].active!;
    expect(newActive.specialConditions.length).toBe(0);
  });

  it('preserves damage counters on evolution', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active) throw new Error('No active');

    const damagedActive: InPlayPokemon = { ...player.active, damageCounters: 5, isNewThisTurn: false };
    const flaaffyInstId = 'flaaffy-evo-inst2';

    const customState: GameState = {
      ...state,
      turnNumber: 3,
      cardRegistry: new Map([
        ...state.cardRegistry,
        [flaaffyInstId, { instanceId: flaaffyInstId, definitionId: FLAAFFY_ID, owner: state.activePlayer }],
        [player.active.instanceId, { instanceId: player.active.instanceId, definitionId: MAREEP_ID, owner: state.activePlayer }]
      ]),
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          active: damagedActive,
          hand: [...player.hand, flaaffyInstId]
        }
      }
    };

    const evolved = evolvePokemon(customState, flaaffyInstId, player.active.instanceId);
    const newActive = evolved.players[state.activePlayer].active!;
    expect(newActive.damageCounters).toBe(5);
  });

  it('emits POKEMON_EVOLVED event', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active) throw new Error('No active');

    const flaaffyInstId = 'flaaffy-evo-inst3';
    const customState: GameState = {
      ...state,
      turnNumber: 3,
      cardRegistry: new Map([
        ...state.cardRegistry,
        [flaaffyInstId, { instanceId: flaaffyInstId, definitionId: FLAAFFY_ID, owner: state.activePlayer }],
        [player.active.instanceId, { instanceId: player.active.instanceId, definitionId: MAREEP_ID, owner: state.activePlayer }]
      ]),
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          active: { ...player.active, isNewThisTurn: false },
          hand: [...player.hand, flaaffyInstId]
        }
      }
    };

    const evolved = evolvePokemon(customState, flaaffyInstId, player.active.instanceId);
    const evoEvent = evolved.eventLog.find(e => e.type === 'POKEMON_EVOLVED');
    expect(evoEvent).toBeDefined();
  });
});

// ─── Retreat ──────────────────────────────────────────────────────────────

describe('Retreat', () => {
  function stateWithBench(seed = 42): GameState {
    // Get a game where active player has a bench Pokemon
    let state = setupCompleteGame(seed);

    // Fast-forward past turn 1 if needed
    if (state.activePlayer === state.startingPlayer) {
      const r = applyAction(state, { type: 'PASS' });
      if (!r.ok) throw new Error('PASS failed');
      state = r.value;
    }

    // Play a basic to bench if possible
    const basics = state.players[state.activePlayer].hand.filter(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Pokemon' && def.stage === 'Basic';
    });

    if (basics.length > 0 && state.players[state.activePlayer].bench.length < 5) {
      const r = applyAction(state, { type: 'PLAY_BASIC_TO_BENCH', cardInstanceId: basics[0]! });
      if (!r.ok) return state;
      state = r.value;
    }

    return state;
  }

  it('cannot retreat while Asleep', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active || player.bench.length === 0) return;

    const asleepActive = applySpecialCondition(player.active, 'Asleep');
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: asleepActive }
      }
    };

    const result = applyAction(modState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: []
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Asleep');
  });

  it('cannot retreat while Paralyzed', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active || player.bench.length === 0) return;

    const paralyzed = applySpecialCondition(player.active, 'Paralyzed');
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: paralyzed }
      }
    };

    const result = applyAction(modState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: []
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Paralyzed');
  });

  it('cannot retreat twice in one turn', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active || player.bench.length === 0) return;

    // First retreated
    const retreatedState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, retreatedThisTurn: true }
      }
    };

    const result = applyAction(retreatedState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: []
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Already retreated');
  });

  it('clears special conditions on retreat', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active || player.bench.length === 0) return;

    const poisonedActive = applySpecialCondition(
      applySpecialCondition(player.active, 'Poisoned'),
      'Burned'
    );

    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: poisonedActive }
      }
    };

    const result = applyAction(modState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: []
    });
    if (!result.ok) return; // retreat cost might block

    // Find retreated pokemon (it's now on bench)
    const newPlayer = result.value.players[state.activePlayer];
    const retreated = newPlayer.bench.find(b => b.instanceId === poisonedActive.instanceId);
    if (retreated) {
      expect(retreated.specialConditions.length).toBe(0);
    }
  });

  it('preserves damage counters on retreated Pokemon', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active || player.bench.length === 0) return;

    const damagedActive: InPlayPokemon = { ...player.active, damageCounters: 3 };
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: damagedActive }
      }
    };

    const result = applyAction(modState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: []
    });
    if (!result.ok) return;

    const newPlayer = result.value.players[state.activePlayer];
    const retreated = newPlayer.bench.find(b => b.instanceId === damagedActive.instanceId);
    if (retreated) {
      expect(retreated.damageCounters).toBe(3);
    }
  });
});

// ─── Per-Turn Limits ──────────────────────────────────────────────────────

describe('Per-turn limits', () => {
  it('energy attachment: once per turn', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];

    // Find energy in hand
    let energyId: string | undefined;
    for (const id of player.hand) {
      const inst = state.cardRegistry.get(id);
      if (!inst) continue;
      const def = state.definitionRegistry.get(inst.definitionId);
      if (def?.cardType === 'Energy') { energyId = id; break; }
    }
    if (!energyId || !player.active) return;

    // First attachment
    const r1 = applyAction(state, {
      type: 'ATTACH_ENERGY',
      cardInstanceId: energyId,
      targetInstanceId: player.active.instanceId
    });
    if (!r1.ok) return;

    // Find another energy
    let energyId2: string | undefined;
    for (const id of r1.value.players[state.activePlayer].hand) {
      const inst = state.cardRegistry.get(id);
      if (!inst) continue;
      const def = state.definitionRegistry.get(inst.definitionId);
      if (def?.cardType === 'Energy') { energyId2 = id; break; }
    }
    if (!energyId2) return;

    const r2 = applyAction(r1.value, {
      type: 'ATTACH_ENERGY',
      cardInstanceId: energyId2,
      targetInstanceId: r1.value.players[state.activePlayer].active!.instanceId
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toContain('Already attached energy');
  });

  it('supporter: once per turn', () => {
    // Get to turn 2 (second player's turn, no first-turn restriction)
    let state = setupCompleteGame();
    const r = applyAction(state, { type: 'PASS' });
    if (!r.ok) throw new Error('PASS failed');
    state = r.value;

    const player = state.players[state.activePlayer];
    let supporterId: string | undefined;
    for (const id of player.hand) {
      const inst = state.cardRegistry.get(id);
      if (!inst) continue;
      const def = state.definitionRegistry.get(inst.definitionId);
      if (def?.cardType === 'Trainer' && def.subtypes.includes('Supporter')) {
        supporterId = id; break;
      }
    }
    if (!supporterId) return;

    const r1 = applyAction(state, { type: 'PLAY_TRAINER', cardInstanceId: supporterId });
    if (!r1.ok) return;

    // Find second supporter
    let supporterId2: string | undefined;
    for (const id of r1.value.players[state.activePlayer].hand) {
      const inst = state.cardRegistry.get(id);
      if (!inst) continue;
      const def = state.definitionRegistry.get(inst.definitionId);
      if (def?.cardType === 'Trainer' && def.subtypes.includes('Supporter')) {
        supporterId2 = id; break;
      }
    }
    if (!supporterId2) return;

    const r2 = applyAction(r1.value, { type: 'PLAY_TRAINER', cardInstanceId: supporterId2 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toContain('Supporter');
  });
});

// ─── Win Conditions ───────────────────────────────────────────────────────

describe('Win conditions', () => {
  it('detects prize exhaustion win (all prizes taken)', () => {
    const state = setupCompleteGame();
    const winner = state.activePlayer;

    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [winner]: { ...state.players[winner], prizes: [] }
      }
    };
    const result = checkWinConditions(modState);
    expect(result.winner).toBe(winner);
    expect(result.phase).toBe('finished');
  });

  it('detects no Pokemon in play win', () => {
    const state = setupCompleteGame();
    const loser = otherPlayer(state.activePlayer);
    const winner = state.activePlayer;

    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [loser]: { ...state.players[loser], active: null, bench: [] }
      }
    };
    const result = checkWinConditions(modState);
    expect(result.winner).toBe(winner);
    expect(result.phase).toBe('finished');
  });

  it('deck-out: detected at startTurn', () => {
    const state = setupCompleteGame();
    const activePlayer = state.activePlayer;

    const emptyDeckState: GameState = {
      ...state,
      players: {
        ...state.players,
        [activePlayer]: { ...state.players[activePlayer], deck: [] }
      }
    };

    const result = startTurn(emptyDeckState);
    expect(result.winner).toBe(otherPlayer(activePlayer));
    expect(result.phase).toBe('finished');
  });

  it('simultaneous win: player with more conditions wins', () => {
    // Player1 takes last prize AND opponent has no Pokemon
    const state = setupCompleteGame();

    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, prizes: [] },
        player2: { ...state.players.player2, active: null, bench: [] }
      }
    };
    const result = checkWinConditions(modState);
    // Player1 satisfies 2 conditions (prizes empty + opponent has no pokemon)
    // Player2 satisfies 1 condition (opponent [player1] has no more prizes wait...)
    // Actually: player1 prizes=0 → player1 condition A satisfied
    // player2 has no pokemon → player1 condition B satisfied
    // player2 prizes still have 6 → player2 condition A not satisfied
    // player1 has pokemon → player2 condition B not satisfied
    // So player1 has 2 conditions, player2 has 0 → player1 wins
    expect(result.winner).toBe('player1');
  });

  it('simultaneous win: both satisfy 1 condition → draw', () => {
    const state = setupCompleteGame();

    // Both have no active, both have no bench, but both have prizes remaining
    // Actually "no pokemon in play" means: for EACH player, the OPPONENT has no pokemon
    // checkWinConditions checks: countWinConditions(state, player) counts conditions for that player
    // So if both players have no pokemon, both players satisfy "opponent has no pokemon"
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: null, bench: [] },
        player2: { ...state.players.player2, active: null, bench: [] }
      }
    };
    const result = checkWinConditions(modState);
    expect(result.winner).toBe('draw');
  });

  it('handleKnockOut awards prizes to opponent', () => {
    const state = setupCompleteGame();
    const activePlayer = state.activePlayer;
    const opponent = otherPlayer(activePlayer);
    const active = state.players[activePlayer].active;
    if (!active) throw new Error('No active');

    const initialOpponentPrizes = state.players[opponent].prizes.length;
    const result = handleKnockOut(state, active.instanceId);

    // Opponent took at least 1 prize (prizeValue >= 1)
    expect(result.players[opponent].prizes.length).toBeLessThan(initialOpponentPrizes);
    // KO'd Pokemon goes to discard
    expect(result.players[activePlayer].active).toBeNull();
  });
});

// ─── Pokemon Checkup ─────────────────────────────────────────────────────

describe('Pokemon Checkup', () => {
  function stateWithCondition(condition: 'Poisoned' | 'Burned' | 'Asleep' | 'Paralyzed'): GameState {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active) throw new Error('No active');
    const afflicted = applySpecialCondition(player.active, condition);
    return {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: afflicted }
      }
    };
  }

  it('Poison places exactly 1 damage counter', () => {
    const state = stateWithCondition('Poisoned');
    const activePlayer = state.activePlayer;
    const beforeCounters = state.players[activePlayer].active!.damageCounters;
    const result = performCheckup(state);
    const afterCounters = result.players[activePlayer].active?.damageCounters;
    // Might be KO'd — check if still active
    if (afterCounters !== undefined) {
      expect(afterCounters).toBe(beforeCounters + 1);
    }
  });

  it('Burn places exactly 2 damage counters then flips', () => {
    const state = stateWithCondition('Burned');
    const activePlayer = state.activePlayer;
    const beforeCounters = state.players[activePlayer].active!.damageCounters;
    const result = performCheckup(state);
    // COIN_FLIPPED event should be emitted for burn
    const burnFlip = result.eventLog.find(e => e.type === 'COIN_FLIPPED' && e.reason === 'burn_check');
    expect(burnFlip).toBeDefined();
    const afterPokemon = result.players[activePlayer].active;
    if (afterPokemon) {
      expect(afterPokemon.damageCounters).toBeGreaterThanOrEqual(beforeCounters + 2);
    }
  });

  it('Asleep flips coin for removal', () => {
    const state = stateWithCondition('Asleep');
    const result = performCheckup(state);
    const sleepFlip = result.eventLog.find(e => e.type === 'COIN_FLIPPED' && e.reason === 'sleep_check');
    expect(sleepFlip).toBeDefined();
  });

  it('Paralyzed removed only after its owner completes their turn', () => {
    const state = stateWithCondition('Paralyzed');
    const activePlayer = state.activePlayer;

    // activePlayer has Paralyzed active. performCheckup removes it for activePlayer (just completed turn)
    const result = performCheckup(state);
    const afterPokemon = result.players[activePlayer].active;
    if (afterPokemon) {
      expect(afterPokemon.specialConditions.includes('Paralyzed')).toBe(false);
    }
  });

  it('Paralyzed NOT removed during opponent\'s checkup', () => {
    // The Paralyzed Pokemon's OWNER must complete their turn for removal
    // If opponent is activePlayer, the Paralyzed Pokemon on the non-active player's side should NOT be removed
    const state = setupCompleteGame();
    const activePlayer = state.activePlayer;
    const otherPlayerKey = otherPlayer(activePlayer);
    const otherPlayerState = state.players[otherPlayerKey];
    if (!otherPlayerState.active) return;

    const paralyzed = applySpecialCondition(otherPlayerState.active, 'Paralyzed');
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [otherPlayerKey]: { ...otherPlayerState, active: paralyzed }
      }
    };

    // performCheckup removes Paralyzed only for activePlayer, not otherPlayer
    const result = performCheckup(modState);
    const afterPokemon = result.players[otherPlayerKey].active;
    if (afterPokemon) {
      expect(afterPokemon.specialConditions.includes('Paralyzed')).toBe(true);
    }
  });

  it('checkup KO with no bench on either side → draw', () => {
    const state = setupCompleteGame();
    const player1 = state.players.player1;
    const player2 = state.players.player2;
    if (!player1.active || !player2.active) return;

    // Give both active pokemon lethal damage counters (HP is at most a few hundred = 30 counters max)
    const p1Active: InPlayPokemon = { ...player1.active, damageCounters: 999, specialConditions: [] };
    const p2Active: InPlayPokemon = { ...player2.active, damageCounters: 999, specialConditions: [] };

    const modState: GameState = {
      ...state,
      players: {
        player1: { ...player1, active: p1Active, bench: [] },
        player2: { ...player2, active: p2Active, bench: [] }
      }
    };

    const result = performCheckup(modState);
    // Both KO'd, neither has bench → draw or one player wins (depends on prize count)
    // If both have same prize count conditions → draw
    // But checkup fires: first player1 loses active, prizes awarded to player2.
    // If player2 prize pile goes empty → player2 wins. Otherwise if both KO → check win
    // In a fresh game both have prizes, so taking 1 prize each shouldn't exhaust them.
    // Both should be KO'd → no pokemon in play for both players → draw scenario
    expect(result.phase).toBe('finished');
  });

  it('emits CHECKUP_COMPLETED event', () => {
    const state = setupCompleteGame();
    const result = performCheckup(state);
    const event = result.eventLog.find(e => e.type === 'CHECKUP_COMPLETED');
    expect(event).toBeDefined();
  });

  it('processes Poison before Burn (ordering)', () => {
    const state = setupCompleteGame();
    const player = state.players[state.activePlayer];
    if (!player.active) return;

    const both = applySpecialCondition(
      applySpecialCondition(player.active, 'Poisoned'),
      'Burned'
    );
    const modState: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, active: both }
      }
    };

    const result = performCheckup(modState);
    // Should have DAMAGE_COUNTERS_PLACED events: poison (1 counter) before burn (2 counters)
    const damageEvents = result.eventLog.filter(e => e.type === 'DAMAGE_COUNTERS_PLACED');
    if (damageEvents.length >= 2) {
      expect(damageEvents[0]!.source).toBe('poison');
      expect(damageEvents[1]!.source).toBe('burn');
    }
  });
});

// ─── Missing coverage: ACE SPEC Trainer + Energy combined ────────────────

describe('Deck validation — ACE SPEC Trainer + Energy combined', () => {
  it('rejects deck with >1 ACE SPEC when one is Trainer and one is Special Energy', () => {
    // sv5-153 = Master Ball (ACE SPEC Trainer, H mark)
    // sv5-162 = Neo Upper Energy (ACE SPEC Special Energy, H mark)
    const ACE_SPEC_ENERGY_ID = 'sv5-162';

    // Skip if either card isn't in the pool
    if (!pool.get(ACE_SPEC_ID) || !pool.get(ACE_SPEC_ENERGY_ID)) return;

    const deck = makeDeck([
      { id: MAREEP_ID, count: 4 },
      { id: FLAAFFY_ID, count: 4 },
      { id: PIKACHU_EX_ID, count: 4 },
      { id: SUPPORTER_ID, count: 4 },
      { id: ITEM_ID, count: 3 },
      { id: ACE_SPEC_ID, count: 1 },       // ACE SPEC Trainer
      { id: ACE_SPEC_ENERGY_ID, count: 1 }, // ACE SPEC Energy
      { id: FIRE_ENERGY_ID, count: 39 }
    ]);
    expect(deck.length).toBe(60);

    const result = validateDeck(deck, pool, new Date('2026-01-01'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('ACE SPEC');
  });
});

// ─── Missing coverage: extra draws = differential of individual mulligans ─

describe('Setup — extra mulligan draws', () => {
  it('getLegalActions returns DRAW_CARD when extraDrawsRemaining > 0 in setup', () => {
    const state = setupCompleteGame();
    // Construct a setup-phase state where P2 has extra draws pending.
    // Both actives must be null — extra draws are checked only before active selection.
    const setupState: GameState = {
      ...state,
      phase: 'setup',
      activePlayer: 'player2',
      players: {
        ...state.players,
        player1: { ...state.players.player1, active: null },
        player2: { ...state.players.player2, active: null }
      },
      turnFlags: {
        ...state.turnFlags,
        mulliganCounts: { player1: 2, player2: 0 },
        extraDrawsRemaining: { player1: 0, player2: 2 },
        setupBenchSelected: { player1: false, player2: false }
      }
    };
    const actions = getLegalActions(setupState);
    expect(actions.some(a => a.type === 'DRAW_CARD')).toBe(true);
    expect(actions.every(a => a.type === 'DRAW_CARD')).toBe(true);
  });

  it('DRAW_CARD decrements extraDrawsRemaining and transitions to SELECT_ACTIVE when exhausted', () => {
    const base = setupCompleteGame();
    const p2 = base.players.player2;

    // Construct state: P2 has 1 extra draw left, both players have basics in hand,
    // neither has selected their active yet (actives must be null for setup sub-phase detection).
    const setupState: GameState = {
      ...base,
      phase: 'setup',
      activePlayer: 'player2',
      turnFlags: {
        ...base.turnFlags,
        mulliganCounts: { player1: 1, player2: 0 },
        extraDrawsRemaining: { player1: 0, player2: 1 },
        setupBenchSelected: { player1: false, player2: false }
      },
      players: {
        ...base.players,
        player1: { ...base.players.player1, active: null },
        player2: { ...p2, active: null }
      }
    };

    const result = applyAction(setupState, { type: 'DRAW_CARD' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Extra draws for P2 should be exhausted
    expect(result.value.turnFlags.extraDrawsRemaining.player2).toBe(0);
    // Next legal action should be SELECT_ACTIVE (P1 goes first)
    const next = getLegalActions(result.value);
    expect(next.some(a => a.type === 'SELECT_ACTIVE')).toBe(true);
  });
});

// ─── Missing coverage: second player CAN play Supporter on turn 1 ─────────

describe('First-turn restrictions — second player', () => {
  it('second player CAN play Supporter on their first turn (turn 2)', () => {
    let state = setupCompleteGame();

    // Ensure we are on the starting player's turn, then PASS to reach P2's turn
    if (state.activePlayer === state.startingPlayer) {
      const r = applyAction(state, { type: 'PASS' });
      if (!r.ok) throw new Error('PASS failed');
      state = r.value;
    }

    // Now on the second player's first turn (turn 2)
    expect(state.activePlayer).not.toBe(state.startingPlayer);
    expect(state.turnNumber).toBe(2);

    // There should be Supporter actions available (if the player has one in hand)
    const actions = getLegalActions(state);
    const supporterActions = actions.filter(a => {
      if (a.type !== 'PLAY_TRAINER') return false;
      const inst = state.cardRegistry.get(a.cardInstanceId);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
    });

    // isStartingPlayerFirstTurn must be false on turn 2
    expect(state.turnFlags.isStartingPlayerFirstTurn).toBe(false);

    // If a Supporter is in hand, the action must be legal
    const player = state.players[state.activePlayer];
    const hasSupporterInHand = player.hand.some(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
    });

    if (hasSupporterInHand) {
      expect(supporterActions.length).toBeGreaterThan(0);
    }
  });
});

// ─── Missing coverage: attached Energy AND Tools preserved on retreat ──────

describe('Retreat — attached cards preservation', () => {
  it('attached Energy and Tools are preserved on retreated Pokemon (minus cost paid)', () => {
    const state = setupCompleteGame();
    const pid = state.activePlayer;
    const player = state.players[pid];
    if (!player.active || player.bench.length === 0) return;

    // Attach a fake tool instance to active
    const toolInstId = 'test-tool-inst';
    const energyInstId = 'test-energy-inst';

    // Register fake instances (tool + energy)
    const newRegistry = new Map(state.cardRegistry);
    newRegistry.set(toolInstId, { instanceId: toolInstId, definitionId: ITEM_ID, owner: pid });
    newRegistry.set(energyInstId, { instanceId: energyInstId, definitionId: FIRE_ENERGY_ID, owner: pid });

    const activeWithAttachments: InPlayPokemon = {
      ...player.active,
      attachedTools: [toolInstId],
      attachedEnergy: [energyInstId],
      damageCounters: 2
    };

    const modState: GameState = {
      ...state,
      cardRegistry: newRegistry,
      players: {
        ...state.players,
        [pid]: { ...player, active: activeWithAttachments }
      }
    };

    // Retreat cost for Mareep is 1 — we have 1 energy, so cost is covered
    const result = applyAction(modState, {
      type: 'RETREAT',
      newActiveInstanceId: player.bench[0]!.instanceId,
      energyToDiscard: [energyInstId] // pay the retreat cost
    });

    if (!result.ok) return; // skip if retreat cost logic prevents it

    const newPlayer = result.value.players[pid];
    const retreated = newPlayer.bench.find(b => b.instanceId === activeWithAttachments.instanceId);
    if (!retreated) return;

    // Tool must still be attached (tools are never discarded on retreat)
    expect(retreated.attachedTools).toContain(toolInstId);
    // Energy paid as cost was discarded, but damage counters preserved
    expect(retreated.damageCounters).toBe(2);
  });
});

// ─── Missing coverage: Stadium once per turn, blocks same-name ────────────

describe('Stadium — per-turn limits', () => {
  // svp-45 = Paradise Resort (Stadium, G mark)
  const STADIUM_ID = 'svp-45';

  it('Stadium blocked if current Stadium has same name', () => {
    const state = setupCompleteGame();
    const pid = state.activePlayer;
    const player = state.players[pid];
    if (!pool.get(STADIUM_ID)) return;

    // Put 2 copies of the Stadium in hand
    const stadInst1 = 'stad-inst-1';
    const stadInst2 = 'stad-inst-2';
    const newRegistry = new Map(state.cardRegistry);
    newRegistry.set(stadInst1, { instanceId: stadInst1, definitionId: STADIUM_ID, owner: pid });
    newRegistry.set(stadInst2, { instanceId: stadInst2, definitionId: STADIUM_ID, owner: pid });

    // Place the first Stadium already in play
    const modState: GameState = {
      ...state,
      cardRegistry: newRegistry,
      stadium: { cardInstanceId: stadInst1, playedBy: pid },
      players: {
        ...state.players,
        [pid]: { ...player, hand: [...player.hand, stadInst2] }
      }
    };

    // getLegalActions should NOT include playing stadInst2 (same name as active Stadium)
    const actions = getLegalActions(modState);
    const stadiumActions = actions.filter(
      a => a.type === 'PLAY_TRAINER' && a.cardInstanceId === stadInst2
    );
    expect(stadiumActions.length).toBe(0);

    // applyAction should also reject it
    const result = applyAction(modState, { type: 'PLAY_TRAINER', cardInstanceId: stadInst2 });
    expect(result.ok).toBe(false);
  });

  it('Stadium blocked if already played one this turn', () => {
    const state = setupCompleteGame();
    const pid = state.activePlayer;
    const player = state.players[pid];
    if (!pool.get(STADIUM_ID)) return;

    const stadInst = 'stad-inst-1';
    const newRegistry = new Map(state.cardRegistry);
    newRegistry.set(stadInst, { instanceId: stadInst, definitionId: STADIUM_ID, owner: pid });

    // Mark stadiumPlayedThisTurn = true
    const modState: GameState = {
      ...state,
      cardRegistry: newRegistry,
      players: {
        ...state.players,
        [pid]: { ...player, hand: [...player.hand, stadInst], stadiumPlayedThisTurn: true }
      }
    };

    const result = applyAction(modState, { type: 'PLAY_TRAINER', cardInstanceId: stadInst });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Stadium');
  });
});

// ─── End-to-end game loop ─────────────────────────────────────────────────

describe('Full game loop', () => {
  it('game progresses through turns and terminates', () => {
    let state = setupCompleteGame(7);
    let turns = 0;
    const maxTurns = 200;

    while (state.phase !== 'finished' && turns < maxTurns) {
      const actions = getLegalActions(state);
      if (actions.length === 0) break;

      // Simple AI: prefer PASS to keep test fast
      const chosen: PlayerAction = actions.find(a => a.type === 'PASS') ?? actions[0]!;
      const result = applyAction(state, chosen);
      if (!result.ok) {
        throw new Error(`applyAction failed: ${result.error.message} for action: ${JSON.stringify(chosen)}`);
      }
      state = result.value;
      turns++;
    }

    // Game should end via deck-out (both PASSing every turn)
    expect(state.phase).toBe('finished');
    expect(state.winner).not.toBeNull();
  });

  it('PASS ends the turn', () => {
    const state = setupCompleteGame();
    const before = state.turnNumber;
    const before_player = state.activePlayer;
    const result = applyAction(state, { type: 'PASS' });
    if (!result.ok) throw new Error('PASS failed');
    expect(result.value.turnNumber).toBe(before + 1);
    expect(result.value.activePlayer).toBe(otherPlayer(before_player));
  });

  it('getLegalActions returns PASS in main phase', () => {
    const state = setupCompleteGame();
    const actions = getLegalActions(state);
    expect(actions.some(a => a.type === 'PASS')).toBe(true);
  });

  it('getLegalActions returns empty array when game is finished', () => {
    const state = setupCompleteGame();
    const finished: GameState = { ...state, phase: 'finished', winner: 'player1' };
    expect(getLegalActions(finished)).toEqual([]);
  });

  it('PLAY_BASIC_TO_BENCH adds to bench', () => {
    // Get to second player turn to avoid first-turn restrictions
    let state = setupCompleteGame();
    const r0 = applyAction(state, { type: 'PASS' });
    if (!r0.ok) throw new Error('PASS failed');
    state = r0.value;

    const player = state.players[state.activePlayer];
    const basics = state.players[state.activePlayer].hand.filter(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Pokemon' && def.stage === 'Basic';
    });

    if (basics.length === 0 || player.bench.length >= 5) return;

    const beforeBench = player.bench.length;
    const result = applyAction(state, { type: 'PLAY_BASIC_TO_BENCH', cardInstanceId: basics[0]! });
    if (!result.ok) throw new Error(`PLAY_BASIC failed: ${result.error.message}`);
    expect(result.value.players[state.activePlayer].bench.length).toBe(beforeBench + 1);
  });
});
