import type { GameState } from '../types/game';
import type { TemporalEffect } from '../types/effect';
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
  flipCoin,
  flipCoins,
  healDamage,
  discardEnergy,
  discardAllEnergy,
  moveEnergy,
  applyCondition,
  attachEnergyFromDeck,
  wasKnockedOutLastTurn,
  hasRuleBox,
  setTurnEndedByEffect,
  getTopDef
} from './primitives';
import { otherPlayer } from '../core/game';
import { placeDamageCountersOn } from '../core/combat';

// ─── ACE SPEC Items ──────────────────────────────────────────────────────

// Brilliant Blender: Search deck for up to 5 cards and discard them.
function brilliantBlenderHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {}, 999);
  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(5, candidates.length),
    reason: 'Brilliant Blender: choose up to 5 cards to discard from deck'
  });

  const chosen = new Set(choice.slice(0, 5));
  const ps = state.players[ctx.player];
  const remaining = ps.deck.filter(id => !chosen.has(id));
  const discarded = ps.deck.filter(id => chosen.has(id));

  let s: GameState = {
    ...state,
    players: {
      ...state.players,
      [ctx.player]: {
        ...ps,
        deck: remaining,
        discard: [...ps.discard, ...discarded]
      }
    }
  };
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Dangerous Laser: Opponent's Active is now Burned and Confused.
function dangerousLaserHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opActive = state.players[opponent].active;
  if (!opActive) return state;

  let s = applyCondition(state, opponent, opActive.instanceId, 'Burned');
  s = applyCondition(s, opponent, opActive.instanceId, 'Confused');
  return s;
}

// Energy Search Pro: Search deck for any number of Basic Energy of different types.
function energySearchProHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  // Filter to one per type
  const seenTypes = new Set<string>();
  const uniqueByType = candidates.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    if (!def || def.cardType !== 'Energy') return false;
    const key = def.provides[0] ?? def.name;
    if (seenTypes.has(key)) return false;
    seenTypes.add(key);
    return true;
  });

  if (uniqueByType.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: uniqueByType,
    min: 0,
    max: uniqueByType.length,
    reason: 'Energy Search Pro: choose Basic Energy of different types'
  });

  let s = state;
  for (const id of choice) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Hyper Aroma: Search deck for up to 3 Stage 1 Pokemon.
function hyperAromaHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, { stage: 'Stage1' }, 999);
  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(3, candidates.length),
    reason: 'Hyper Aroma: choose up to 3 Stage 1 Pokemon'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Master Ball: Search deck for any Pokemon.
function masterBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, { supertype: 'Pokemon' }, 999);
  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Master Ball: choose a Pokemon to put in your hand'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Max Rod: Put up to 5 Pokemon/Basic Energy from discard into hand.
function maxRodHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const validCards = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
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
    max: Math.min(5, validCards.length),
    reason: 'Max Rod: choose up to 5 Pokemon/Basic Energy from discard'
  });

  let s = state;
  for (const id of choice.slice(0, 5)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'discard');
    }
  }
  return s;
}

// Megaton Blower: Discard all Tools and Special Energy from opponent's Pokemon, discard stadium.
function megatonBlowerHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  const allOpPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  let s = state;

  for (const poke of allOpPokemon) {
    // Discard all tools
    for (const toolId of [...poke.attachedTools]) {
      s = {
        ...s,
        players: {
          ...s.players,
          [opponent]: {
            ...s.players[opponent],
            active: s.players[opponent].active?.instanceId === poke.instanceId
              ? { ...s.players[opponent].active, attachedTools: s.players[opponent].active.attachedTools.filter(t => t !== toolId) }
              : s.players[opponent].active,
            bench: s.players[opponent].bench.map(b =>
              b.instanceId === poke.instanceId
                ? { ...b, attachedTools: b.attachedTools.filter(t => t !== toolId) }
                : b
            ),
            discard: [...s.players[opponent].discard, toolId]
          }
        }
      };
    }

    // Discard all Special Energy
    const currentPoke = s.players[opponent].active?.instanceId === poke.instanceId
      ? s.players[opponent].active!
      : s.players[opponent].bench.find(b => b.instanceId === poke.instanceId)!;

    if (!currentPoke) continue;

    for (const energyId of [...currentPoke.attachedEnergy]) {
      const inst = s.cardRegistry.get(energyId);
      const def = inst ? s.definitionRegistry.get(inst.definitionId) : undefined;
      if (!def || def.cardType !== 'Energy' || def.subtype !== 'Special') continue;

      s = {
        ...s,
        players: {
          ...s.players,
          [opponent]: {
            ...s.players[opponent],
            active: s.players[opponent].active?.instanceId === poke.instanceId
              ? { ...s.players[opponent].active!, attachedEnergy: s.players[opponent].active!.attachedEnergy.filter(e => e !== energyId) }
              : s.players[opponent].active,
            bench: s.players[opponent].bench.map(b =>
              b.instanceId === poke.instanceId
                ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== energyId) }
                : b
            ),
            discard: [...s.players[opponent].discard, energyId]
          }
        }
      };
    }
  }

  // Discard stadium
  if (s.stadium) {
    const stadiumId = s.stadium.cardInstanceId;
    const stadiumOwner = s.stadium.playedBy;
    s = {
      ...s,
      stadium: null,
      players: {
        ...s.players,
        [stadiumOwner]: {
          ...s.players[stadiumOwner],
          discard: [...s.players[stadiumOwner].discard, stadiumId]
        }
      }
    };
  }

  return s;
}

// Miracle Headset: Put up to 2 Supporter cards from discard into hand.
function miracleHeadsetHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const validCards = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
  });

  if (validCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: validCards,
    min: 1,
    max: Math.min(2, validCards.length),
    reason: 'Miracle Headset: choose up to 2 Supporters from discard'
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'discard');
    }
  }
  return s;
}

// Poke Vital A: Heal 150 damage from 1 of your Pokemon.
function pokeVitalAHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const options = [ps.active, ...ps.bench]
    .filter(Boolean)
    .filter(p => p!.damageCounters > 0)
    .map(p => p!.instanceId);

  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Poke Vital A: choose a Pokemon to heal 150 damage'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return healDamage(state, ctx.player, chosen, 150);
}

// Precious Trolley: Search deck for any number of Basic Pokemon, put on bench.
function preciousTrolleyHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const availableSlots = 5 - ps.bench.length;
  if (availableSlots <= 0) return shuffleDeck(state, ctx.player);

  const { candidates } = searchDeck(state, ctx.player, { stage: 'Basic' }, 999);
  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 0,
    max: Math.min(availableSlots, candidates.length),
    reason: 'Precious Trolley: choose Basic Pokemon to put on bench'
  });

  let s = state;
  for (const id of choice) {
    if (s.players[ctx.player].bench.length < 5 && s.players[ctx.player].deck.includes(id)) {
      s = putOnBench(s, ctx.player, id);
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Prime Catcher: Switch in opponent's Benched Pokemon, then switch your Active.
function primeCatcherHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  if (!opState.active || opState.bench.length === 0) return state;

  const opOptions = opState.bench.map(b => b.instanceId);
  const opChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: opOptions,
    min: 1,
    max: 1,
    reason: "Prime Catcher: choose opponent's Benched Pokemon to switch in"
  });

  const chosenOp = opChoice[0];
  if (!chosenOp || !opOptions.includes(chosenOp)) return state;

  let s = switchActive(state, opponent, chosenOp);

  const myState = s.players[ctx.player];
  if (myState.bench.length === 0) return s;

  const myOptions = myState.bench.map(b => b.instanceId);
  const myChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: myOptions,
    min: 1,
    max: 1,
    reason: 'Prime Catcher: choose your Benched Pokemon to switch in'
  });

  const chosenMy = myChoice[0];
  if (!chosenMy || !myOptions.includes(chosenMy)) return s;

  s = switchActive(s, ctx.player, chosenMy);
  return s;
}

