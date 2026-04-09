import type { GameEvent, PlayerId } from '@pokemon/engine/browser';
import type {
  ReplayBoardState,
  ReplayPlayerState,
  ReplayPokemonSlot,
  SerializedCardDefinition
} from './types';
import type { CapturedReplay } from '../../../workers/simulation.worker';

export interface ReplayStateCache {
  readonly turnStates: Map<number, ReplayBoardState>;
}

function definitionIdFromInstanceId(instanceId: string): string {
  const lastUnderscore = instanceId.lastIndexOf('_');
  if (lastUnderscore === -1) return instanceId;
  return instanceId.slice(0, lastUnderscore);
}

function lookupName(
  instanceId: string,
  definitions: Record<string, SerializedCardDefinition>
): string {
  const defId = definitionIdFromInstanceId(instanceId);
  return definitions[defId]?.name ?? defId;
}

function lookupHp(
  instanceId: string,
  definitions: Record<string, SerializedCardDefinition>
): number {
  const defId = definitionIdFromInstanceId(instanceId);
  return definitions[defId]?.hp ?? 0;
}

function lookupStage(
  instanceId: string,
  definitions: Record<string, SerializedCardDefinition>
): string {
  const defId = definitionIdFromInstanceId(instanceId);
  return definitions[defId]?.stage ?? 'Basic';
}

function lookupEnergyType(
  instanceId: string,
  definitions: Record<string, SerializedCardDefinition>
): string {
  const defId = definitionIdFromInstanceId(instanceId);
  const def = definitions[defId];
  if (def?.provides && def.provides.length > 0) {
    return def.provides[0] ?? 'Colorless';
  }
  return 'Colorless';
}

function emptyPlayerState(): ReplayPlayerState {
  return {
    active: null,
    bench: [],
    handCount: 0,
    deckCount: 60,
    discardCount: 0,
    discardTopCardId: null,
    prizesRemaining: 6
  };
}

export function buildInitialState(): ReplayBoardState {
  return {
    player1: emptyPlayerState(),
    player2: emptyPlayerState(),
    stadium: null,
    turnNumber: 0,
    activePlayer: 'player1',
    currentEventIndex: -1
  };
}

function updatePlayer(
  state: ReplayBoardState,
  player: PlayerId,
  updater: (ps: ReplayPlayerState) => ReplayPlayerState
): ReplayBoardState {
  if (player === 'player1') {
    return { ...state, player1: updater(state.player1) };
  }
  return { ...state, player2: updater(state.player2) };
}

function getPlayer(state: ReplayBoardState, player: PlayerId): ReplayPlayerState {
  return player === 'player1' ? state.player1 : state.player2;
}

function findPokemonInPlayer(
  ps: ReplayPlayerState,
  instanceId: string
): ReplayPokemonSlot | null {
  if (ps.active?.instanceId === instanceId) return ps.active;
  return ps.bench.find((s) => s.instanceId === instanceId) ?? null;
}

function updatePokemonInPlayer(
  ps: ReplayPlayerState,
  instanceId: string,
  updater: (slot: ReplayPokemonSlot) => ReplayPokemonSlot
): ReplayPlayerState {
  if (ps.active?.instanceId === instanceId) {
    return { ...ps, active: updater(ps.active) };
  }
  const benchIdx = ps.bench.findIndex((s) => s.instanceId === instanceId);
  if (benchIdx !== -1) {
    const newBench = [...ps.bench];
    newBench[benchIdx] = updater(ps.bench[benchIdx]!);
    return { ...ps, bench: newBench };
  }
  return ps;
}

function findPlayerOwningPokemon(
  state: ReplayBoardState,
  instanceId: string
): PlayerId | null {
  if (findPokemonInPlayer(state.player1, instanceId)) return 'player1';
  if (findPokemonInPlayer(state.player2, instanceId)) return 'player2';
  return null;
}

function updatePokemonGlobal(
  state: ReplayBoardState,
  instanceId: string,
  updater: (slot: ReplayPokemonSlot) => ReplayPokemonSlot
): ReplayBoardState {
  const owner = findPlayerOwningPokemon(state, instanceId);
  if (!owner) return state;
  return updatePlayer(state, owner, (ps) => updatePokemonInPlayer(ps, instanceId, updater));
}

