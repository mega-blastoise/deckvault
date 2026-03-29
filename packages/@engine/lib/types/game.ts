import type { RngState } from '../rng';
import type { CardDefinition } from './card';
import type { GameEvent } from './event';
import type { TemporalEffect } from './effect';

export type PlayerId = 'player1' | 'player2';

export interface CardInstance {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly owner: PlayerId;
}

// SPECIAL CONDITION MUTUAL EXCLUSIVITY (rulebook p.16):
// Asleep, Confused, and Paralyzed are mutually exclusive (all rotate the card).
// Burned and Poisoned use markers and do NOT conflict with rotation-based conditions.
// A Pokemon can be in at most: 1 of {Asleep, Confused, Paralyzed} + Burned + Poisoned.
//
// REMOVAL ON ZONE CHANGE (rulebook p.15-16):
// Moving to Bench or evolving removes ALL Special Conditions.
export type SpecialCondition = 'Asleep' | 'Burned' | 'Confused' | 'Paralyzed' | 'Poisoned';

export interface InPlayPokemon {
  readonly instanceId: string;
  readonly evolutionStack: ReadonlyArray<string>;
  readonly attachedEnergy: ReadonlyArray<string>;
  readonly attachedTools: ReadonlyArray<string>;
  readonly damageCounters: number;
  readonly specialConditions: ReadonlyArray<SpecialCondition>;
  readonly turnPlayed: number;
  readonly turnEvolved: number | null;
  readonly isNewThisTurn: boolean;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly deck: ReadonlyArray<string>;
  readonly hand: ReadonlyArray<string>;
  readonly prizes: ReadonlyArray<string>;
  readonly active: InPlayPokemon | null;
  readonly bench: ReadonlyArray<InPlayPokemon>;
  readonly discard: ReadonlyArray<string>;
  readonly lostZone: ReadonlyArray<string>;
  readonly supporterPlayedThisTurn: boolean;
  readonly stadiumPlayedThisTurn: boolean;
  readonly energyAttachedThisTurn: boolean;
  readonly retreatedThisTurn: boolean;
}

export type GamePhase =
  | 'setup'
  | 'draw'
  | 'main'
  | 'attack'
  | 'checkup'
  | 'finished';

// Stadium is shared — only one can be in play at a time (rulebook p.12).
export interface StadiumState {
  readonly cardInstanceId: string;
  readonly playedBy: PlayerId;
}

export interface TurnFlags {
  readonly attackUsed: boolean;
  // The starting player cannot attack or play a Supporter on turn 1 (rulebook p.12-13).
  // Computed as: activePlayer === startingPlayer && turnNumber === 1.
  readonly isStartingPlayerFirstTurn: boolean;
  // Set by Trainer effects that end the turn immediately (e.g. Boxed Order, Katy).
  // Checked after resolveEffect — if true, skip remaining main phase and go to endTurn.
  readonly turnEndedByEffect: boolean;
  // Setup-phase tracking (zeroed when setup completes):
  readonly mulliganCounts: Readonly<Record<PlayerId, number>>;
  readonly extraDrawsRemaining: Readonly<Record<PlayerId, number>>;
  readonly setupBenchSelected: Readonly<Record<PlayerId, boolean>>;
}

export interface GameState {
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  readonly startingPlayer: PlayerId;
  readonly turnNumber: number;
  readonly phase: GamePhase;
  readonly stadium: StadiumState | null;
  readonly cardRegistry: ReadonlyMap<string, CardInstance>;
  readonly definitionRegistry: ReadonlyMap<string, CardDefinition>;
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw' | null;
  readonly rngState: RngState;
  readonly turnFlags: TurnFlags;
  readonly temporalEffects: ReadonlyArray<TemporalEffect>;
}