// Scoop Up Cyclone: Return 1 of your Pokemon and all attached cards to hand.
function scoopUpCycloneHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const options = [ps.active, ...ps.bench].filter(Boolean).map(p => p!.instanceId);
  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Scoop Up Cyclone: choose a Pokemon to return to hand'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  const target = ps.active?.instanceId === chosen
    ? ps.active!
    : ps.bench.find(b => b.instanceId === chosen)!;

  if (!target) return state;

  // Collect all cards to return to hand
  const cardsToHand: string[] = [
    ...target.evolutionStack,
    ...target.attachedEnergy,
    ...target.attachedTools
  ];

  // Remove from play
  let s = state;
  if (ps.active?.instanceId === chosen) {
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: { ...s.players[ctx.player], active: null }
      }
    };
  } else {
    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: {
          ...s.players[ctx.player],
          bench: s.players[ctx.player].bench.filter(b => b.instanceId !== chosen)
        }
      }
    };
  }

  // Add all cards to hand
  s = {
    ...s,
    players: {
      ...s.players,
      [ctx.player]: {
        ...s.players[ctx.player],
        hand: [...s.players[ctx.player].hand, ...cardsToHand]
      }
    }
  };

  return s;
}

// Scramble Switch: Switch active with bench; may move energy to new active.
function scrambleSwitchHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (!ps.active || ps.bench.length === 0) return state;

  const options = ps.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Scramble Switch: choose a Benched Pokemon to become Active'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  const oldActiveId = ps.active.instanceId;
  let s = switchActive(state, ctx.player, chosen);

  // Old active is now on bench; offer to move energy from it to new active
  const newBenchPoke = s.players[ctx.player].bench.find(b => b.instanceId === oldActiveId);
  if (!newBenchPoke || newBenchPoke.attachedEnergy.length === 0) return s;

  const energyOptions = [...newBenchPoke.attachedEnergy];
  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: energyOptions,
    min: 0,
    max: energyOptions.length,
    reason: 'Scramble Switch: choose energy to move to new Active Pokemon'
  });

  for (const energyId of energyChoice) {
    if (s.players[ctx.player].bench.find(b => b.instanceId === oldActiveId)?.attachedEnergy.includes(energyId)) {
      s = moveEnergy(s, ctx.player, oldActiveId, chosen, energyId);
    }
  }

  return s;
}

// Secret Box: Discard 3, search for Item + Tool + Supporter + Stadium.
function secretBoxHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (ps.hand.length < 3) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...ps.hand],
    min: 3,
    max: 3,
    reason: 'Secret Box: discard 3 cards from your hand'
  });

  if (discardChoice.length < 3) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 3));

  const searchAndAdd = (
    st: GameState,
    filterFn: (def: { cardType: string; subtypes?: ReadonlyArray<string> }) => boolean,
    reason: string
  ): GameState => {
    const { candidates } = searchDeck(st, ctx.player, {
      custom: (def) => filterFn(def as { cardType: string; subtypes?: ReadonlyArray<string> })
    }, 999);
    if (candidates.length === 0) return st;

    const c = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: candidates,
      min: 1,
      max: 1,
      reason
    });

    const id = c[0];
    if (!id || !st.players[ctx.player].deck.includes(id)) return st;
    return moveToHand(st, ctx.player, id, 'deck');
  };

  s = searchAndAdd(s,
    (def) => def.cardType === 'Trainer' && (def.subtypes ?? []).includes('Item'),
    'Secret Box: choose an Item card'
  );
  s = searchAndAdd(s,
    (def) => def.cardType === 'Trainer' && (def.subtypes ?? []).includes('PokemonTool'),
    'Secret Box: choose a Pokemon Tool card'
  );
  s = searchAndAdd(s,
    (def) => def.cardType === 'Trainer' && (def.subtypes ?? []).includes('Supporter'),
    'Secret Box: choose a Supporter card'
  );
  s = searchAndAdd(s,
    (def) => def.cardType === 'Trainer' && (def.subtypes ?? []).includes('Stadium'),
    'Secret Box: choose a Stadium card'
  );

  s = shuffleDeck(s, ctx.player);
  return s;
}

// Treasure Tracker: Search deck for up to 5 Pokemon Tool cards.
function treasureTrackerHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('PokemonTool')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(5, candidates.length),
    reason: 'Treasure Tracker: choose up to 5 Pokemon Tool cards'
  });

  let s = state;
  for (const id of choice.slice(0, 5)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Unfair Stamp: Precondition (KO check) in getLegalActions. Both shuffle, you draw 5, opp draws 2.
function unfairStampHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  let s = state;

  for (const pid of [ctx.player, opponent] as const) {
    const hand = [...s.players[pid].hand];
    for (const id of hand) {
      s = moveToDeck(s, pid, id, 'hand');
    }
    s = shuffleDeck(s, pid);
  }

  s = drawCards(s, ctx.player, 5);
  s = drawCards(s, opponent, 2);
  return s;
}

// ─── Ancient/Future Items ────────────────────────────────────────────────

// Awakening Drum: Draw a card for each Ancient Pokemon in play.
function awakeningDrumHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as typeof ps.bench[number][];

  let count = 0;
  for (const poke of allInPlay) {
    const def = getTopDef(state, poke);
    if (def?.subtypes.includes('Ancient')) count++;
  }

  if (count === 0) return state;
  return drawCards(state, ctx.player, count);
}

// Earthen Vessel: Discard 1 other card, search for up to 2 Basic Energy.
function earthenVesselHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (ps.hand.length < 1) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...ps.hand],
    min: 1,
    max: 1,
    reason: 'Earthen Vessel: discard another card from your hand'
  });

  if (discardChoice.length < 1) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 1));

  const { candidates } = searchDeck(s, ctx.player, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(s, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(2, candidates.length),
    reason: 'Earthen Vessel: choose up to 2 Basic Energy cards'
  });

  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Reboot Pod (ACE SPEC): Attach a Basic Energy from discard to each Future Pokemon.
function rebootPodHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const futurePokemon = [ps.active, ...ps.bench]
    .filter(Boolean)
    .filter(p => {
      const def = getTopDef(state, p!);
      return def?.subtypes.includes('Future');
    }) as typeof ps.bench[number][];

  if (futurePokemon.length === 0) return state;

  let s = state;
  for (const poke of futurePokemon) {
    const discardEnergies = s.players[ctx.player].discard.filter(id => {
      const inst = s.cardRegistry.get(id);
      const def = inst ? s.definitionRegistry.get(inst.definitionId) : undefined;
      return def?.cardType === 'Energy' && def.subtype === 'Basic';
    });

    if (discardEnergies.length === 0) break;

    const choice = ctx.choiceResolver({
      type: 'select_energy',
      player: ctx.player,
      options: discardEnergies,
      min: 1,
      max: 1,
      reason: `Reboot Pod: choose Basic Energy to attach to ${getTopDef(s, poke)?.name ?? 'Future Pokemon'}`
    });

    const energyId = choice[0];
    if (!energyId || !s.players[ctx.player].discard.includes(energyId)) continue;

    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: {
          ...s.players[ctx.player],
          discard: s.players[ctx.player].discard.filter(id => id !== energyId),
          active: s.players[ctx.player].active?.instanceId === poke.instanceId
            ? { ...s.players[ctx.player].active!, attachedEnergy: [...s.players[ctx.player].active!.attachedEnergy, energyId] }
            : s.players[ctx.player].active,
          bench: s.players[ctx.player].bench.map(b =>
            b.instanceId === poke.instanceId
              ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
              : b
          )
        }
      }
    };
  }

  return s;
}

// Techno Radar: Discard 1 other card, search for up to 2 Future Pokemon.
function technoRadarHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (ps.hand.length < 1) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...ps.hand],
    min: 1,
    max: 1,
    reason: 'Techno Radar: discard another card from your hand'
  });

  if (discardChoice.length < 1) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 1));

  const { candidates } = searchDeck(s, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && def.subtypes.includes('Future')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(s, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(2, candidates.length),
    reason: 'Techno Radar: choose up to 2 Future Pokemon'
  });

  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Regular Items ───────────────────────────────────────────────────────

// Accompanying Flute: Reveal top 5 of opponent's deck; put matching Basics on their bench.
function accompanyingFluteHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opDeck = state.players[opponent].deck;
  const top5 = opDeck.slice(0, 5);

  const basics = top5.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Pokemon' && def.stage === 'Basic';
  });

  const availableSlots = 5 - state.players[opponent].bench.length;
  if (basics.length === 0 || availableSlots <= 0) {
    return shuffleDeck(state, opponent);
  }

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: basics,
    min: 0,
    max: Math.min(availableSlots, basics.length),
    reason: "Accompanying Flute: choose Basic Pokemon from opponent's top 5 to put on their bench"
  });

  let s = state;
  for (const id of choice) {
    if (s.players[opponent].bench.length < 5 && s.players[opponent].deck.includes(id)) {
      s = putOnBench(s, opponent, id);
    }
  }

  // Non-chosen cards remain in deck; shuffle opponent's deck
  s = shuffleDeck(s, opponent);
  return s;
}

