import type { CardDefinition, EnergyType, PokemonCardDefinition, PokemonStage } from '../types/card';
import type {
  GameState, InPlayPokemon, PlayerId, PlayerState, SpecialCondition
} from '../types/game';
import type { GameEvent } from '../types/event';
import type { TemporalEffect } from '../types/effect';
import { coinFlip as rngCoinFlip, shuffle as rngShuffle } from '../rng';
import {
  applySpecialCondition as applyConditionToPokemon,
  removeSpecialCondition as removeConditionFromPokemon,
  clearSpecialConditions
} from '../core/conditions';
import { canEvolve, evolvePokemon } from '../core/evolution';

// ─── Types ───────────────────────────────────────────────────────────────

export interface CardFilter {
  readonly supertype?: 'Pokemon' | 'Trainer' | 'Energy';
  readonly stage?: PokemonStage;
  readonly type?: EnergyType;
  readonly subtypes?: ReadonlyArray<string>;
  readonly name?: string;
  readonly custom?: (def: CardDefinition) => boolean;
}

export interface SearchResult {
  readonly candidates: ReadonlyArray<string>;
  readonly newState: GameState;
}

export type Zone = 'deck' | 'hand' | 'discard' | 'bench' | 'active' | 'prizes' | 'lostZone';

// ─── Internal Helpers ────────────────────────────────────────────────────

function getDefForInstance(state: GameState, instanceId: string): CardDefinition | undefined {
  const instance = state.cardRegistry.get(instanceId);
  if (!instance) return undefined;
  return state.definitionRegistry.get(instance.definitionId);
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  updater: (ps: PlayerState) => PlayerState
): GameState {
  return {
    ...state,
    players: { ...state.players, [playerId]: updater(state.players[playerId]) }
  };
}

function addEvents(state: GameState, events: ReadonlyArray<GameEvent>): GameState {
  return { ...state, eventLog: [...state.eventLog, ...events] };
}

function findPokemonLocation(
  state: GameState,
  playerId: PlayerId,
  instanceId: string
): { zone: 'active' | 'bench'; benchIdx: number } | null {
  const player = state.players[playerId];
  if (player.active?.instanceId === instanceId) return { zone: 'active', benchIdx: -1 };
  const benchIdx = player.bench.findIndex(b => b.instanceId === instanceId);
  if (benchIdx !== -1) return { zone: 'bench', benchIdx };
  return null;
}

function updatePokemonInPlay(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  updater: (p: InPlayPokemon) => InPlayPokemon
): GameState {
  const player = state.players[playerId];
  if (player.active?.instanceId === instanceId) {
    return updatePlayer(state, playerId, ps => ({ ...ps, active: updater(ps.active!) }));
  }
  const benchIdx = player.bench.findIndex(b => b.instanceId === instanceId);
  if (benchIdx !== -1) {
    const newBench = [...player.bench];
    newBench[benchIdx] = updater(player.bench[benchIdx]!);
    return updatePlayer(state, playerId, ps => ({ ...ps, bench: newBench }));
  }
  return state;
}

