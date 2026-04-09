import type { PokemonCardDefinition, TrainerCardDefinition } from '../types/card';
import type { GameState, InPlayPokemon, PlayerId, CardInstance } from '../types/game';
import type { ChoiceResolver } from '../types/effect';
import type { GameResult } from '../core/result';
import { ok } from '../core/result';

// ─── Typed Contexts ──────────────────────────────────────────────────────

export interface AttackContext {
  readonly attacker: InPlayPokemon;
  readonly attackerDef: PokemonCardDefinition;
  readonly defender: InPlayPokemon;
  readonly defenderDef: PokemonCardDefinition;
  readonly attackIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly choiceResolver: ChoiceResolver;
}

export interface AbilityContext {
  readonly pokemon: InPlayPokemon;
  readonly pokemonDef: PokemonCardDefinition;
  readonly abilityIndex: number;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly choiceResolver: ChoiceResolver;
}

export interface TrainerContext {
  readonly cardInstance: CardInstance;
  readonly trainerDef: TrainerCardDefinition;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly targets: ReadonlyArray<string>;
  readonly choiceResolver: ChoiceResolver;
}

// ─── Typed Handler Signatures ────────────────────────────────────────────

export type AttackEffectHandler = (state: GameState, context: AttackContext) => GameState;
export type AbilityEffectHandler = (state: GameState, context: AbilityContext) => GameState;
export type TrainerEffectHandler = (state: GameState, context: TrainerContext) => GameState;

// ─── Typed Registries ────────────────────────────────────────────────────

const attackRegistry = new Map<string, AttackEffectHandler>();
const abilityRegistry = new Map<string, AbilityEffectHandler>();
const trainerRegistry = new Map<string, TrainerEffectHandler>();

export function registerAttackEffect(name: string, handler: AttackEffectHandler): void {
  attackRegistry.set(name, handler);
}

export function registerAbilityEffect(name: string, handler: AbilityEffectHandler): void {
  abilityRegistry.set(name, handler);
}

export function registerTrainerEffect(name: string, handler: TrainerEffectHandler): void {
  trainerRegistry.set(name, handler);
}

export function resolveAttackEffect(state: GameState, context: AttackContext): GameState {
  const attack = context.attackerDef.attacks[context.attackIndex];
  if (!attack?.effectId) return state;

  const handler = attackRegistry.get(attack.effectId)
    ?? attackRegistry.get(attack.name);
  if (!handler) return state;
  return handler(state, context);
}

export function resolveAbilityEffect(state: GameState, context: AbilityContext): GameState {
  const ability = context.pokemonDef.abilities[context.abilityIndex];
  if (!ability) return state;

  const handler = abilityRegistry.get(ability.effectId)
    ?? abilityRegistry.get(ability.name);
  if (!handler) return state;
  return handler(state, context);
}

export function resolveTrainerEffect(state: GameState, context: TrainerContext): GameState {
  const handler = trainerRegistry.get(context.trainerDef.effectId)
    ?? trainerRegistry.get(context.trainerDef.name);
  if (!handler) return state;
  return handler(state, context);
}

// ─── Legacy Facade ───────────────────────────────────────────────────────
// Kept for backwards compatibility with combat.ts and turn.ts call sites.

export type EffectContext = {
  readonly state: GameState;
  readonly actingPlayer: PlayerId;
  readonly targets: ReadonlyArray<string>;
  readonly attackContext?: AttackContext;
  readonly abilityContext?: AbilityContext;
  readonly trainerContext?: TrainerContext;
};

export type EffectHandler = (context: EffectContext) => GameResult<GameState>;

const legacyRegistry = new Map<string, EffectHandler>();

export function registerEffect(effectId: string, handler: EffectHandler): void {
  legacyRegistry.set(effectId, handler);
}

export function resolveEffect(effectId: string, context: EffectContext): GameResult<GameState> {
  if (context.attackContext) {
    const result = resolveAttackEffect(context.state, context.attackContext);
    return ok(result);
  }
  if (context.abilityContext) {
    const result = resolveAbilityEffect(context.state, context.abilityContext);
    return ok(result);
  }
  if (context.trainerContext) {
    const result = resolveTrainerEffect(context.state, context.trainerContext);
    return ok(result);
  }

  const handler = legacyRegistry.get(effectId);
  if (!handler) return ok(context.state);
  return handler(context);
}

// ─── Registry Access (for testing) ───────────────────────────────────────

export function getAttackRegistry(): ReadonlyMap<string, AttackEffectHandler> {
  return attackRegistry;
}

export function getTrainerRegistry(): ReadonlyMap<string, TrainerEffectHandler> {
  return trainerRegistry;
}

export function getAbilityRegistry(): ReadonlyMap<string, AbilityEffectHandler> {
  return abilityRegistry;
}
