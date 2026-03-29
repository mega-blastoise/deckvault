// Public API surface for @pokemon/engine.
// Types are re-exported from ./types/index.ts for external consumers.

export type {
  EnergyType,
  PokemonStage,
  PokemonSubtype,
  TrainerSubtype,
  EnergySubtype,
  AttackDefinition,
  AbilityDefinition,
  WeaknessDefinition,
  ResistanceDefinition,
  PokemonCardDefinition,
  TrainerCardDefinition,
  EnergyCardDefinition,
  CardDefinition,
  PlayerId,
  CardInstance,
  SpecialCondition,
  InPlayPokemon,
  PlayerState,
  GamePhase,
  StadiumState,
  TurnFlags,
  GameState,
  PlayerAction,
  GameEvent,
  WinReason,
  TemporalEffect,
  TemporalEffectType,
  EffectSourceType,
  EffectExpiry,
  EffectChoice,
  ChoiceResolver
} from './types/index';

export { ENERGY_TYPES } from './types/index';

export type { RngState } from './rng';
export { coinFlip, shuffle, randomInt, createRngState } from './rng';

export type { SqliteCardRow, DeckValidationResult } from './adapter';
export {
  adaptCardRow,
  adaptPokemonRow,
  adaptTrainerRow,
  adaptEnergyRow,
  loadStandardCardPool,
  isStandardLegal,
  getLegalRegulationMarks,
  validateAceSpec,
  ROTATION_DATE,
  PRE_ROTATION_MARKS,
  POST_ROTATION_MARKS
} from './adapter';

export {
  applySpecialCondition,
  removeSpecialCondition,
  clearSpecialConditions
} from './core/conditions';

export type { GameErrorCode, GameError, GameResult } from './core/result';
export { ok, err } from './core/result';

export type { GameConfig } from './core/game';
export {
  createGame,
  checkWinConditions,
  handleKnockOut,
  promoteFromBench,
  otherPlayer
} from './core/game';

export { validateDeck } from './core/validation';
export { hasBasicPokemon } from './core/setup';
export { canPayEnergyCost, canPayRetreatCost } from './core/energy';
export { canEvolve, evolvePokemon } from './core/evolution';
export { performCheckup } from './core/checkup';
export { startTurn, endTurn, getLegalActions, applyAction } from './core/turn';

export type {
  DamageOutputModifierResult,
  DamageInputModifierResult,
  RetreatCostModifierResult,
  HpModifierResult,
  AttackCostModifierResult,
  PrizeModifierResult,
  SurvivalResult
} from './core/modifiers';
export {
  getDamageOutputModifiers,
  getDamageInputModifiers,
  getRetreatCostModifiers,
  getEffectiveRetreatCost,
  getAttackCostModifiers,
  getEffectiveAttackCost,
  getHpModifiers,
  getEffectiveHp,
  getEffectiveHpById,
  modifyPrizeCount,
  checkSurvivalEffects,
  resolveOnDamageTriggers,
  resolveOnKOTriggers,
  getPoisonModifiers,
  checkConditionImmunity,
  isJammingTowerActive,
  isNeutralizationZoneActive
} from './core/modifiers';

export type { DamageCalculation } from './core/combat';
export {
  resolveAttack,
  calculateDamage,
  resolveWeakness,
  resolveResistance,
  resolveConfusion,
  dealBenchDamage,
  dealSelfDamage,
  discardEnergyFromPokemon,
  checkKnockOuts,
  placeDamageCountersOn
} from './core/combat';

export type {
  EffectContext,
  EffectHandler,
  AttackContext,
  AbilityContext,
  TrainerContext,
  AttackEffectHandler,
  AbilityEffectHandler,
  TrainerEffectHandler
} from './effects/registry';
export {
  registerEffect,
  resolveEffect,
  registerAttackEffect,
  registerAbilityEffect,
  registerTrainerEffect,
  resolveAttackEffect,
  resolveAbilityEffect,
  resolveTrainerEffect
} from './effects/registry';

import './effects/tools';
import './effects/stadiums';
import './effects/trainers';
import './effects/items';
import './effects/supporters';

export type { CardFilter, SearchResult, Zone } from './effects/primitives';
export {
  drawCards as effectDrawCards,
  discardFromHand,
  searchDeck,
  shuffleDeck,
  moveToHand,
  moveToDeck,
  moveToDeckBottom,
  discardEnergy as effectDiscardEnergy,
  discardAllEnergy,
  moveEnergy,
  attachEnergyFromDeck,
  switchActive,
  putOnBench,
  flipCoin as effectFlipCoin,
  flipCoins,
  healDamage,
  healAllDamage,
  applyCondition,
  removeCondition
} from './effects/primitives';