// Antique Fossils (no-op — fossil mechanic needs separate architecture)
function fossilNoOpHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// Arven's Sandwich: Heal 30 from Active (100 if Arven's Pokemon).
function arvensSandwichHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (!ps.active) return state;

  const def = getTopDef(state, ps.active);
  // Arven's Pokemon have "Arven's" in their name per card naming convention
  const isArvens = def?.name.startsWith("Arven's") ?? false;
  const healAmount = isArvens ? 100 : 30;

  return healDamage(state, ctx.player, ps.active.instanceId, healAmount);
}

// Blowtorch: Discard a Basic Fire Energy from hand, then discard a Tool/Special Energy or Stadium.
function blowtorchHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const fireEnergy = ps.hand.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Fire');
  });

  if (fireEnergy.length === 0) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: fireEnergy,
    min: 1,
    max: 1,
    reason: 'Blowtorch: discard a Basic Fire Energy from hand'
  });

  if (discardChoice.length < 1) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 1));

  const opponent = otherPlayer(ctx.player);
  const opState = s.players[opponent];
  const allOpPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  // Collect valid targets: Tools/Special Energy on opponent's Pokemon + stadium
  type BlowtorchTarget = { kind: 'tool' | 'special_energy'; pokemonId: string; cardId: string } | { kind: 'stadium'; cardId: string };
  const targets: BlowtorchTarget[] = [];

  for (const poke of allOpPokemon) {
    for (const toolId of poke.attachedTools) {
      targets.push({ kind: 'tool', pokemonId: poke.instanceId, cardId: toolId });
    }
    for (const energyId of poke.attachedEnergy) {
      const inst = s.cardRegistry.get(energyId);
      const def = inst ? s.definitionRegistry.get(inst.definitionId) : undefined;
      if (def?.cardType === 'Energy' && def.subtype === 'Special') {
        targets.push({ kind: 'special_energy', pokemonId: poke.instanceId, cardId: energyId });
      }
    }
  }

  if (s.stadium) {
    targets.push({ kind: 'stadium', cardId: s.stadium.cardInstanceId });
  }

  if (targets.length === 0) return s;

  const targetOptions = targets.map(t => t.cardId);
  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: targetOptions,
    min: 1,
    max: 1,
    reason: 'Blowtorch: choose a Tool, Special Energy, or Stadium to discard'
  });

  const chosenId = choice[0];
  if (!chosenId) return s;

  const target = targets.find(t => t.cardId === chosenId);
  if (!target) return s;

  if (target.kind === 'stadium') {
    const stadiumOwner = s.stadium!.playedBy;
    s = {
      ...s,
      stadium: null,
      players: {
        ...s.players,
        [stadiumOwner]: {
          ...s.players[stadiumOwner],
          discard: [...s.players[stadiumOwner].discard, chosenId]
        }
      }
    };
  } else {
    const { pokemonId } = target as { kind: 'tool' | 'special_energy'; pokemonId: string; cardId: string };
    if (target.kind === 'tool') {
      s = {
        ...s,
        players: {
          ...s.players,
          [opponent]: {
            ...s.players[opponent],
            active: s.players[opponent].active?.instanceId === pokemonId
              ? { ...s.players[opponent].active!, attachedTools: s.players[opponent].active!.attachedTools.filter(t => t !== chosenId) }
              : s.players[opponent].active,
            bench: s.players[opponent].bench.map(b =>
              b.instanceId === pokemonId
                ? { ...b, attachedTools: b.attachedTools.filter(t => t !== chosenId) }
                : b
            ),
            discard: [...s.players[opponent].discard, chosenId]
          }
        }
      };
    } else {
      s = {
        ...s,
        players: {
          ...s.players,
          [opponent]: {
            ...s.players[opponent],
            active: s.players[opponent].active?.instanceId === pokemonId
              ? { ...s.players[opponent].active!, attachedEnergy: s.players[opponent].active!.attachedEnergy.filter(e => e !== chosenId) }
              : s.players[opponent].active,
            bench: s.players[opponent].bench.map(b =>
              b.instanceId === pokemonId
                ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== chosenId) }
                : b
            ),
            discard: [...s.players[opponent].discard, chosenId]
          }
        }
      };
    }
  }

  return s;
}

// Boxed Order: Search deck for up to 2 Items, put in hand. Turn ends.
function boxedOrderHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Item')
  }, 999);

  let s = state;

  if (candidates.length > 0) {
    const choice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: candidates,
      min: 1,
      max: Math.min(2, candidates.length),
      reason: 'Boxed Order: choose up to 2 Item cards'
    });

    for (const id of choice.slice(0, 2)) {
      if (s.players[ctx.player].deck.includes(id)) {
        s = moveToHand(s, ctx.player, id, 'deck');
      }
    }
    s = shuffleDeck(s, ctx.player);
  } else {
    s = shuffleDeck(s, ctx.player);
  }

  s = setTurnEndedByEffect(s);
  return s;
}

// Buddy-Buddy Poffin: Search deck for up to 2 Basic Pokemon with 70 HP or less.
function buddyBuddyPoffinHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const availableSlots = 5 - ps.bench.length;
  if (availableSlots <= 0) return shuffleDeck(state, ctx.player);

  const { candidates } = searchDeck(state, ctx.player, {
    stage: 'Basic',
    custom: (def) => def.cardType === 'Pokemon' && def.stage === 'Basic' && def.hp <= 70
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(2, availableSlots, candidates.length),
    reason: 'Buddy-Buddy Poffin: choose up to 2 Basic Pokemon with 70 HP or less'
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].bench.length < 5 && s.players[ctx.player].deck.includes(id)) {
      s = putOnBench(s, ctx.player, id);
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Bug Catching Set: Look at top 7; take up to 2 Grass Pokemon/Basic Grass Energy.
function bugCatchingSetHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top7 = ps.deck.slice(0, 7);

  const matching = top7.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    if (!def) return false;
    if (def.cardType === 'Pokemon' && def.types.includes('Grass')) return true;
    if (def.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Grass')) return true;
    return false;
  });

  if (matching.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: matching,
    min: 0,
    max: Math.min(2, matching.length),
    reason: 'Bug Catching Set: choose up to 2 Grass Pokemon/Basic Grass Energy from top 7'
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

// Call Bell: Precondition in getLegalActions. Search deck for a Supporter.
function callBellHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Supporter')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Call Bell: choose a Supporter card'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Chill Teaser Toy: Precondition in getLegalActions. Put an Energy from opponent's Pokemon into their hand.
function chillTeaserToyHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  const allOpPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  const energyOptions: string[] = [];
  for (const poke of allOpPokemon) {
    energyOptions.push(...poke.attachedEnergy);
  }

  if (energyOptions.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: energyOptions,
    min: 1,
    max: 1,
    reason: "Chill Teaser Toy: choose an Energy from opponent's Pokemon to return to their hand"
  });

  const chosenId = choice[0];
  if (!chosenId) return state;

  // Find which Pokemon has this energy
  const ownerPoke = allOpPokemon.find(p => p.attachedEnergy.includes(chosenId));
  if (!ownerPoke) return state;

  let s = state;
  if (opState.active?.instanceId === ownerPoke.instanceId) {
    s = {
      ...s,
      players: {
        ...s.players,
        [opponent]: {
          ...s.players[opponent],
          active: { ...s.players[opponent].active!, attachedEnergy: s.players[opponent].active!.attachedEnergy.filter(e => e !== chosenId) },
          hand: [...s.players[opponent].hand, chosenId]
        }
      }
    };
  } else {
    s = {
      ...s,
      players: {
        ...s.players,
        [opponent]: {
          ...s.players[opponent],
          bench: s.players[opponent].bench.map(b =>
            b.instanceId === ownerPoke.instanceId
              ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== chosenId) }
              : b
          ),
          hand: [...s.players[opponent].hand, chosenId]
        }
      }
    };
  }

  return s;
}

