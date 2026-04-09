import type { SerializedSimulationResult } from '../../../workers/simulation.worker';

export type { SerializedSimulationResult };

export interface MetaDeck {
  readonly id: string;
  readonly name: string;
  readonly tier: 'S' | 'A' | 'B' | 'C';
  readonly cards: ReadonlyArray<{ cardId: string; quantity: number }>;
  readonly coverCardId: string;
  readonly eventName: string;
}

export interface MatchupProgress {
  readonly opponentId: string;
  readonly opponentName: string;
  readonly status: 'pending' | 'running' | 'complete' | 'error';
  readonly progress: number;
  readonly gamesCompleted: number;
}

export interface MatchupResult {
  readonly opponentId: string;
  readonly opponentName: string;
  readonly opponentTier: string;
  readonly winRate: number;
  readonly gamesPlayed: number;
  readonly favorability: 'favorable' | 'even' | 'unfavorable';
  readonly result: SerializedSimulationResult;
}

export interface MatchupMatrixProps {
  readonly playerDeckName: string;
  readonly progress: ReadonlyArray<MatchupProgress>;
  readonly results: ReadonlyArray<MatchupResult>;
  readonly overallWinRate: number | null;
  readonly onCellClick: (opponentId: string) => void;
  readonly status: 'idle' | 'resolving' | 'running' | 'complete' | 'error';
}

export interface MatchupCellProps {
  readonly opponentName: string;
  readonly opponentTier: string;
  readonly status: 'pending' | 'running' | 'complete' | 'error';
  readonly progress: number;
  readonly winRate?: number;
  readonly favorability?: 'favorable' | 'even' | 'unfavorable';
  readonly onClick: () => void;
}

export interface ArchetypeSelectorProps {
  readonly archetypes: ReadonlyArray<MetaDeck>;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onSelectAll: () => void;
  readonly onDeselectAll: () => void;
}
