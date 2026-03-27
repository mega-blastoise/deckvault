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
  TemporalEffect
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

export type { EffectContext, EffectHandler } from './effects/registry';
export { registerEffect, resolveEffect } from './effects/registry';
