import type { PlayerAction } from '../types/action';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition } from '../types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState } from '../types/game';
import type { GameEvent } from '../types/event';
import type { GameResult } from './result';
import { ok, err } from './result';
import { shuffle } from '../rng';
import { clearSpecialConditions } from './conditions';
import { canEvolve, evolvePokemon } from './evolution';
import { canPayEnergyCost, canPayRetreatCost } from './energy';
import { hasBasicPokemon } from './setup';
import { performCheckup } from './checkup';
import { otherPlayer } from './game';
import { resolveEffect } from '../effects/registry';
import { resolveAttack } from './combat';
import { getEffectiveRetreatCost, getEffectiveAttackCost } from './modifiers';
import { fireEventHooks } from './events';
import type { EventHookPayload } from './events';
import { canUseAbility } from './abilities';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getCardDef(state: GameState, instanceId: string): CardDefinition | undefined {
  const instance = state.cardRegistry.get(instanceId);
  if (!instance) return undefined;
  return state.definitionRegistry.get(instance.definitionId);
}

function getActivePokemonDef(state: GameState, playerId: PlayerId): PokemonCardDefinition | null {
  const active = state.players[playerId].active;
  if (!active) return null;
  const topId = active.evolutionStack[active.evolutionStack.length - 1] ?? active.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return null;
  const def = state.definitionRegistry.get(instance.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

function resetNewThisTurn(state: GameState): GameState {
  const resetPlayer = (ps: PlayerState): PlayerState => ({
    ...ps,
    active: ps.active ? { ...ps.active, isNewThisTurn: false } : null,
    bench: ps.bench.map(b => ({ ...b, isNewThisTurn: false }))
  });
  return {
    ...state,
    players: {
      player1: resetPlayer(state.players.player1),
      player2: resetPlayer(state.players.player2)
    }
  };
}

function getBasicsInHand(state: GameState, playerId: PlayerId): ReadonlyArray<string> {
  const player = state.players[playerId];
  return player.hand.filter(instanceId => {
    const def = getCardDef(state, instanceId);
    return def?.cardType === 'Pokemon' && def.stage === 'Basic';
  });
}

// ─── startTurn ─────────────────────────────────────────────────────────────

export function startTurn(state: GameState): GameState {
  let s = resetNewThisTurn(state);
  const player = s.players[s.activePlayer];

  // Deck-out check
  if (player.deck.length === 0) {
    const winner = otherPlayer(s.activePlayer);
    return {
      ...s,
      winner,
      phase: 'finished',
      eventLog: [...s.eventLog, { type: 'GAME_OVER', winner, reason: 'deck_out' }]
    };
  }

  // Draw 1 card
  const drawnCard = player.deck[0]!;
  s = {
    ...s,
    players: {
      ...s.players,
      [s.activePlayer]: {
        ...player,
        deck: player.deck.slice(1),
        hand: [...player.hand, drawnCard]
      }
    },
    eventLog: [...s.eventLog, { type: 'CARD_DRAWN', player: s.activePlayer, cardInstanceId: drawnCard }]
  };

  const isStartingPlayerFirstTurn = s.activePlayer === s.startingPlayer && s.turnNumber === 1;
  s = {
    ...s,
    phase: 'main',
    turnFlags: {
      ...s.turnFlags,
      attackUsed: false,
      isStartingPlayerFirstTurn,
      turnEndedByEffect: false,
      abilitiesUsedThisTurn: []
    },
    eventLog: [...s.eventLog, { type: 'TURN_STARTED', player: s.activePlayer, turnNumber: s.turnNumber }]
  };

  return s;
}

// ─── endTurn ───────────────────────────────────────────────────────────────

export function endTurn(state: GameState): GameState {
  const endingPayload: EventHookPayload = {
    type: 'turn_ending',
    data: { player: state.activePlayer }
  };
  const turnEndingResult = fireEventHooks(state, endingPayload);

  let s: GameState = {
    ...turnEndingResult.newState,
    phase: 'checkup',
    eventLog: [...turnEndingResult.newState.eventLog, { type: 'TURN_ENDED', player: state.activePlayer }]
  };

  const resetPlayerFlags = (ps: PlayerState): PlayerState => ({
    ...ps,
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  });

  s = {
    ...s,
    players: {
      player1: resetPlayerFlags(s.players.player1),
      player2: resetPlayerFlags(s.players.player2)
    }
  };

  const currentPlayer = state.activePlayer;
  s = {
    ...s,
    temporalEffects: s.temporalEffects.filter(e => {
      if (e.expiresAt === 'end_of_turn') return false;
      if (e.expiresAt === 'end_of_opponent_turn' && currentPlayer !== e.payload['createdByPlayer']) return false;
      if (e.expiresOnTurn !== null && s.turnNumber >= e.expiresOnTurn) return false;
      return true;
    })
  };

  s = performCheckup(s);
  if (s.phase === 'finished') return s;

  const nextPlayer = otherPlayer(s.activePlayer);
  s = { ...s, activePlayer: nextPlayer, turnNumber: s.turnNumber + 1 };

  s = startTurn(s);

  return s;
}

// ─── getLegalActions ───────────────────────────────────────────────────────

export function getLegalActions(state: GameState): ReadonlyArray<PlayerAction> {
  if (state.phase === 'finished') return [];

  if (state.phase === 'setup') {
    return getSetupActions(state);
  }

  if (state.phase === 'main') {
    return getMainActions(state);
  }

  return [];
}

function getSetupActions(state: GameState): ReadonlyArray<PlayerAction> {
  const actions: PlayerAction[] = [];
  const p1 = state.players.player1;
  const p2 = state.players.player2;

  // Coin flip choice phase: both hands empty (pre-draw)
  if (p1.hand.length === 0 && p2.hand.length === 0) {
    actions.push({ type: 'COIN_FLIP_CHOICE', choice: 'first' });
    actions.push({ type: 'COIN_FLIP_CHOICE', choice: 'second' });
    return actions;
  }

  // Mulligan check — only applies if neither player has chosen their active yet.
  // Once active selection has started (any active is set), we're past mulligan phase.
  const anyActiveSelected = p1.active !== null || p2.active !== null;
  if (!anyActiveSelected) {
    const p1NeedsMulligan = !hasBasicPokemon(p1.hand, state.cardRegistry, state.definitionRegistry);
    const p2NeedsMulligan = !hasBasicPokemon(p2.hand, state.cardRegistry, state.definitionRegistry);

    if (p1NeedsMulligan || p2NeedsMulligan) {
      return [{ type: 'MULLIGAN_REDRAW' }];
    }

    // Extra draws for active player (only before active selection)
    if (state.turnFlags.extraDrawsRemaining[state.activePlayer] > 0) {
      return [{ type: 'DRAW_CARD' }];
    }
  }

  // SELECT_ACTIVE for active player
  if (state.players[state.activePlayer].active === null) {
    const basics = getBasicsInHand(state, state.activePlayer);
    return basics.map(instanceId => ({ type: 'SELECT_ACTIVE' as const, cardInstanceId: instanceId }));
  }

  // SELECT_BENCH for active player
  if (!state.turnFlags.setupBenchSelected[state.activePlayer]) {
    const basics = getBasicsInHand(state, state.activePlayer);
    const subsets = generateBenchSubsets(basics, 5);
    return subsets.map(ids => ({ type: 'SELECT_BENCH' as const, cardInstanceIds: ids }));
  }

  return [];
}

function generateBenchSubsets(
  cards: ReadonlyArray<string>,
  maxSize: number
): ReadonlyArray<ReadonlyArray<string>> {
  const results: Array<ReadonlyArray<string>> = [];
  const n = Math.min(cards.length, maxSize);

  function helper(start: number, current: string[]): void {
    results.push([...current]);
    for (let i = start; i < cards.length; i++) {
      if (current.length >= n) break;
      current.push(cards[i]!);
      helper(i + 1, current);
      current.pop();
    }
  }

  helper(0, []);
  return results;
}

function getMainActions(state: GameState): ReadonlyArray<PlayerAction> {
  const actions: PlayerAction[] = [];
  const player = state.players[state.activePlayer];
  const flags = state.turnFlags;

  // PLAY_BASIC_TO_BENCH
  if (player.bench.length < 5) {
    const basics = getBasicsInHand(state, state.activePlayer);
    for (const instanceId of basics) {
      actions.push({ type: 'PLAY_BASIC_TO_BENCH', cardInstanceId: instanceId });
    }
  }

  // EVOLVE_POKEMON
  for (const instanceId of player.hand) {
    const def = getCardDef(state, instanceId);
    if (!def || def.cardType !== 'Pokemon' || def.stage === 'Basic') continue;

    if (player.active && canEvolve(def, player.active, state)) {
      actions.push({ type: 'EVOLVE_POKEMON', cardInstanceId: instanceId, targetInstanceId: player.active.instanceId });
    }
    for (const benched of player.bench) {
      if (canEvolve(def, benched, state)) {
        actions.push({ type: 'EVOLVE_POKEMON', cardInstanceId: instanceId, targetInstanceId: benched.instanceId });
      }
    }
  }

  // ATTACH_ENERGY
  if (!player.energyAttachedThisTurn) {
    for (const instanceId of player.hand) {
      const def = getCardDef(state, instanceId);
      if (!def || def.cardType !== 'Energy') continue;

      if (player.active) {
        actions.push({ type: 'ATTACH_ENERGY', cardInstanceId: instanceId, targetInstanceId: player.active.instanceId });
      }
      for (const benched of player.bench) {
        actions.push({ type: 'ATTACH_ENERGY', cardInstanceId: instanceId, targetInstanceId: benched.instanceId });
      }
    }
  }

  // PLAY_TRAINER
  for (const instanceId of player.hand) {
    const def = getCardDef(state, instanceId);
    if (!def || def.cardType !== 'Trainer') continue;

    if (def.subtypes.includes('Item') || def.subtypes.includes('TechnicalMachine')) {
      actions.push({ type: 'PLAY_TRAINER', cardInstanceId: instanceId });
    }

    if (def.subtypes.includes('Supporter')) {
      if (!player.supporterPlayedThisTurn && !flags.isStartingPlayerFirstTurn) {
        actions.push({ type: 'PLAY_TRAINER', cardInstanceId: instanceId });
      }
    }

    if (def.subtypes.includes('Stadium')) {
      if (!player.stadiumPlayedThisTurn) {
        const currentStadium = state.stadium
          ? state.definitionRegistry.get(state.cardRegistry.get(state.stadium.cardInstanceId)?.definitionId ?? '')
          : null;
        if (currentStadium?.name !== def.name) {
          actions.push({ type: 'PLAY_TRAINER', cardInstanceId: instanceId });
        }
      }
    }

    if (def.subtypes.includes('PokemonTool')) {
      if (player.active && player.active.attachedTools.length === 0) {
        actions.push({ type: 'PLAY_TRAINER', cardInstanceId: instanceId, targets: [player.active.instanceId] });
      }
      for (const benched of player.bench) {
        if (benched.attachedTools.length === 0) {
          actions.push({ type: 'PLAY_TRAINER', cardInstanceId: instanceId, targets: [benched.instanceId] });
        }
      }
    }
  }

  // RETREAT
  if (player.active && !player.retreatedThisTurn) {
    const active = player.active;
    const isAsleep = active.specialConditions.includes('Asleep');
    const isParalyzed = active.specialConditions.includes('Paralyzed');

    if (!isAsleep && !isParalyzed) {
      const activeDef = getActivePokemonDef(state, state.activePlayer);
      const retreatCost = activeDef
        ? getEffectiveRetreatCost(state, state.activePlayer, active, activeDef)
        : 0;
      const energyProviders = active.attachedEnergy.map(eid => {
        const def = getCardDef(state, eid);
        return { provides: def?.cardType === 'Energy' ? def.provides : [] };
      });

      if (canPayRetreatCost(retreatCost, energyProviders)) {
        for (const benched of player.bench) {
          actions.push({ type: 'RETREAT', newActiveInstanceId: benched.instanceId, energyToDiscard: [] });
        }
      }
    }
  }

  // USE_ABILITY
  const allPokemon: InPlayPokemon[] = [];
  if (player.active) allPokemon.push(player.active);
  allPokemon.push(...player.bench);

  for (const pokemon of allPokemon) {
    const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
    const instance = state.cardRegistry.get(topId);
    if (!instance) continue;
    const def = state.definitionRegistry.get(instance.definitionId);
    if (!def || def.cardType !== 'Pokemon') continue;
    for (let i = 0; i < def.abilities.length; i++) {
      const ability = def.abilities[i]!;
      if (ability.category === 'passive' || ability.category === 'triggered') continue;
      const usedKey = `${pokemon.instanceId}:${i}`;
      const alreadyUsed = flags.abilitiesUsedThisTurn.includes(usedKey);
      const isRepeatable = ability.text.toLowerCase().includes('as often as you like');
      if (alreadyUsed && !isRepeatable) continue;
      if (canUseAbility(state, state.activePlayer, pokemon, i)) {
        actions.push({ type: 'USE_ABILITY', pokemonInstanceId: pokemon.instanceId, abilityIndex: i });
      }
    }
  }

  // ATTACK
  if (!flags.attackUsed && !flags.isStartingPlayerFirstTurn && player.active) {
    const active = player.active;
    const isAsleep = active.specialConditions.includes('Asleep');
    const isParalyzed = active.specialConditions.includes('Paralyzed');

    if (!isAsleep && !isParalyzed) {
      const activeDef = getActivePokemonDef(state, state.activePlayer);
      if (activeDef) {
        const energyProviders = active.attachedEnergy.map(eid => {
          const def = getCardDef(state, eid);
          return { provides: def?.cardType === 'Energy' ? def.provides : [] };
        });

        for (let i = 0; i < activeDef.attacks.length; i++) {
          const attack = activeDef.attacks[i]!;
          const effectiveCost = getEffectiveAttackCost(state, active, activeDef, attack, state.activePlayer);
          if (canPayEnergyCost(effectiveCost, energyProviders)) {
            actions.push({ type: 'ATTACK', attackIndex: i });
          }
        }
      }

      // TM-granted attacks
      for (let ti = 0; ti < active.attachedTools.length; ti++) {
        const toolDef = getCardDef(state, active.attachedTools[ti]!);
        if (toolDef?.cardType === 'Trainer' && toolDef.subtypes.includes('TechnicalMachine')) {
          actions.push({ type: 'ATTACK', attackIndex: 100 + ti });
        }
      }
    }
  }

  // PASS
  actions.push({ type: 'PASS' });

  return actions;
}

// ─── applyAction ──────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: PlayerAction): GameResult<GameState> {
  if (state.phase === 'setup') {
    return applySetupAction(state, action);
  }
  if (state.phase === 'main') {
    return applyMainAction(state, action);
  }
  return err('INVALID_STATE', `Cannot apply action in phase: ${state.phase}`);
}

function applySetupAction(state: GameState, action: PlayerAction): GameResult<GameState> {
  const p1 = state.players.player1;
  const p2 = state.players.player2;

  if (action.type === 'COIN_FLIP_CHOICE') {
    if (p1.hand.length !== 0 || p2.hand.length !== 0) {
      return err('ILLEGAL_ACTION', 'COIN_FLIP_CHOICE only valid before hands are dealt');
    }

    const flipWinner = state.activePlayer;
    const startingPlayer: PlayerId = action.choice === 'first' ? flipWinner : otherPlayer(flipWinner);

    let s = { ...state, startingPlayer };

    const { result: deck1, nextState: rng1 } = shuffle(s.players.player1.deck, s.rngState);
    const { result: deck2, nextState: rng2 } = shuffle(s.players.player2.deck, rng1);

    s = {
      ...s,
      rngState: rng2,
      players: {
        player1: { ...s.players.player1, deck: [...deck1] },
        player2: { ...s.players.player2, deck: [...deck2] }
      },
      eventLog: [
        ...s.eventLog,
        { type: 'DECK_SHUFFLED', player: 'player1' as PlayerId },
        { type: 'DECK_SHUFFLED', player: 'player2' as PlayerId }
      ] as GameEvent[]
    };

    s = drawCards(s, 'player1', 7);
    s = drawCards(s, 'player2', 7);
    s = advanceSetupAfterDraw(s);

    return ok(s);
  }

  if (action.type === 'MULLIGAN_REDRAW') {
    const currentP1 = state.players.player1;
    const currentP2 = state.players.player2;
    const p1Needs = !hasBasicPokemon(currentP1.hand, state.cardRegistry, state.definitionRegistry);
    const p2Needs = !hasBasicPokemon(currentP2.hand, state.cardRegistry, state.definitionRegistry);

    let s = state;

    if (p1Needs && p2Needs) {
      s = shuffleHandBack(s, 'player1');
      s = shuffleHandBack(s, 'player2');
      s = drawCards(s, 'player1', 7);
      s = drawCards(s, 'player2', 7);
      s = {
        ...s,
        eventLog: [
          ...s.eventLog,
          { type: 'MULLIGAN', player: 'player1' as PlayerId, mulliganCount: s.turnFlags.mulliganCounts.player1 },
          { type: 'MULLIGAN', player: 'player2' as PlayerId, mulliganCount: s.turnFlags.mulliganCounts.player2 }
        ] as GameEvent[]
      };
    } else {
      const mullPlayer = state.activePlayer;
      s = shuffleHandBack(s, mullPlayer);
      s = drawCards(s, mullPlayer, 7);
      const newCount = s.turnFlags.mulliganCounts[mullPlayer] + 1;
      s = {
        ...s,
        turnFlags: {
          ...s.turnFlags,
          mulliganCounts: { ...s.turnFlags.mulliganCounts, [mullPlayer]: newCount }
        },
        eventLog: [
          ...s.eventLog,
          { type: 'MULLIGAN', player: mullPlayer, mulliganCount: newCount }
        ] as GameEvent[]
      };
    }

    s = advanceSetupAfterDraw(s);
    return ok(s);
  }

  if (action.type === 'DRAW_CARD') {
    const remaining = state.turnFlags.extraDrawsRemaining[state.activePlayer];
    if (remaining <= 0) {
      return err('ILLEGAL_ACTION', 'No extra draws remaining');
    }

    let s = drawCards(state, state.activePlayer, 1);
    const newRemaining = remaining - 1;
    s = {
      ...s,
      turnFlags: {
        ...s.turnFlags,
        extraDrawsRemaining: {
          ...s.turnFlags.extraDrawsRemaining,
          [state.activePlayer]: newRemaining
        }
      }
    };

    if (newRemaining === 0) {
      const other = otherPlayer(state.activePlayer);
      const otherRemaining = s.turnFlags.extraDrawsRemaining[other];
      if (otherRemaining <= 0) {
        s = { ...s, activePlayer: 'player1' };
      }
    }

    return ok(s);
  }

  if (action.type === 'SELECT_ACTIVE') {
    const player = state.players[state.activePlayer];
    if (player.active !== null) {
      return err('ILLEGAL_ACTION', 'Already have an active Pokemon');
    }

    const def = getCardDef(state, action.cardInstanceId);
    if (!def || def.cardType !== 'Pokemon' || def.stage !== 'Basic') {
      return err('ILLEGAL_ACTION', 'Card must be a Basic Pokemon');
    }

    const newHand = player.hand.filter(id => id !== action.cardInstanceId);
    const newActive: InPlayPokemon = {
      instanceId: action.cardInstanceId,
      evolutionStack: [action.cardInstanceId],
      attachedEnergy: [],
      attachedTools: [],
      damageCounters: 0,
      specialConditions: [],
      turnPlayed: 0,
      turnEvolved: null,
      isNewThisTurn: false
    };

    let s: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: { ...player, hand: newHand, active: newActive }
      },
      eventLog: [
        ...state.eventLog,
        { type: 'BASIC_PLAYED', player: state.activePlayer, cardInstanceId: action.cardInstanceId, zone: 'active' }
      ] as GameEvent[]
    };

    const other = otherPlayer(state.activePlayer);
    if (s.players[other].active === null) {
      s = { ...s, activePlayer: other };
    } else {
      s = { ...s, activePlayer: 'player1' };
    }

    return ok(s);
  }

  if (action.type === 'SELECT_BENCH') {
    const player = state.players[state.activePlayer];

    let s = state;
    for (const instanceId of action.cardInstanceIds) {
      const def = getCardDef(s, instanceId);
      if (!def || def.cardType !== 'Pokemon' || def.stage !== 'Basic') {
        return err('ILLEGAL_ACTION', `Card ${instanceId} is not a Basic Pokemon`);
      }

      const newBenchPokemon: InPlayPokemon = {
        instanceId,
        evolutionStack: [instanceId],
        attachedEnergy: [],
        attachedTools: [],
        damageCounters: 0,
        specialConditions: [],
        turnPlayed: 0,
        turnEvolved: null,
        isNewThisTurn: false
      };

      const currentPlayer = s.players[state.activePlayer];
      s = {
        ...s,
        players: {
          ...s.players,
          [state.activePlayer]: {
            ...currentPlayer,
            hand: currentPlayer.hand.filter(id => id !== instanceId),
            bench: [...currentPlayer.bench, newBenchPokemon]
          }
        },
        eventLog: [
          ...s.eventLog,
          { type: 'BASIC_PLAYED', player: state.activePlayer, cardInstanceId: instanceId, zone: 'bench' }
        ] as GameEvent[]
      };
    }

    s = {
      ...s,
      turnFlags: {
        ...s.turnFlags,
        setupBenchSelected: { ...s.turnFlags.setupBenchSelected, [state.activePlayer]: true }
      }
    };

    const other = otherPlayer(state.activePlayer);
    if (!s.turnFlags.setupBenchSelected[other]) {
      s = { ...s, activePlayer: other };
    } else {
      s = completeSetup(s);
    }

    return ok(s);
  }

  return err('ILLEGAL_ACTION', `Action type ${action.type} not valid during setup`);
}

