import type { CardDefinition } from '@pokemon/engine';
import type { SerializedSimulationResult } from '../../../workers/simulation.worker';
import type { ResolvedDeck } from '../DeckInputPanel/types';

export type Perspective = 'player1' | 'player2';

export interface AnalyticsDashboardProps {
  readonly result: SerializedSimulationResult;
  readonly keyCardIds: ReadonlyArray<string>;
  readonly definitions: Record<string, CardDefinition>;
  readonly perspective: Perspective;
  readonly playerDeck: ResolvedDeck;
  readonly onPerspectiveChange: (p: Perspective) => void;
}

// Win Condition Breakdown
export interface WinConditionSegment {
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  readonly color: string;
}

export interface WinConditionData {
  readonly total: number;
  readonly segments: ReadonlyArray<WinConditionSegment>;
}

// Prize Race
export interface PrizeRacePoint {
  readonly turn: number;
  readonly meanDifferential: number;
  readonly stdDev: number;
}

export interface PrizeRaceData {
  readonly points: ReadonlyArray<PrizeRacePoint>;
  readonly maxTurn: number;
}

// Opening Hand
export interface HandArchetype {
  readonly label: string;
  readonly frequency: number;
  readonly isIdeal: boolean;
}

export interface OpeningHandData {
  readonly mulliganRate: number;
  readonly hasSupporterRate: number;
  readonly hasEnergyRate: number;
  readonly idealOpeningRate: number;
  readonly averageBasicsInHand: number;
  readonly handArchetypes: ReadonlyArray<HandArchetype>;
}

// Key Card Curves
export interface KeyCardCurvePoint {
  readonly turn: number;
  readonly probability: number;
}

export interface KeyCardCurve {
  readonly cardId: string;
  readonly cardName: string;
  readonly copiesInDeck: number;
  readonly curve: ReadonlyArray<KeyCardCurvePoint>;
}

// Trainer Utilization
export interface TrainerUtilizationEntry {
  readonly cardId: string;
  readonly cardName: string;
  readonly copiesInDeck: number;
  readonly avgCopiesPlayed: number;
  readonly playRate: number;
  readonly avgTurnFirstPlayed: number;
  readonly utilizationScore: number;
}

// Turn Length Distribution
export interface TurnLengthBucket {
  readonly minTurn: number;
  readonly maxTurn: number;
  readonly label: string;
  readonly player1Wins: number;
  readonly player2Wins: number;
  readonly draws: number;
  readonly total: number;
}

// Canvas chart option types
export interface ChartTheme {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly gridColor: string;
  readonly textColor: string;
  readonly backgroundColor: string;
}

export interface LineChartOptions {
  readonly theme: ChartTheme;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly color: string;
  readonly lineWidth?: number;
}

export interface BarChartOptions {
  readonly theme: ChartTheme;
  readonly colors: ReadonlyArray<string>;
  readonly xLabel?: string;
  readonly yLabel?: string;
}

export interface BandOptions {
  readonly theme: ChartTheme;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly bandColor: string;
}
