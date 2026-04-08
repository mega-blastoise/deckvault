import type { CardDefinition, PokemonCardDefinition } from '../types/card';
import type {
  GameState, PlayerState, PlayerId, CardInstance, TurnFlags
} from '../types/game';
import type { GameEvent } from '../types/event';
import { createRngState, coinFlip } from '../rng';
import { validateDeck } from './validation';
import {
  modifyPrizeCount,
  resolveOnKOTriggers
} from './modifiers';
export type { GameErrorCode, GameError, GameResult } from './result';
export { ok, err } from './result';

export interface GameConfig {
  readonly deck1: ReadonlyArray<string>;
  readonly deck2: ReadonlyArray<string>;
  readonly seed: number;
  readonly definitions: ReadonlyMap<string, CardDefinition>;
  readonly formatDate?: Date;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 'player1' ? 'player2' : 'player1';
}

function makeEmptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    deck: [],
    hand: [],
    prizes: [],
    active: null,
    bench: [],
    discard: [],
    lostZone: [],
    supporterPlayedThisTurn: false,
    stadiumPlayedThisTurn: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false
  };
}

function makeInitialTurnFlags(): TurnFlags {
  return {
    attackUsed: false,
    isStartingPlayerFirstTurn: false,
    turnEndedByEffect: false,
    abilitiesUsedThisTurn: [],
    mulliganCounts: { player1: 0, player2: 0 },
    extraDrawsRemaining: { player1: 0, player2: 0 },
    setupBenchSelected: { player1: false, player2: false }
  };
}

export function createGame(config: GameConfig): import('./result').GameResult<GameState> {
  const { ok, err } = { ok: <T>(v: T) => ({ ok: true as const, value: v }), err: (code: import('./result').GameErrorCode, msg: string) => ({ ok: false as const, error: { code, message: msg } }) };
  const formatDate = config.formatDate ?? new Date();

  const d1Result = validateDeck(config.deck1, config.definitions, formatDate);
  if (!d1Result.ok) return d1Result;
  const d2Result = validateDeck(config.deck2, config.definitions, formatDate);
  if (!d2Result.ok) return d2Result;

  const cardRegistry = new Map<string, CardInstance>();

  const p1DeckInstances: string[] = [];
  const p1CountMap = new Map<string, number>();
  for (const defId of config.deck1) {
    const count = p1CountMap.get(defId) ?? 0;
    const instanceId = `p1-${defId}-${count}`;
    p1CountMap.set(defId, count + 1);
    cardRegistry.set(instanceId, { instanceId, definitionId: defId, owner: 'player1' });
    p1DeckInstances.push(instanceId);
  }

  const p2DeckInstances: string[] = [];
  const p2CountMap = new Map<string, number>();
  for (const defId of config.deck2) {
    const count = p2CountMap.get(defId) ?? 0;
    const instanceId = `p2-${defId}-${count}`;
    p2CountMap.set(defId, count + 1);
    cardRegistry.set(instanceId, { instanceId, definitionId: defId, owner: 'player2' });
    p2DeckInstances.push(instanceId);
  }

  const rngState = createRngState(config.seed);
  const { result: flipResult, nextState: rng1 } = coinFlip(rngState);
  const coinFlipWinner: PlayerId = flipResult === 'heads' ? 'player1' : 'player2';

  const events: GameEvent[] = [
    { type: 'GAME_STARTED', seed: config.seed },
    { type: 'COIN_FLIPPED', result: flipResult, reason: 'setup_coin_flip' }
  ];

  const player1: PlayerState = { ...makeEmptyPlayer('player1'), deck: p1DeckInstances };
  const player2: PlayerState = { ...makeEmptyPlayer('player2'), deck: p2DeckInstances };

  const state: GameState = {
    players: { player1, player2 },
    activePlayer: coinFlipWinner,
    startingPlayer: coinFlipWinner,
    turnNumber: 0,
    phase: 'setup',
    stadium: null,
    cardRegistry,
    definitionRegistry: config.definitions,
    eventLog: events,
    winner: null,
    rngState: rng1,
    turnFlags: makeInitialTurnFlags(),
    temporalEffects: []
  };

  return ok(state);
}

function countWinConditions(state: GameState, player: PlayerId): number {
  const opponent = otherPlayer(player);
  const opponentState = state.players[opponent];
  const playerState = state.players[player];
  let count = 0;

  if (playerState.prizes.length === 0 && state.phase !== 'setup') count++;
  if (opponentState.active === null && opponentState.bench.length === 0 && state.phase !== 'setup') count++;

  return count;
}

export function checkWinConditions(state: GameState): GameState {
  if (state.winner !== null || state.phase === 'setup') return state;

  const p1Conditions = countWinConditions(state, 'player1');
  const p2Conditions = countWinConditions(state, 'player2');

  if (p1Conditions === 0 && p2Conditions === 0) return state;

  let winner: PlayerId | 'draw';
  if (p1Conditions > p2Conditions) winner = 'player1';
  else if (p2Conditions > p1Conditions) winner = 'player2';
  else winner = 'draw';

  const reason = p1Conditions > 0
    ? (state.players.player2.active === null && state.players.player2.bench.length === 0
        ? 'no_pokemon_in_play' : 'all_prizes_taken')
    : (state.players.player1.active === null && state.players.player1.bench.length === 0
        ? 'no_pokemon_in_play' : 'all_prizes_taken');

  return {
    ...state,
    winner,
    phase: 'finished',
    eventLog: [...state.eventLog, { type: 'GAME_OVER', winner, reason }]
  };
}

