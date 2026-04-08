import React from 'react';
import type {
  WinConditionData,
  PrizeRaceData,
  OpeningHandData,
  KeyCardCurve,
  TrainerUtilizationEntry,
  TurnLengthBucket,
  Perspective
} from './types';
import { WinConditionBreakdown } from './WinConditionBreakdown';
import { PrizeRaceTimeline } from './PrizeRaceTimeline';
import { OpeningHandQuality } from './OpeningHandQuality';
import { KeyCardCurves } from './KeyCardCurves';
import { TrainerUtilization } from './TrainerUtilization';
import { TurnLengthDistribution } from './TurnLengthDistribution';

interface AnalyticsDashboardViewProps {
  readonly winConditionData: WinConditionData;
  readonly prizeRaceData: PrizeRaceData;
  readonly openingHandData: OpeningHandData;
  readonly keyCardCurves: ReadonlyArray<KeyCardCurve>;
  readonly trainerEntries: ReadonlyArray<TrainerUtilizationEntry>;
  readonly turnBuckets: ReadonlyArray<TurnLengthBucket>;
  readonly medianTurns: number;
  readonly perspective: Perspective;
  readonly onPerspectiveChange: (p: Perspective) => void;
}

export function AnalyticsDashboardView({
  winConditionData,
  prizeRaceData,
  openingHandData,
  keyCardCurves,
  trainerEntries,
  turnBuckets,
  medianTurns,
  perspective,
  onPerspectiveChange
}: AnalyticsDashboardViewProps) {
  return (
    <div className="analytics-dashboard">
      <div className="analytics-dashboard__perspective-row">
        <span className="analytics-dashboard__perspective-label">Viewing as:</span>
        <div className="analytics-dashboard__perspective-toggle">
          <button
            type="button"
            className={`analytics-dashboard__perspective-btn${perspective === 'player1' ? ' analytics-dashboard__perspective-btn--active' : ''}`}
            onClick={() => onPerspectiveChange('player1')}
          >
            Your Deck
          </button>
          <button
            type="button"
            className={`analytics-dashboard__perspective-btn${perspective === 'player2' ? ' analytics-dashboard__perspective-btn--active' : ''}`}
            onClick={() => onPerspectiveChange('player2')}
          >
            Opponent
          </button>
        </div>
      </div>

      <div className="analytics-dashboard__panel analytics-dashboard__panel--win-breakdown">
        <h3 className="analytics-dashboard__panel-title">Win Condition Breakdown</h3>
        <WinConditionBreakdown data={winConditionData} />
      </div>

      <div className="analytics-dashboard__panel">
        <h3 className="analytics-dashboard__panel-title">Prize Race Timeline</h3>
        <PrizeRaceTimeline data={prizeRaceData} />
      </div>

      <div className="analytics-dashboard__panel">
        <h3 className="analytics-dashboard__panel-title">Opening Hand Quality</h3>
        <OpeningHandQuality data={openingHandData} />
      </div>

      <div className="analytics-dashboard__panel">
        <h3 className="analytics-dashboard__panel-title">Key Card Consistency</h3>
        <KeyCardCurves curves={keyCardCurves} />
      </div>

      <div className="analytics-dashboard__panel">
        <h3 className="analytics-dashboard__panel-title">Trainer Utilization</h3>
        <TrainerUtilization entries={trainerEntries} />
      </div>

      <div className="analytics-dashboard__panel">
        <h3 className="analytics-dashboard__panel-title">Turn Length Distribution</h3>
        <TurnLengthDistribution buckets={turnBuckets} medianTurns={medianTurns} />
      </div>
    </div>
  );
}
