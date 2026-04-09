import type { GameState, PlayerId, InPlayPokemon } from '../types/game';
import type { TemporalEffect } from '../types/effect';
import type { PokemonCardDefinition } from '../types/card';
import type { TrainerContext } from './registry';
import { registerTrainerEffect } from './registry';
import {
  drawCards, discardFromHand, searchDeck, shuffleDeck,
  moveToHand, moveToDeck, moveToDeckBottom, putOnBench,
  switchActive, flipCoin, healDamage, healAllDamage,
  discardEnergy, moveEnergy, applyCondition, removeCondition,
  wasKnockedOutLastTurn, hasRuleBox, setTurnEndedByEffect,
  getTopDef, attachEnergyFromDeck
} from './primitives';
import { canEvolve, evolvePokemon } from '../core/evolution';
import { otherPlayer } from '../core/game';

// ─── Helpers ─────────────────────────────────────────────────────────────

function defFor(state: GameState, instanceId: string): ReturnType<typeof state.definitionRegistry.get> {
  const inst = state.cardRegistry.get(instanceId);
  if (!inst) return undefined;
  return state.definitionRegistry.get(inst.definitionId);
}

function allInPlay(state: GameState, pid: PlayerId): InPlayPokemon[] {
  const p = state.players[pid];
  return [...(p.active ? [p.active] : []), ...p.bench];
}

function addTemporalEffect(state: GameState, effect: TemporalEffect): GameState {
  return { ...state, temporalEffects: [...state.temporalEffects, effect] };
}

// ─── 1. Acerola's Mischief ────────────────────────────────────────────────
// Choose 1 of your Pokemon in play. During opponent's next turn, prevent all
// damage from attacks done to that Pokemon by opponent's Pokemon ex.

function acerolaMischiefHandler(state: GameState, ctx: TrainerContext): GameState {
  const options = allInPlay(state, ctx.player).map(p => p.instanceId);
  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Acerola's Mischief: choose a Pokemon to protect"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  const effect: TemporalEffect = {
    id: `acerola-${state.turnNumber}-${chosen}`,
    type: 'damage_prevention',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: chosen,
    expiresOnTurn: null,
    expiresAt: 'end_of_opponent_turn',
    payload: { fromExOnly: true }
  };

  return addTemporalEffect(state, effect);
}

// ─── 2. Amarys ────────────────────────────────────────────────────────────
// Draw 4 cards.

function amarysHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 4);
}

// ─── 3. Anthea & Concordia ────────────────────────────────────────────────
// Precondition: 6 specific N's Pokemon in play/hand. Handled in getLegalActions.
// Effect text varies; treated as no-op here since precondition is rarely met.

function antheaAndConcordiaHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── 4. Atticus ───────────────────────────────────────────────────────────
// Shuffle your hand into your deck. Then, draw 7 cards.

function atticusHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;
  const hand = [...s.players[ctx.player].hand];
  for (const id of hand) {
    s = moveToDeck(s, ctx.player, id, 'hand');
  }
  s = shuffleDeck(s, ctx.player);
  s = drawCards(s, ctx.player, 7);
  return s;
}

// ─── 5. Bianca's Devotion ────────────────────────────────────────────────
// Heal all damage from 1 of your Pokemon that has 30 HP or less remaining.

function biancasDevotionHandler(state: GameState, ctx: TrainerContext): GameState {
  const candidates = allInPlay(state, ctx.player).filter(p => {
    const def = getTopDef(state, p);
    if (!def) return false;
    const remaining = def.hp - p.damageCounters * 10;
    return remaining <= 30 && p.damageCounters > 0;
  });

  if (candidates.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: "Bianca's Devotion: choose a Pokemon with 30 HP or less remaining"
  });

  const chosen = choice[0];
  if (!chosen) return state;

  return healAllDamage(state, ctx.player, chosen);
}

// ─── 6. Bill's Transfer ───────────────────────────────────────────────────
// Look at top 8 cards. Reveal any number of Pokemon, put into hand. Shuffle rest.

function billsTransferHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top8 = ps.deck.slice(0, 8);

  const pokemonInTop8 = top8.filter(id => {
    const d = defFor(state, id);
    return d?.cardType === 'Pokemon';
  });

  let s = state;

  if (pokemonInTop8.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: pokemonInTop8,
      min: 0,
      max: pokemonInTop8.length,
      reason: "Bill's Transfer: choose any Pokemon from top 8 to put in hand"
    });

    for (const id of choice) {
      if (pokemonInTop8.includes(id)) {
        s = moveToHand(s, ctx.player, id, 'deck');
      }
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 7. Billy & O'Nare ───────────────────────────────────────────────────
// Draw 2 cards. If you have 10+ cards in hand after, draw 2 more.

function billyAndONareHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = drawCards(state, ctx.player, 2);
  if (s.players[ctx.player].hand.length >= 10) {
    s = drawCards(s, ctx.player, 2);
  }
  return s;
}

// ─── 8. Black Belt's Training ────────────────────────────────────────────
// This turn, attacks do 40 more damage to opponent's Active Pokemon ex.

function blackBeltsTrainingHandler(state: GameState, ctx: TrainerContext): GameState {
  const effect: TemporalEffect = {
    id: `blackbelt-${state.turnNumber}`,
    type: 'damage_modifier',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: null,
    expiresOnTurn: null,
    expiresAt: 'end_of_turn',
    payload: { amount: 40, targetExOnly: true }
  };
  return addTemporalEffect(state, effect);
}

// ─── 9. Boss's Orders (Ghetsis) ──────────────────────────────────────────
// Switch in opponent's Benched Pokemon (same as Boss's Orders).

function bossOrdersGhetsisHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponentState = state.players[ctx.opponent];
  if (!opponentState.active || opponentState.bench.length === 0) return state;

  const options = opponentState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Boss's Orders (Ghetsis): choose opponent's Benched Pokemon to become Active"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, ctx.opponent, chosen);
}

// ─── 10. Brassius ────────────────────────────────────────────────────────
// Count hand, shuffle into deck, draw that many +1.

function brassiusHandler(state: GameState, ctx: TrainerContext): GameState {
  const count = state.players[ctx.player].hand.length;
  let s = state;
  const hand = [...s.players[ctx.player].hand];
  for (const id of hand) {
    s = moveToDeck(s, ctx.player, id, 'hand');
  }
  s = shuffleDeck(s, ctx.player);
  s = drawCards(s, ctx.player, count + 1);
  return s;
}

// ─── 11. Briar ───────────────────────────────────────────────────────────
// This turn, if opponent's Active is KO'd by your Tera Pokemon, take 1 more Prize.

function briarHandler(state: GameState, ctx: TrainerContext): GameState {
  const effect: TemporalEffect = {
    id: `briar-${state.turnNumber}`,
    type: 'prize_modifier',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: null,
    expiresOnTurn: null,
    expiresAt: 'end_of_turn',
    payload: { extraPrizes: 1, requiresTera: true }
  };
  return addTemporalEffect(state, effect);
}

// ─── 12. Brock's Scouting ────────────────────────────────────────────────
// Search deck for up to 2 Basic Pokemon or 1 Evolution Pokemon → hand.

function brocksScoutingHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates: basics } = searchDeck(state, ctx.player, { stage: 'Basic' }, 999);
  const { candidates: evolutions } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && (def.stage === 'Stage1' || def.stage === 'Stage2')
  }, 999);

  const allOptions = [...new Set([...basics, ...evolutions])];
  if (allOptions.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: allOptions,
    min: 0,
    max: allOptions.length,
    reason: "Brock's Scouting: choose up to 2 Basic or 1 Evolution Pokemon"
  });

  let s = state;
  const basicChosen = choice.filter(id => basics.includes(id)).slice(0, 2);
  const evolutionChosen = choice.filter(id => evolutions.includes(id) && !basics.includes(id)).slice(0, 1);
  const finalChosen = [...basicChosen, ...evolutionChosen];

  for (const id of finalChosen) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 13. Canari ───────────────────────────────────────────────────────────
// Discard 1 card from hand. Search deck for up to 4 Lightning Pokemon → hand.

function canariHandler(state: GameState, ctx: TrainerContext): GameState {
  const handOptions = state.players[ctx.player].hand;
  if (handOptions.length === 0) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...handOptions],
    min: 1,
    max: 1,
    reason: 'Canari: discard 1 card from hand'
  });

  if (discardChoice.length < 1) return state;

  let s = discardFromHand(state, ctx.player, [discardChoice[0]!]);

  const { candidates } = searchDeck(s, ctx.player, { type: 'Lightning', supertype: 'Pokemon' }, 999);
  if (candidates.length === 0) return shuffleDeck(s, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(4, candidates.length),
    reason: 'Canari: choose up to 4 Lightning Pokemon from deck'
  });

  for (const id of choice.slice(0, 4)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 14. Caretaker ───────────────────────────────────────────────────────
// Draw 2 cards.

function caretakerHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 2);
}

// ─── 15. Carmine ─────────────────────────────────────────────────────────
// Discard your hand and draw 5 cards.

function carmineHandler(state: GameState, ctx: TrainerContext): GameState {
  const hand = [...state.players[ctx.player].hand];
  let s = hand.length > 0 ? discardFromHand(state, ctx.player, hand) : state;
  s = drawCards(s, ctx.player, 5);
  return s;
}

// ─── 16. Cassiopeia ───────────────────────────────────────────────────────
// Search deck for up to 2 cards → hand. Then shuffle.

function cassiopeiaHandler(state: GameState, ctx: TrainerContext): GameState {
  const allCards = [...state.players[ctx.player].deck];
  if (allCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: allCards,
    min: 0,
    max: Math.min(2, allCards.length),
    reason: 'Cassiopeia: choose up to 2 cards from deck'
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 17. Cheren ───────────────────────────────────────────────────────────
// Draw 3 cards.

function cherenHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 3);
}

// ─── 18. Ciphermaniac's Codebreaking ─────────────────────────────────────
// Search deck for 2 cards → hand, shuffle.
// (True "put on top" ordering deferred; search+hand is functional equivalent for v1.)