function drawCards(state: GameState, playerId: PlayerId, count: number): GameState {
  const player = state.players[playerId];
  const drawn = player.deck.slice(0, count);
  const events: GameEvent[] = drawn.map(id => ({
    type: 'CARD_DRAWN' as const,
    player: playerId,
    cardInstanceId: id
  }));
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: player.deck.slice(count),
        hand: [...player.hand, ...drawn]
      }
    },
    eventLog: [...state.eventLog, ...events]
  };
}

function shuffleHandBack(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  const combined = [...player.deck, ...player.hand];
  const { result: shuffled, nextState: rng } = shuffle(combined, state.rngState);
  return {
    ...state,
    rngState: rng,
    players: {
      ...state.players,
      [playerId]: { ...player, deck: [...shuffled], hand: [] }
    },
    eventLog: [...state.eventLog, { type: 'DECK_SHUFFLED', player: playerId }]
  };
}

function advanceSetupAfterDraw(state: GameState): GameState {
  const p1 = state.players.player1;
  const p2 = state.players.player2;
  const p1Needs = !hasBasicPokemon(p1.hand, state.cardRegistry, state.definitionRegistry);
  const p2Needs = !hasBasicPokemon(p2.hand, state.cardRegistry, state.definitionRegistry);

  if (p1Needs && p2Needs) {
    return { ...state, activePlayer: 'player1' };
  }
  if (p1Needs) {
    return { ...state, activePlayer: 'player1' };
  }
  if (p2Needs) {
    return { ...state, activePlayer: 'player2' };
  }

  // No more mulligans — compute extra draws
  const p1Count = state.turnFlags.mulliganCounts.player1;
  const p2Count = state.turnFlags.mulliganCounts.player2;
  const diff = p1Count - p2Count;

  if (diff > 0) {
    return {
      ...state,
      activePlayer: 'player2',
      turnFlags: {
        ...state.turnFlags,
        extraDrawsRemaining: { ...state.turnFlags.extraDrawsRemaining, player2: diff }
      }
    };
  }
  if (diff < 0) {
    return {
      ...state,
      activePlayer: 'player1',
      turnFlags: {
        ...state.turnFlags,
        extraDrawsRemaining: { ...state.turnFlags.extraDrawsRemaining, player1: -diff }
      }
    };
  }

  return { ...state, activePlayer: 'player1' };
}