// Counter Catcher: Precondition in getLegalActions. Switch in opponent's Benched Pokemon.
function counterCatcherHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  if (!opState.active || opState.bench.length === 0) return state;

  const options = opState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Counter Catcher: choose opponent's Benched Pokemon to switch in"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, opponent, chosen);
}

// Crushing Hammer: Flip a coin; if heads, discard an Energy from opponent's Pokemon.
function crushingHammerHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, 'Crushing Hammer');
  if (result !== 'heads') return newState;

  const opponent = otherPlayer(ctx.player);
  const opState = newState.players[opponent];
  const allOpPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  const energyOptions: string[] = [];
  for (const poke of allOpPokemon) {
    energyOptions.push(...poke.attachedEnergy);
  }

  if (energyOptions.length === 0) return newState;

  const choice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: energyOptions,
    min: 1,
    max: 1,
    reason: "Crushing Hammer: choose an Energy to discard from opponent's Pokemon"
  });

  const chosenId = choice[0];
  if (!chosenId) return newState;

  const ownerPoke = allOpPokemon.find(p => p.attachedEnergy.includes(chosenId));
  if (!ownerPoke) return newState;

  return discardEnergy(newState, opponent, ownerPoke.instanceId, 1);
}

// Deduction Kit: Look at top 3, put back in order or shuffle to bottom. AI: shuffle to bottom.
function deductionKitHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top3 = ps.deck.slice(0, 3);
  if (top3.length === 0) return state;

  // Reveal top 3 to the player (choice resolver with 0 picks = just viewing)
  ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: top3,
    min: 0,
    max: 0,
    reason: 'Deduction Kit: look at top 3 cards'
  });

  // Shuffle top 3 to bottom of deck
  const remaining = ps.deck.slice(top3.length);
  return {
    ...state,
    players: {
      ...state.players,
      [ctx.player]: {
        ...ps,
        deck: [...remaining, ...top3]
      }
    }
  };
}

// Delivery Drone: Flip 2 coins; if both heads, search deck for any card.
function deliveryDroneHandler(state: GameState, ctx: TrainerContext): GameState {
  const { results, newState } = flipCoins(state, 2, 'Delivery Drone');
  if (results[0] !== 'heads' || results[1] !== 'heads') return newState;

  const ps = newState.players[ctx.player];
  if (ps.deck.length === 0) return newState;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...ps.deck],
    min: 1,
    max: 1,
    reason: 'Delivery Drone: choose any card from your deck'
  });

  const chosen = choice[0];
  if (!chosen || !newState.players[ctx.player].deck.includes(chosen)) return shuffleDeck(newState, ctx.player);

  let s = moveToHand(newState, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Dragon Elixir: Heal 60 damage from Active Dragon Pokemon.
function dragonElixirHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (!ps.active) return state;

  const def = getTopDef(state, ps.active);
  if (!def?.types.includes('Dragon')) return state;

  return healDamage(state, ctx.player, ps.active.instanceId, 60);
}

// Dusk Ball: Look at bottom 7; take a Pokemon.
function duskBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const bottom7 = ps.deck.slice(-7);

  const pokemon = bottom7.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Pokemon';
  });

  if (pokemon.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: pokemon,
    min: 1,
    max: 1,
    reason: 'Dusk Ball: choose a Pokemon from the bottom 7 cards'
  });

  const chosen = choice[0];
  if (!chosen || !pokemon.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Electric Generator: Look at top 5; attach up to 2 Basic Lightning Energy to Benched Lightning Pokemon.
function electricGeneratorHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top5 = ps.deck.slice(0, 5);

  const lightningEnergy = top5.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Lightning');
  });

  if (lightningEnergy.length === 0) return shuffleDeck(state, ctx.player);

  const lightningBench = ps.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.types.includes('Lightning');
  });

  if (lightningBench.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: lightningEnergy,
    min: 0,
    max: Math.min(2, lightningEnergy.length),
    reason: 'Electric Generator: choose up to 2 Basic Lightning Energy to attach'
  });

  let s = state;
  for (const energyId of choice.slice(0, 2)) {
    if (!s.players[ctx.player].deck.includes(energyId)) continue;

    const availableBench = s.players[ctx.player].bench.filter(b => {
      const def = getTopDef(s, b);
      return def?.types.includes('Lightning');
    });
    if (availableBench.length === 0) break;

    const targetChoice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: availableBench.map(b => b.instanceId),
      min: 1,
      max: 1,
      reason: 'Electric Generator: choose a Benched Lightning Pokemon to attach energy to'
    });

    const targetId = targetChoice[0];
    if (!targetId) continue;

    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: {
          ...s.players[ctx.player],
          deck: s.players[ctx.player].deck.filter(id => id !== energyId),
          bench: s.players[ctx.player].bench.map(b =>
            b.instanceId === targetId
              ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
              : b
          )
        }
      }
    };
  }

  s = shuffleDeck(s, ctx.player);
  return s;
}

// Energy Coin: Flip 2 coins; if both heads, search deck for Basic Energy and attach.
function energyCoinHandler(state: GameState, ctx: TrainerContext): GameState {
  const { results, newState } = flipCoins(state, 2, 'Energy Coin');
  if (results[0] !== 'heads' || results[1] !== 'heads') return newState;

  const ps = newState.players[ctx.player];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as typeof ps.bench[number][];
  if (allInPlay.length === 0) return newState;

  const { candidates } = searchDeck(newState, ctx.player, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);
  if (candidates.length === 0) return shuffleDeck(newState, ctx.player);

  const energyChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Energy Coin: choose a Basic Energy card from deck'
  });
  const energyId = energyChoice[0];
  if (!energyId) return shuffleDeck(newState, ctx.player);

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: allInPlay.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Energy Coin: choose a Pokemon to attach energy to'
  });
  const targetId = targetChoice[0];
  if (!targetId) return shuffleDeck(newState, ctx.player);

  let s = newState;
  s = {
    ...s,
    players: {
      ...s.players,
      [ctx.player]: {
        ...s.players[ctx.player],
        deck: s.players[ctx.player].deck.filter(id => id !== energyId)
      }
    }
  };
  s = {
    ...s,
    players: {
      ...s.players,
      [ctx.player]: {
        ...s.players[ctx.player],
        active: s.players[ctx.player].active?.instanceId === targetId
          ? { ...s.players[ctx.player].active!, attachedEnergy: [...s.players[ctx.player].active!.attachedEnergy, energyId] }
          : s.players[ctx.player].active,
        bench: s.players[ctx.player].bench.map(b =>
          b.instanceId === targetId
            ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
            : b
        )
      }
    }
  };
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Energy Recycler: Shuffle up to 5 Basic Energy from discard into deck.
function energyRecyclerHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const basicEnergy = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: basicEnergy,
    min: 1,
    max: Math.min(5, basicEnergy.length),
    reason: 'Energy Recycler: choose up to 5 Basic Energy from discard to shuffle into deck'
  });

  let s = state;
  for (const id of choice.slice(0, 5)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToDeck(s, ctx.player, id, 'discard');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Energy Search: Search deck for a Basic Energy.
function energySearchHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Energy Search: choose a Basic Energy card'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Energy Sticker: Flip a coin; if heads, attach Basic Energy from discard to Benched Pokemon.
function energyStickerHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, 'Energy Sticker');
  if (result !== 'heads') return newState;

  const ps = newState.players[ctx.player];
  if (ps.bench.length === 0) return newState;

  const basicEnergy = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return newState;

  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: basicEnergy,
    min: 1,
    max: 1,
    reason: 'Energy Sticker: choose a Basic Energy from discard'
  });

  const energyId = energyChoice[0];
  if (!energyId) return newState;

  const benchOptions = ps.bench.map(b => b.instanceId);
  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: benchOptions,
    min: 1,
    max: 1,
    reason: 'Energy Sticker: choose a Benched Pokemon to attach energy to'
  });

  const targetId = targetChoice[0];
  if (!targetId) return newState;

  return {
    ...newState,
    players: {
      ...newState.players,
      [ctx.player]: {
        ...newState.players[ctx.player],
        discard: newState.players[ctx.player].discard.filter(id => id !== energyId),
        bench: newState.players[ctx.player].bench.map(b =>
          b.instanceId === targetId
            ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
            : b
        )
      }
    }
  };
}