function ciphermaniacsCodebreakingHandler(state: GameState, ctx: TrainerContext): GameState {
  const allCards = [...state.players[ctx.player].deck];
  if (allCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: allCards,
    min: 0,
    max: Math.min(2, allCards.length),
    reason: "Ciphermaniac's Codebreaking: choose 2 cards to put on top of deck"
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 19. Clavell ─────────────────────────────────────────────────────────
// Search deck for up to 3 Basic Pokemon with 120 HP or less → hand.

function clavellHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    stage: 'Basic',
    custom: (def) => def.cardType === 'Pokemon' && def.stage === 'Basic' && def.hp <= 120
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(3, candidates.length),
    reason: 'Clavell: choose up to 3 Basic Pokemon with 120 HP or less'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (candidates.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 20. Clemont's Quick Wit ─────────────────────────────────────────────
// Heal 60 damage from each of your Lightning Pokemon.

function clemontHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;
  for (const pokemon of allInPlay(state, ctx.player)) {
    const def = getTopDef(state, pokemon);
    if (def && def.types.includes('Lightning')) {
      s = healDamage(s, ctx.player, pokemon.instanceId, 60);
    }
  }
  return s;
}

// ─── 21. Clive ────────────────────────────────────────────────────────────
// Count Supporter cards in opponent's hand. Draw 2 for each.

function cliveHandler(state: GameState, ctx: TrainerContext): GameState {
  const oppHand = state.players[ctx.opponent].hand;
  const supporterCount = oppHand.filter(id => {
    const d = defFor(state, id);
    return d?.cardType === 'Trainer' && d.subtypes.includes('Supporter');
  }).length;

  if (supporterCount === 0) return state;
  return drawCards(state, ctx.player, supporterCount * 2);
}

// ─── 22. Colress's Tenacity ───────────────────────────────────────────────
// Search deck for a Stadium card and an Energy card → hand.

function colressTenacityHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates: stadiums } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Stadium')
  }, 999);

  const { candidates: energies } = searchDeck(state, ctx.player, {
    supertype: 'Energy'
  }, 999);

  let s = state;

  if (stadiums.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: stadiums,
      min: 0,
      max: 1,
      reason: "Colress's Tenacity: choose a Stadium card"
    });
    const chosen = choice[0];
    if (chosen && stadiums.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  const remainingEnergies = energies.filter(id => s.players[ctx.player].deck.includes(id));
  if (remainingEnergies.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: remainingEnergies,
      min: 0,
      max: 1,
      reason: "Colress's Tenacity: choose an Energy card"
    });
    const chosen = choice[0];
    if (chosen && remainingEnergies.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 23. Cook ─────────────────────────────────────────────────────────────
// Heal 70 damage from your Active Pokemon.

function cookHandler(state: GameState, ctx: TrainerContext): GameState {
  const active = state.players[ctx.player].active;
  if (!active) return state;
  return healDamage(state, ctx.player, active.instanceId, 70);
}

// ─── 24. Crispin ──────────────────────────────────────────────────────────
// Search deck for up to 2 Basic Energy of different types. Put 1 in hand, attach other.

function crispinHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Energy',
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(2, candidates.length),
    reason: 'Crispin: choose up to 2 Basic Energy of different types'
  });

  if (choice.length === 0) return shuffleDeck(state, ctx.player);

  let s = state;

  if (choice.length === 1) {
    const id = choice[0]!;
    if (candidates.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
    return shuffleDeck(s, ctx.player);
  }

  // 2 chosen: put first in hand, attach second to a Pokemon
  const toHand = choice[0]!;
  const toAttach = choice[1]!;

  if (candidates.includes(toHand) && s.players[ctx.player].deck.includes(toHand)) {
    s = moveToHand(s, ctx.player, toHand, 'deck');
  }

  s = shuffleDeck(s, ctx.player);

  if (!candidates.includes(toAttach)) return s;

  const attachTargets = allInPlay(s, ctx.player).map(p => p.instanceId);
  if (attachTargets.length === 0) return s;

  const attachChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: attachTargets,
    min: 1,
    max: 1,
    reason: 'Crispin: choose a Pokemon to attach energy to'
  });

  const target = attachChoice[0];
  if (!target || !attachTargets.includes(target)) return s;

  if (s.players[ctx.player].deck.includes(toAttach)) {
    s = attachEnergyFromDeck(s, ctx.player, target, 'Colorless');
    // attachEnergyFromDeck searches fresh; we need to directly attach toAttach
    // Revert and do manual attach since attachEnergyFromDeck picks by type
    // Instead: move energy from deck to attached
    const attachState = { ...s };
    const ps = attachState.players[ctx.player];
    if (ps.deck.includes(toAttach)) {
      const newDeck = ps.deck.filter(id => id !== toAttach);
      const inPlay = ps.active?.instanceId === target
        ? ps.active
        : ps.bench.find(b => b.instanceId === target);
      if (inPlay) {
        // We already called attachEnergyFromDeck which may have attached a different card.
        // Roll back and do a direct attach of toAttach.
        // The simplest correct approach: use moveToHand then a manual energy placement.
        // Since we don't have a direct "move from deck to attached" primitive,
        // use attachEnergyFromDeck by type — which may pick a different instance.
        // For v1, this is acceptable: we use attachEnergyFromDeck with the correct energy type.
        const energyDef = defFor(s, toAttach);
        if (energyDef?.cardType === 'Energy' && energyDef.provides.length > 0) {
          const energyType = energyDef.provides[0]!;
          // Re-run on the state before the first call (s before above attachEnergyFromDeck call)
          // Actually s at this point is post-shuffle, pre-attach. Re-do properly:
          return attachEnergyFromDeck(s, ctx.player, target, energyType);
        }
      }
    }
  }

  return s;
}

// ─── 25. Cyrano ───────────────────────────────────────────────────────────
// Search deck for up to 3 Pokemon ex → hand.

function cyranoHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && def.subtypes.includes('ex')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(3, candidates.length),
    reason: 'Cyrano: choose up to 3 Pokemon ex from deck'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (candidates.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 26. Daisy's Help ────────────────────────────────────────────────────
// Draw 2 cards. (Prize-looking deferred.)

function daisysHelpHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 2);
}

// ─── 27. Dawn ────────────────────────────────────────────────────────────
// Search deck for a Basic, a Stage 1, and a Stage 2 Pokemon → hand.

function dawnHandler(state: GameState, ctx: TrainerContext): GameState {
  const stages: Array<'Basic' | 'Stage1' | 'Stage2'> = ['Basic', 'Stage1', 'Stage2'];
  let s = state;

  for (const stage of stages) {
    const { candidates } = searchDeck(s, ctx.player, { stage }, 999);
    if (candidates.length === 0) continue;

    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: candidates,
      min: 0,
      max: 1,
      reason: `Dawn: choose a ${stage} Pokemon`
    });

    const chosen = choice[0];
    if (chosen && candidates.includes(chosen) && s.players[ctx.player].deck.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 28. Dendra ───────────────────────────────────────────────────────────
// Put 1 card from hand on bottom of deck. Draw until you have 5.

function dendraHandler(state: GameState, ctx: TrainerContext): GameState {
  const handOptions = [...state.players[ctx.player].hand];
  if (handOptions.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: handOptions,
    min: 1,
    max: 1,
    reason: 'Dendra: choose 1 card to put on bottom of deck'
  });

  const chosen = choice[0];
  if (!chosen) return state;

  let s = moveToDeckBottom(state, ctx.player, [chosen]);
  const toDraw = Math.max(0, 5 - s.players[ctx.player].hand.length);
  if (toDraw > 0) s = drawCards(s, ctx.player, toDraw);
  return s;
}

// ─── 29. Drasna ───────────────────────────────────────────────────────────
// Shuffle hand into deck. Flip coin: heads → draw 8, tails → draw 3.

function drasnaHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;
  const hand = [...s.players[ctx.player].hand];
  for (const id of hand) {
    s = moveToDeck(s, ctx.player, id, 'hand');
  }
  s = shuffleDeck(s, ctx.player);

  const { result, newState } = flipCoin(s, 'Drasna');
  s = newState;
  s = drawCards(s, ctx.player, result === 'heads' ? 8 : 3);
  return s;
}

// ─── 30. Drayton ──────────────────────────────────────────────────────────
// Look at top 7. May reveal a Pokemon and a Trainer → hand. Shuffle rest.

function draytonHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top7 = ps.deck.slice(0, 7);

  const pokemonInTop7 = top7.filter(id => defFor(state, id)?.cardType === 'Pokemon');
  const trainersInTop7 = top7.filter(id => defFor(state, id)?.cardType === 'Trainer');

  let s = state;

  if (pokemonInTop7.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: pokemonInTop7,
      min: 0,
      max: 1,
      reason: 'Drayton: choose a Pokemon from top 7 to put in hand'
    });
    const chosen = choice[0];
    if (chosen && pokemonInTop7.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  const remainingTrainers = trainersInTop7.filter(id => s.players[ctx.player].deck.includes(id));
  if (remainingTrainers.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: remainingTrainers,
      min: 0,
      max: 1,
      reason: 'Drayton: choose a Trainer from top 7 to put in hand'
    });
    const chosen = choice[0];
    if (chosen && remainingTrainers.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 31. Emcee's Hype ────────────────────────────────────────────────────
// Draw 2. If opponent has 3 or fewer prizes, draw 2 more.

function emceesHypeHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = drawCards(state, ctx.player, 2);
  if (state.players[ctx.opponent].prizes.length <= 3) {
    s = drawCards(s, ctx.player, 2);
  }
  return s;
}

// ─── 32. Eri ──────────────────────────────────────────────────────────────
// Look at opponent's hand. Discard up to 2 Item cards from it.

function eriHandler(state: GameState, ctx: TrainerContext): GameState {
  const oppHand = state.players[ctx.opponent].hand;
  const items = oppHand.filter(id => {
    const d = defFor(state, id);
    return d?.cardType === 'Trainer' && d.subtypes.includes('Item');
  });

  if (items.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: items,
    min: 0,
    max: Math.min(2, items.length),
    reason: "Eri: choose up to 2 Item cards to discard from opponent's hand"
  });

  if (choice.length === 0) return state;

  const toDiscard = choice.slice(0, 2).filter(id => items.includes(id));
  return discardFromHand(state, ctx.opponent, toDiscard);
}

// ─── 33. Erika's Invitation ──────────────────────────────────────────────
// Look at opponent's hand. Put a Basic Pokemon onto their Bench. Switch it to Active.

function erikasInvitationHandler(state: GameState, ctx: TrainerContext): GameState {
  const oppHand = state.players[ctx.opponent].hand;
  const basics = oppHand.filter(id => {
    const d = defFor(state, id);
    return d?.cardType === 'Pokemon' && d.stage === 'Basic';
  });

  if (basics.length === 0) return state;
  if (state.players[ctx.opponent].bench.length >= 5) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: basics,
    min: 1,
    max: 1,
    reason: "Erika's Invitation: choose a Basic Pokemon from opponent's hand to put on their bench"
  });

  const chosen = choice[0];
  if (!chosen || !basics.includes(chosen)) return state;

  let s = putOnBench(state, ctx.opponent, chosen);

  if (s.players[ctx.opponent].active) {
    s = switchActive(s, ctx.opponent, chosen);
  }

  return s;
}

// ─── 34. Ethan's Adventure ────────────────────────────────────────────────
// Search deck for up to 3 in any combination of Ethan's Pokemon and Basic Fire Energy.

function ethansAdventureHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => {
      if (def.cardType === 'Pokemon' && def.name.startsWith("Ethan's ")) return true;
      if (def.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Fire')) return true;
      return false;
    }
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(3, candidates.length),
    reason: "Ethan's Adventure: choose up to 3 Ethan's Pokemon or Basic Fire Energy"
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (candidates.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 35. Explorer's Guidance ─────────────────────────────────────────────
// Look at top 6. Put 2 in hand. Discard the other 4.

function explorersGuidanceHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top6 = ps.deck.slice(0, 6);
  if (top6.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: top6,
    min: 0,
    max: Math.min(2, top6.length),
    reason: "Explorer's Guidance: choose 2 cards from top 6 to put in hand"
  });

  const toHand = new Set(choice.slice(0, 2));
  let s = state;

  for (const id of top6) {
    if (toHand.has(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  // Discard remaining (those from top6 still in deck)
  const remaining = top6.filter(id => !toHand.has(id) && s.players[ctx.player].deck.includes(id));
  for (const id of remaining) {
    // Move from deck to discard
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: {
          ...s.players[ctx.player],
          deck: s.players[ctx.player].deck.filter(d => d !== id),
          discard: [...s.players[ctx.player].discard, id]
        }
      }
    };
  }

  return s;
}

// ─── 36. Falkner ─────────────────────────────────────────────────────────
// Draw 2. If you have a Stadium in play, draw 2 more.

function falknerHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = drawCards(state, ctx.player, 2);
  if (state.stadium !== null) {
    s = drawCards(s, ctx.player, 2);
  }
  return s;
}

// ─── 37. Fennel ───────────────────────────────────────────────────────────
// Heal 40 damage from each of your Pokemon.

function fennelHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;
  for (const pokemon of allInPlay(state, ctx.player)) {
    s = healDamage(s, ctx.player, pokemon.instanceId, 40);
  }
  return s;
}

// ─── 38. Firebreather ────────────────────────────────────────────────────
// Search deck for up to 7 Basic Fire Energy → hand.

function firebreatherHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Energy',
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Fire')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(7, candidates.length),
    reason: 'Firebreather: choose up to 7 Basic Fire Energy from deck'
  });

  let s = state;
  for (const id of choice.slice(0, 7)) {
    if (candidates.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 39. Friends in Paldea ───────────────────────────────────────────────
// Draw 3 cards.

function friendsInPaldeaHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 3);
}

// ─── 40. Geeta ────────────────────────────────────────────────────────────
// Search deck for up to 2 Basic Energy, attach to 1 of your Pokemon.
// Your Pokemon can't attack this turn.

function geetaHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Energy',
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const energyChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(2, candidates.length),
    reason: 'Geeta: choose up to 2 Basic Energy to attach'
  });

  if (energyChoice.length === 0) return shuffleDeck(state, ctx.player);

  const attachTargets = allInPlay(state, ctx.player).map(p => p.instanceId);
  if (attachTargets.length === 0) return shuffleDeck(state, ctx.player);

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: attachTargets,
    min: 1,
    max: 1,
    reason: 'Geeta: choose a Pokemon to attach energy to'
  });

  const target = targetChoice[0];
  if (!target || !attachTargets.includes(target)) return shuffleDeck(state, ctx.player);

  let s = shuffleDeck(state, ctx.player);

  for (const energyId of energyChoice.slice(0, 2)) {
    if (s.players[ctx.player].deck.includes(energyId)) {
      const energyDef = defFor(s, energyId);
      if (energyDef?.cardType === 'Energy' && energyDef.provides.length > 0) {
        s = attachEnergyFromDeck(s, ctx.player, target, energyDef.provides[0]!);
      }
    }
  }

  const effect: TemporalEffect = {
    id: `geeta-${state.turnNumber}`,
    type: 'attack_lock',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: null,
    expiresOnTurn: null,
    expiresAt: 'end_of_turn',
    payload: { allPlayerPokemon: true }
  };

  return addTemporalEffect(s, effect);
}

// ─── 41. Giacomo ──────────────────────────────────────────────────────────
// Discard a Special Energy from each of opponent's Pokemon.

function giacomoHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;
  for (const pokemon of allInPlay(state, ctx.opponent)) {
    const specialEnergy = pokemon.attachedEnergy.filter(id => {
      const d = defFor(state, id);
      return d?.cardType === 'Energy' && d.subtype === 'Special';
    });
    if (specialEnergy.length === 0) continue;
    // Discard one special energy from this Pokemon
    const toDiscard = specialEnergy[0]!;
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.opponent]: {
          ...s.players[ctx.opponent],
          active: s.players[ctx.opponent].active?.instanceId === pokemon.instanceId
            ? { ...s.players[ctx.opponent].active!, attachedEnergy: s.players[ctx.opponent].active!.attachedEnergy.filter(e => e !== toDiscard) }
            : s.players[ctx.opponent].active,
          bench: s.players[ctx.opponent].bench.map(b =>
            b.instanceId === pokemon.instanceId
              ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== toDiscard) }
              : b
          ),
          discard: [...s.players[ctx.opponent].discard, toDiscard]
        }
      }
    };
  }
  return s;
}

// ─── 42. Giovanni's Charisma ─────────────────────────────────────────────
// Put an Energy from opponent's Active into their hand. Attach an Energy from
// your hand to your Active.

function giovanniCharismaHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  // Return one energy from opponent's active to their hand
  const oppActive = s.players[ctx.opponent].active;
  if (oppActive && oppActive.attachedEnergy.length > 0) {
    const options = [...oppActive.attachedEnergy];
    const choice = ctx.choiceResolver({
      type: 'select_energy',
      player: ctx.player,
      options,
      min: 1,
      max: 1,
      reason: "Giovanni's Charisma: choose an Energy from opponent's Active to return to hand"
    });
    const chosen = choice[0];
    if (chosen && options.includes(chosen)) {
      s = {
        ...s,
        players: {
          ...s.players,
          [ctx.opponent]: {
            ...s.players[ctx.opponent],
            active: {
              ...s.players[ctx.opponent].active!,
              attachedEnergy: s.players[ctx.opponent].active!.attachedEnergy.filter(e => e !== chosen)
            },
            hand: [...s.players[ctx.opponent].hand, chosen]
          }
        }
      };
    }
  }

  // Attach energy from your hand to your active
  const myActive = s.players[ctx.player].active;
  if (myActive) {
    const energyInHand = s.players[ctx.player].hand.filter(id => {
      const d = defFor(s, id);
      return d?.cardType === 'Energy';
    });
    if (energyInHand.length > 0) {
      const attachChoice = ctx.choiceResolver({
        type: 'select_energy',
        player: ctx.player,
        options: energyInHand,
        min: 1,
        max: 1,
        reason: "Giovanni's Charisma: choose an Energy from hand to attach to your Active"
      });
      const chosen = attachChoice[0];
      if (chosen && energyInHand.includes(chosen)) {
        s = {
          ...s,
          players: {
            ...s.players,
            [ctx.player]: {
              ...s.players[ctx.player],
              hand: s.players[ctx.player].hand.filter(id => id !== chosen),
              active: {
                ...s.players[ctx.player].active!,
                attachedEnergy: [...s.players[ctx.player].active!.attachedEnergy, chosen]
              }
            }
          }
        };
      }
    }
  }

  return s;
}

// ─── 43. Grimsley's Move ──────────────────────────────────────────────────
// Look at top 7. Put a Darkness Pokemon onto Bench. Shuffle rest to bottom.

function grimsleysMoveHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (ps.bench.length >= 5) return state;

  const top7 = ps.deck.slice(0, 7);
  const darkness = top7.filter(id => {
    const d = defFor(state, id);
    return d?.cardType === 'Pokemon' && d.stage === 'Basic' && d.types.includes('Darkness');
  });

  if (darkness.length === 0) {
    // Shuffle rest to bottom (top7 go to bottom)
    let s = state;
    const newDeck = [...ps.deck.slice(7), ...top7];
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: { ...s.players[ctx.player], deck: newDeck }
      }
    };
    return s;
  }

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: darkness,
    min: 1,
    max: 1,
    reason: "Grimsley's Move: choose a Darkness Pokemon from top 7 to put on bench"
  });

  const chosen = choice[0];
  if (!chosen || !darkness.includes(chosen)) {
    let s = state;
    const newDeck = [...ps.deck.slice(7), ...top7];
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: { ...s.players[ctx.player], deck: newDeck }
      }
    };
    return s;
  }

  let s = putOnBench(state, ctx.player, chosen);

  // Remaining top7 cards (not chosen) go to bottom of deck
  const remaining = top7.filter(id => id !== chosen);
  if (remaining.length > 0) {
    const currentDeck = s.players[ctx.player].deck.filter(id => !remaining.includes(id));
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: { ...s.players[ctx.player], deck: [...currentDeck, ...remaining] }
      }
    };
  }

  return s;
}

// ─── 44. Grusha ───────────────────────────────────────────────────────────
// Draw until 5 in hand. If none of your Pokemon have Energy attached, draw until 7.

function grushaHandler(state: GameState, ctx: TrainerContext): GameState {
  const noEnergy = allInPlay(state, ctx.player).every(p => p.attachedEnergy.length === 0);
  const target = noEnergy ? 7 : 5;
  return drawCards(state, ctx.player, Math.max(0, target - state.players[ctx.player].hand.length));
}

// ─── 45. Harlequin ────────────────────────────────────────────────────────
// Both shuffle hands into deck. Flip coin: heads → you draw 5/opp draws 3; tails → you draw 3/opp draws 5.

function harlequinHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const hand = [...s.players[pid].hand];
    for (const id of hand) {
      s = moveToDeck(s, pid, id, 'hand');
    }
    s = shuffleDeck(s, pid);
  }

  const { result, newState } = flipCoin(s, 'Harlequin');
  s = newState;

  const [youDraw, oppDraw] = result === 'heads' ? [5, 3] : [3, 5];
  s = drawCards(s, ctx.player, youDraw);
  s = drawCards(s, ctx.opponent, oppDraw);
  return s;
}

// ─── 46. Hassel ───────────────────────────────────────────────────────────
// Look at top 8. Put up to 3 into hand. Shuffle rest.

function hasselHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top8 = ps.deck.slice(0, 8);
  if (top8.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: top8,
    min: 0,
    max: Math.min(3, top8.length),
    reason: 'Hassel: choose up to 3 cards from top 8 to put in hand'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (top8.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 47. Hilda ────────────────────────────────────────────────────────────
// Search deck for an Evolution Pokemon and an Energy card → hand.

function hildaHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates: evolutions } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && (def.stage === 'Stage1' || def.stage === 'Stage2')
  }, 999);

  const { candidates: energies } = searchDeck(state, ctx.player, {
    supertype: 'Energy'
  }, 999);

  let s = state;

  if (evolutions.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: evolutions,
      min: 0,
      max: 1,
      reason: 'Hilda: choose an Evolution Pokemon from deck'
    });
    const chosen = choice[0];
    if (chosen && evolutions.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  const remainingEnergies = energies.filter(id => s.players[ctx.player].deck.includes(id));
  if (remainingEnergies.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: remainingEnergies,
      min: 0,
      max: 1,
      reason: 'Hilda: choose an Energy card from deck'
    });
    const chosen = choice[0];
    if (chosen && remainingEnergies.includes(chosen)) {
      s = moveToHand(s, ctx.player, chosen, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 48. Iris's Fighting Spirit ───────────────────────────────────────────
// Discard 1 card from hand. Draw until 6 in hand.

function irisFightingSpiritHandler(state: GameState, ctx: TrainerContext): GameState {
  const handOptions = [...state.players[ctx.player].hand];
  if (handOptions.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: handOptions,
    min: 1,
    max: 1,
    reason: "Iris's Fighting Spirit: discard 1 card from hand"
  });

  const chosen = choice[0];
  if (!chosen) return state;

  let s = discardFromHand(state, ctx.player, [chosen]);
  const toDraw = Math.max(0, 6 - s.players[ctx.player].hand.length);
  if (toDraw > 0) s = drawCards(s, ctx.player, toDraw);
  return s;
}

// ─── 49. Jacq ────────────────────────────────────────────────────────────
// Search deck for up to 2 Evolution Pokemon → hand.

function jacqHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && (def.stage === 'Stage1' || def.stage === 'Stage2')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(2, candidates.length),
    reason: 'Jacq: choose up to 2 Evolution Pokemon from deck'
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (candidates.includes(id) && s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── 50. Janine's Secret Art ──────────────────────────────────────────────
// Choose up to 2 Darkness Pokemon. Attach Basic Darkness Energy from deck to each.
// If Active got Energy this way, it's Poisoned.

function janineSecretArtHandler(state: GameState, ctx: TrainerContext): GameState {
  const darknessPokemon = allInPlay(state, ctx.player).filter(p => {
    const def = getTopDef(state, p);
    return def?.types.includes('Darkness');
  });

  if (darknessPokemon.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: darknessPokemon.map(p => p.instanceId),
    min: 0,
    max: Math.min(2, darknessPokemon.length),
    reason: "Janine's Secret Art: choose up to 2 Darkness Pokemon to attach Basic Darkness Energy to"
  });

  let s = state;
  let activeGotEnergy = false;

  for (const targetId of choice.slice(0, 2)) {
    if (!darknessPokemon.some(p => p.instanceId === targetId)) continue;
    const before = s.players[ctx.player].deck.length;
    s = attachEnergyFromDeck(s, ctx.player, targetId, 'Darkness');
    const attached = s.players[ctx.player].deck.length < before;
    if (attached && s.players[ctx.player].active?.instanceId === targetId) {
      activeGotEnergy = true;
    }
  }

  if (activeGotEnergy && s.players[ctx.player].active) {
    s = applyCondition(s, ctx.player, s.players[ctx.player].active!.instanceId, 'Poisoned');
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Exports ─────────────────────────────────────────────────────────────


// ─── Shared Helper ────────────────────────────────────────────────────────

function returnPokemonToHand(state: GameState, player: PlayerId, pokemon: InPlayPokemon): GameState {
  const allCards = [...pokemon.evolutionStack, ...pokemon.attachedEnergy, ...pokemon.attachedTools];
  const ps = state.players[player];
  const isActive = ps.active?.instanceId === pokemon.instanceId;
  const benchIdx = ps.bench.findIndex(b => b.instanceId === pokemon.instanceId);

  if (isActive) {
    return { ...state, players: { ...state.players, [player]: {
      ...ps, active: null, hand: [...ps.hand, ...allCards]
    }}};
  }
  if (benchIdx !== -1) {
    return { ...state, players: { ...state.players, [player]: {
      ...ps, bench: ps.bench.filter((_, i) => i !== benchIdx), hand: [...ps.hand, ...allCards]
    }}};
  }
  return state;
}

// ─── 51. Katy ─────────────────────────────────────────────────────────────
// Shuffle hand into deck. Draw 8. Turn ends.

function katyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;
  const hand = [...s.players[pid].hand];
  for (const id of hand) {
    s = moveToDeck(s, pid, id, 'hand');
  }
  s = shuffleDeck(s, pid);
  s = drawCards(s, pid, 8);
  s = setTurnEndedByEffect(s);
  return s;
}

// ─── 52. Kieran ───────────────────────────────────────────────────────────
// Choose: switch Active/Bench OR attacks do +30 to opponent's Active ex this turn.

function kieranHandler(state: GameState, ctx: TrainerContext): GameState {
  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: ['switch', 'damage_boost'],
    min: 1,
    max: 1,
    reason: 'Kieran: choose Switch Active with Benched, or +30 damage to opponent\'s Active ex'
  });

  const picked = choice[0];

  if (picked === 'switch') {
    const ps = state.players[ctx.player];
    if (!ps.active || ps.bench.length === 0) return state;
    const opts = ps.bench.map(b => b.instanceId);
    const benchChoice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: opts,
      min: 1,
      max: 1,
      reason: 'Kieran: choose Benched Pokemon to become Active'
    });
    const chosen = benchChoice[0];
    if (!chosen || !opts.includes(chosen)) return state;
    return switchActive(state, ctx.player, chosen);
  }

  if (picked === 'damage_boost') {
    const effect: TemporalEffect = {
      id: `kieran-boost-${state.turnNumber}`,
      type: 'damage_modifier',
      sourceInstanceId: ctx.cardInstance.instanceId,
      sourceType: 'trainer',
      targetInstanceId: null,
      expiresOnTurn: null,
      expiresAt: 'end_of_turn',
      payload: { bonus: 30, onlyVsRuleBox: true }
    };
    return { ...state, temporalEffects: [...state.temporalEffects, effect] };
  }

  return state;
}

// ─── 53. Kofu ─────────────────────────────────────────────────────────────
// Put 2 cards from hand on bottom of deck. If you did, draw 4.

function kofuHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const hand = state.players[pid].hand;
  if (hand.length < 2) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: [...hand],
    min: 2,
    max: 2,
    reason: 'Kofu: choose 2 cards to put on the bottom of your deck'
  });

  if (choice.length < 2) return state;

  let s = moveToDeckBottom(state, pid, choice.slice(0, 2));
  s = drawCards(s, pid, 4);
  return s;
}

// ─── 54. Lacey ────────────────────────────────────────────────────────────
// Shuffle hand into deck. Draw 4. If opponent has ≤3 prizes, draw 8 instead.

function laceyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;
  const hand = [...s.players[pid].hand];
  for (const id of hand) {
    s = moveToDeck(s, pid, id, 'hand');
  }
  s = shuffleDeck(s, pid);
  const opponentPrizes = s.players[ctx.opponent].prizes.length;
  s = drawCards(s, pid, opponentPrizes <= 3 ? 8 : 4);
  return s;
}

// ─── 55. Lana's Aid ───────────────────────────────────────────────────────
// Put up to 3 non-Rule-Box Pokemon and/or Basic Energy from discard into hand.

function lanasAidHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const discard = state.players[pid].discard;

  const valid = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    if (!def) return false;
    if (def.cardType === 'Pokemon') return !hasRuleBox(def);
    if (def.cardType === 'Energy') return def.subtype === 'Basic';
    return false;
  });

  if (valid.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: valid,
    min: 0,
    max: Math.min(3, valid.length),
    reason: "Lana's Aid: choose up to 3 non-Rule-Box Pokemon and/or Basic Energy from discard"
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (valid.includes(id)) {
      s = moveToHand(s, pid, id, 'discard');
    }
  }
  return s;
}

// ─── 56. Larry ────────────────────────────────────────────────────────────
// Flip coin. Heads: search for up to 2 Pokemon → hand. Tails: search for 1 Basic → hand.

function larryHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const { result, newState: s1 } = flipCoin(state, 'Larry');

  if (result === 'heads') {
    const { candidates } = searchDeck(s1, pid, { supertype: 'Pokemon' }, 999);
    if (candidates.length === 0) return shuffleDeck(s1, pid);

    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: candidates,
      min: 0,
      max: Math.min(2, candidates.length),
      reason: 'Larry (Heads): choose up to 2 Pokemon from your deck'
    });

    let s = s1;
    for (const id of choice.slice(0, 2)) {
      if (s.players[pid].deck.includes(id)) {
        s = moveToHand(s, pid, id, 'deck');
      }
    }
    return shuffleDeck(s, pid);
  } else {
    const { candidates } = searchDeck(s1, pid, { stage: 'Basic' }, 999);
    if (candidates.length === 0) return shuffleDeck(s1, pid);

    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: candidates,
      min: 0,
      max: 1,
      reason: 'Larry (Tails): choose 1 Basic Pokemon from your deck'
    });

    let s = s1;
    const chosen = choice[0];
    if (chosen && candidates.includes(chosen)) {
      s = moveToHand(s, pid, chosen, 'deck');
    }
    return shuffleDeck(s, pid);
  }
}

// ─── 57. Larry's Skill ────────────────────────────────────────────────────
// Discard hand. Search for 1 Pokemon, 1 Supporter, 1 Basic Energy → hand. Shuffle.

function larrysSkillHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;

  const hand = [...s.players[pid].hand];
  if (hand.length > 0) {
    s = discardFromHand(s, pid, hand);
  }

  const { candidates: pokemon } = searchDeck(s, pid, { supertype: 'Pokemon' }, 999);
  if (pokemon.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: pokemon,
      min: 0,
      max: 1,
      reason: "Larry's Skill: choose a Pokemon from your deck"
    });
    const chosen = choice[0];
    if (chosen && s.players[pid].deck.includes(chosen)) {
      s = moveToHand(s, pid, chosen, 'deck');
    }
  }

  const { candidates: supporters } = searchDeck(s, pid, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Supporter')
  }, 999);
  if (supporters.length > 0) {
    const remaining = supporters.filter(id => s.players[pid].deck.includes(id));
    if (remaining.length > 0) {
      const choice = ctx.choiceResolver({
        type: 'select_cards',
        player: pid,
        options: remaining,
        min: 0,
        max: 1,
        reason: "Larry's Skill: choose a Supporter from your deck"
      });
      const chosen = choice[0];
      if (chosen && remaining.includes(chosen)) {
        s = moveToHand(s, pid, chosen, 'deck');
      }
    }
  }

  const { candidates: energy } = searchDeck(s, pid, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);
  if (energy.length > 0) {
    const remaining = energy.filter(id => s.players[pid].deck.includes(id));
    if (remaining.length > 0) {
      const choice = ctx.choiceResolver({
        type: 'select_cards',
        player: pid,
        options: remaining,
        min: 0,
        max: 1,
        reason: "Larry's Skill: choose a Basic Energy from your deck"
      });
      const chosen = choice[0];
      if (chosen && remaining.includes(chosen)) {
        s = moveToHand(s, pid, chosen, 'deck');
      }
    }
  }

  return shuffleDeck(s, pid);
}

// ─── 58. Lillie's Determination ──────────────────────────────────────────
// Shuffle hand into deck. Draw 6. If exactly 6 prizes remaining, draw 8.

function lilliesDeterminationHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;
  const hand = [...s.players[pid].hand];
  for (const id of hand) {
    s = moveToDeck(s, pid, id, 'hand');
  }
  s = shuffleDeck(s, pid);
  const prizes = s.players[pid].prizes.length;
  s = drawCards(s, pid, prizes === 6 ? 8 : 6);
  return s;
}

