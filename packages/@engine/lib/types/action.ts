// All legal player actions as a discriminated union on `type`.

export type PlayerAction =
  | { readonly type: 'DRAW_CARD' }
  | { readonly type: 'PLAY_BASIC_TO_BENCH'; readonly cardInstanceId: string }
  | { readonly type: 'EVOLVE_POKEMON'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'ATTACH_ENERGY'; readonly cardInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: 'PLAY_TRAINER'; readonly cardInstanceId: string; readonly targets?: ReadonlyArray<string> }
  | { readonly type: 'USE_ABILITY'; readonly pokemonInstanceId: string; readonly abilityIndex: number }
  | { readonly type: 'RETREAT'; readonly newActiveInstanceId: string; readonly energyToDiscard: ReadonlyArray<string> }
  | { readonly type: 'ATTACK'; readonly attackIndex: number }
  | { readonly type: 'PASS' }
  | { readonly type: 'SELECT_ACTIVE'; readonly cardInstanceId: string }
  | { readonly type: 'SELECT_BENCH'; readonly cardInstanceIds: ReadonlyArray<string> }
  | { readonly type: 'MULLIGAN_REDRAW' }
  // Winner of setup coin flip DECIDES who goes first (rulebook p.8)
  | { readonly type: 'COIN_FLIP_CHOICE'; readonly choice: 'first' | 'second' }
  | { readonly type: 'ATTACH_TOOL'; readonly cardInstanceId: string; readonly targetInstanceId: string };
