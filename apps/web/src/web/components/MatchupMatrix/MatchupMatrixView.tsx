import React from 'react';
import { MatchupCell } from './MatchupCell';
import type { MatchupMatrixProps, MatchupProgress, MatchupResult } from './types';

const TIER_WEIGHTS: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

function computeWeightedWinRate(results: ReadonlyArray<MatchupResult>): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of results) {
    const weight = TIER_WEIGHTS[r.opponentTier] ?? 1;
    weightedSum += r.winRate * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function winRateToColor(winRate: number): string {
  const normalized = winRate / 100;
  const clamped = Math.max(0, Math.min(1, normalized));
  const hue = Math.round(clamped * 120);
  const saturation = 60;
  const lightness = clamped >= 0.5 ? 45 - Math.round((clamped - 0.5) * 10) : 50 + Math.round((0.5 - clamped) * 10);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getProgressForOpponent(
  opponentId: string,
  progress: ReadonlyArray<MatchupProgress>
): MatchupProgress | undefined {
  return progress.find((p) => p.opponentId === opponentId);
}

function getResultForOpponent(
  opponentId: string,
  results: ReadonlyArray<MatchupResult>
): MatchupResult | undefined {
  return results.find((r) => r.opponentId === opponentId);
}

export function MatchupMatrixView({
  playerDeckName,
  progress,
  results,
  overallWinRate,
  onCellClick,
  status
}: MatchupMatrixProps) {
  const allOpponents = progress.map((p) => ({
    id: p.opponentId,
    name: p.opponentName
  }));

  const completedCount = progress.filter((p) => p.status === 'complete' || p.status === 'error').length;
  const totalCount = progress.length;
  const globalPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const weightedOverall = results.length > 0 ? computeWeightedWinRate(results) : null;
  const displayOverall = overallWinRate ?? weightedOverall;

  return (
    <div className="matchup-matrix">
      <div className="matchup-matrix__header">
        <span className="matchup-matrix__deck-label">Your Deck: {playerDeckName}</span>
        {status === 'running' || status === 'resolving' ? (
          <div className="matchup-matrix__global-progress">
            <span className="matchup-matrix__global-progress-label">
              Matchup {completedCount}/{totalCount} complete ({globalPercent}%)
            </span>
            <div className="matchup-matrix__global-progress-bar-wrap">
              <div
                className="matchup-matrix__global-progress-bar"
                style={{ width: `${globalPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {progress.length === 0 && (
        <div className="matchup-matrix__empty">
          <p>Select archetypes and run to see matchup results.</p>
        </div>
      )}

      {progress.length > 0 && (
        <div className="matchup-matrix__grid">
          {allOpponents.map(({ id }) => {
            const prog = getProgressForOpponent(id, progress);
            const result = getResultForOpponent(id, results);
            if (!prog) return null;

            return (
              <MatchupCell
                key={id}
                opponentName={prog.opponentName}
                opponentTier={result?.opponentTier ?? ''}
                status={prog.status}
                progress={prog.progress}
                winRate={result?.winRate}
                favorability={result?.favorability}
                onClick={() => onCellClick(id)}
              />
            );
          })}
        </div>
      )}

      {displayOverall !== null && results.length > 0 && (
        <div
          className="matchup-matrix__summary"
          style={{ backgroundColor: winRateToColor(displayOverall) }}
        >
          <span className="matchup-matrix__summary-label">
            Overall: {displayOverall.toFixed(1)}% (tier-weighted)
          </span>
        </div>
      )}
    </div>
  );
}