// Energy Switch: Move a Basic Energy from one of your Pokemon to another.
function energySwitchHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as typeof ps.bench[number][];

  // Find Pokemon with Basic Energy attached
  const withEnergy = allInPlay.filter(p => {
    return p.attachedEnergy.some(id => {
      const inst = state.cardRegistry.get(id);
      const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
      return def?.cardType === 'Energy' && def.subtype === 'Basic';
    });
  });

  if (withEnergy.length === 0) return state;
  if (allInPlay.length < 2) return state;

  const fromChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: withEnergy.map(p => p.instanceId),
    min: 1,
    max: 1,
    reason: 'Energy Switch: choose a Pokemon to move Basic Energy from'
  });

  const fromId = fromChoice[0];
  if (!fromId) return state;

  const fromPoke = allInPlay.find(p => p.instanceId === fromId);
  if (!fromPoke) return state;

  const basicEnergyOnFrom = fromPoke.attachedEnergy.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: basicEnergyOnFrom,
    min: 1,
    max: 1,
    reason: 'Energy Switch: choose a Basic Energy to move'
  });

  const energyId = energyChoice[0];
  if (!energyId) return state;

  const toOptions = allInPlay.filter(p => p.instanceId !== fromId).map(p => p.instanceId);
  const toChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: toOptions,
    min: 1,
    max: 1,
    reason: 'Energy Switch: choose a Pokemon to move Basic Energy to'
  });

  const toId = toChoice[0];
  if (!toId) return state;

  return moveEnergy(state, ctx.player, fromId, toId, energyId);
}

// Enhanced Hammer: Discard a Special Energy from opponent's Pokemon.
function enhancedHammerHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  const allOpPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  const specialEnergy: string[] = [];
  for (const poke of allOpPokemon) {
    for (const id of poke.attachedEnergy) {
      const inst = state.cardRegistry.get(id);
      const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
      if (def?.cardType === 'Energy' && def.subtype === 'Special') {
        specialEnergy.push(id);
      }
    }
  }

  if (specialEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: specialEnergy,
    min: 1,
    max: 1,
    reason: "Enhanced Hammer: choose a Special Energy to discard from opponent's Pokemon"
  });

  const chosenId = choice[0];
  if (!chosenId) return state;

  const ownerPoke = allOpPokemon.find(p => p.attachedEnergy.includes(chosenId));
  if (!ownerPoke) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [opponent]: {
        ...opState,
        active: opState.active?.instanceId === ownerPoke.instanceId
          ? { ...opState.active, attachedEnergy: opState.active.attachedEnergy.filter(e => e !== chosenId) }
          : opState.active,
        bench: opState.bench.map(b =>
          b.instanceId === ownerPoke.instanceId
            ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== chosenId) }
            : b
        ),
        discard: [...opState.discard, chosenId]
      }
    }
  };
}

// Fighting Au Lait: Precondition in getLegalActions. Heal 60 from 1 of your Pokemon.
function fightingAuLaitHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const options = [ps.active, ...ps.bench]
    .filter(Boolean)
    .filter(p => p!.damageCounters > 0)
    .map(p => p!.instanceId);

  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Fighting Au Lait: choose a Pokemon to heal 60 damage'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return healDamage(state, ctx.player, chosen, 60);
}

// Fighting Gong: Search deck for Basic Fighting Energy or Basic Fighting Pokemon.
function fightingGongHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => {
      if (def.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Fighting')) return true;
      if (def.cardType === 'Pokemon' && def.stage === 'Basic' && def.types.includes('Fighting')) return true;
      return false;
    }
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Fighting Gong: choose a Basic Fighting Energy or Basic Fighting Pokemon'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Glass Trumpet: Precondition in getLegalActions. Attach Basic Energy from discard to up to 2 Benched Colorless Pokemon.
function glassTrumpetHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const colorlessBench = ps.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.types.includes('Colorless');
  });

  if (colorlessBench.length === 0) return state;

  const basicEnergy = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return state;

  const targets = colorlessBench.slice(0, 2);
  let s = state;

  for (const target of targets) {
    const availableEnergy = s.players[ctx.player].discard.filter(id => {
      const inst = s.cardRegistry.get(id);
      const def = inst ? s.definitionRegistry.get(inst.definitionId) : undefined;
      return def?.cardType === 'Energy' && def.subtype === 'Basic';
    });
    if (availableEnergy.length === 0) break;

    const choice = ctx.choiceResolver({
      type: 'select_energy',
      player: ctx.player,
      options: availableEnergy,
      min: 1,
      max: 1,
      reason: `Glass Trumpet: choose Basic Energy to attach to ${getTopDef(s, target)?.name ?? 'Colorless Pokemon'}`
    });

    const energyId = choice[0];
    if (!energyId || !s.players[ctx.player].discard.includes(energyId)) continue;

    s = {
      ...s,
      players: {
        ...s.players,
        [ctx.player]: {
          ...s.players[ctx.player],
          discard: s.players[ctx.player].discard.filter(id => id !== energyId),
          bench: s.players[ctx.player].bench.map(b =>
            b.instanceId === target.instanceId
              ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
              : b
          )
        }
      }
    };
  }

  return s;
}

// Grabber: Opponent reveals hand; you put a Pokemon you find there on the bottom of their deck.
function grabberHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opHand = state.players[opponent].hand;

  const pokemonInHand = opHand.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Pokemon';
  });

  if (pokemonInHand.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: pokemonInHand,
    min: 1,
    max: 1,
    reason: "Grabber: choose a Pokemon from opponent's hand to put on the bottom of their deck"
  });

  const chosen = choice[0];
  if (!chosen || !pokemonInHand.includes(chosen)) return state;

  return moveToDeckBottom(state, opponent, [chosen]);
}

// Great Ball: Look at top 7; take a Pokemon.
function greatBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top7 = ps.deck.slice(0, 7);

  const pokemon = top7.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Pokemon';
  });

  if (pokemon.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: pokemon,
    min: 1,
    max: 1,
    reason: 'Great Ball: choose a Pokemon from the top 7 cards'
  });

  const chosen = choice[0];
  if (!chosen || !pokemon.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Hand Trimmer: Each player discards until 5 cards. Opponent discards first.
function handTrimmerHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  let s = state;

  // Opponent discards first
  const opHand = s.players[opponent].hand;
  if (opHand.length > 5) {
    const excess = opHand.length - 5;
    const discardChoice = ctx.choiceResolver({
      type: 'select_cards',
      player: opponent,
      options: [...opHand],
      min: excess,
      max: excess,
      reason: 'Hand Trimmer: discard cards until you have 5'
    });
    s = discardFromHand(s, opponent, discardChoice.slice(0, excess));
  }

  const myHand = s.players[ctx.player].hand;
  if (myHand.length > 5) {
    const excess = myHand.length - 5;
    const discardChoice = ctx.choiceResolver({
      type: 'select_cards',
      player: ctx.player,
      options: [...myHand],
      min: excess,
      max: excess,
      reason: 'Hand Trimmer: discard cards until you have 5'
    });
    s = discardFromHand(s, ctx.player, discardChoice.slice(0, excess));
  }

  return s;
}

// Hop's Bag: Search deck for up to 2 Basic Hop's Pokemon.
function hopsBagHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const availableSlots = 5 - ps.bench.length;
  if (availableSlots <= 0) return shuffleDeck(state, ctx.player);

  const { candidates } = searchDeck(state, ctx.player, {
    stage: 'Basic',
    custom: (def) => def.cardType === 'Pokemon' && def.stage === 'Basic' && def.name.startsWith("Hop's")
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(2, availableSlots, candidates.length),
    reason: "Hop's Bag: choose up to 2 Basic Hop's Pokemon"
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].bench.length < 5 && s.players[ctx.player].deck.includes(id)) {
      s = putOnBench(s, ctx.player, id);
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Iron Defender: During opponent's next turn, Metal Pokemon take 30 less damage.
function ironDefenderHandler(state: GameState, ctx: TrainerContext): GameState {
  const effect: TemporalEffect = {
    id: `iron-defender-${state.turnNumber}-${ctx.player}`,
    type: 'damage_reduction',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: null,
    expiresOnTurn: null,
    expiresAt: 'end_of_opponent_turn',
    payload: { amount: 30, condition: 'metal_pokemon_only', player: ctx.player }
  };

  return {
    ...state,
    temporalEffects: [...state.temporalEffects, effect]
  };
}

// Jumbo Ice Cream: Heal 80 from Active Pokemon with 3+ Energy attached.
function jumboIceCreamHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (!ps.active) return state;
  if (ps.active.attachedEnergy.length < 3) return state;

  return healDamage(state, ctx.player, ps.active.instanceId, 80);
}

