import type { PlayerId, SpecialCondition } from './game';

export type WinReason = 'all_prizes_taken' | 'no_pokemon_in_play' | 'deck_out' | 'tiebreaker';

export type GameEvent =
  | { readonly type: 'GAME_STARTED'; readonly seed: number }
  | { readonly type: 'COIN_FLIPPED'; readonly result: 'heads' | 'tails'; readonly reason: string }
  | { readonly type: 'CARD_DRAWN'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'BASIC_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string; readonly zone: 'active' | 'bench' }
  | { readonly type: 'POKEMON_EVOLVED'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly evolutionInstanceId: string }
  | { readonly type: 'ENERGY_ATTACHED'; readonly player: PlayerId; readonly energyInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'TOOL_ATTACHED'; readonly player: PlayerId; readonly toolInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'TRAINER_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'ABILITY_USED'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly abilityName: string }
  | { readonly type: 'ATTACK_DECLARED'; readonly player: PlayerId; readonly attackName: string; readonly attackerInstanceId: string }
  | { readonly type: 'DAMAGE_DEALT'; readonly targetInstanceId: string; readonly amount: number; readonly source: string }
  // Direct counter placement — bypasses damage pipeline (Poison, Burn, Confusion self-hit,
  // "place N damage counters" attacks).
  | { readonly type: 'DAMAGE_COUNTERS_PLACED'; readonly targetInstanceId: string; readonly counters: number; readonly source: string }
  | { readonly type: 'DAMAGE_HEALED'; readonly targetInstanceId: string; readonly amount: number }
  | { readonly type: 'POKEMON_KNOCKED_OUT'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly prizesAwarded: number }
  | { readonly type: 'PRIZE_TAKEN'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'SPECIAL_CONDITION_APPLIED'; readonly pokemonInstanceId: string; readonly condition: SpecialCondition }
  | { readonly type: 'SPECIAL_CONDITION_REMOVED'; readonly pokemonInstanceId: string; readonly condition: SpecialCondition }
  | { readonly type: 'RETREATED'; readonly player: PlayerId; readonly oldActiveId: string; readonly newActiveId: string }
  | { readonly type: 'STADIUM_PLAYED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'STADIUM_DISCARDED'; readonly cardInstanceId: string }
  | { readonly type: 'CARD_DISCARDED'; readonly player: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'DECK_SHUFFLED'; readonly player: PlayerId }
  | { readonly type: 'CARD_SEARCHED'; readonly player: PlayerId; readonly cardInstanceId: string; readonly from: 'deck' | 'discard' }
  | { readonly type: 'CARD_MOVED'; readonly cardInstanceId: string; readonly from: string; readonly to: string }
  | { readonly type: 'MULLIGAN'; readonly player: PlayerId; readonly mulliganCount: number }
  | { readonly type: 'TURN_STARTED'; readonly player: PlayerId; readonly turnNumber: number }
  | { readonly type: 'TURN_ENDED'; readonly player: PlayerId }
  | { readonly type: 'CHECKUP_COMPLETED' }
  | { readonly type: 'GAME_OVER'; readonly winner: PlayerId | 'draw'; readonly reason: WinReason };