export function applyEvent(
  state: ReplayBoardState,
  event: GameEvent,
  definitions: Record<string, SerializedCardDefinition>
): ReplayBoardState {
  switch (event.type) {
    case 'GAME_STARTED': {
      return {
        ...buildInitialState(),
        currentEventIndex: state.currentEventIndex
      };
    }

    case 'TURN_STARTED': {
      return {
        ...state,
        turnNumber: event.turnNumber,
        activePlayer: event.player
      };
    }

    case 'TURN_ENDED': {
      return state;
    }

    case 'CARD_DRAWN': {
      return updatePlayer(state, event.player, (ps) => ({
        ...ps,
        handCount: ps.handCount + 1,
        deckCount: Math.max(0, ps.deckCount - 1)
      }));
    }

    case 'BASIC_PLAYED': {
      const hp = lookupHp(event.cardInstanceId, definitions);
      const name = lookupName(event.cardInstanceId, definitions);
      const cardId = definitionIdFromInstanceId(event.cardInstanceId);
      const newSlot: ReplayPokemonSlot = {
        instanceId: event.cardInstanceId,
        cardId,
        name,
        hp,
        currentHp: hp,
        damageCounters: 0,
        attachedEnergy: [],
        attachedTools: [],
        specialConditions: [],
        evolutionStage: 'Basic'
      };
      return updatePlayer(state, event.player, (ps) => {
        const newPs: ReplayPlayerState = { ...ps, handCount: Math.max(0, ps.handCount - 1) };
        if (event.zone === 'active') {
          return { ...newPs, active: newSlot };
        }
        return { ...newPs, bench: [...newPs.bench, newSlot] };
      });
    }

    case 'POKEMON_EVOLVED': {
      const newCardId = definitionIdFromInstanceId(event.evolutionInstanceId);
      const newName = lookupName(event.evolutionInstanceId, definitions);
      const newHp = lookupHp(event.evolutionInstanceId, definitions);
      const newStage = lookupStage(event.evolutionInstanceId, definitions);
      return updatePlayer(
        state,
        findPlayerOwningPokemon(state, event.pokemonInstanceId) ?? state.activePlayer,
        (ps) => {
          const updated = updatePokemonInPlayer(ps, event.pokemonInstanceId, (slot) => ({
            ...slot,
            instanceId: event.evolutionInstanceId,
            cardId: newCardId,
            name: newName,
            hp: newHp,
            currentHp: newHp - slot.damageCounters * 10,
            evolutionStage: newStage,
            specialConditions: []
          }));
          return { ...updated, handCount: Math.max(0, updated.handCount - 1) };
        }
      );
    }

    case 'ENERGY_ATTACHED': {
      const energyType = lookupEnergyType(event.energyInstanceId, definitions);
      const energyCardId = definitionIdFromInstanceId(event.energyInstanceId);
      const ownerOfTarget = findPlayerOwningPokemon(state, event.targetInstanceId) ?? event.player;
      const newState = updatePlayer(state, event.player, (ps) => ({
        ...ps,
        handCount: Math.max(0, ps.handCount - 1)
      }));
      return updatePlayer(newState, ownerOfTarget, (ps) =>
        updatePokemonInPlayer(ps, event.targetInstanceId, (slot) => ({
          ...slot,
          attachedEnergy: [
            ...slot.attachedEnergy,
            { cardId: energyCardId, type: energyType }
          ]
        }))
      );
    }

    case 'TOOL_ATTACHED': {
      const toolName = lookupName(event.toolInstanceId, definitions);
      const toolCardId = definitionIdFromInstanceId(event.toolInstanceId);
      const ownerOfTarget = findPlayerOwningPokemon(state, event.targetInstanceId) ?? event.player;
      const newState = updatePlayer(state, event.player, (ps) => ({
        ...ps,
        handCount: Math.max(0, ps.handCount - 1)
      }));
      return updatePlayer(newState, ownerOfTarget, (ps) =>
        updatePokemonInPlayer(ps, event.targetInstanceId, (slot) => ({
          ...slot,
          attachedTools: [...slot.attachedTools, { cardId: toolCardId, name: toolName }]
        }))
      );
    }

    case 'TRAINER_PLAYED': {
      return updatePlayer(state, event.player, (ps) => ({
        ...ps,
        handCount: Math.max(0, ps.handCount - 1)
      }));
    }

    case 'DAMAGE_DEALT': {
      const countersFromDamage = Math.floor(event.amount / 10);
      return updatePokemonGlobal(state, event.targetInstanceId, (slot) => {
        const newCounters = slot.damageCounters + countersFromDamage;
        return {
          ...slot,
          damageCounters: newCounters,
          currentHp: Math.max(0, slot.hp - newCounters * 10)
        };
      });
    }

    case 'DAMAGE_COUNTERS_PLACED': {
      return updatePokemonGlobal(state, event.targetInstanceId, (slot) => {
        const newCounters = slot.damageCounters + event.counters;
        return {
          ...slot,
          damageCounters: newCounters,
          currentHp: Math.max(0, slot.hp - newCounters * 10)
        };
      });
    }

    case 'DAMAGE_HEALED': {
      const healCounters = Math.floor(event.amount / 10);
      return updatePokemonGlobal(state, event.targetInstanceId, (slot) => {
        const newCounters = Math.max(0, slot.damageCounters - healCounters);
        return {
          ...slot,
          damageCounters: newCounters,
          currentHp: Math.max(0, slot.hp - newCounters * 10)
        };
      });
    }

    case 'POKEMON_KNOCKED_OUT': {
      const opponent: PlayerId = event.player === 'player1' ? 'player2' : 'player1';
      const withRemoved = updatePlayer(state, event.player, (ps) => {
        if (ps.active?.instanceId === event.pokemonInstanceId) {
          return {
            ...ps,
            active: null,
            discardCount: ps.discardCount + 1
          };
        }
        const benchIdx = ps.bench.findIndex((s) => s.instanceId === event.pokemonInstanceId);
        if (benchIdx !== -1) {
          const newBench = ps.bench.filter((_, i) => i !== benchIdx);
          return { ...ps, bench: newBench, discardCount: ps.discardCount + 1 };
        }
        return ps;
      });
      return updatePlayer(withRemoved, opponent, (ps) => ({
        ...ps,
        prizesRemaining: Math.max(0, ps.prizesRemaining - event.prizesAwarded)
      }));
    }

    case 'PRIZE_TAKEN': {
      return updatePlayer(state, event.player, (ps) => ({
        ...ps,
        handCount: ps.handCount + 1
      }));
    }

    case 'SPECIAL_CONDITION_APPLIED': {
      return updatePokemonGlobal(state, event.pokemonInstanceId, (slot) => {
        if (slot.specialConditions.includes(event.condition)) return slot;
        return {
          ...slot,
          specialConditions: [...slot.specialConditions, event.condition]
        };
      });
    }

    case 'SPECIAL_CONDITION_REMOVED': {
      return updatePokemonGlobal(state, event.pokemonInstanceId, (slot) => ({
        ...slot,
        specialConditions: slot.specialConditions.filter((c) => c !== event.condition)
      }));
    }

    case 'RETREATED': {
      const owner = findPlayerOwningPokemon(state, event.oldActiveId) ?? state.activePlayer;
      return updatePlayer(state, owner, (ps) => {
        const newActive = ps.bench.find((s) => s.instanceId === event.newActiveId) ?? null;
        if (!newActive) return ps;
        const newBench = ps.bench.filter((s) => s.instanceId !== event.newActiveId);
        const oldActive = ps.active;
        const clearedNewActive: ReplayPokemonSlot = { ...newActive, specialConditions: [] };
        return {
          ...ps,
          active: clearedNewActive,
          bench: oldActive ? [...newBench, oldActive] : newBench
        };
      });
    }

    case 'STADIUM_PLAYED': {
      const stadiumName = lookupName(event.cardInstanceId, definitions);
      const stadiumCardId = definitionIdFromInstanceId(event.cardInstanceId);
      return updatePlayer(
        { ...state, stadium: { cardId: stadiumCardId, name: stadiumName } },
        event.player,
        (ps) => ({ ...ps, handCount: Math.max(0, ps.handCount - 1) })
      );
    }

    case 'STADIUM_DISCARDED': {
      return { ...state, stadium: null };
    }

    case 'CARD_DISCARDED': {
      const discardCardId = definitionIdFromInstanceId(event.cardInstanceId);
      return updatePlayer(state, event.player, (ps) => ({
        ...ps,
        discardCount: ps.discardCount + 1,
        discardTopCardId: discardCardId
      }));
    }

    case 'CARD_SEARCHED': {
      return updatePlayer(state, event.player, (ps) => {
        const fromDeck = event.from === 'deck';
        return {
          ...ps,
          deckCount: fromDeck ? Math.max(0, ps.deckCount - 1) : ps.deckCount,
          discardCount: fromDeck ? ps.discardCount : Math.max(0, ps.discardCount - 1),
          handCount: ps.handCount + 1
        };
      });
    }

    case 'CARD_MOVED': {
      return state;
    }

    case 'MULLIGAN': {
      return state;
    }

    case 'DECK_SHUFFLED': {
      return state;
    }

    case 'CHECKUP_COMPLETED': {
      return state;
    }

    case 'ABILITY_USED': {
      return state;
    }

    case 'ATTACK_DECLARED': {
      return state;
    }

    case 'COIN_FLIPPED': {
      return state;
    }

    case 'GAME_OVER': {
      return state;
    }

    default: {
      return state;
    }
  }
}

