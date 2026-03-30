import type { GameState } from '../types/game';
import type { TrainerCardDefinition } from '../types/card';
import type { TrainerContext } from './registry';
import { registerTrainerEffect } from './registry';
import {
  drawCards,
  discardFromHand,
  searchDeck,
  shuffleDeck,
  moveToHand,
  moveToDeck,
  putOnBench,
  switchActive,
  healDamage,
  flipCoin,
  getTopDef
} from './primitives';
import { canEvolve, evolvePokemon } from '../core/evolution';
import { registerEventHook } from '../core/events';
import type { EventHookPayload, EventHookResult } from '../core/events';
import { placeDamageCountersOn } from '../core/combat';

function getStadiumDef(state: GameState): TrainerCardDefinition | null {
  if (!state.stadium) return null;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' ? def : null;
}

// ─── Academy at Night ───────────────────────────────────────────────────
// Once per turn: put a card from hand on top of deck.

function academyAtNightHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (player.hand.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: [...player.hand],
    min: 1,
    max: 1,
    reason: 'Academy at Night: choose a card to put on top of your deck'
  });

  const chosen = choice[0];
  if (!chosen || !player.hand.includes(chosen)) return state;

  return moveToDeck(state, ctx.player, chosen, 'hand');
}

// ─── Area Zero Underdepths ──────────────────────────────────────────────
// passive: requires bench-size hook

function areaZeroUnderdepthsHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Battle Cage ────────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (damage pipeline)

function battleCageHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Beach Court ────────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (retreat cost)

function beachCourtHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Calamitous Snowy Mountain ──────────────────────────────────────────
// trigger: requires energy-attach event hook

function calamitousSnowyMountainHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Calamitous Wasteland ───────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (retreat cost)

function calamitousWastelandHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Community Center ───────────────────────────────────────────────────
// Once per turn: if you played a Supporter this turn, heal 10 from each of your Pokemon.

function communityCenterHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (!player.supporterPlayedThisTurn) return state;

  let s = state;
  const allInPlay = [player.active, ...player.bench].filter(Boolean) as typeof player.bench[number][];

  for (const pokemon of allInPlay) {
    s = healDamage(s, ctx.player, pokemon.instanceId, 10);
  }

  return s;
}

// ─── Cycling Road ───────────────────────────────────────────────────────
// Once per turn: discard a Basic Energy from hand to draw a card.

function cyclingRoadHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];

  const basicEnergy = player.hand.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Basic';
  });

  if (basicEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: basicEnergy,
    min: 1,
    max: 1,
    reason: 'Cycling Road: discard a Basic Energy to draw a card'
  });

  const chosen = choice[0];
  if (!chosen || !basicEnergy.includes(chosen)) return state;

  let s = discardFromHand(state, ctx.player, [chosen]);
  s = drawCards(s, ctx.player, 1);
  return s;
}

// ─── Dizzying Valley ────────────────────────────────────────────────────
// passive: requires confusion recovery hook

function dizzyingValleyHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Festival Grounds ───────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (condition immunity)

function festivalGroundsHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Forest of Vitality ─────────────────────────────────────────────────
// passive: requires evolution-turn-check hook

function forestOfVitalityHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Full Metal Lab ─────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (damage pipeline)

function fullMetalLabHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Grand Tree ─────────────────────────────────────────────────────────
// ACE SPEC. Once per turn: search for Stage 1 that evolves from a Basic, evolve.

function grandTreeHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  const allInPlay = [player.active, ...player.bench].filter(Boolean) as typeof player.bench[number][];

  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Pokemon',
    stage: 'Stage1'
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const validPairs: Array<{ stage1Id: string; targetId: string }> = [];

  for (const stage1Id of candidates) {
    const stage1Def = state.definitionRegistry.get(
      state.cardRegistry.get(stage1Id)?.definitionId ?? ''
    );
    if (!stage1Def || stage1Def.cardType !== 'Pokemon') continue;

    for (const target of allInPlay) {
      if (canEvolve(stage1Def, target, state, {})) {
        validPairs.push({ stage1Id, targetId: target.instanceId });
      }
    }
  }

  if (validPairs.length === 0) return shuffleDeck(state, ctx.player);

  const options = validPairs.map(p => `${p.stage1Id}:${p.targetId}`);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Grand Tree: choose a Stage 1 and target Basic to evolve'
  });

  const picked = choice[0];
  if (!picked) return shuffleDeck(state, ctx.player);

  const [stage1Id, targetId] = picked.split(':');
  if (!stage1Id || !targetId) return shuffleDeck(state, ctx.player);

  let s = evolvePokemon(state, stage1Id, targetId);
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Granite Cave ───────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (damage pipeline)

function graniteCaveHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Gravity Mountain ───────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (HP modifier)

function gravityMountainHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Jamming Tower ──────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (Jamming Tower suppression)

function jammingTowerHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Levincia ───────────────────────────────────────────────────────────
// Once per turn: put up to 2 Basic Lightning Energy from discard into hand.

function levinciaHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];

  const lightningEnergy = player.discard.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Lightning');
  });

  if (lightningEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: lightningEnergy,
    min: 1,
    max: Math.min(2, lightningEnergy.length),
    reason: 'Levincia: choose up to 2 Basic Lightning Energy from discard'
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

// ─── Lively Stadium ────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (HP modifier)

function livelyStadiumHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Mesagoza ───────────────────────────────────────────────────────────
// Once per turn: flip a coin. If heads, search deck for a Pokemon → hand.

function mesagozaHandler(state: GameState, ctx: TrainerContext): GameState {
  const { result, newState } = flipCoin(state, 'Mesagoza');
  if (result === 'tails') return newState;

  const { candidates } = searchDeck(newState, ctx.player, { supertype: 'Pokemon' }, 999);
  if (candidates.length === 0) return shuffleDeck(newState, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Mesagoza: choose a Pokemon to put in your hand'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(newState, ctx.player);

  let s = moveToHand(newState, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Moonlit Hill ───────────────────────────────────────────────────────
// Once per turn: discard a Basic Psychic Energy from hand to heal 30 from each of your Pokemon.

function moonlitHillHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];

  const psychicEnergy = player.hand.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy' && def.subtype === 'Basic' && def.provides.includes('Psychic');
  });

  if (psychicEnergy.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: psychicEnergy,
    min: 1,
    max: 1,
    reason: 'Moonlit Hill: discard a Basic Psychic Energy to heal 30 from each Pokemon'
  });

  const chosen = choice[0];
  if (!chosen || !psychicEnergy.includes(chosen)) return state;

  let s = discardFromHand(state, ctx.player, [chosen]);

  const updatedPlayer = s.players[ctx.player];
  const allInPlay = [updatedPlayer.active, ...updatedPlayer.bench].filter(Boolean) as typeof updatedPlayer.bench[number][];

  for (const pokemon of allInPlay) {
    s = healDamage(s, ctx.player, pokemon.instanceId, 30);
  }

  return s;
}

// ─── Mystery Garden ─────────────────────────────────────────────────────
// Once per turn: discard an Energy from hand, draw cards until hand size = Psychic Pokemon in play.

function mysteryGardenHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];

  const energyInHand = player.hand.filter(id => {
    const inst = state.cardRegistry.get(id);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Energy';
  });

  if (energyInHand.length === 0) return state;

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: energyInHand,
    min: 1,
    max: 1,
    reason: 'Mystery Garden: discard an Energy card'
  });

  const chosen = choice[0];
  if (!chosen || !energyInHand.includes(chosen)) return state;

  let s = discardFromHand(state, ctx.player, [chosen]);

  const updatedPlayer = s.players[ctx.player];
  const allInPlay = [updatedPlayer.active, ...updatedPlayer.bench].filter(Boolean) as typeof updatedPlayer.bench[number][];

  let psychicCount = 0;
  for (const pokemon of allInPlay) {
    const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
    const inst = s.cardRegistry.get(topId);
    if (!inst) continue;
    const def = s.definitionRegistry.get(inst.definitionId);
    if (def?.cardType === 'Pokemon' && def.types.includes('Psychic')) {
      psychicCount++;
    }
  }

  const currentHandSize = s.players[ctx.player].hand.length;
  const toDraw = Math.max(0, psychicCount - currentHandSize);

  if (toDraw > 0) {
    s = drawCards(s, ctx.player, toDraw);
  }

  return s;
}

// ─── N's Castle ─────────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (retreat cost)

function nsCastleHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Neutralization Zone ────────────────────────────────────────────────
// ACE SPEC. passive: requires damage pipeline hook

function neutralizationZoneHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Nighttime Mine ─────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (attack cost)

function nighttimeMineHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Paradise Resort ────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (retreat cost)

function paradiseResortHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Perilous Jungle ────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (checkup/poison)

function perilousJungleHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Pokemon League Headquarters ────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (attack cost)

function pokemonLeagueHQHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Postwick ───────────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (damage pipeline)

function postwickHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Practice Studio ────────────────────────────────────────────────────
// modifier-only: logic in core/modifiers.ts (damage pipeline)

function practiceStudioHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Risky Ruins ────────────────────────────────────────────────────────
// trigger: requires bench-placement event hook

function riskyRuinsHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Spikemuth Gym ──────────────────────────────────────────────────────
// Once per turn: search deck for a Marnie's Pokemon → hand.

function spikemuthGymHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Pokemon',
    custom: (def) => def.cardType === 'Pokemon' && def.name.startsWith("Marnie's")
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: "Spikemuth Gym: choose a Marnie's Pokemon to put in your hand"
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Surfing Beach ──────────────────────────────────────────────────────
// Once per turn: switch Active Water Pokemon with Benched Water Pokemon.

function surfingBeachHandler(state: GameState, ctx: TrainerContext): GameState {
  const player = state.players[ctx.player];
  if (!player.active || player.bench.length === 0) return state;

  const activeTopId = player.active.evolutionStack[player.active.evolutionStack.length - 1] ?? player.active.instanceId;
  const activeInst = state.cardRegistry.get(activeTopId);
  const activeDef = activeInst ? state.definitionRegistry.get(activeInst.definitionId) : undefined;
  if (!activeDef || activeDef.cardType !== 'Pokemon' || !activeDef.types.includes('Water')) return state;

  const waterBench = player.bench.filter(b => {
    const topId = b.evolutionStack[b.evolutionStack.length - 1] ?? b.instanceId;
    const inst = state.cardRegistry.get(topId);
    if (!inst) return false;
    const def = state.definitionRegistry.get(inst.definitionId);
    return def?.cardType === 'Pokemon' && def.types.includes('Water');
  });

  if (waterBench.length === 0) return state;

  const options = waterBench.map(b => b.instanceId);
  const choice = ctx.choiceResolver({
    type: 'select_pokemon',
    player: ctx.player,
    options,
    min: 1,
    max: 1,
    reason: 'Surfing Beach: choose a Benched Water Pokemon to switch with Active'
  });

  const chosen = choice[0];
  if (!chosen || !options.includes(chosen)) return state;

  return switchActive(state, ctx.player, chosen);
}

// ─── Team Rocket's Factory ──────────────────────────────────────────────
// Once per turn: if you played a "Team Rocket" Supporter this turn, draw 2 cards.

function teamRocketsFactoryHandler(state: GameState, ctx: TrainerContext): GameState {
  // supporterPlayedThisTurn tracks if any Supporter was played.
  // For v1 we check that flag; precise name-matching requires event log inspection.
  const player = state.players[ctx.player];
  if (!player.supporterPlayedThisTurn) return state;

  return drawCards(state, ctx.player, 2);
}

// ─── Team Rocket's Watchtower ───────────────────────────────────────────
// passive: requires ability-lock hook