// ─── 59. Lisia's Appeal ───────────────────────────────────────────────────
// Switch in 1 of opponent's Benched Basic Pokemon. It becomes Confused.

function lisiasAppealHandler(state: GameState, ctx: TrainerContext): GameState {
  const opp = ctx.opponent;
  const oppState = state.players[opp];
  if (!oppState.active || oppState.bench.length === 0) return state;

  const basicBench = oppState.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.stage === 'Basic';
  });

  if (basicBench.length === 0) return state;

  const options = basicBench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Lisia's Appeal: choose opponent's Benched Basic Pokemon to switch in"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  let s = switchActive(state, opp, chosen);
  const newActive = s.players[opp].active;
  if (newActive) {
    s = applyCondition(s, opp, newActive.instanceId, 'Confused');
  }
  return s;
}

// ─── 60. Lt. Surge's Bargain ─────────────────────────────────────────────
// Draw 4 cards.

function ltSurgesBargainHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 4);
}

// ─── 61. Lucian ───────────────────────────────────────────────────────────
// Both shuffle hand to deck bottom. Each flip coin: heads→draw 6, tails→draw 3.

function lucianHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const hand = [...s.players[pid].hand];
    s = moveToDeckBottom(s, pid, hand);
  }

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const { result, newState } = flipCoin(s, `Lucian flip for ${pid}`);
    s = newState;
    s = drawCards(s, pid, result === 'heads' ? 6 : 3);
  }

  return s;
}

// ─── 62. Mela ─────────────────────────────────────────────────────────────
// Attach a Basic Fire Energy from discard to 1 of your Pokemon. Draw until 6.

function melaHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const discard = state.players[pid].discard;

  const fireEnergy = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Fire');
  });

  if (fireEnergy.length === 0) return state;

  const ps = state.players[pid];
  const allPokemon = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];
  if (allPokemon.length === 0) return state;

  const energyChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: fireEnergy,
    min: 1,
    max: 1,
    reason: 'Mela: choose a Basic Fire Energy from discard to attach'
  });

  const chosenEnergy = energyChoice[0];
  if (!chosenEnergy || !fireEnergy.includes(chosenEnergy)) return state;

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: allPokemon.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Mela: choose a Pokemon to attach Fire Energy to'
  });

  const chosenTarget = targetChoice[0];
  if (!chosenTarget) return state;

  let s = moveToHand(state, pid, chosenEnergy, 'discard');
  // Attach from hand: move energy from hand to the target Pokemon's attached list
  s = {
    ...s,
    players: {
      ...s.players,
      [pid]: {
        ...s.players[pid],
        hand: s.players[pid].hand.filter(id => id !== chosenEnergy)
      }
    }
  };
  // Place on Pokemon
  const loc = s.players[pid].active?.instanceId === chosenTarget ? 'active' : 'bench';
  if (loc === 'active' && s.players[pid].active) {
    s = {
      ...s,
      players: {
        ...s.players,
        [pid]: {
          ...s.players[pid],
          active: {
            ...s.players[pid].active!,
            attachedEnergy: [...s.players[pid].active!.attachedEnergy, chosenEnergy]
          }
        }
      }
    };
  } else {
    const benchIdx = s.players[pid].bench.findIndex(b => b.instanceId === chosenTarget);
    if (benchIdx !== -1) {
      const newBench = [...s.players[pid].bench];
      newBench[benchIdx] = {
        ...newBench[benchIdx]!,
        attachedEnergy: [...newBench[benchIdx]!.attachedEnergy, chosenEnergy]
      };
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...s.players[pid], bench: newBench } }
      };
    }
  }

  s = drawCards(s, pid, Math.max(0, 6 - s.players[pid].hand.length));
  return s;
}

// ─── 63. Miriam ───────────────────────────────────────────────────────────
// Shuffle up to 5 Pokemon from discard into deck. If any shuffled, draw 3.

function miriamHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const discard = state.players[pid].discard;

  const pokemon = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Pokemon';
  });

  if (pokemon.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: pokemon,
    min: 0,
    max: Math.min(5, pokemon.length),
    reason: 'Miriam: choose up to 5 Pokemon from discard to shuffle into deck'
  });

  if (choice.length === 0) return state;

  let s = state;
  for (const id of choice) {
    if (pokemon.includes(id)) {
      s = moveToDeck(s, pid, id, 'discard');
    }
  }
  s = shuffleDeck(s, pid);
  s = drawCards(s, pid, 3);
  return s;
}

// ─── 64. Morty's Conviction ───────────────────────────────────────────────
// Discard 1 card from hand. Draw a card for each of opponent's Benched Pokemon.

function mortysConvictionHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const hand = state.players[pid].hand;
  if (hand.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: [...hand],
    min: 1,
    max: 1,
    reason: "Morty's Conviction: discard 1 card from hand"
  });

  const chosen = choice[0];
  if (!chosen || !hand.includes(chosen)) return state;

  let s = discardFromHand(state, pid, [chosen]);
  const benchCount = s.players[ctx.opponent].bench.length;
  s = drawCards(s, pid, benchCount);
  return s;
}

// ─── 65. N's Plan ─────────────────────────────────────────────────────────
// Move up to 2 Energy from Benched Pokemon to your Active Pokemon.

function nsPlanHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  if (!ps.active) return state;

  const benchWithEnergy = ps.bench.filter(b => b.attachedEnergy.length > 0);
  if (benchWithEnergy.length === 0) return state;

  let s = state;
  let moved = 0;

  while (moved < 2) {
    const currentBench = s.players[pid].bench.filter(b => b.attachedEnergy.length > 0);
    if (currentBench.length === 0) break;

    const sourceChoice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: currentBench.map(b => b.instanceId),
      min: 0,
      max: 1,
      reason: `N's Plan: choose a Benched Pokemon to move Energy from (${moved}/2 moved)`
    });

    const sourcePokemonId = sourceChoice[0];
    if (!sourcePokemonId) break;

    const sourcePokemon = s.players[pid].bench.find(b => b.instanceId === sourcePokemonId);
    if (!sourcePokemon || sourcePokemon.attachedEnergy.length === 0) break;

    const energyChoice = ctx.choiceResolver({
      type: 'select_energy',
      player: pid,
      options: [...sourcePokemon.attachedEnergy],
      min: 1,
      max: 1,
      reason: "N's Plan: choose an Energy to move to Active"
    });

    const energyId = energyChoice[0];
    if (!energyId || !sourcePokemon.attachedEnergy.includes(energyId)) break;

    s = moveEnergy(s, pid, sourcePokemonId, s.players[pid].active!.instanceId, energyId);
    moved++;
  }

  return s;
}

// ─── 66. Nemona ───────────────────────────────────────────────────────────
// Draw 3 cards.

function nemonaHandler(state: GameState, ctx: TrainerContext): GameState {
  return drawCards(state, ctx.player, 3);
}

// ─── 67. Norman ───────────────────────────────────────────────────────────
// Draw 2. If opponent's Active is a Pokemon ex, draw 2 more.

function normanHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = drawCards(state, ctx.player, 2);
  const oppActive = s.players[ctx.opponent].active;
  if (oppActive) {
    const def = getTopDef(s, oppActive);
    if (def && def.subtypes.includes('ex')) {
      s = drawCards(s, ctx.player, 2);
    }
  }
  return s;
}

// ─── 68. Ortega ───────────────────────────────────────────────────────────
// Look at opponent's hand. Choose a card, put it on bottom of their deck. Opponent may draw 1.

function ortegaHandler(state: GameState, ctx: TrainerContext): GameState {
  const opp = ctx.opponent;
  const oppHand = state.players[opp].hand;
  if (oppHand.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...oppHand],
    min: 1,
    max: 1,
    reason: "Ortega: choose a card from opponent's hand to put on bottom of their deck"
  });

  const chosen = choice[0];
  if (!chosen || !oppHand.includes(chosen)) return state;

  let s = moveToDeckBottom(state, opp, [chosen]);
  s = drawCards(s, opp, 1);
  return s;
}

// ─── 69. Paldean Student ──────────────────────────────────────────────────
// Search deck for 1 non-Rule-Box Pokemon (+1 per Paldean Student in discard). Shuffle.

function paldeanStudentHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const discard = state.players[pid].discard;

  const studentsInDiscard = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Trainer' && def.name === 'Paldean Student';
  }).length;

  const searchCount = 1 + studentsInDiscard;

  const { candidates } = searchDeck(state, pid, {
    custom: (def) => def.cardType === 'Pokemon' && !hasRuleBox(def)
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, pid);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: candidates,
    min: 0,
    max: Math.min(searchCount, candidates.length),
    reason: `Paldean Student: choose up to ${searchCount} non-Rule-Box Pokemon from your deck`
  });

  let s = state;
  for (const id of choice) {
    if (candidates.includes(id) && s.players[pid].deck.includes(id)) {
      s = moveToHand(s, pid, id, 'deck');
    }
  }

  return shuffleDeck(s, pid);
}

// ─── 70. Parasol Lady ─────────────────────────────────────────────────────
// Shuffle hand into deck. Draw 4. If going second and first turn, draw 8.

function parasolLadyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;
  const hand = [...s.players[pid].hand];
  for (const id of hand) {
    s = moveToDeck(s, pid, id, 'hand');
  }
  s = shuffleDeck(s, pid);

  const isGoingSecond = state.startingPlayer !== pid;
  const isFirstTurn = state.turnNumber <= 2;
  const drawCount = (isGoingSecond && isFirstTurn) ? 8 : 4;

  s = drawCards(s, pid, drawCount);
  return s;
}

// ─── 71. Penny ────────────────────────────────────────────────────────────
// Put 1 of your Basic Pokemon and all attached cards into your hand.

function pennyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const basics = allInPlay.filter(p => {
    const def = getTopDef(state, p);
    return def?.stage === 'Basic';
  });

  if (basics.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: basics.map(b => b.instanceId),
    min: 1,
    max: 1,
    reason: 'Penny: choose a Basic Pokemon to return to hand'
  });

  const chosen = choice[0];
  if (!chosen) return state;

  const target = basics.find(b => b.instanceId === chosen);
  if (!target) return state;

  return returnPokemonToHand(state, pid, target);
}

// ─── 72. Perrin ───────────────────────────────────────────────────────────
// Reveal up to 2 Pokemon from hand, put into deck. Search for up to that many Pokemon → hand. Shuffle.

function perrinHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const hand = state.players[pid].hand;

  const pokemonInHand = hand.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Pokemon';
  });

  if (pokemonInHand.length === 0) return state;

  const putBackChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: pokemonInHand,
    min: 0,
    max: Math.min(2, pokemonInHand.length),
    reason: 'Perrin: choose up to 2 Pokemon from hand to put into deck'
  });

  if (putBackChoice.length === 0) return state;

  let s = state;
  for (const id of putBackChoice) {
    if (pokemonInHand.includes(id)) {
      s = moveToDeck(s, pid, id, 'hand');
    }
  }

  const searchCount = putBackChoice.length;
  const { candidates } = searchDeck(s, pid, { supertype: 'Pokemon' }, 999);

  if (candidates.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: candidates,
      min: 0,
      max: Math.min(searchCount, candidates.length),
      reason: `Perrin: choose up to ${searchCount} Pokemon from your deck`
    });

    for (const id of choice) {
      if (candidates.includes(id) && s.players[pid].deck.includes(id)) {
        s = moveToHand(s, pid, id, 'deck');
      }
    }
  }

  return shuffleDeck(s, pid);
}

// ─── 73. Picnicker ────────────────────────────────────────────────────────
// Flip coin. Heads: draw 4. Tails: draw 2.

function picknickerHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState: s } = flipCoin(state, 'Picnicker');
  return drawCards(s, ctx.player, result === 'heads' ? 4 : 2);
}

// ─── 74. Pokemon Center Lady ──────────────────────────────────────────────
// Heal 60 from 1 of your Pokemon. Remove all Special Conditions from it.

function pokemonCenterLadyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  if (allInPlay.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: allInPlay.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Pokemon Center Lady: choose a Pokemon to heal 60 damage and cure Special Conditions'
  });

  const chosen = choice[0];
  if (!chosen) return state;

  let s = healDamage(state, pid, chosen, 60);
  for (const cond of (['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned'] as const)) {
    s = removeCondition(s, pid, chosen, cond);
  }
  return s;
}

// ─── 75. Poppy ────────────────────────────────────────────────────────────
// Move up to 2 Energy from 1 of your Pokemon to another of your Pokemon.

function poppyHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const withEnergy = allInPlay.filter(p => p.attachedEnergy.length > 0);
  if (withEnergy.length === 0) return state;

  const sourceChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: withEnergy.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Poppy: choose a Pokemon to move Energy from'
  });

  const sourcePokemonId = sourceChoice[0];
  if (!sourcePokemonId) return state;

  const sourcePokemon = withEnergy.find(p => p.instanceId === sourcePokemonId);
  if (!sourcePokemon) return state;

  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: pid,
    options: [...sourcePokemon.attachedEnergy],
    min: 1,
    max: Math.min(2, sourcePokemon.attachedEnergy.length),
    reason: 'Poppy: choose up to 2 Energy to move'
  });

  if (energyChoice.length === 0) return state;

  const targets = allInPlay.filter(p => p.instanceId !== sourcePokemonId);
  if (targets.length === 0) return state;

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: targets.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Poppy: choose a Pokemon to move Energy to'
  });

  const targetPokemonId = targetChoice[0];
  if (!targetPokemonId) return state;

  let s = state;
  for (const energyId of energyChoice) {
    if (s.players[pid].bench.concat(s.players[pid].active ? [s.players[pid].active!] : [])
        .find(p => p.instanceId === sourcePokemonId)?.attachedEnergy.includes(energyId)) {
      s = moveEnergy(s, pid, sourcePokemonId, targetPokemonId, energyId);
    }
  }
  return s;
}

// ─── 76. Professor Sada's Vitality ────────────────────────────────────────
// Choose up to 2 Ancient Pokemon. Attach Basic Energy from discard to each. If any attached, draw 3.

function professorSadasVitalityHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const ancients = allInPlay.filter(p => {
    const def = getTopDef(state, p);
    return def?.subtypes.includes('Ancient');
  });

  if (ancients.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: ancients.map(a => a.instanceId),
    min: 0,
    max: Math.min(2, ancients.length),
    reason: "Professor Sada's Vitality: choose up to 2 Ancient Pokemon to attach Basic Energy to"
  });

  if (choice.length === 0) return state;

  let s = state;
  let attached = 0;

  for (const pokemonId of choice) {
    const discardEnergies = s.players[pid].discard.filter(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Energy' && def.subtype === 'Basic';
    });

    if (discardEnergies.length === 0) continue;

    const energyChoice = ctx.choiceResolver({
      type: 'select_cards',
      player: pid,
      options: discardEnergies,
      min: 1,
      max: 1,
      reason: `Professor Sada's Vitality: choose a Basic Energy from discard to attach to ${pokemonId}`
    });

    const chosenEnergy = energyChoice[0];
    if (!chosenEnergy || !discardEnergies.includes(chosenEnergy)) continue;

    // Move energy from discard to Pokemon
    s = {
      ...s,
      players: {
        ...s.players,
        [pid]: {
          ...s.players[pid],
          discard: s.players[pid].discard.filter(id => id !== chosenEnergy)
        }
      }
    };

    const loc = s.players[pid].active?.instanceId === pokemonId ? 'active' : 'bench';
    if (loc === 'active' && s.players[pid].active) {
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid],
            active: {
              ...s.players[pid].active!,
              attachedEnergy: [...s.players[pid].active!.attachedEnergy, chosenEnergy]
            }
          }
        }
      };
    } else {
      const benchIdx = s.players[pid].bench.findIndex(b => b.instanceId === pokemonId);
      if (benchIdx !== -1) {
        const newBench = [...s.players[pid].bench];
        newBench[benchIdx] = {
          ...newBench[benchIdx]!,
          attachedEnergy: [...newBench[benchIdx]!.attachedEnergy, chosenEnergy]
        };
        s = {
          ...s,
          players: { ...s.players, [pid]: { ...s.players[pid], bench: newBench } }
        };
      }
    }

    attached++;
  }

  if (attached > 0) {
    s = drawCards(s, pid, 3);
  }

  return s;
}

// ─── 77. Professor Turo's Scenario ────────────────────────────────────────
// Put 1 of your Pokemon in play into your hand. Discard all attached cards.

function professorTurosScenarioHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  if (allInPlay.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: allInPlay.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: "Professor Turo's Scenario: choose a Pokemon to return to hand (attached cards are discarded)"
  });

  const chosen = choice[0];
  if (!chosen) return state;

  const target = allInPlay.find(p => p.instanceId === chosen);
  if (!target) return state;

  // Collect all cards that go to hand (evolution stack only, not energy/tools which are discarded)
  const cardsToHand = [...target.evolutionStack];
  const cardsToDiscard = [...target.attachedEnergy, ...target.attachedTools];

  const isActive = ps.active?.instanceId === chosen;
  const benchIdx = ps.bench.findIndex(b => b.instanceId === chosen);

  let s = state;
  if (isActive) {
    s = {
      ...s,
      players: {
        ...s.players,
        [pid]: {
          ...s.players[pid],
          active: null,
          hand: [...s.players[pid].hand, ...cardsToHand],
          discard: [...s.players[pid].discard, ...cardsToDiscard]
        }
      }
    };
  } else if (benchIdx !== -1) {
    s = {
      ...s,
      players: {
        ...s.players,
        [pid]: {
          ...s.players[pid],
          bench: s.players[pid].bench.filter((_, i) => i !== benchIdx),
          hand: [...s.players[pid].hand, ...cardsToHand],
          discard: [...s.players[pid].discard, ...cardsToDiscard]
        }
      }
    };
  }

  return s;
}

// ─── 78. Professor's Research (Professor Sada) ────────────────────────────
// Discard hand and draw 7.

function professorsResearchSadaHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const hand = [...state.players[pid].hand];
  let s = state;
  if (hand.length > 0) {
    s = discardFromHand(s, pid, hand);
  }
  return drawCards(s, pid, 7);
}

// ─── 79. Professor's Research (Professor Turo) ────────────────────────────
// Discard hand and draw 7.

function professorsResearchTuroHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const hand = [...state.players[pid].hand];
  let s = state;
  if (hand.length > 0) {
    s = discardFromHand(s, pid, hand);
  }
  return drawCards(s, pid, 7);
}

// ─── 80. Raifort ──────────────────────────────────────────────────────────
// Look at top 5 of deck. Discard any. Put rest back (shuffled back to top).

function raifortHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const top5 = ps.deck.slice(0, 5);

  if (top5.length === 0) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: top5,
    min: 0,
    max: top5.length,
    reason: 'Raifort: choose any cards from the top 5 to discard'
  });

  const toDiscard = new Set(discardChoice);
  const toKeep = top5.filter(id => !toDiscard.has(id));

  let s = {
    ...state,
    players: {
      ...state.players,
      [pid]: {
        ...ps,
        deck: [...toKeep, ...ps.deck.slice(5)],
        discard: [...ps.discard, ...discardChoice]
      }
    }
  };

  return s;
}

// ─── 81. Rika ─────────────────────────────────────────────────────────────
// Look at top 4 of deck. Put 2 in hand. Shuffle rest to bottom.

function rikaHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const top4 = ps.deck.slice(0, 4);

  if (top4.length === 0) return state;

  const max = Math.min(2, top4.length);
  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: top4,
    min: max,
    max,
    reason: 'Rika: choose 2 cards from top 4 to put in hand'
  });

  const toHand = new Set(choice.slice(0, max));
  const toBottom = top4.filter(id => !toHand.has(id));

  const remainingDeck = ps.deck.slice(4);
  const s = {
    ...state,
    players: {
      ...state.players,
      [pid]: {
        ...ps,
        deck: [...remainingDeck, ...toBottom],
        hand: [...ps.hand, ...choice.slice(0, max)]
      }
    }
  };

  return s;
}

// ─── 82. Roark ────────────────────────────────────────────────────────────
// Draw 2. Put a Basic Energy from discard into hand.

function roarkHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = drawCards(state, pid, 2);

  const discard = s.players[pid].discard;
  const basicEnergy = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return s;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: basicEnergy,
    min: 1,
    max: 1,
    reason: 'Roark: choose a Basic Energy from discard to put in hand'
  });

  const chosen = choice[0];
  if (!chosen || !basicEnergy.includes(chosen)) return s;

  return moveToHand(s, pid, chosen, 'discard');
}

// ─── 83. Ruffian ──────────────────────────────────────────────────────────
// Discard a Pokemon Tool and a Special Energy from 1 of opponent's Pokemon.