// Letter of Encouragement: Precondition uses wasKnockedOutLastTurn. Search deck for up to 3 Basic Energy.
function letterOfEncouragementHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Energy' && def.subtype === 'Basic'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(3, candidates.length),
    reason: 'Letter of Encouragement: choose up to 3 Basic Energy cards'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Love Ball: Search deck for a Pokemon with the same name as one of opponent's Pokemon.
function loveBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  const opPokemon = [opState.active, ...opState.bench].filter(Boolean) as typeof opState.bench[number][];

  const opNames = new Set(opPokemon.map(p => getTopDef(state, p)?.name).filter(Boolean) as string[]);
  if (opNames.size === 0) return shuffleDeck(state, ctx.player);

  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && opNames.has(def.name)
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: "Love Ball: choose a Pokemon matching one of opponent's Pokemon names"
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Meddling Memo: Opponent puts hand on bottom of deck, draws same number.
function meddlingMemoHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opHand = [...state.players[opponent].hand];
  const count = opHand.length;

  if (count === 0) return state;

  let s = moveToDeckBottom(state, opponent, opHand);
  s = shuffleDeck(s, opponent);
  s = drawCards(s, opponent, count);
  return s;
}

// Mega Signal: Search deck for a Mega Evolution Pokemon ex.
function megaSignalHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && def.subtypes.includes('MegaEvolutionEx')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Mega Signal: choose a Mega Evolution Pokemon ex'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// N's PP Up: Attach Basic Energy from discard to a Benched N's Pokemon.
function nsPpUpHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const nsBench = ps.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.name.startsWith("N's");
  });

  if (nsBench.length === 0) return state;

  const basicEnergy = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return state;

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: nsBench.map(b => b.instanceId),
    min: 1,
    max: 1,
    reason: "N's PP Up: choose a Benched N's Pokemon to attach energy to"
  });

  const targetId = targetChoice[0];
  if (!targetId) return state;

  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: basicEnergy,
    min: 1,
    max: 1,
    reason: "N's PP Up: choose a Basic Energy from discard"
  });

  const energyId = energyChoice[0];
  if (!energyId || !ps.discard.includes(energyId)) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [ctx.player]: {
        ...ps,
        discard: ps.discard.filter(id => id !== energyId),
        bench: ps.bench.map(b =>
          b.instanceId === targetId
            ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
            : b
        )
      }
    }
  };
}

// Nemona's Backpack: Put up to 2 Nemona cards from discard into hand.
function nemonaBackpackHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const nemonaCards = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Trainer' && def.name.startsWith('Nemona');
  });

  if (nemonaCards.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: nemonaCards,
    min: 1,
    max: Math.min(2, nemonaCards.length),
    reason: "Nemona's Backpack: choose up to 2 Nemona cards from discard"
  });

  let s = state;
  for (const id of choice.slice(0, 2)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'discard');
    }
  }
  return s;
}

// Night Stretcher: Put a Pokemon or Basic Energy from discard into hand.
function nightStretcherHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const validCards = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
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
    max: 1,
    reason: 'Night Stretcher: choose a Pokemon or Basic Energy from discard'
  });

  const chosen = choice[0];
  if (!chosen || !validCards.includes(chosen)) return state;

  return moveToHand(state, ctx.player, chosen, 'discard');
}

// Ogre's Mask: no-op (Ogerpon-specific swap mechanic too niche)
function ogresMaskHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// Picnic Basket: Heal 30 from each Pokemon in play (both players).
function picnicBasketHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  let s = state;

  for (const pid of [ctx.player, opponent] as const) {
    const ps = s.players[pid];
    const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as typeof ps.bench[number][];
    for (const poke of allInPlay) {
      if (poke.damageCounters > 0) {
        s = healDamage(s, pid, poke.instanceId, 30);
      }
    }
  }

  return s;
}

// Poke Ball: Flip a coin; if heads, search deck for a Pokemon.
function pokeBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, 'Poke Ball');
  if (result !== 'heads') return newState;

  const { candidates } = searchDeck(newState, ctx.player, { supertype: 'Pokemon' }, 999);
  if (candidates.length === 0) return shuffleDeck(newState, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Poke Ball: choose a Pokemon to put in your hand'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(newState, ctx.player);

  let s = moveToHand(newState, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Pokemon Catcher: Flip a coin; if heads, switch in opponent's Benched Pokemon.
function pokemonCatcherHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, 'Pokemon Catcher');
  if (result !== 'heads') return newState;

  const opponent = otherPlayer(ctx.player);
  const opState = newState.players[opponent];
  if (!opState.active || opState.bench.length === 0) return newState;

  const options = opState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: "Pokemon Catcher: choose opponent's Benched Pokemon to switch in"
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return newState;

  return switchActive(newState, opponent, chosen);
}

// Potion: Heal 30 from 1 of your Pokemon.
function potionHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const options = [ps.active, ...ps.bench]
    .filter(Boolean)
    .filter(p => p!.damageCounters > 0)
    .map(p => p!.instanceId);

  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Potion: choose a Pokemon to heal 30 damage'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return healDamage(state, ctx.player, chosen, 30);
}

// Premium Power Pro: During this turn, Fighting Pokemon attacks do 30 more damage.
function premiumPowerProHandler(state: GameState, ctx: TrainerContext): GameState {
  const effect: TemporalEffect = {
    id: `premium-power-pro-${state.turnNumber}-${ctx.player}`,
    type: 'damage_modifier',
    sourceInstanceId: ctx.cardInstance.instanceId,
    sourceType: 'trainer',
    targetInstanceId: null,
    expiresOnTurn: null,
    expiresAt: 'end_of_turn',
    payload: { amount: 30, condition: 'fighting_pokemon_only', player: ctx.player }
  };

  return {
    ...state,
    temporalEffects: [...state.temporalEffects, effect]
  };
}

// Redeemable Ticket: Shuffle prizes to bottom of deck, draw new prizes from top.
function redeemableTicketHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const prizeCount = ps.prizes.length;
  if (prizeCount === 0) return state;

  const prizeCards = [...ps.prizes];

  // Put prizes on bottom of deck
  let s = {
    ...state,
    players: {
      ...state.players,
      [ctx.player]: {
        ...ps,
        prizes: [],
        deck: [...ps.deck, ...prizeCards]
      }
    }
  };

  // Shuffle
  s = shuffleDeck(s, ctx.player);

  // Take new prizes from top
  const newDeck = s.players[ctx.player].deck;
  const newPrizes = newDeck.slice(0, prizeCount);
  const remainingDeck = newDeck.slice(prizeCount);

  s = {
    ...s,
    players: {
      ...s.players,
      [ctx.player]: {
        ...s.players[ctx.player],
        prizes: newPrizes,
        deck: remainingDeck
      }
    }
  };

  return s;
}

// Repel: Switch out opponent's Active to Bench (opponent chooses new Active).
function repelHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const opState = state.players[opponent];
  if (!opState.active || opState.bench.length === 0) return state;

  const options = opState.bench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: opponent,
    options,
    min: 1,
    max: 1,
    reason: 'Repel: choose your new Active Pokemon'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, opponent, chosen);
}

// Roto-Stick: Look at top 4; take any Supporters.
function rotoStickHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const top4 = ps.deck.slice(0, 4);

  const supporters = top4.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Trainer' && def.subtypes.includes('Supporter');
  });

  if (supporters.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: supporters,
    min: 0,
    max: supporters.length,
    reason: 'Roto-Stick: choose any Supporters from the top 4 cards'
  });

  let s = state;
  for (const id of choice) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Sacred Ash: Shuffle up to 5 Pokemon from discard into deck.
function sacredAshHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const pokemonInDiscard = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Pokemon';
  });

  if (pokemonInDiscard.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: pokemonInDiscard,
    min: 1,
    max: Math.min(5, pokemonInDiscard.length),
    reason: 'Sacred Ash: choose up to 5 Pokemon from discard to shuffle into deck'
  });

  let s = state;
  for (const id of choice.slice(0, 5)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToDeck(s, ctx.player, id, 'discard');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Snorlax Doll: no-op (needs "play as Pokemon" mechanic)
function snorlaxDollHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// Strange Timepiece: no-op (devolve mechanic needs separate architecture)
function strangeTimepieceHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// Super Potion: Heal 60 from 1 Pokemon; if healed, discard an Energy from it.
function superPotionHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const options = [ps.active, ...ps.bench]
    .filter(Boolean)
    .filter(p => p!.damageCounters > 0)
    .map(p => p!.instanceId);

  if (options.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Super Potion: choose a Pokemon to heal 60 damage'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  const target = ps.active?.instanceId === chosen
    ? ps.active!
    : ps.bench.find(b => b.instanceId === chosen)!;

  if (!target || target.damageCounters === 0) return state;

  let s = healDamage(state, ctx.player, chosen, 60);

  // Discard an Energy from the healed Pokemon
  const updatedTarget = s.players[ctx.player].active?.instanceId === chosen
    ? s.players[ctx.player].active!
    : s.players[ctx.player].bench.find(b => b.instanceId === chosen)!;

  if (!updatedTarget || updatedTarget.attachedEnergy.length === 0) return s;

  const energyOptions = [...updatedTarget.attachedEnergy];
  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: energyOptions,
    min: 1,
    max: 1,
    reason: 'Super Potion: choose an Energy to discard from the healed Pokemon'
  });

  const energyId = energyChoice[0];
  if (!energyId || !energyOptions.includes(energyId)) return s;

  s = {
    ...s,
    players: {
      ...s.players,
      [ctx.player]: {
        ...s.players[ctx.player],
        active: s.players[ctx.player].active?.instanceId === chosen
          ? { ...s.players[ctx.player].active!, attachedEnergy: s.players[ctx.player].active!.attachedEnergy.filter(e => e !== energyId) }
          : s.players[ctx.player].active,
        bench: s.players[ctx.player].bench.map(b =>
          b.instanceId === chosen
            ? { ...b, attachedEnergy: b.attachedEnergy.filter(e => e !== energyId) }
            : b
        ),
        discard: [...s.players[ctx.player].discard, energyId]
      }
    }
  };

  return s;
}

// Superior Energy Retrieval: Discard 2 other cards, put up to 4 Basic Energy from discard into hand.
function superiorEnergyRetrievalHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  if (ps.hand.length < 2) return state;

  const discardChoice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...ps.hand],
    min: 2,
    max: 2,
    reason: 'Superior Energy Retrieval: discard 2 other cards from your hand'
  });

  if (discardChoice.length < 2) return state;

  let s = discardFromHand(state, ctx.player, discardChoice.slice(0, 2));

  const basicEnergy = s.players[ctx.player].discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return s;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: basicEnergy,
    min: 1,
    max: Math.min(4, basicEnergy.length),
    reason: 'Superior Energy Retrieval: choose up to 4 Basic Energy from discard'
  });

  for (const id of choice.slice(0, 4)) {
    if (s.players[ctx.player].discard.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'discard');
    }
  }

  return s;
}

// Team Rocket's Bother-Bot: no-op (face-down prize manipulation too complex for v1)
function teamRocketsBotherBotHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// Team Rocket's Great Ball: Flip coin; search for Evolution TR Pokemon (heads) or Basic TR Pokemon (tails).
function teamRocketsGreatBallHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, "Team Rocket's Great Ball");

  const isHeads = result === 'heads';
  const { candidates } = searchDeck(newState, ctx.player, {
    custom: (def) => {
      if (def.cardType !== 'Pokemon') return false;
      if (!def.name.startsWith("Team Rocket's")) return false;
      if (isHeads) return def.stage !== 'Basic';
      return def.stage === 'Basic';
    }
  }, 999);

  if (candidates.length === 0) return shuffleDeck(newState, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: `Team Rocket's Great Ball: choose a ${isHeads ? 'Evolution' : 'Basic'} Team Rocket's Pokemon`
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(newState, ctx.player);

  let s = moveToHand(newState, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Team Rocket's Transceiver: Search deck for a Supporter with 'Team Rocket' in its name.
function teamRocketsTransceiverHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('Supporter') && def.name.includes('Team Rocket')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: "Team Rocket's Transceiver: choose a Team Rocket Supporter"
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Team Rocket's Venture Bomb: Flip coin; heads = 2 counters on opponent's Pokemon, tails = 2 on own Active.
function teamRocketsVentureBombHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, "Team Rocket's Venture Bomb");
  const opponent = otherPlayer(ctx.player);

  if (result === 'heads') {
    const opState = newState.players[opponent];
    const opOptions = [opState.active, ...opState.bench].filter(Boolean).map(p => p!.instanceId);
    if (opOptions.length === 0) return newState;

    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options: opOptions,
      min: 1,
      max: 1,
      reason: "Team Rocket's Venture Bomb: choose opponent's Pokemon to place 2 damage counters"
    });

    const chosen = choice[0];
    if (!chosen) return newState;

    return placeDamageCountersOn(newState, chosen, 2, "Team Rocket's Venture Bomb");
  } else {
    const myActive = newState.players[ctx.player].active;
    if (!myActive) return newState;
    return placeDamageCountersOn(newState, myActive.instanceId, 2, "Team Rocket's Venture Bomb");
  }
}

// Tera Orb: Search deck for a Tera Pokemon.
function teraOrbHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Pokemon' && def.subtypes.includes('Tera')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Tera Orb: choose a Tera Pokemon'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// TM Machine: Search deck for up to 3 Pokemon Tools with 'Technical Machine' in their name.
function tmMachineHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('PokemonTool') && def.name.includes('Technical Machine')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: Math.min(3, candidates.length),
    reason: 'TM Machine: choose up to 3 Technical Machine Pokemon Tools'
  });

  let s = state;
  for (const id of choice.slice(0, 3)) {
    if (s.players[ctx.player].deck.includes(id)) {
      s = moveToHand(s, ctx.player, id, 'deck');
    }
  }
  s = shuffleDeck(s, ctx.player);
  return s;
}

// Tool Scrapper: Choose up to 2 Pokemon Tools from any Pokemon (either side) and discard them.
function toolScrapperHandler(state: GameState, ctx: TrainerContext): GameState {
  const opponent = otherPlayer(ctx.player);
  const allTools: Array<{ toolId: string; pokemonId: string; owner: typeof ctx.player }> = [];

  for (const pid of [ctx.player, opponent] as const) {
    const ps = state.players[pid];
    const allInPlay = [ps.active, ...ps.bench].filter(Boolean) as typeof ps.bench[number][];
    for (const poke of allInPlay) {
      for (const toolId of poke.attachedTools) {
        allTools.push({ toolId, pokemonId: poke.instanceId, owner: pid });
      }
    }
  }

  if (allTools.length === 0) return state;

  const toolOptions = allTools.map(t => t.toolId);
  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: toolOptions,
    min: 1,
    max: Math.min(2, toolOptions.length),
    reason: 'Tool Scrapper: choose up to 2 Pokemon Tools to discard'
  });

  let s = state;
  for (const chosenId of choice.slice(0, 2)) {
    const entry = allTools.find(t => t.toolId === chosenId);
    if (!entry) continue;

    const { pokemonId, owner } = entry;
    s = {
      ...s,
      players: {
        ...s.players,
        [owner]: {
          ...s.players[owner],
          active: s.players[owner].active?.instanceId === pokemonId
            ? { ...s.players[owner].active!, attachedTools: s.players[owner].active!.attachedTools.filter(t => t !== chosenId) }
            : s.players[owner].active,
          bench: s.players[owner].bench.map(b =>
            b.instanceId === pokemonId
              ? { ...b, attachedTools: b.attachedTools.filter(t => t !== chosenId) }
              : b
          ),
          discard: [...s.players[owner].discard, chosenId]
        }
      }
    };
  }

  return s;
}

