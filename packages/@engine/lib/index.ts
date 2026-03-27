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