function completeSetup(state: GameState): GameState {
  let s = state;

  for (const playerId of ['player1', 'player2'] as PlayerId[]) {
    const player = s.players[playerId];
    const prizes = player.deck.slice(0, 6);
    s = {
      ...s,
      players: {
        ...s.players,
        [playerId]: { ...s.players[playerId], deck: player.deck.slice(6), prizes }
      }
    };
  }

  s = {
    ...s,
    activePlayer: s.startingPlayer,
    turnNumber: 1,
    turnFlags: {
      ...s.turnFlags,
      mulliganCounts: { player1: 0, player2: 0 },
      extraDrawsRemaining: { player1: 0, player2: 0 },
      setupBenchSelected: { player1: false, player2: false }
    }
  };

  s = startTurn(s);
  return s;
}

function applyMainAction(state: GameState, action: PlayerAction): GameResult<GameState> {
  const player = state.players[state.activePlayer];

  if (action.type === 'PLAY_BASIC_TO_BENCH') {
    if (player.bench.length >= 5) {
      return err('ILLEGAL_ACTION', 'Bench is full');
    }
    const def = getCardDef(state, action.cardInstanceId);
    if (!def || def.cardType !== 'Pokemon' || def.stage !== 'Basic') {
      return err('ILLEGAL_ACTION', 'Card must be a Basic Pokemon');
    }

    const newBenchPokemon: InPlayPokemon = {
      instanceId: action.cardInstanceId,
      evolutionStack: [action.cardInstanceId],
      attachedEnergy: [],
      attachedTools: [],
      damageCounters: 0,
      specialConditions: [],
      turnPlayed: state.turnNumber,
      turnEvolved: null,
      isNewThisTurn: true
    };

    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          hand: player.hand.filter(id => id !== action.cardInstanceId),
          bench: [...player.bench, newBenchPokemon]
        }
      },
      eventLog: [
        ...state.eventLog,
        { type: 'BASIC_PLAYED', player: state.activePlayer, cardInstanceId: action.cardInstanceId, zone: 'bench' }
      ] as GameEvent[]
    };
    const benchPayload: EventHookPayload = {
      type: 'pokemon_benched',
      data: { player: state.activePlayer, pokemonInstanceId: action.cardInstanceId }
    };
    const benchHookResult = fireEventHooks(s, benchPayload);
    return ok(benchHookResult.newState);
  }

  if (action.type === 'EVOLVE_POKEMON') {
    const evoDef = getCardDef(state, action.cardInstanceId);
    if (!evoDef || evoDef.cardType !== 'Pokemon') {
      return err('ILLEGAL_ACTION', 'Evolution card must be a Pokemon');
    }

    const target =
      player.active?.instanceId === action.targetInstanceId
        ? player.active
        : player.bench.find(b => b.instanceId === action.targetInstanceId);

    if (!target) {
      return err('ILLEGAL_ACTION', 'Target Pokemon not found');
    }

    if (!canEvolve(evoDef, target, state)) {
      return err('ILLEGAL_ACTION', 'Cannot evolve this Pokemon');
    }

    return ok(evolvePokemon(state, action.cardInstanceId, action.targetInstanceId));
  }

  if (action.type === 'ATTACH_ENERGY') {
    if (player.energyAttachedThisTurn) {
      return err('ILLEGAL_ACTION', 'Already attached energy this turn');
    }

    const def = getCardDef(state, action.cardInstanceId);
    if (!def || def.cardType !== 'Energy') {
      return err('ILLEGAL_ACTION', 'Card must be an Energy card');
    }

    const isActive = player.active?.instanceId === action.targetInstanceId;
    const benchIdx = player.bench.findIndex(b => b.instanceId === action.targetInstanceId);

    if (!isActive && benchIdx === -1) {
      return err('ILLEGAL_ACTION', 'Target Pokemon not found');
    }

    const attachTo = (pokemon: InPlayPokemon): InPlayPokemon => ({
      ...pokemon,
      attachedEnergy: [...pokemon.attachedEnergy, action.cardInstanceId]
    });

    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          hand: player.hand.filter(id => id !== action.cardInstanceId),
          energyAttachedThisTurn: true,
          active: isActive ? attachTo(player.active!) : player.active,
          bench: benchIdx !== -1
            ? player.bench.map((b, i) => i === benchIdx ? attachTo(b) : b)
            : player.bench
        }
      },
      eventLog: [
        ...state.eventLog,
        { type: 'ENERGY_ATTACHED', player: state.activePlayer, energyInstanceId: action.cardInstanceId, targetInstanceId: action.targetInstanceId }
      ] as GameEvent[]
    };
    const energyPayload: EventHookPayload = {
      type: 'energy_attached',
      data: {
        player: state.activePlayer,
        energyInstanceId: action.cardInstanceId,
        targetInstanceId: action.targetInstanceId
      }
    };
    const energyHookResult = fireEventHooks(s, energyPayload);
    return ok(energyHookResult.newState);
  }

  if (action.type === 'PLAY_TRAINER') {
    const def = getCardDef(state, action.cardInstanceId);
    if (!def || def.cardType !== 'Trainer') {
      return err('ILLEGAL_ACTION', 'Card must be a Trainer card');
    }

    const trainerDef = def as TrainerCardDefinition;
    let s: GameState = state;

    if (trainerDef.subtypes.includes('Supporter')) {
      if (player.supporterPlayedThisTurn) {
        return err('ILLEGAL_ACTION', 'Already played a Supporter this turn');
      }
      if (state.turnFlags.isStartingPlayerFirstTurn) {
        return err('ILLEGAL_ACTION', 'Starting player cannot play Supporters on turn 1');
      }
      s = {
        ...s,
        players: {
          ...s.players,
          [state.activePlayer]: { ...player, supporterPlayedThisTurn: true }
        }
      };
    }

    if (trainerDef.subtypes.includes('Stadium')) {
      if (player.stadiumPlayedThisTurn) {
        return err('ILLEGAL_ACTION', 'Already played a Stadium this turn');
      }
      const currentStadium = state.stadium
        ? state.definitionRegistry.get(state.cardRegistry.get(state.stadium.cardInstanceId)?.definitionId ?? '')
        : null;
      if (currentStadium?.name === trainerDef.name) {
        return err('ILLEGAL_ACTION', 'Cannot play a Stadium with the same name as the current Stadium');
      }

      const events: GameEvent[] = [];
      if (state.stadium) {
        events.push({ type: 'STADIUM_DISCARDED', cardInstanceId: state.stadium.cardInstanceId });
        const oldOwner = state.stadium.playedBy;
        const oldOwnerState = s.players[oldOwner];
        s = {
          ...s,
          players: {
            ...s.players,
            [oldOwner]: { ...oldOwnerState, discard: [...oldOwnerState.discard, state.stadium.cardInstanceId] }
          }
        };
      }

      s = {
        ...s,
        stadium: { cardInstanceId: action.cardInstanceId, playedBy: state.activePlayer },
        players: {
          ...s.players,
          [state.activePlayer]: {
            ...s.players[state.activePlayer],
            hand: s.players[state.activePlayer].hand.filter(id => id !== action.cardInstanceId),
            stadiumPlayedThisTurn: true
          }
        },
        eventLog: [
          ...s.eventLog,
          ...events,
          { type: 'STADIUM_PLAYED', player: state.activePlayer, cardInstanceId: action.cardInstanceId }
        ] as GameEvent[]
      };
      return ok(s);
    }

    if (trainerDef.subtypes.includes('PokemonTool')) {
      const target = action.targets?.[0];
      if (!target) {
        return err('ILLEGAL_ACTION', 'Tool requires a target Pokemon');
      }
      const isActive = player.active?.instanceId === target;
      const benchIdx = player.bench.findIndex(b => b.instanceId === target);
      if (!isActive && benchIdx === -1) {
        return err('ILLEGAL_ACTION', 'Tool target Pokemon not found');
      }

      const attachTool = (pokemon: InPlayPokemon): InPlayPokemon => ({
        ...pokemon,
        attachedTools: [...pokemon.attachedTools, action.cardInstanceId]
      });

      s = {
        ...s,
        players: {
          ...s.players,
          [state.activePlayer]: {
            ...player,
            hand: player.hand.filter(id => id !== action.cardInstanceId),
            active: isActive ? attachTool(player.active!) : player.active,
            bench: benchIdx !== -1
              ? player.bench.map((b, i) => i === benchIdx ? attachTool(b) : b)
              : player.bench
          }
        },
        eventLog: [
          ...s.eventLog,
          { type: 'TOOL_ATTACHED', player: state.activePlayer, toolInstanceId: action.cardInstanceId, targetInstanceId: target }
        ] as GameEvent[]
      };
      return ok(s);
    }

    // Item / TM
    s = {
      ...s,
      players: {
        ...s.players,
        [state.activePlayer]: {
          ...s.players[state.activePlayer],
          hand: s.players[state.activePlayer].hand.filter(id => id !== action.cardInstanceId),
          discard: [...s.players[state.activePlayer].discard, action.cardInstanceId]
        }
      },
      eventLog: [
        ...s.eventLog,
        { type: 'TRAINER_PLAYED', player: state.activePlayer, cardInstanceId: action.cardInstanceId }
      ] as GameEvent[]
    };

    const effectResult = resolveEffect(trainerDef.effectId, {
      state: s,
      actingPlayer: state.activePlayer,
      targets: action.targets ?? []
    });
    if (!effectResult.ok) return effectResult;

    let resultState = effectResult.value;

    // Some trainer effects end the turn immediately (e.g. Boxed Order, Katy).
    if (resultState.turnFlags.turnEndedByEffect) {
      resultState = {
        ...resultState,
        turnFlags: { ...resultState.turnFlags, turnEndedByEffect: false }
      };
      resultState = endTurn(resultState);
    }

    return ok(resultState);
  }

  if (action.type === 'RETREAT') {
    if (player.retreatedThisTurn) {
      return err('ILLEGAL_ACTION', 'Already retreated this turn');
    }
    if (!player.active) {
      return err('ILLEGAL_ACTION', 'No active Pokemon to retreat');
    }

    const active = player.active;
    const isAsleep = active.specialConditions.includes('Asleep');
    const isParalyzed = active.specialConditions.includes('Paralyzed');
    if (isAsleep) return err('ILLEGAL_ACTION', 'Cannot retreat while Asleep');
    if (isParalyzed) return err('ILLEGAL_ACTION', 'Cannot retreat while Paralyzed');

    const activeDef = getActivePokemonDef(state, state.activePlayer);
    const retreatCost = activeDef
      ? getEffectiveRetreatCost(state, state.activePlayer, active, activeDef)
      : 0;
    const energyProviders = active.attachedEnergy.map(eid => {
      const def = getCardDef(state, eid);
      return { provides: def?.cardType === 'Energy' ? def.provides : [] };
    });

    if (!canPayRetreatCost(retreatCost, energyProviders)) {
      return err('ILLEGAL_ACTION', 'Not enough energy to pay retreat cost');
    }

    const energyToDiscard = action.energyToDiscard.length > 0
      ? action.energyToDiscard
      : active.attachedEnergy.slice(0, retreatCost);

    const remainingEnergy = active.attachedEnergy.filter(id => !energyToDiscard.includes(id));

    const retreatedPokemon: InPlayPokemon = {
      ...clearSpecialConditions(active),
      attachedEnergy: remainingEnergy
    };

    const benchIdx = player.bench.findIndex(b => b.instanceId === action.newActiveInstanceId);
    if (benchIdx === -1) {
      return err('ILLEGAL_ACTION', 'New active Pokemon not found on bench');
    }

    const newActive = player.bench[benchIdx]!;
    const newBench = [
      ...player.bench.filter((_, i) => i !== benchIdx),
      retreatedPokemon
    ];

    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        [state.activePlayer]: {
          ...player,
          active: newActive,
          bench: newBench,
          discard: [...player.discard, ...energyToDiscard],
          retreatedThisTurn: true
        }
      },
      temporalEffects: state.temporalEffects.filter(
        e => !(e.targetInstanceId === active.instanceId && e.sourceType === 'attack')
      ),
      eventLog: [
        ...state.eventLog,
        { type: 'RETREATED', player: state.activePlayer, oldActiveId: active.instanceId, newActiveId: action.newActiveInstanceId }
      ] as GameEvent[]
    };
    return ok(s);
  }

  if (action.type === 'USE_ABILITY') {
    const pokemon =
      player.active?.instanceId === action.pokemonInstanceId
        ? player.active
        : player.bench.find(b => b.instanceId === action.pokemonInstanceId);

    if (!pokemon) {
      return err('ILLEGAL_ACTION', 'Pokemon not found');
    }

    const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
    const instance = state.cardRegistry.get(topId);
    const def = instance ? state.definitionRegistry.get(instance.definitionId) : undefined;
    if (!def || def.cardType !== 'Pokemon' || !def.abilities[action.abilityIndex]) {
      return err('ILLEGAL_ACTION', 'Ability not found');
    }

    const ability = def.abilities[action.abilityIndex]!;

    if (!canUseAbility(state, state.activePlayer, pokemon, action.abilityIndex)) {
      return err('ILLEGAL_ACTION', 'Ability is suppressed or unavailable');
    }

    const s: GameState = {
      ...state,
      eventLog: [
        ...state.eventLog,
        { type: 'ABILITY_USED', player: state.activePlayer, pokemonInstanceId: action.pokemonInstanceId, abilityName: ability.name }
      ] as GameEvent[]
    };

    const effectResult = resolveEffect(ability.effectId, {
      state: s,
      actingPlayer: state.activePlayer,
      targets: [action.pokemonInstanceId]
    });
    if (!effectResult.ok) return effectResult;

    const abilityKey = `${action.pokemonInstanceId}:${action.abilityIndex}`;
    const finalState: GameState = {
      ...effectResult.value,
      turnFlags: {
        ...effectResult.value.turnFlags,
        abilitiesUsedThisTurn: [...effectResult.value.turnFlags.abilitiesUsedThisTurn, abilityKey]
      }
    };
    return ok(finalState);
  }

  if (action.type === 'ATTACK') {
    if (state.turnFlags.attackUsed) {
      return err('ILLEGAL_ACTION', 'Already attacked this turn');
    }
    if (state.turnFlags.isStartingPlayerFirstTurn) {
      return err('ILLEGAL_ACTION', 'Starting player cannot attack on turn 1');
    }
    if (!player.active) {
      return err('ILLEGAL_ACTION', 'No active Pokemon');
    }

    const active = player.active;
    const isAsleep = active.specialConditions.includes('Asleep');
    const isParalyzed = active.specialConditions.includes('Paralyzed');
    if (isAsleep) return err('ILLEGAL_ACTION', 'Cannot attack while Asleep');
    if (isParalyzed) return err('ILLEGAL_ACTION', 'Cannot attack while Paralyzed');

    const activeDef = getActivePokemonDef(state, state.activePlayer);
    const attackName = action.attackIndex < 100
      ? (activeDef?.attacks[action.attackIndex]?.name ?? `Attack ${action.attackIndex}`)
      : `TM Attack ${action.attackIndex - 100}`;

    let s: GameState = {
      ...state,
      phase: 'attack',
      turnFlags: { ...state.turnFlags, attackUsed: true },
      eventLog: [
        ...state.eventLog,
        { type: 'ATTACK_DECLARED', player: state.activePlayer, attackName, attackerInstanceId: active.instanceId }
      ] as GameEvent[]
    };

    s = resolveAttack(s, action.attackIndex);
    if (s.phase === 'finished') return ok(s);

    s = endTurn(s);
    return ok(s);
  }

  if (action.type === 'PASS') {
    return ok(endTurn(state));
  }

  return err('ILLEGAL_ACTION', `Action type ${action.type} not valid during main phase`);
}
