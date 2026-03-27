import type { PokemonCardDefinition } from '../types/card';
import type { GameState, InPlayPokemon, PlayerId } from '../types/game';
import { clearSpecialConditions } from './conditions';

export function canEvolve(
  evolutionCard: PokemonCardDefinition,
  target: InPlayPokemon,
  state: GameState,
  options?: { readonly skipStage1?: boolean }
): boolean {
  if (evolutionCard.cardType !== 'Pokemon') return false;
  if (!evolutionCard.evolvesFrom) return false;

  const topInstanceId = target.evolutionStack[target.evolutionStack.length - 1] ?? target.instanceId;
  const topInstance = state.cardRegistry.get(topInstanceId);
  if (!topInstance) return false;
  const topDef = state.definitionRegistry.get(topInstance.definitionId);
  if (!topDef || topDef.cardType !== 'Pokemon') return false;

  if (!options?.skipStage1) {
    // Normal evolution: evolvesFrom must exactly match the current Pokemon's name
    if (evolutionCard.evolvesFrom !== topDef.name) return false;
    if (topDef.stage === 'Basic' && evolutionCard.stage !== 'Stage1') return false;
    if (topDef.stage === 'Stage1' && evolutionCard.stage !== 'Stage2') return false;
    if (topDef.stage === 'Stage2') return false;
  } else {
    // Rare Candy: Basic → Stage2 only
    // topDef must be Basic, evolutionCard must be Stage2
    if (topDef.stage !== 'Basic' || evolutionCard.stage !== 'Stage2') return false;
    // The Stage2 must have an intermediate Stage1 that evolvesFrom the Basic's name
    // i.e., there exists a Stage1 where stage1.evolvesFrom === topDef.name
    //                             AND evolutionCard.evolvesFrom === stage1.name
    const stage1Name = evolutionCard.evolvesFrom; // e.g. "Flaaffy"
    // Find if any definition matches: stage1.name === stage1Name && stage1.evolvesFrom === topDef.name
    let validChain = false;
    for (const def of state.definitionRegistry.values()) {
      if (
        def.cardType === 'Pokemon' &&
        def.stage === 'Stage1' &&
        def.name === stage1Name &&
        def.evolvesFrom === topDef.name
      ) {
        validChain = true;
        break;
      }
    }
    if (!validChain) return false;
  }

  if (target.isNewThisTurn) return false;

  if (target.turnEvolved !== null && target.turnEvolved === state.turnNumber) return false;

  const activePlayer = state.activePlayer;
  const startingPlayer = state.startingPlayer;
  if (activePlayer === startingPlayer && state.turnNumber <= 1) return false;
  if (activePlayer !== startingPlayer && state.turnNumber <= 2) return false;

  return true;
}

function findPokemonOwner(state: GameState, targetInstanceId: string): PlayerId | null {
  for (const [playerId, player] of Object.entries(state.players) as Array<[PlayerId, typeof state.players[PlayerId]]>) {
    if (player.active?.instanceId === targetInstanceId) return playerId;
    if (player.bench.some(b => b.instanceId === targetInstanceId)) return playerId;
  }
  return null;
}

function updatePokemonInPlay(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
  updater: (p: InPlayPokemon) => InPlayPokemon
): GameState {
  const player = state.players[playerId];
  if (player.active?.instanceId === targetInstanceId) {
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, active: updater(player.active) }
      }
    };
  }
  const benchIdx = player.bench.findIndex(b => b.instanceId === targetInstanceId);
  if (benchIdx !== -1) {
    const newBench = [...player.bench];
    newBench[benchIdx] = updater(player.bench[benchIdx]!);
    return {
      ...state,
      players: { ...state.players, [playerId]: { ...player, bench: newBench } }
    };
  }
  return state;
}

export function evolvePokemon(
  state: GameState,
  evolutionInstanceId: string,
  targetInstanceId: string
): GameState {
  const playerId = findPokemonOwner(state, targetInstanceId);
  if (!playerId) return state;

  const player = state.players[playerId];
  const newHand = player.hand.filter(id => id !== evolutionInstanceId);

  let newState: GameState = {
    ...state,
    players: { ...state.players, [playerId]: { ...player, hand: newHand } }
  };

  newState = updatePokemonInPlay(newState, playerId, targetInstanceId, pokemon => {
    const cleared = clearSpecialConditions(pokemon);
    return {
      ...cleared,
      instanceId: evolutionInstanceId,
      evolutionStack: [...pokemon.evolutionStack, evolutionInstanceId],
      turnEvolved: state.turnNumber,
      isNewThisTurn: false
    };
  });

  newState = {
    ...newState,
    temporalEffects: newState.temporalEffects.filter(
      e => e.targetInstanceId !== targetInstanceId && e.targetInstanceId !== evolutionInstanceId
    )
  };

  newState = {
    ...newState,
    eventLog: [
      ...newState.eventLog,
      { type: 'POKEMON_EVOLVED', player: playerId, pokemonInstanceId: targetInstanceId, evolutionInstanceId }
    ]
  };

  return newState;
}