export function buildStateAtEvent(
  replay: CapturedReplay,
  eventIndex: number,
  definitions: Record<string, SerializedCardDefinition>,
  cache?: ReplayStateCache
): ReplayBoardState {
  const clampedIndex = Math.max(-1, Math.min(eventIndex, replay.eventLog.length - 1));

  let startIndex = 0;
  let startState = buildInitialState();

  if (cache) {
    let bestTurn = -1;
    for (const [turn, cachedState] of cache.turnStates) {
      if (cachedState.currentEventIndex <= clampedIndex && turn > bestTurn) {
        bestTurn = turn;
        startState = cachedState;
        startIndex = cachedState.currentEventIndex + 1;
      }
    }
  }

  let state = startState;
  for (let i = startIndex; i <= clampedIndex; i++) {
    const event = replay.eventLog[i];
    if (!event) continue;
    state = applyEvent(state, event, definitions);
    state = { ...state, currentEventIndex: i };
  }

  return { ...state, currentEventIndex: clampedIndex };
}

export function buildStateCache(
  replay: CapturedReplay,
  definitions: Record<string, SerializedCardDefinition>
): ReplayStateCache {
  const turnStates = new Map<number, ReplayBoardState>();
  let state = buildInitialState();

  for (let i = 0; i < replay.eventLog.length; i++) {
    const event = replay.eventLog[i];
    if (!event) continue;

    if (event.type === 'TURN_STARTED') {
      turnStates.set(event.turnNumber, { ...state, currentEventIndex: i - 1 });
    }

    state = applyEvent(state, event, definitions);
    state = { ...state, currentEventIndex: i };
  }

  return { turnStates };
}