function ruffianHandler(state: GameState, ctx: TrainerContext): GameState {
  const opp = ctx.opponent;
  const oppState = state.players[opp];
  const allInPlay = [oppState.active, ...oppState.bench].filter(Boolean) as InPlayPokemon[];

  const eligible = allInPlay.filter(p => {
    const hasTool = p.attachedTools.length > 0;
    const hasSpecialEnergy = p.attachedEnergy.some(id => {
      const inst = state.cardRegistry.get(id);
      if (!inst) return false;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Energy' && def.subtype === 'Special';
    });
    return hasTool && hasSpecialEnergy;
  });

  if (eligible.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: eligible.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: "Ruffian: choose opponent's Pokemon to discard a Tool and Special Energy from"
  });

  const chosen = choice[0];
  if (!chosen) return state;

  const target = eligible.find(p => p.instanceId === chosen);
  if (!target) return state;

  const toolId = target.attachedTools[0]!;
  const specialEnergyId = target.attachedEnergy.find(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Special';
  });

  if (!specialEnergyId) return state;

  let s = {
    ...state,
    players: {
      ...state.players,
      [opp]: {
        ...oppState,
        discard: [...oppState.discard, toolId, specialEnergyId]
      }
    }
  };

  // Remove tool
  const loc = s.players[opp].active?.instanceId === chosen ? 'active' : 'bench';
  if (loc === 'active' && s.players[opp].active) {
    s = {
      ...s,
      players: {
        ...s.players,
        [opp]: {
          ...s.players[opp],
          active: {
            ...s.players[opp].active!,
            attachedTools: s.players[opp].active!.attachedTools.filter(id => id !== toolId),
            attachedEnergy: s.players[opp].active!.attachedEnergy.filter(id => id !== specialEnergyId)
          }
        }
      }
    };
  } else {
    const benchIdx = s.players[opp].bench.findIndex(b => b.instanceId === chosen);
    if (benchIdx !== -1) {
      const newBench = [...s.players[opp].bench];
      newBench[benchIdx] = {
        ...newBench[benchIdx]!,
        attachedTools: newBench[benchIdx]!.attachedTools.filter(id => id !== toolId),
        attachedEnergy: newBench[benchIdx]!.attachedEnergy.filter(id => id !== specialEnergyId)
      };
      s = {
        ...s,
        players: { ...s.players, [opp]: { ...s.players[opp], bench: newBench } }
      };
    }
  }

  return s;
}

// ─── 84. Ryme ─────────────────────────────────────────────────────────────
// Draw 3. Switch out opponent's Active to Bench (opponent chooses new Active).

function rymeHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = drawCards(state, ctx.player, 3);

  const opp = ctx.opponent;
  const oppState = s.players[opp];
  if (!oppState.active || oppState.bench.length === 0) return s;

  const opts = oppState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: opp,
    options: opts,
    min: 1,
    max: 1,
    reason: 'Ryme: choose a Benched Pokemon to switch in as new Active'
  });

  const chosen = choice[0];
  if (!chosen || !opts.includes(chosen)) return s;

  return switchActive(s, opp, chosen);
}

// ─── 85. Saguaro ──────────────────────────────────────────────────────────
// Choose up to 2 of your Pokemon. Heal 50 from each.

function saguaroHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  if (allInPlay.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: allInPlay.map(p => p.instanceId),
    min: 0,
    max: Math.min(2, allInPlay.length),
    reason: 'Saguaro: choose up to 2 Pokemon to heal 50 damage from'
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    s = healDamage(s, pid, id, 50);
  }
  return s;
}

// ─── 86. Salvatore ────────────────────────────────────────────────────────
// Search deck for a card with no Abilities that evolves from one of your Pokemon, evolve it.
// Can use on Pokemon played this turn.

function salvatoreHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const evolutionsInDeck = ps.deck.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    if (!def || def.cardType !== 'Pokemon') return false;
    if (!def.evolvesFrom) return false;
    if (def.abilities && def.abilities.length > 0) return false;
    return allInPlay.some(target => {
      if (!def.evolvesFrom) return false;
      const topDef = getTopDef(state, target);
      return topDef?.name === def.evolvesFrom;
    });
  });

  if (evolutionsInDeck.length === 0) return shuffleDeck(state, pid);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: evolutionsInDeck,
    min: 1,
    max: 1,
    reason: 'Salvatore: choose an Evolution card from your deck'
  });

  const chosenCardId = choice[0];
  if (!chosenCardId || !evolutionsInDeck.includes(chosenCardId)) return shuffleDeck(state, pid);

  const chosenDef = state.definitionRegistry.get(state.cardRegistry.get(chosenCardId)?.definitionId ?? '');
  if (!chosenDef || chosenDef.cardType !== 'Pokemon' || !chosenDef.evolvesFrom) return shuffleDeck(state, pid);

  const validTargets = allInPlay.filter(p => {
    const topDef = getTopDef(state, p);
    return topDef?.name === chosenDef.evolvesFrom;
  });

  if (validTargets.length === 0) return shuffleDeck(state, pid);

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: validTargets.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Salvatore: choose a Pokemon to evolve'
  });

  const targetId = targetChoice[0];
  if (!targetId) return shuffleDeck(state, pid);

  // Salvatore bypasses the "can't evolve if played this turn" restriction
  let s = shuffleDeck(state, pid);
  s = evolvePokemon(s, chosenCardId, targetId);
  return s;
}

// ─── 87. Shauntal ─────────────────────────────────────────────────────────
// Flip coin. Heads: switch in opponent's Benched. Tails: switch your Active with Benched.

function shauntalHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState: s1 } = flipCoin(state, 'Shauntal');

  if (result === 'heads') {
    const opp = ctx.opponent;
    const oppState = s1.players[opp];
    if (!oppState.active || oppState.bench.length === 0) return s1;

    const opts = oppState.bench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: opts,
      min: 1,
      max: 1,
      reason: "Shauntal (Heads): choose opponent's Benched Pokemon to switch in"
    });

    const chosen = choice[0];
    if (!chosen || !opts.includes(chosen)) return s1;
    return switchActive(s1, opp, chosen);
  } else {
    const pid = ctx.player;
    const ps = s1.players[pid];
    if (!ps.active || ps.bench.length === 0) return s1;

    const opts = ps.bench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: opts,
      min: 1,
      max: 1,
      reason: 'Shauntal (Tails): choose a Benched Pokemon to become Active'
    });

    const chosen = choice[0];
    if (!chosen || !opts.includes(chosen)) return s1;
    return switchActive(s1, pid, chosen);
  }
}

// ─── 88. Surfer ───────────────────────────────────────────────────────────
// Switch Active with Benched. Draw until 5 in hand.

function surferHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  if (!ps.active || ps.bench.length === 0) return state;

  const opts = ps.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: opts,
    min: 1,
    max: 1,
    reason: 'Surfer: choose a Benched Pokemon to become Active'
  });

  const chosen = choice[0];
  if (!chosen || !opts.includes(chosen)) return state;

  let s = switchActive(state, pid, chosen);
  s = drawCards(s, pid, Math.max(0, 5 - s.players[pid].hand.length));
  return s;
}

// ─── 89. Team Rocket's Archer ─────────────────────────────────────────────
// Both shuffle hand into deck. You draw 5, opponent draws 3.

function teamRocketsArcherHandler(state: GameState, ctx: TrainerContext): GameState {
  let s = state;

  for (const pid of [ctx.player, ctx.opponent] as const) {
    const hand = [...s.players[pid].hand];
    for (const id of hand) {
      s = moveToDeck(s, pid, id, 'hand');
    }
    s = shuffleDeck(s, pid);
  }

  s = drawCards(s, ctx.player, 5);
  s = drawCards(s, ctx.opponent, 3);
  return s;
}

// ─── 90. Team Rocket's Ariana ─────────────────────────────────────────────
// Draw until 5. If all your Pokemon are Team Rocket's, draw until 8.

function teamRocketsArianaHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const allTeamRockets = allInPlay.length > 0 && allInPlay.every(p => {
    const def = getTopDef(state, p);
    return def?.name.startsWith("Team Rocket's ");
  });

  const target = allTeamRockets ? 8 : 5;
  return drawCards(state, pid, Math.max(0, target - ps.hand.length));
}

// ─── 91. Team Rocket's Giovanni ───────────────────────────────────────────
// Switch your Active Team Rocket's with Benched Team Rocket's.
// Then switch in opponent's Benched.

function teamRocketsGiovanniHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];

  const activeIsRocket = (() => {
    if (!ps.active) return false;
    const def = getTopDef(state, ps.active);
    return def?.name.startsWith("Team Rocket's ") ?? false;
  })();

  const rocketBench = ps.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.name.startsWith("Team Rocket's ");
  });

  let s = state;

  if (activeIsRocket && rocketBench.length > 0) {
    const opts = rocketBench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: opts,
      min: 1,
      max: 1,
      reason: "Team Rocket's Giovanni: choose a Benched Team Rocket's Pokemon to switch in"
    });

    const chosen = choice[0];
    if (chosen && opts.includes(chosen)) {
      s = switchActive(s, pid, chosen);
    }
  }

  const opp = ctx.opponent;
  const oppState = s.players[opp];
  if (oppState.active && oppState.bench.length > 0) {
    const opts = oppState.bench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: pid,
      options: opts,
      min: 1,
      max: 1,
      reason: "Team Rocket's Giovanni: choose opponent's Benched Pokemon to switch in"
    });

    const chosen = choice[0];
    if (chosen && opts.includes(chosen)) {
      s = switchActive(s, opp, chosen);
    }
  }

  return s;
}

// ─── 92. Team Rocket's Petrel ─────────────────────────────────────────────
// Search deck for a Trainer card → hand. Shuffle.

function teamRocketsPetrelHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const { candidates } = searchDeck(state, pid, { supertype: 'Trainer' }, 999);

  if (candidates.length === 0) return shuffleDeck(state, pid);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: candidates,
    min: 1,
    max: 1,
    reason: "Team Rocket's Petrel: choose a Trainer card from your deck"
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, pid);

  let s = moveToHand(state, pid, chosen, 'deck');
  return shuffleDeck(s, pid);
}

// ─── 93. Team Rocket's Proton ─────────────────────────────────────────────
// Search deck for up to 3 Basic Team Rocket's Pokemon → hand. Shuffle.

function teamRocketsProtonHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const { candidates } = searchDeck(state, pid, {
    custom: (def) => def.cardType === 'Pokemon' && def.stage === 'Basic' && def.name.startsWith("Team Rocket's ")
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, pid);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: candidates,
    min: 0,
    max: Math.min(3, candidates.length),
    reason: "Team Rocket's Proton: choose up to 3 Basic Team Rocket's Pokemon from your deck"
  });

  let s = state;
  for (const id of choice) {
    if (candidates.includes(id) && s.players[pid].deck.includes(id)) {
      s = moveToHand(s, pid, id, 'deck');
    }
  }

  return shuffleDeck(s, pid);
}

// ─── 94. Team Star Grunt ──────────────────────────────────────────────────
// Put an Energy from opponent's Active on top of their deck.

function teamStarGruntHandler(state: GameState, ctx: TrainerContext): GameState {
  const opp = ctx.opponent;
  const oppActive = state.players[opp].active;
  if (!oppActive || oppActive.attachedEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: [...oppActive.attachedEnergy],
    min: 1,
    max: 1,
    reason: "Team Star Grunt: choose an Energy from opponent's Active to put on top of their deck"
  });

  const chosen = choice[0];
  if (!chosen || !oppActive.attachedEnergy.includes(chosen)) return state;

  const oppState = state.players[opp];
  return {
    ...state,
    players: {
      ...state.players,
      [opp]: {
        ...oppState,
        active: {
          ...oppActive,
          attachedEnergy: oppActive.attachedEnergy.filter(id => id !== chosen)
        },
        deck: [chosen, ...oppState.deck]
      }
    }
  };
}

