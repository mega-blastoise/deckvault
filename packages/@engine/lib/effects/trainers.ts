import type { GameState } from '../types/game';
import type { TrainerContext } from './registry';
import { registerTrainerEffect } from './registry';
import {
  drawCards,
  discardFromHand,
  searchDeck,
  shuffleDeck,
  moveToHand,
  moveToDeck,
  moveToDeckBottom,
  putOnBench,
  switchActive,
  canEvolve,
  evolvePokemon
} from './primitives';
import { otherPlayer } from '../core/game';

// ─── Nest Ball ───────────────────────────────────────────────────────────
// Search deck for a Basic Pokemon and put it on bench. Shuffle deck.

function nestBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (player.bench.length >= 5) return state;

  const { candidates } = searchDeck(state, ctx.player, { stage: 'Basic' }, 999);
  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Nest Ball: choose a Basic Pokemon to put on bench'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = putOnBench(state, ctx.player, chosen);
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Ultra Ball ──────────────────────────────────────────────────────────
// Discard 2 cards from hand, then search deck for any Pokemon.

function ultraBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const handCards = player.hand;

  if (handCards.length < 2) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...handCards],
    min: 2,
    max: 2,
    reason: 'Ultra Ball: discard 2 cards from your hand'
  });

  if (discardChoice.length < 2) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 2));

  const { candidates } = searchDeck(s, ctx.player, { supertype: 'Pokemon' }, 999);
  if (candidates.length === 0) return shuffleDeck(s, ctx.player);

  const searchChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Ultra Ball: choose a Pokemon to put in your hand'
  });

  const chosen = searchChoice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(s, ctx.player);

  s = moveToHand(s, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Rare Candy ──────────────────────────────────────────────────────────
// Evolve a Basic Pokemon directly to Stage 2.

function rareCandyHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];

  const stage2InHand = player.hand.filter(id => {
    const def = state.definitionRegistry.get(state.cardRegistry.get(id)?.definitionId ?? '');
    return def?.cardType === 'Pokemon' && def.stage === 'Stage2';
  });

  if (stage2InHand.length === 0) return state;

  const validPairs: Array<{ stage2Id: string; targetId: string }> = [];
  const allInPlay = [player.active, ...player.bench].filter(Boolean) as typeof player.bench[number][];

  for (const stage2Id of stage2InHand) {
    const stage2Def = state.definitionRegistry.get(state.cardRegistry.get(stage2Id)?.definitionId ?? '');
    if (!stage2Def || stage2Def.cardType !== 'Pokemon') continue;

    for (const target of allInPlay) {
      if (canEvolve(stage2Def, target, state, { skipStage1: true })) {
        validPairs.push({ stage2Id, targetId: target.instanceId });
      }
    }
  }

  if (validPairs.length === 0) return state;

  const options = validPairs.map(p => `${p.stage2Id}:${p.targetId}`);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Rare Candy: choose Stage 2 and target Basic'
  });

  const picked = choice[0];
  if (!picked) return state;

  const [stage2Id, targetId] = picked.split(':');
  if (!stage2Id || !targetId) return state;

  return evolvePokemon(state, stage2Id, targetId);
}

// ─── Switch ──────────────────────────────────────────────────────────────
// Switch your Active with one of your Benched Pokemon.

function switchHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (!player.active || player.bench.length === 0) return state;

  const options = player.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Switch: choose a Benched Pokemon to become Active'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, ctx.player, chosen);
}

// ─── Super Rod ───────────────────────────────────────────────────────────
// Shuffle up to 3 Pokemon/Basic Energy from discard into deck.

function superRodHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const validCards = player.discard.filter(id => {
    const def = state.definitionRegistry.get(state.cardRegistry.get(id)?.definitionId ?? '');
    if (!def) return false;
    if (def.cardType === 'Pokemon') return true;
    if (def.cardType === 'Energy' && def.subtype === 'Basic') return true;
    return false;
  });

  if (validCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: validCards,
    min: 1,
    max: Math.min(3, validCards.length),
    reason: 'Super Rod: choose up to 3 Pokemon/Basic Energy from discard'
  });

  if (choice.length === 0) return state;

  let s = state;
  for (const cardId of choice.slice(0, 3)) {
    if (validCards.includes(cardId)) {
      s = moveToDeck(s, ctx.player, cardId, 'discard');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Energy Retrieval ────────────────────────────────────────────────────
// Put up to 2 Basic Energy from discard into hand.

function energyRetrievalHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const validCards = player.discard.filter(id => {
    const def = state.definitionRegistry.get(state.cardRegistry.get(id)?.definitionId ?? '');
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (validCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: validCards,
    min: 1,
    max: Math.min(2, validCards.length),
    reason: 'Energy Retrieval: choose up to 2 Basic Energy from discard'
  });

  if (choice.length === 0) return state;

  let s = state;
  for (const cardId of choice.slice(0, 2)) {
    if (s.players[ctx.player].discard.includes(cardId)) {
      s = moveToHand(s, ctx.player, cardId, 'discard');
    }
  }

  return s;
}

// ─── Pal Pad ─────────────────────────────────────────────────────────────
// Shuffle up to 2 Supporters from discard into deck.

function palPadHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const validCards = player.discard.filter(id => {
    const def = state.definitionRegistry.get(state.cardRegistry.get(id)?.definitionId ?? '');
    return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
  });

  if (validCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: validCards,
    min: 1,
    max: Math.min(2, validCards.length),
    reason: 'Pal Pad: choose up to 2 Supporters from discard'
  });

  if (choice.length === 0) return state;

  let s = state;
  for (const cardId of choice.slice(0, 2)) {
    if (s.players[ctx.player].discard.includes(cardId)) {
      s = moveToDeck(s, ctx.player, cardId, 'discard');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Pokegear 3.0 ────────────────────────────────────────────────────────
// Look at top 7 of deck, take a Supporter.

function pokegearHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const top7 = player.deck.slice(0, 7);

  const supporters = top7.filter(id => {
    const def = state.definitionRegistry.get(state.cardRegistry.get(id)?.definitionId ?? '');
    return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
  });

  if (supporters.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: supporters,
    min: 1,
    max: 1,
    reason: 'Pokegear 3.0: choose a Supporter from the top 7 cards'
  });

  const chosen = choice[0];
  if (!chosen || !supporters.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Boss's Orders ───────────────────────────────────────────────────────
// Switch opponent's Active with one of their Benched Pokemon.

function bossOrdersHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = ctx.opponent;
  const opponentState = state.players[opponent];
  if (!opponentState.active || opponentState.bench.length === 0) return state;

  const options = opponentState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Boss's Orders: choose opponent's Benched Pokemon to become Active"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, opponent, chosen);
}

// ─── Iono ────────────────────────────────────────────────────────────────
// Both players shuffle hand to bottom of deck, draw cards = remaining prizes.

function ionoHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const player = s.players[pid];
    const handCards = [...player.hand];
    s = moveToDeckBottom(s, pid, handCards);
  }

  s = shuffleDeck(s, ctx.player);
  s = shuffleDeck(s, ctx.opponent);

  const playerPrizes = s.players[ctx.player].prizes.length;
  const opponentPrizes = s.players[ctx.opponent].prizes.length;

  s = drawCards(s, ctx.player, playerPrizes);
  s = drawCards(s, ctx.opponent, opponentPrizes);

  return s;
}

