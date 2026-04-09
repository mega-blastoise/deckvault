import type { PlayerId } from './game';

export type TemporalEffectType =
  | 'damage_modifier'
  | 'damage_reduction'
  | 'damage_prevention'
  | 'attack_prevention'
  | 'ability_lock'
  | 'retreat_prevention'
  | 'attack_lock'
  | 'prize_modifier';

export type EffectSourceType = 'attack' | 'ability' | 'trainer' | 'stadium';

export type EffectExpiry =
  | 'end_of_turn'
  | 'end_of_opponent_turn'
  | 'end_of_next_turn'
  | 'permanent';

export interface TemporalEffect {
  readonly id: string;
  readonly type: TemporalEffectType;
  readonly sourceInstanceId: string;
  readonly sourceType: EffectSourceType;
  readonly targetInstanceId: string | null;
  readonly expiresOnTurn: number | null;
  readonly expiresAt: EffectExpiry | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EffectChoice {
  readonly type: 'select_pokemon' | 'select_cards' | 'select_energy' | 'select_attack' | 'coin_flip_choice';
  readonly player: PlayerId;
  readonly options: ReadonlyArray<string>;
  readonly min: number;
  readonly max: number;
  readonly reason: string;
}

export type ChoiceResolver = (choice: EffectChoice) => ReadonlyArray<string>;
