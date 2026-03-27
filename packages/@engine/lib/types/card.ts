// Core card type definitions for the Pokemon TCG game engine.
// All types are readonly — no mutable state anywhere in the engine.

export const ENERGY_TYPES = [
  'Grass', 'Fire', 'Water', 'Lightning', 'Psychic',
  'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'
] as const;

export type EnergyType = typeof ENERGY_TYPES[number];

// Standard-legal stages only.
// NOTE: MegaEvolutionEx is a subtype, NOT a stage — Mega Evolution ex cards print
// a real stage (Basic/Stage1/Stage2). (Rulebook Appendix 1, p.23)
export type PokemonStage = 'Basic' | 'Stage1' | 'Stage2';

// Standard-legal subtypes only.
export type PokemonSubtype = 'ex' | 'MegaEvolutionEx' | 'Tera' | 'Ancient' | 'Future';

export interface AttackDefinition {
  readonly name: string;
  readonly cost: ReadonlyArray<EnergyType>;
  readonly damage: number;
  readonly damageModifier: '+' | '-' | 'x' | null;
  readonly text: string;
  readonly effectId: string | null;
}

export interface AbilityDefinition {
  readonly name: string;
  readonly text: string;
  readonly type: 'Ability';
  readonly effectId: string;
}

export interface WeaknessDefinition {
  readonly type: EnergyType;
  readonly value: string;
}

export interface ResistanceDefinition {
  readonly type: EnergyType;
  readonly value: string;
}

export interface PokemonCardDefinition {
  readonly cardType: 'Pokemon';
  readonly id: string;
  readonly name: string;
  readonly stage: PokemonStage;
  readonly subtypes: ReadonlyArray<PokemonSubtype>;
  readonly hp: number;
  readonly types: ReadonlyArray<EnergyType>;
  readonly evolvesFrom: string | null;
  readonly attacks: ReadonlyArray<AttackDefinition>;
  readonly abilities: ReadonlyArray<AbilityDefinition>;
  readonly weaknesses: ReadonlyArray<WeaknessDefinition>;
  readonly resistances: ReadonlyArray<ResistanceDefinition>;
  readonly retreatCost: number;
  readonly rules: ReadonlyArray<string>;
  readonly prizeValue: 1 | 2 | 3;
  readonly regulationMark: string | null;
}

// TECHNICAL MACHINE RULES (rulebook glossary p.44):
// TMs are a Trainer subtype that attach to a Pokemon like a Tool, granting access
// to the TM's attack. A Pokemon can have at most 1 Tool OR 1 TM (they share the slot).
// TMs remain attached unless card text says otherwise — auto-discard is NOT universal.
export type TrainerSubtype =
  | 'Item'
  | 'Supporter'
  | 'Stadium'
  | 'PokemonTool'
  | 'TechnicalMachine'
  | 'AceSpec';

export interface TrainerCardDefinition {
  readonly cardType: 'Trainer';
  readonly id: string;
  readonly name: string;
  readonly subtypes: ReadonlyArray<TrainerSubtype>;
  readonly rules: ReadonlyArray<string>;
  readonly effectId: string;
}

export type EnergySubtype = 'Basic' | 'Special';

export interface EnergyCardDefinition {
  readonly cardType: 'Energy';
  readonly id: string;
  readonly name: string;
  readonly subtype: EnergySubtype;
  readonly provides: ReadonlyArray<EnergyType>;
  readonly rules: ReadonlyArray<string>;
  readonly effectId: string | null;
  // NOTE: ACE SPEC cards can be either Trainer or Special Energy (Rulebook Appendix 3, p.25).
  readonly isAceSpec: boolean;
}

export type CardDefinition =
  | PokemonCardDefinition
  | TrainerCardDefinition
  | EnergyCardDefinition;