// ─── 95. Tulip ────────────────────────────────────────────────────────────
// Put up to 4 Psychic Pokemon and/or Basic Psychic Energy from discard → hand.

function tulipHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const discard = state.players[pid].discard;

  const valid = discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    if (!def) return false;
    if (def.cardType === 'Pokemon') return def.types.includes('Psychic');
    if (def.cardType === 'Energy') return def.subtype === 'Basic' && def.provides.includes('Psychic');
    return false;
  });

  if (valid.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: pid,
    options: valid,
    min: 0,
    max: Math.min(4, valid.length),
    reason: 'Tulip: choose up to 4 Psychic Pokemon and/or Basic Psychic Energy from discard'
  });

  let s = state;
  for (const id of choice.slice(0, 4)) {
    if (valid.includes(id) && s.players[pid].discard.includes(id)) {
      s = moveToHand(s, pid, id, 'discard');
    }
  }
  return s;
}

// ─── 96. Tyme ─────────────────────────────────────────────────────────────
// No-op (requires opponent guessing — not implementable in deterministic engine).

function tymeHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── 97. Wally's Compassion ───────────────────────────────────────────────
// Heal all damage from 1 of your Mega Evolution Pokemon ex.
// If healed, put all attached Energy into your hand.

function wallysCompassionHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  const ps = state.players[pid];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];

  const megaEx = allInPlay.filter(p => {
    const def = getTopDef(state, p);
    return def?.subtypes.includes('MegaEvolutionEx');
  });

  if (megaEx.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: pid,
    options: megaEx.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: "Wally's Compassion: choose a Mega Evolution Pokemon ex to heal"
  });

  const chosen = choice[0];
  if (!chosen) return state;

  const target = megaEx.find(p => p.instanceId === chosen);
  if (!target || target.damageCounters === 0) return state;

  let s = healAllDamage(state, pid, chosen);
  const energyIds = [...target.attachedEnergy];

  if (energyIds.length > 0) {
    const isActive = s.players[pid].active?.instanceId === chosen;
    const benchIdx = s.players[pid].bench.findIndex(b => b.instanceId === chosen);

    if (isActive && s.players[pid].active) {
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid],
            active: { ...s.players[pid].active!, attachedEnergy: [] },
            hand: [...s.players[pid].hand, ...energyIds]
          }
        }
      };
    } else if (benchIdx !== -1) {
      const newBench = [...s.players[pid].bench];
      newBench[benchIdx] = { ...newBench[benchIdx]!, attachedEnergy: [] };
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid],
            bench: newBench,
            hand: [...s.players[pid].hand, ...energyIds]
          }
        }
      };
    }
  }

  return s;
}

// ─── 98. Xerosic's Machinations ───────────────────────────────────────────
// Opponent discards from hand until they have 3 cards.

function xerosicsMachinationsHandler(state: GameState, ctx: TrainerContext): GameState {
  const opp = ctx.opponent;
  const oppHand = state.players[opp].hand;

  if (oppHand.length <= 3) return state;

  const excess = oppHand.length - 3;
  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: opp,
    options: [...oppHand],
    min: excess,
    max: excess,
    reason: "Xerosic's Machinations: discard cards until you have 3 in hand"
  });

  const toDiscard = choice.slice(0, excess);
  return discardFromHand(state, opp, toDiscard);
}

// ─── 99. Youngster ────────────────────────────────────────────────────────
// Shuffle hand into deck. Draw 5.

function youngsterHandler(state: GameState, ctx: TrainerContext): GameState {
  const pid = ctx.player;
  let s = state;
  const hand = [...s.players[pid].hand];
  for (const id of hand) {
    s = moveToDeck(s, pid, id, 'hand');
  }
  s = shuffleDeck(s, pid);
  s = drawCards(s, pid, 5);
  return s;
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerAllSupporters(): void {
  // Batch A (1-50)
  registerTrainerEffect("Acerola's Mischief", acerolaMischiefHandler);
  registerTrainerEffect('Amarys', amarysHandler);
  registerTrainerEffect('Anthea & Concordia', antheaAndConcordiaHandler);
  registerTrainerEffect('Atticus', atticusHandler);
  registerTrainerEffect("Bianca's Devotion", biancasDevotionHandler);
  registerTrainerEffect("Bill's Transfer", billsTransferHandler);
  registerTrainerEffect("Billy & O'Nare", billyAndONareHandler);
  registerTrainerEffect("Black Belt's Training", blackBeltsTrainingHandler);
  registerTrainerEffect("Boss's Orders (Ghetsis)", bossOrdersGhetsisHandler);
  registerTrainerEffect('Brassius', brassiusHandler);
  registerTrainerEffect('Briar', briarHandler);
  registerTrainerEffect("Brock's Scouting", brocksScoutingHandler);
  registerTrainerEffect('Canari', canariHandler);
  registerTrainerEffect('Caretaker', caretakerHandler);
  registerTrainerEffect('Carmine', carmineHandler);
  registerTrainerEffect('Cassiopeia', cassiopeiaHandler);
  registerTrainerEffect('Cheren', cherenHandler);
  registerTrainerEffect("Ciphermaniac's Codebreaking", ciphermaniacsCodebreakingHandler);
  registerTrainerEffect('Clavell', clavellHandler);
  registerTrainerEffect("Clemont's Quick Wit", clemontHandler);
  registerTrainerEffect('Clive', cliveHandler);
  registerTrainerEffect("Colress's Tenacity", colressTenacityHandler);
  registerTrainerEffect('Cook', cookHandler);
  registerTrainerEffect('Crispin', crispinHandler);
  registerTrainerEffect('Cyrano', cyranoHandler);
  registerTrainerEffect("Daisy's Help", daisysHelpHandler);
  registerTrainerEffect('Dawn', dawnHandler);
  registerTrainerEffect('Dendra', dendraHandler);
  registerTrainerEffect('Drasna', drasnaHandler);
  registerTrainerEffect('Drayton', draytonHandler);
  registerTrainerEffect("Emcee's Hype", emceesHypeHandler);
  registerTrainerEffect('Eri', eriHandler);
  registerTrainerEffect("Erika's Invitation", erikasInvitationHandler);
  registerTrainerEffect("Ethan's Adventure", ethansAdventureHandler);
  registerTrainerEffect("Explorer's Guidance", explorersGuidanceHandler);
  registerTrainerEffect('Falkner', falknerHandler);
  registerTrainerEffect('Fennel', fennelHandler);
  registerTrainerEffect('Firebreather', firebreatherHandler);
  registerTrainerEffect('Friends in Paldea', friendsInPaldeaHandler);
  registerTrainerEffect('Geeta', geetaHandler);
  registerTrainerEffect('Giacomo', giacomoHandler);
  registerTrainerEffect("Giovanni's Charisma", giovanniCharismaHandler);
  registerTrainerEffect("Grimsley's Move", grimsleysMoveHandler);
  registerTrainerEffect('Grusha', grushaHandler);
  registerTrainerEffect('Harlequin', harlequinHandler);
  registerTrainerEffect('Hassel', hasselHandler);
  registerTrainerEffect('Hilda', hildaHandler);
  registerTrainerEffect("Iris's Fighting Spirit", irisFightingSpiritHandler);
  registerTrainerEffect('Jacq', jacqHandler);
  registerTrainerEffect("Janine's Secret Art", janineSecretArtHandler);

  // Batch B (51-100)
  registerTrainerEffect('Katy', katyHandler);
  registerTrainerEffect('Kieran', kieranHandler);
  registerTrainerEffect('Kofu', kofuHandler);
  registerTrainerEffect('Lacey', laceyHandler);
  registerTrainerEffect("Lana's Aid", lanasAidHandler);
  registerTrainerEffect('Larry', larryHandler);
  registerTrainerEffect("Larry's Skill", larrysSkillHandler);
  registerTrainerEffect("Lillie's Determination", lilliesDeterminationHandler);
  registerTrainerEffect("Lisia's Appeal", lisiasAppealHandler);
  registerTrainerEffect("Lt. Surge's Bargain", ltSurgesBargainHandler);
  registerTrainerEffect('Lucian', lucianHandler);
  registerTrainerEffect('Mela', melaHandler);
  registerTrainerEffect('Miriam', miriamHandler);
  registerTrainerEffect("Morty's Conviction", mortysConvictionHandler);
  registerTrainerEffect("N's Plan", nsPlanHandler);
  registerTrainerEffect('Nemona', nemonaHandler);
  registerTrainerEffect('Norman', normanHandler);
  registerTrainerEffect('Ortega', ortegaHandler);
  registerTrainerEffect('Paldean Student', paldeanStudentHandler);
  registerTrainerEffect('Parasol Lady', parasolLadyHandler);
  registerTrainerEffect('Penny', pennyHandler);
  registerTrainerEffect('Perrin', perrinHandler);
  registerTrainerEffect('Picnicker', picknickerHandler);
  registerTrainerEffect('Pokémon Center Lady', pokemonCenterLadyHandler);
  registerTrainerEffect('Pokemon Center Lady', pokemonCenterLadyHandler);
  registerTrainerEffect('Poppy', poppyHandler);
  registerTrainerEffect("Professor Sada's Vitality", professorSadasVitalityHandler);
  registerTrainerEffect("Professor Turo's Scenario", professorTurosScenarioHandler);
  registerTrainerEffect("Professor's Research (Professor Sada)", professorsResearchSadaHandler);
  registerTrainerEffect("Professor's Research (Professor Turo)", professorsResearchTuroHandler);
  registerTrainerEffect('Raifort', raifortHandler);
  registerTrainerEffect('Rika', rikaHandler);
  registerTrainerEffect('Roark', roarkHandler);
  registerTrainerEffect('Ruffian', ruffianHandler);
  registerTrainerEffect('Ryme', rymeHandler);
  registerTrainerEffect('Saguaro', saguaroHandler);
  registerTrainerEffect('Salvatore', salvatoreHandler);
  registerTrainerEffect('Shauntal', shauntalHandler);
  registerTrainerEffect('Surfer', surferHandler);
  registerTrainerEffect("Team Rocket's Archer", teamRocketsArcherHandler);
  registerTrainerEffect("Team Rocket's Ariana", teamRocketsArianaHandler);
  registerTrainerEffect("Team Rocket's Giovanni", teamRocketsGiovanniHandler);
  registerTrainerEffect("Team Rocket's Petrel", teamRocketsPetrelHandler);
  registerTrainerEffect("Team Rocket's Proton", teamRocketsProtonHandler);
  registerTrainerEffect('Team Star Grunt', teamStarGruntHandler);
  registerTrainerEffect('Tulip', tulipHandler);
  registerTrainerEffect('Tyme', tymeHandler);
  registerTrainerEffect("Wally's Compassion", wallysCompassionHandler);
  registerTrainerEffect("Xerosic's Machinations", xerosicsMachinationsHandler);
  registerTrainerEffect('Youngster', youngsterHandler);
}

registerAllSupporters();
