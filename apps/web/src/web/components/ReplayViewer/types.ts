import type { PlayerId, WinReason } from '@pokemon/engine/browser';

export interface ReplayBoardState {
  readonly player1: ReplayPlayerState;
  readonly player2: ReplayPlayerState;
  readonly stadium: { readonly cardId: string; readonly name: string } | null;
  readonly turnNumber: number;
  readonly activePlayer: PlayerId;
  readonly currentEventIndex: number;
}

export interface ReplayPlayerState {
  readonly active: ReplayPokemonSlot | null;
  readonly bench: ReadonlyArray<ReplayPokemonSlot>;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
  readonly discardTopCardId: string | null;
  readonly prizesRemaining: number;
}

export interface ReplayPokemonSlot {
  readonly instanceId: string;
  readonly cardId: string;
  readonly name: string;
  readonly hp: number;
  readonly currentHp: number;
  readonly damageCounters: number;
  readonly attachedEnergy: ReadonlyArray<{ cardId: string; type: string }>;
  readonly attachedTools: ReadonlyArray<{ cardId: string; name: string }>;
  readonly specialConditions: ReadonlyArray<string>;
  readonly evolutionStage: string;
}

export interface KeyMoment {
  readonly label: string;
  readonly eventIndex: number;
  readonly type: 'ko' | 'prize' | 'turn_start' | 'game_over';
}

export interface SerializedCardDefinition {
  readonly id: string;
  readonly name: string;
  readonly cardType: 'Pokemon' | 'Trainer' | 'Energy';
  readonly hp?: number;
  readonly stage?: string;
  readonly provides?: ReadonlyArray<string>;
}

export interface GamePickerEntry {
  readonly gameIndex: number;
  readonly winner: PlayerId | 'draw';
  readonly winReason: WinReason;
  readonly totalTurns: number;
  readonly hasCapturedReplay: boolean;
}
