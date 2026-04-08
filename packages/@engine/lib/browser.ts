// Browser-safe re-exports from @pokemon/engine.
// Excludes adapter.ts (bun:sqlite) and simulation/runner.ts (imports adapter).
// Safe for use in Web Workers and browser bundles.

export { ROTATION_DATE, PRE_ROTATION_MARKS, POST_ROTATION_MARKS, getLegalRegulationMarks } from './adapter-format';

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

export { applySpecialCondition, removeSpecialCondition, clearSpecialConditions } from './core/conditions';

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

export type { AiStrategy, AiConfig, ScoredAction } from './ai/types';
export { RandomStrategy, GreedyStrategy } from './ai/strategy';
export { playTurn, runSetupPhase, simulateGame } from './ai/player';
export { evaluateBoard } from './ai/evaluate';