export function computeKeyMoments(events: ReadonlyArray<GameEvent>): ReadonlyArray<{
  label: string;
  eventIndex: number;
  type: 'ko' | 'prize' | 'turn_start' | 'game_over';
}> {
  const moments: Array<{
    label: string;
    eventIndex: number;
    type: 'ko' | 'prize' | 'turn_start' | 'game_over';
  }> = [];

  let firstKoDone = false;
  let prizeCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    if (event.type === 'POKEMON_KNOCKED_OUT' && !firstKoDone) {
      moments.push({ label: 'First KO', eventIndex: i, type: 'ko' });
      firstKoDone = true;
    } else if (event.type === 'PRIZE_TAKEN') {
      prizeCount++;
      const playerLabel = event.player === 'player1' ? 'P1' : 'P2';
      moments.push({
        label: `Prize ${prizeCount} (${playerLabel})`,
        eventIndex: i,
        type: 'prize'
      });
    } else if (event.type === 'GAME_OVER') {
      moments.push({ label: 'Game Over', eventIndex: i, type: 'game_over' });
    }
  }

  return moments;
}

export function findNextTurnEventIndex(
  events: ReadonlyArray<GameEvent>,
  currentIndex: number
): number {
  for (let i = currentIndex + 1; i < events.length; i++) {
    if (events[i]?.type === 'TURN_STARTED') return i;
  }
  return events.length - 1;
}

export function findPrevTurnEventIndex(
  events: ReadonlyArray<GameEvent>,
  currentIndex: number
): number {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (events[i]?.type === 'TURN_STARTED') return i;
  }
  return 0;
}