function teamRocketsWatchtowerHandler(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

// ─── Town Store ─────────────────────────────────────────────────────────
// Once per turn: search deck for a Pokemon Tool → hand.

function townStoreHandler(state: GameState, ctx: TrainerContext): GameState {
  const { candidates } = searchDeck(state, ctx.player, {
    supertype: 'Trainer',
    custom: (def) => def.cardType === 'Trainer' && def.subtypes.includes('PokemonTool')
  }, 999);

  if (candidates.length === 0) return shuffleDeck(state, ctx.player);

  const choice = ctx.choiceResolver({
    type: 'select_cards',
    player: ctx.player,
    options: candidates,
    min: 1,
    max: 1,
    reason: 'Town Store: choose a Pokemon Tool to put in your hand'
  });

  const chosen = choice[0];
  if (!chosen || !candidates.includes(chosen)) return shuffleDeck(state, ctx.player);

  let s = moveToHand(state, ctx.player, chosen, 'deck');
  s = shuffleDeck(s, ctx.player);
  return s;
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerAllStadiums(): void {
  registerTrainerEffect('Academy at Night', academyAtNightHandler);
  registerTrainerEffect('Area Zero Underdepths', areaZeroUnderdepthsHandler);
  // Artazon: already registered in trainers.ts
  registerTrainerEffect('Battle Cage', battleCageHandler);
  registerTrainerEffect('Beach Court', beachCourtHandler);
  registerTrainerEffect('Calamitous Snowy Mountain', calamitousSnowyMountainHandler);
  registerTrainerEffect('Calamitous Wasteland', calamitousWastelandHandler);
  registerTrainerEffect('Community Center', communityCenterHandler);
  registerTrainerEffect('Cycling Road', cyclingRoadHandler);
  registerTrainerEffect('Dizzying Valley', dizzyingValleyHandler);
  registerTrainerEffect('Festival Grounds', festivalGroundsHandler);
  registerTrainerEffect('Forest of Vitality', forestOfVitalityHandler);
  registerTrainerEffect('Full Metal Lab', fullMetalLabHandler);
  registerTrainerEffect('Grand Tree', grandTreeHandler);
  registerTrainerEffect('Granite Cave', graniteCaveHandler);
  registerTrainerEffect('Gravity Mountain', gravityMountainHandler);
  registerTrainerEffect('Jamming Tower', jammingTowerHandler);
  registerTrainerEffect('Levincia', levinciaHandler);
  registerTrainerEffect('Lively Stadium', livelyStadiumHandler);
  registerTrainerEffect('Mesagoza', mesagozaHandler);
  registerTrainerEffect('Moonlit Hill', moonlitHillHandler);
  registerTrainerEffect('Mystery Garden', mysteryGardenHandler);
  registerTrainerEffect("N's Castle", nsCastleHandler);
  registerTrainerEffect('Neutralization Zone', neutralizationZoneHandler);
  registerTrainerEffect('Nighttime Mine', nighttimeMineHandler);
  registerTrainerEffect('Paradise Resort', paradiseResortHandler);
  registerTrainerEffect('Perilous Jungle', perilousJungleHandler);
  registerTrainerEffect('Pokemon League Headquarters', pokemonLeagueHQHandler);
  registerTrainerEffect('Postwick', postwickHandler);
  registerTrainerEffect('Practice Studio', practiceStudioHandler);
  registerTrainerEffect('Risky Ruins', riskyRuinsHandler);
  registerTrainerEffect('Spikemuth Gym', spikemuthGymHandler);
  registerTrainerEffect('Surfing Beach', surfingBeachHandler);
  registerTrainerEffect("Team Rocket's Factory", teamRocketsFactoryHandler);
  registerTrainerEffect("Team Rocket's Watchtower", teamRocketsWatchtowerHandler);
  registerTrainerEffect('Town Store', townStoreHandler);
}

registerAllStadiums();

// ─── Event Hooks ─────────────────────────────────────────────────────────

registerEventHook({
  id: 'calamitous_snowy_mountain',
  hookType: 'energy_attached',
  handler(state: GameState, payload: EventHookPayload): EventHookResult {
    if (payload.type !== 'energy_attached') return { handled: false };
    const stadiumDef = getStadiumDef(state);
    if (stadiumDef?.name !== 'Calamitous Snowy Mountain') return { handled: false };

    const { targetInstanceId, player } = payload.data;
    const playerState = state.players[player];
    const target = playerState.active?.instanceId === targetInstanceId
      ? playerState.active
      : playerState.bench.find(b => b.instanceId === targetInstanceId);
    if (!target) return { handled: false };

    const targetDef = getTopDef(state, target);
    if (!targetDef) return { handled: false };
    if (targetDef.stage !== 'Basic' || targetDef.types.includes('Water')) return { handled: false };

    const newState = placeDamageCountersOn(state, targetInstanceId, 2, 'Calamitous Snowy Mountain');
    return { handled: true, newState };
  }
});

registerEventHook({
  id: 'risky_ruins',
  hookType: 'pokemon_benched',
  handler(state: GameState, payload: EventHookPayload): EventHookResult {
    if (payload.type !== 'pokemon_benched') return { handled: false };
    const stadiumDef = getStadiumDef(state);
    if (stadiumDef?.name !== 'Risky Ruins') return { handled: false };

    const { pokemonInstanceId, player } = payload.data;
    const playerState = state.players[player];
    const benched = playerState.bench.find(b => b.instanceId === pokemonInstanceId);
    if (!benched) return { handled: false };

    const benchedDef = getTopDef(state, benched);
    if (!benchedDef) return { handled: false };
    if (benchedDef.stage !== 'Basic' || benchedDef.types.includes('Darkness')) return { handled: false };

    const newState = placeDamageCountersOn(state, pokemonInstanceId, 2, 'Risky Ruins');
    return { handled: true, newState };
  }
});