// Wondrous Patch: Attach Basic Psychic Energy from discard to a Benched Psychic Pokemon.
function wondrousPatchHandler(state: GameState, ctx: TrainerContext): GameState {
  const ps = state.players[ctx.player];
  const psychicBench = ps.bench.filter(b => {
    const def = getTopDef(state, b);
    return def?.types.includes('Psychic');
  });

  if (psychicBench.length === 0) return state;

  const psychicEnergy = ps.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    const def = inst ? state.definitionRegistry.get(inst.definitionId) : undefined;
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Psychic');
  });

  if (psychicEnergy.length === 0) return state;

  const targetChoice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: psychicBench.map(b => b.instanceId),
    min: 1,
    max: 1,
    reason: 'Wondrous Patch: choose a Benched Psychic Pokemon to attach energy to'
  });

  const targetId = targetChoice[0];
  if (!targetId) return state;

  const energyChoice = ctx.choiceResolver({
    type: 'select_energy',
    player: ctx.player,
    options: psychicEnergy,
    min: 1,
    max: 1,
    reason: 'Wondrous Patch: choose a Basic Psychic Energy from discard'
  });

  const energyId = energyChoice[0];
  if (!energyId || !ps.discard.includes(energyId)) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [ctx.player]: {
        ...ps,
        discard: ps.discard.filter(id => id !== energyId),
        bench: ps.bench.map(b =>
          b.instanceId === targetId
            ? { ...b, attachedEnergy: [...b.attachedEnergy, energyId] }
            : b
        )
      }
    }
  };
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerAllItems(): void {
  // ACE SPEC Items
  registerTrainerEffect('Brilliant Blender', brilliantBlenderHandler);
  registerTrainerEffect('Dangerous Laser', dangerousLaserHandler);
  registerTrainerEffect('Energy Search Pro', energySearchProHandler);
  registerTrainerEffect('Hyper Aroma', hyperAromaHandler);
  registerTrainerEffect('Master Ball', masterBallHandler);
  registerTrainerEffect('Max Rod', maxRodHandler);
  registerTrainerEffect('Megaton Blower', megatonBlowerHandler);
  registerTrainerEffect('Miracle Headset', miracleHeadsetHandler);
  registerTrainerEffect('Poké Vital A', pokeVitalAHandler);
  registerTrainerEffect('Poke Vital A', pokeVitalAHandler);
  registerTrainerEffect('Precious Trolley', preciousTrolleyHandler);
  registerTrainerEffect('Prime Catcher', primeCatcherHandler);
  registerTrainerEffect('Scoop Up Cyclone', scoopUpCycloneHandler);
  registerTrainerEffect('Scramble Switch', scrambleSwitchHandler);
  registerTrainerEffect('Secret Box', secretBoxHandler);
  registerTrainerEffect('Treasure Tracker', treasureTrackerHandler);
  registerTrainerEffect('Unfair Stamp', unfairStampHandler);
  // Ancient/Future Items
  registerTrainerEffect('Awakening Drum', awakeningDrumHandler);
  registerTrainerEffect('Earthen Vessel', earthenVesselHandler);
  registerTrainerEffect('Reboot Pod', rebootPodHandler);
  registerTrainerEffect('Techno Radar', technoRadarHandler);
  // Regular Items
  registerTrainerEffect('Accompanying Flute', accompanyingFluteHandler);
  registerTrainerEffect('Cover Fossil', fossilNoOpHandler);
  registerTrainerEffect('Dome Fossil', fossilNoOpHandler);
  registerTrainerEffect('Helix Fossil', fossilNoOpHandler);
  registerTrainerEffect('Old Amber Fossil', fossilNoOpHandler);
  registerTrainerEffect('Plume Fossil', fossilNoOpHandler);
  registerTrainerEffect('Root Fossil', fossilNoOpHandler);
  registerTrainerEffect("Arven's Sandwich", arvensSandwichHandler);
  registerTrainerEffect('Blowtorch', blowtorchHandler);
  registerTrainerEffect('Boxed Order', boxedOrderHandler);
  registerTrainerEffect('Buddy-Buddy Poffin', buddyBuddyPoffinHandler);
  registerTrainerEffect('Bug Catching Set', bugCatchingSetHandler);
  registerTrainerEffect('Call Bell', callBellHandler);
  registerTrainerEffect('Chill Teaser Toy', chillTeaserToyHandler);
  registerTrainerEffect('Counter Catcher', counterCatcherHandler);
  registerTrainerEffect('Crushing Hammer', crushingHammerHandler);
  registerTrainerEffect('Deduction Kit', deductionKitHandler);
  registerTrainerEffect('Delivery Drone', deliveryDroneHandler);
  registerTrainerEffect('Dragon Elixir', dragonElixirHandler);
  registerTrainerEffect('Dusk Ball', duskBallHandler);
  registerTrainerEffect('Electric Generator', electricGeneratorHandler);
  registerTrainerEffect('Energy Coin', energyCoinHandler);
  registerTrainerEffect('Energy Recycler', energyRecyclerHandler);
  registerTrainerEffect('Energy Search', energySearchHandler);
  registerTrainerEffect('Energy Sticker', energyStickerHandler);
  registerTrainerEffect('Energy Switch', energySwitchHandler);
  registerTrainerEffect('Enhanced Hammer', enhancedHammerHandler);
  registerTrainerEffect('Fighting Au Lait', fightingAuLaitHandler);
  registerTrainerEffect('Fighting Gong', fightingGongHandler);
  registerTrainerEffect('Glass Trumpet', glassTrumpetHandler);
  registerTrainerEffect('Grabber', grabberHandler);
  registerTrainerEffect('Great Ball', greatBallHandler);
  registerTrainerEffect('Hand Trimmer', handTrimmerHandler);
  registerTrainerEffect("Hop's Bag", hopsBagHandler);
  registerTrainerEffect('Iron Defender', ironDefenderHandler);
  registerTrainerEffect('Jumbo Ice Cream', jumboIceCreamHandler);
  registerTrainerEffect('Letter of Encouragement', letterOfEncouragementHandler);
  registerTrainerEffect('Love Ball', loveBallHandler);
  registerTrainerEffect('Meddling Memo', meddlingMemoHandler);
  registerTrainerEffect('Mega Signal', megaSignalHandler);
  registerTrainerEffect("N's PP Up", nsPpUpHandler);
  registerTrainerEffect("Nemona's Backpack", nemonaBackpackHandler);
  registerTrainerEffect('Night Stretcher', nightStretcherHandler);
  registerTrainerEffect("Ogre's Mask", ogresMaskHandler);
  registerTrainerEffect('Picnic Basket', picnicBasketHandler);
  registerTrainerEffect('Poké Ball', pokeBallHandler);
  registerTrainerEffect('Poke Ball', pokeBallHandler);
  registerTrainerEffect('Pokémon Catcher', pokemonCatcherHandler);
  registerTrainerEffect('Pokemon Catcher', pokemonCatcherHandler);
  registerTrainerEffect('Potion', potionHandler);
  registerTrainerEffect('Premium Power Pro', premiumPowerProHandler);
  registerTrainerEffect('Redeemable Ticket', redeemableTicketHandler);
  registerTrainerEffect('Repel', repelHandler);
  registerTrainerEffect('Roto-Stick', rotoStickHandler);
  registerTrainerEffect('Sacred Ash', sacredAshHandler);
  registerTrainerEffect('Snorlax Doll', snorlaxDollHandler);
  registerTrainerEffect('Strange Timepiece', strangeTimepieceHandler);
  registerTrainerEffect('Super Potion', superPotionHandler);
  registerTrainerEffect('Superior Energy Retrieval', superiorEnergyRetrievalHandler);
  registerTrainerEffect("Team Rocket's Bother-Bot", teamRocketsBotherBotHandler);
  registerTrainerEffect("Team Rocket's Great Ball", teamRocketsGreatBallHandler);
  registerTrainerEffect("Team Rocket's Transceiver", teamRocketsTransceiverHandler);
  registerTrainerEffect("Team Rocket's Venture Bomb", teamRocketsVentureBombHandler);
  registerTrainerEffect('Tera Orb', teraOrbHandler);
  registerTrainerEffect('TM Machine', tmMachineHandler);
  registerTrainerEffect('Tool Scrapper', toolScrapperHandler);
  registerTrainerEffect('Wondrous Patch', wondrousPatchHandler);
}

registerAllItems();