export function promoteFromBench(
  state: GameState,
  player: PlayerId,
  newActiveId: string
): GameState {
  const playerState = state.players[player];
  const benchIdx = playerState.bench.findIndex(b => b.instanceId === newActiveId);
  if (benchIdx === -1) return state;

  const newActive = playerState.bench[benchIdx]!;
  const newBench = playerState.bench.filter((_, i) => i !== benchIdx);

  return {
    ...state,
    players: {
      ...state.players,
      [player]: { ...playerState, active: newActive, bench: newBench }
    }
  };
}

export function handleKnockOut(state: GameState, knockedOutPokemonId: string): GameState {
  let koPlayer: PlayerId | null = null;
  let koZone: 'active' | 'bench' = 'active';
  let koBenchIdx = -1;

  for (const [pid, ps] of Object.entries(state.players) as Array<[PlayerId, PlayerState]>) {
    if (ps.active?.instanceId === knockedOutPokemonId) {
      koPlayer = pid;
      koZone = 'active';
      break;
    }
    const bi = ps.bench.findIndex(b => b.instanceId === knockedOutPokemonId);
    if (bi !== -1) {
      koPlayer = pid;
      koZone = 'bench';
      koBenchIdx = bi;
      break;
    }
  }
  if (!koPlayer) return state;

  const koPlayerState = state.players[koPlayer];
  const koedPokemon = koZone === 'active'
    ? koPlayerState.active!
    : koPlayerState.bench[koBenchIdx]!;

  const topInstanceId = koedPokemon.evolutionStack[koedPokemon.evolutionStack.length - 1] ?? koedPokemon.instanceId;
  const topInstance = state.cardRegistry.get(topInstanceId);
  const topDef = topInstance ? state.definitionRegistry.get(topInstance.definitionId) : undefined;
  const pokemonDef = topDef?.cardType === 'Pokemon' ? topDef : null;

  const basePrizeValue = (pokemonDef ? pokemonDef.prizeValue : 1) as 1 | 2 | 3;
  const prizeValue = pokemonDef
    ? modifyPrizeCount(state, koedPokemon, pokemonDef, basePrizeValue, koPlayer)
    : basePrizeValue;

  const prize = otherPlayer(koPlayer);
  const prizePlayer = state.players[prize];

  const events: GameEvent[] = [];

  // On-KO triggers (Exp. Share, Heavy Baton, etc.) — run BEFORE discard
  let s = state;
  if (pokemonDef) {
    s = resolveOnKOTriggers(s, koedPokemon, pokemonDef, koPlayer, null);
  }

  // Re-read state after triggers may have moved energy
  const updatedKoPlayerState = s.players[koPlayer];
  const updatedKoedPokemon = koZone === 'active'
    ? updatedKoPlayerState.active!
    : updatedKoPlayerState.bench[koBenchIdx]!;

  const toDiscard: string[] = [
    updatedKoedPokemon.instanceId,
    ...updatedKoedPokemon.evolutionStack,
    ...updatedKoedPokemon.attachedEnergy,
    ...updatedKoedPokemon.attachedTools
  ];
  const discardSet = new Set(toDiscard);
  events.push({ type: 'POKEMON_KNOCKED_OUT', player: koPlayer, pokemonInstanceId: knockedOutPokemonId, prizesAwarded: prizeValue });

  const newKoPlayerDiscard = [...updatedKoPlayerState.discard, ...discardSet];
  const updatedPrizePlayer = s.players[prize];

  const prizesToTake = Math.min(prizeValue, updatedPrizePlayer.prizes.length);
  const takenPrizes = updatedPrizePlayer.prizes.slice(0, prizesToTake);
  const remainingPrizes = updatedPrizePlayer.prizes.slice(prizesToTake);

  for (const prizeCard of takenPrizes) {
    events.push({ type: 'PRIZE_TAKEN', player: prize, cardInstanceId: prizeCard });
  }

  if (koZone === 'bench') {
    const newBench = updatedKoPlayerState.bench.filter((_, i) => i !== koBenchIdx);
    let newState: GameState = {
      ...s,
      players: {
        ...s.players,
        [koPlayer]: {
          ...updatedKoPlayerState,
          bench: newBench,
          discard: newKoPlayerDiscard
        },
        [prize]: {
          ...updatedPrizePlayer,
          prizes: remainingPrizes,
          hand: [...updatedPrizePlayer.hand, ...takenPrizes]
        }
      },
      eventLog: [...s.eventLog, ...events]
    };
    newState = checkWinConditions(newState);
    return newState;
  }

  // Active KO
  let newState: GameState = {
    ...s,
    players: {
      ...s.players,
      [koPlayer]: {
        ...updatedKoPlayerState,
        active: null,
        discard: newKoPlayerDiscard
      },
      [prize]: {
        ...updatedPrizePlayer,
        prizes: remainingPrizes,
        hand: [...updatedPrizePlayer.hand, ...takenPrizes]
      }
    },
    eventLog: [...s.eventLog, ...events]
  };

  newState = checkWinConditions(newState);
  if (newState.phase === 'finished') return newState;

  const finalKoPlayer = newState.players[koPlayer];
  if (finalKoPlayer.bench.length > 0) {
    newState = promoteFromBench(newState, koPlayer, finalKoPlayer.bench[0]!.instanceId);
  }

  return newState;
}