function getTopDef(state: GameState, pokemon: InPlayPokemon): PokemonCardDefinition | null {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return null;
  const def = state.definitionRegistry.get(instance.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

// ─── Card Drawing ────────────────────────────────────────────────────────

export function drawCards(state: GameState, player: PlayerId, count: number): GameState {
  const ps = state.players[player];
  const toDraw = Math.min(count, ps.deck.length);
  const drawn = ps.deck.slice(0, toDraw);
  const events: GameEvent[] = drawn.map(id => ({
    type: 'CARD_DRAWN' as const,
    player,
    cardInstanceId: id
  }));
  return addEvents(
    updatePlayer(state, player, p => ({
      ...p,
      deck: p.deck.slice(toDraw),
      hand: [...p.hand, ...drawn]
    })),
    events
  );
}

// ─── Card Discarding ─────────────────────────────────────────────────────

export function discardFromHand(
  state: GameState,
  player: PlayerId,
  cardInstanceIds: ReadonlyArray<string>
): GameState {
  const toDiscard = new Set(cardInstanceIds);
  const events: GameEvent[] = cardInstanceIds.map(id => ({
    type: 'CARD_DISCARDED' as const,
    player,
    cardInstanceId: id
  }));
  return addEvents(
    updatePlayer(state, player, ps => ({
      ...ps,
      hand: ps.hand.filter(id => !toDiscard.has(id)),
      discard: [...ps.discard, ...cardInstanceIds]
    })),
    events
  );
}

// ─── Deck Search ─────────────────────────────────────────────────────────

function matchesFilter(def: CardDefinition, filter: CardFilter): boolean {
  if (filter.supertype) {
    if (filter.supertype === 'Pokemon' && def.cardType !== 'Pokemon') return false;
    if (filter.supertype === 'Trainer' && def.cardType !== 'Trainer') return false;
    if (filter.supertype === 'Energy' && def.cardType !== 'Energy') return false;
  }
  if (filter.stage && (def.cardType !== 'Pokemon' || def.stage !== filter.stage)) return false;
  if (filter.type) {
    if (def.cardType === 'Pokemon' && !def.types.includes(filter.type)) return false;
    if (def.cardType === 'Energy' && !def.provides.includes(filter.type)) return false;
    if (def.cardType === 'Trainer') return false;
  }
  if (filter.subtypes) {
    if (def.cardType === 'Pokemon') {
      if (!filter.subtypes.some(s => (def.subtypes as ReadonlyArray<string>).includes(s))) return false;
    }
    if (def.cardType === 'Trainer') {
      if (!filter.subtypes.some(s => (def.subtypes as ReadonlyArray<string>).includes(s))) return false;
    }
    if (def.cardType === 'Energy') return false;
  }
  if (filter.name && def.name !== filter.name) return false;
  if (filter.custom && !filter.custom(def)) return false;
  return true;
}

export function searchDeck(
  state: GameState,
  player: PlayerId,
  filter: CardFilter,
  count: number
): SearchResult {
  const ps = state.players[player];
  const candidates: string[] = [];

  for (const instanceId of ps.deck) {
    const def = getDefForInstance(state, instanceId);
    if (!def) continue;
    if (matchesFilter(def, filter)) {
      candidates.push(instanceId);
      if (candidates.length >= count) break;
    }
  }

  return { candidates, newState: state };
}

// ─── Deck Shuffling ──────────────────────────────────────────────────────

export function shuffleDeck(state: GameState, player: PlayerId): GameState {
  const ps = state.players[player];
  const { result: shuffled, nextState: rng } = rngShuffle(ps.deck, state.rngState);
  return addEvents(
    {
      ...updatePlayer(state, player, p => ({ ...p, deck: [...shuffled] })),
      rngState: rng
    },
    [{ type: 'DECK_SHUFFLED', player }]
  );
}

// ─── Card Movement Between Zones ─────────────────────────────────────────

export function moveToHand(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  from: Zone
): GameState {
  let s = state;
  const ps = s.players[player];

  if (from === 'deck') {
    const idx = ps.deck.indexOf(cardInstanceId);
    if (idx === -1) return state;
    s = updatePlayer(s, player, p => ({
      ...p,
      deck: p.deck.filter((_, i) => i !== idx),
      hand: [...p.hand, cardInstanceId]
    }));
  } else if (from === 'discard') {
    const idx = ps.discard.indexOf(cardInstanceId);
    if (idx === -1) return state;
    s = updatePlayer(s, player, p => ({
      ...p,
      discard: p.discard.filter((_, i) => i !== idx),
      hand: [...p.hand, cardInstanceId]
    }));
  } else {
    return state;
  }

  return addEvents(s, [
    { type: 'CARD_SEARCHED', player, cardInstanceId, from: from as 'deck' | 'discard' }
  ]);
}

export function moveToDeck(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  from: Zone
): GameState {
  const ps = state.players[player];

  if (from === 'discard') {
    const idx = ps.discard.indexOf(cardInstanceId);
    if (idx === -1) return state;
    return addEvents(
      updatePlayer(state, player, p => ({
        ...p,
        discard: p.discard.filter((_, i) => i !== idx),
        deck: [...p.deck, cardInstanceId]
      })),
      [{ type: 'CARD_MOVED', cardInstanceId, from: 'discard', to: 'deck' }]
    );
  }

  if (from === 'hand') {
    const idx = ps.hand.indexOf(cardInstanceId);
    if (idx === -1) return state;
    return addEvents(
      updatePlayer(state, player, p => ({
        ...p,
        hand: p.hand.filter((_, i) => i !== idx),
        deck: [...p.deck, cardInstanceId]
      })),
      [{ type: 'CARD_MOVED', cardInstanceId, from: 'hand', to: 'deck' }]
    );
  }

  return state;
}

export function moveToDeckBottom(
  state: GameState,
  player: PlayerId,
  cardInstanceIds: ReadonlyArray<string>
): GameState {
  const toMove = new Set(cardInstanceIds);
  return updatePlayer(state, player, ps => ({
    ...ps,
    hand: ps.hand.filter(id => !toMove.has(id)),
    deck: [...ps.deck, ...cardInstanceIds]
  }));
}

// ─── Energy Operations ───────────────────────────────────────────────────

export function discardEnergy(
  state: GameState,
  player: PlayerId,
  pokemonInstanceId: string,
  count: number,
  energyType?: EnergyType
): GameState {
  const loc = findPokemonLocation(state, player, pokemonInstanceId);
  if (!loc) return state;

  const pokemon = loc.zone === 'active'
    ? state.players[player].active!
    : state.players[player].bench[loc.benchIdx]!;

  const toDiscard: string[] = [];
  const remaining = [...pokemon.attachedEnergy];

  for (let i = remaining.length - 1; i >= 0 && toDiscard.length < count; i--) {
    if (energyType) {
      const def = getDefForInstance(state, remaining[i]!);
      if (def?.cardType !== 'Energy' || !def.provides.includes(energyType)) continue;
    }
    toDiscard.push(remaining.splice(i, 1)[0]!);
  }

  if (toDiscard.length === 0) return state;

  const events: GameEvent[] = toDiscard.map(id => ({
    type: 'CARD_DISCARDED' as const,
    player,
    cardInstanceId: id
  }));

  let s = updatePokemonInPlay(state, player, pokemonInstanceId, p => ({
    ...p,
    attachedEnergy: remaining
  }));

  s = updatePlayer(s, player, ps => ({
    ...ps,
    discard: [...ps.discard, ...toDiscard]
  }));

  return addEvents(s, events);
}

export function discardAllEnergy(
  state: GameState,
  player: PlayerId,
  pokemonInstanceId: string
): GameState {
  const loc = findPokemonLocation(state, player, pokemonInstanceId);
  if (!loc) return state;

  const pokemon = loc.zone === 'active'
    ? state.players[player].active!
    : state.players[player].bench[loc.benchIdx]!;

  if (pokemon.attachedEnergy.length === 0) return state;

  const allEnergy = [...pokemon.attachedEnergy];
  const events: GameEvent[] = allEnergy.map(id => ({
    type: 'CARD_DISCARDED' as const,
    player,
    cardInstanceId: id
  }));

  let s = updatePokemonInPlay(state, player, pokemonInstanceId, p => ({
    ...p,
    attachedEnergy: []
  }));

  s = updatePlayer(s, player, ps => ({
    ...ps,
    discard: [...ps.discard, ...allEnergy]
  }));

  return addEvents(s, events);
}

export function moveEnergy(
  state: GameState,
  player: PlayerId,
  fromPokemonId: string,
  toPokemonId: string,
  energyInstanceId: string
): GameState {
  let s = updatePokemonInPlay(state, player, fromPokemonId, p => ({
    ...p,
    attachedEnergy: p.attachedEnergy.filter(e => e !== energyInstanceId)
  }));
  s = updatePokemonInPlay(s, player, toPokemonId, p => ({
    ...p,
    attachedEnergy: [...p.attachedEnergy, energyInstanceId]
  }));
  return addEvents(s, [
    { type: 'CARD_MOVED', cardInstanceId: energyInstanceId, from: fromPokemonId, to: toPokemonId }
  ]);
}

export function attachEnergyFromDeck(
  state: GameState,
  player: PlayerId,
  targetInstanceId: string,
  energyType: EnergyType
): GameState {
  const { candidates } = searchDeck(state, player, {
    supertype: 'Energy',
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes(energyType)
  }, 1);

  if (candidates.length === 0) return state;

  const energyId = candidates[0]!;
  let s = updatePlayer(state, player, ps => ({
    ...ps,
    deck: ps.deck.filter(id => id !== energyId)
  }));

  s = updatePokemonInPlay(s, player, targetInstanceId, p => ({
    ...p,
    attachedEnergy: [...p.attachedEnergy, energyId]
  }));

  return addEvents(s, [
    { type: 'ENERGY_ATTACHED', player, energyInstanceId: energyId, targetInstanceId }
  ]);
}

export function attachEnergyFromDiscard(
  state: GameState,
  player: PlayerId,
  energyInstanceId: string,
  targetPokemonInstanceId: string
): GameState {
  const playerState = state.players[player];
  if (!playerState.discard.includes(energyInstanceId)) return state;

  const loc = findPokemonLocation(state, player, targetPokemonInstanceId);
  if (!loc) return state;

  let s = updatePlayer(state, player, ps => ({
    ...ps,
    discard: ps.discard.filter(id => id !== energyInstanceId)
  }));

  s = updatePokemonInPlay(s, player, targetPokemonInstanceId, p => ({
    ...p,
    attachedEnergy: [...p.attachedEnergy, energyInstanceId]
  }));

  return addEvents(s, [
    { type: 'ENERGY_ATTACHED', player, energyInstanceId, targetInstanceId: targetPokemonInstanceId }
  ]);
}

// ─── Pokemon Movement ────────────────────────────────────────────────────

export function switchActive(
  state: GameState,
  player: PlayerId,
  newActiveInstanceId: string
): GameState {
  const ps = state.players[player];
  if (!ps.active) return state;

  const benchIdx = ps.bench.findIndex(b => b.instanceId === newActiveInstanceId);
  if (benchIdx === -1) return state;

  const oldActive = ps.active;
  const retreatedPokemon = clearSpecialConditions(oldActive);
  const newActive = ps.bench[benchIdx]!;
  const newBench = [
    ...ps.bench.filter((_, i) => i !== benchIdx),
    retreatedPokemon
  ];

  let s: GameState = {
    ...state,
    players: {
      ...state.players,
      [player]: { ...ps, active: newActive, bench: newBench }
    },
    temporalEffects: state.temporalEffects.filter(
      (e: TemporalEffect) => !(e.targetInstanceId === oldActive.instanceId && e.sourceType === 'attack')
    )
  };

  s = addEvents(s, [
    { type: 'RETREATED', player, oldActiveId: oldActive.instanceId, newActiveId: newActiveInstanceId }
  ]);

  return s;
}

export function putOnBench(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string
): GameState {
  const ps = state.players[player];
  if (ps.bench.length >= 5) return state;

  const def = getDefForInstance(state, cardInstanceId);
  if (!def || def.cardType !== 'Pokemon' || def.stage !== 'Basic') return state;

  const inHand = ps.hand.includes(cardInstanceId);
  const inDeck = ps.deck.includes(cardInstanceId);
  if (!inHand && !inDeck) return state;

  const newPokemon: InPlayPokemon = {
    instanceId: cardInstanceId,
    evolutionStack: [cardInstanceId],
    attachedEnergy: [],
    attachedTools: [],
    damageCounters: 0,
    specialConditions: [],
    turnPlayed: state.turnNumber,
    turnEvolved: null,
    isNewThisTurn: true
  };

  let s: GameState;
  if (inHand) {
    s = updatePlayer(state, player, p => ({
      ...p,
      hand: p.hand.filter(id => id !== cardInstanceId),
      bench: [...p.bench, newPokemon]
    }));
  } else {
    s = updatePlayer(state, player, p => ({
      ...p,
      deck: p.deck.filter(id => id !== cardInstanceId),
      bench: [...p.bench, newPokemon]
    }));
  }

  return addEvents(s, [
    { type: 'BASIC_PLAYED', player, cardInstanceId, zone: 'bench' }
  ]);
}

// ─── Coin Flips ──────────────────────────────────────────────────────────

export function flipCoin(
  state: GameState,
  reason: string
): { result: 'heads' | 'tails'; newState: GameState } {
  const { result, nextState: rng } = rngCoinFlip(state.rngState);
  const newState = addEvents(
    { ...state, rngState: rng },
    [{ type: 'COIN_FLIPPED', result, reason }]
  );
  return { result, newState };
}

export function flipCoins(
  state: GameState,
  count: number,
  reason: string
): { results: ReadonlyArray<'heads' | 'tails'>; newState: GameState } {
  const results: Array<'heads' | 'tails'> = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const { result, newState } = flipCoin(s, reason);
    results.push(result);
    s = newState;
  }
  return { results, newState: s };
}

// ─── Healing ─────────────────────────────────────────────────────────────

export function healDamage(
  state: GameState,
  player: PlayerId,
  targetInstanceId: string,
  amount: number
): GameState {
  const loc = findPokemonLocation(state, player, targetInstanceId);
  if (!loc) return state;

  const pokemon = loc.zone === 'active'
    ? state.players[player].active!
    : state.players[player].bench[loc.benchIdx]!;

  if (pokemon.damageCounters === 0) return state;

  const countersToRemove = Math.min(Math.floor(amount / 10), pokemon.damageCounters);
  if (countersToRemove === 0) return state;

  return addEvents(
    updatePokemonInPlay(state, player, targetInstanceId, p => ({
      ...p,
      damageCounters: p.damageCounters - countersToRemove
    })),
    [{ type: 'DAMAGE_HEALED', targetInstanceId, amount: countersToRemove * 10 }]
  );
}

export function healAllDamage(
  state: GameState,
  player: PlayerId,
  targetInstanceId: string
): GameState {
  const loc = findPokemonLocation(state, player, targetInstanceId);
  if (!loc) return state;

  const pokemon = loc.zone === 'active'
    ? state.players[player].active!
    : state.players[player].bench[loc.benchIdx]!;

  if (pokemon.damageCounters === 0) return state;

  const healed = pokemon.damageCounters * 10;

  return addEvents(
    updatePokemonInPlay(state, player, targetInstanceId, p => ({
      ...p,
      damageCounters: 0
    })),
    [{ type: 'DAMAGE_HEALED', targetInstanceId, amount: healed }]
  );
}

// ─── Special Conditions ──────────────────────────────────────────────────

export function applyCondition(
  state: GameState,
  player: PlayerId,
  targetInstanceId: string,
  condition: SpecialCondition
): GameState {
  return addEvents(
    updatePokemonInPlay(state, player, targetInstanceId, p =>
      applyConditionToPokemon(p, condition)
    ),
    [{ type: 'SPECIAL_CONDITION_APPLIED', pokemonInstanceId: targetInstanceId, condition }]
  );
}

export function removeCondition(
  state: GameState,
  player: PlayerId,
  targetInstanceId: string,
  condition: SpecialCondition
): GameState {
  return addEvents(
    updatePokemonInPlay(state, player, targetInstanceId, p =>
      removeConditionFromPokemon(p, condition)
    ),
    [{ type: 'SPECIAL_CONDITION_REMOVED', pokemonInstanceId: targetInstanceId, condition }]
  );
}

// ─── KO Detection ───────────────────────────────────────────────────────

/**
 * Checks if any of `player`'s Pokemon were Knocked Out during the opponent's
 * last turn. Scans the event log backwards from the most recent TURN_STARTED
 * event for the current turn.
 */
export function wasKnockedOutLastTurn(state: GameState, player: PlayerId): boolean {
  const events = state.eventLog;
  // Walk backwards to find the start of the current turn
  let currentTurnStartIdx = events.length;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'TURN_STARTED' && ev.player === state.activePlayer) {
      currentTurnStartIdx = i;
      break;
    }
  }

  // Now walk backwards from there to find the previous turn's events
  let prevTurnStartIdx = 0;
  for (let i = currentTurnStartIdx - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'TURN_STARTED') {
      prevTurnStartIdx = i;
      break;
    }
  }

  // Check for KO events on `player`'s Pokemon between prevTurnStart and currentTurnStart
  for (let i = prevTurnStartIdx; i < currentTurnStartIdx; i++) {
    const ev = events[i]!;
    if (ev.type === 'POKEMON_KNOCKED_OUT' && ev.player === player) {
      return true;
    }
  }

  return false;
}

// ─── Rule Box Detection ─────────────────────────────────────────────────

/**
 * Returns true if the Pokemon definition has a Rule Box (ex, MegaEvolutionEx, V, VSTAR, VMAX).
 * In GHI Standard, this is primarily 'ex' and 'MegaEvolutionEx'.
 */
export function hasRuleBox(def: PokemonCardDefinition): boolean {
  return def.subtypes.some(s => s === 'ex' || s === 'MegaEvolutionEx');
}

// ─── Turn-Ending Flag ───────────────────────────────────────────────────

/**
 * Sets the turnEndedByEffect flag on the state. Used by effects like
 * Boxed Order and Katy that end the turn after resolving.
 */
export function setTurnEndedByEffect(state: GameState): GameState {
  return {
    ...state,
    turnFlags: { ...state.turnFlags, turnEndedByEffect: true }
  };
}

// ─── Evolution (for Rare Candy) ──────────────────────────────────────────

export { canEvolve, evolvePokemon };
export { getTopDef };