// ─── Professor's Research ────────────────────────────────────────────────
// Discard entire hand, draw 7.

function professorsResearchHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const handCards = [...player.hand];

  let s = state;
  if (handCards.length > 0) {
    s = discardFromHand(s, ctx.player, handCards);
  }

  s = drawCards(s, ctx.player, 7);
  return s;
}

// ─── Arven ───────────────────────────────────────────────────────────────
// Search deck for 1 Item and 1 Pokemon Tool, put them in hand.

function arvenHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates: items } = searchDeck(state, ctx.player, {
    supertype: 'Trainer',
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Item')
  }, 999);

  const { candidates: tools } = searchDeck(state, ctx.player, {
    supertype: 'Trainer',
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('PokemonTool')
  }, 999);

  let s = state;

  if (items.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: items,
      min: 0,
      max: 1,
      reason: 'Arven: choose an Item card'
    });
    const chosen = choice[0];
    if (chosen && items.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  if (tools.length > 0) {
    const remainingTools = tools.filter(id => s.players[ctx.player].deck.includes(id));
    if (remainingTools.length > 0) {
      const choice = ctx.choiceResolver({
        type: 'select_cards',
        player: ctx.player,
        options: remainingTools,
        min: 0,
        max: 1,
        reason: 'Arven: choose a Pokemon Tool card'
      });
      const chosen = choice[0];
      if (chosen && remainingTools.includes(chosen)) {
        s = moveToHand(s, ctx.player, chosen, 'deck');
      }
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Judge ───────────────────────────────────────────────────────────────
// Both players shuffle hands into deck, draw 4.

function judgeHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const player = s.players[pid];
    const handCards = [...player.hand];
    for (const cardId of handCards) {
      s = moveToDeck(s, pid, cardId, 'hand');
    }
    s = shuffleDeck(s, pid);
  }

  s = drawCards(s, ctx.player, 4);
  s = drawCards(s, ctx.opponent, 4);

  return s;
}

// ─── Artazon ─────────────────────────────────────────────────────────────
// Stadium: once per turn, search deck for non-Rule Box Basic → bench.
// Artazon is a Stadium, so it doesn't resolve via the normal PLAY_TRAINER flow.
// We register it anyway so it can be called explicitly for its search effect.

function artazonHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (player.bench.length >= 5) return state;

  const { candidates } = searchDeck(state, ctx.player, {
    stage: 'Basic',
    custom: (def) => {
      if (def.cardType !== 'Pokemon') return false;
      if (def.stage !== 'Basic') return false;
      if (def.subtypes.includes('ex')) return false;
      return true;
    }
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Artazon: choose a non-Rule Box Basic Pokemon to put on bench'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = putOnBench(state, ctx.player, chosen);
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerAllTrainers(): void {
  registerTrainerEffect('Nest Ball', nestBallHandler);
  registerTrainerEffect('Ultra Ball', ultraBallHandler);
  registerTrainerEffect('Rare Candy', rareCandyHandler);
  registerTrainerEffect('Switch', switchHandler);
  registerTrainerEffect('Super Rod', superRodHandler);
  registerTrainerEffect('Energy Retrieval', energyRetrievalHandler);
  registerTrainerEffect('Pal Pad', palPadHandler);
  registerTrainerEffect('Pokégear 3.0', pokegearHandler);
  registerTrainerEffect('Pokegear 3.0', pokegearHandler);
  registerTrainerEffect("Boss's Orders", bossOrdersHandler);
  registerTrainerEffect('Iono', ionoHandler);
  registerTrainerEffect("Professor's Research", professorsResearchHandler);
  registerTrainerEffect('Arven', arvenHandler);
  registerTrainerEffect('Judge', judgeHandler);
  registerTrainerEffect('Artazon', artazonHandler);
}

registerAllTrainers();
