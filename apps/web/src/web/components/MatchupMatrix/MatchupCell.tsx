import React from 'react';
import type { MatchupCellProps } from './types';

function winRateToColor(winRate: number): string {
  // Map 0.0–1.0 win rate to hue 0 (red) → 120 (green), midpoint at 0.5 = hue 50 (yellow)
  const clamped = Math.max(0, Math.min(1, winRate));
  const hue = Math.round(clamped * 120);
  const saturation = 60;
  const lightness = clamped >= 0.5 ? 45 - Math.round((clamped - 0.5) * 10) : 50 + Math.round((0.5 - clamped) * 10);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function MatchupCell({
  opponentName,
  opponentTier,
  status,
  progress,
  winRate,
  favorability,
  onClick
}: MatchupCellProps) {
  const tierMod = opponentTier.toLowerCase();
  const isClickable = status === 'complete';

  const cellStyle: React.CSSProperties =
    status === 'complete' && winRate !== undefined
      ? { backgroundColor: winRateToColor(winRate / 100) }
      : {};

  return (
    <div
      className={[
        'matchup-matrix__cell',
        `matchup-matrix__cell--${status}`,
        favorability ? `matchup-matrix__cell--${favorability}` : '',
        isClickable ? 'matchup-matrix__cell--clickable' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={cellStyle}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      <div className="matchup-matrix__cell-header">
        <span className="matchup-matrix__cell-name">{opponentName}</span>
        <span className={`matchup-matrix__tier-badge matchup-matrix__tier-badge--${tierMod}`}>
          {opponentTier}
        </span>
      </div>

      {status === 'pending' && (
        <div className="matchup-matrix__cell-body matchup-matrix__cell-body--pending">
          <span className="matchup-matrix__cell-pending-label">Pending</span>
        </div>
      )}

      {status === 'running' && (
        <div className="matchup-matrix__cell-body">
          <div className="matchup-matrix__cell-progress-wrap">
            <div
              className="matchup-matrix__cell-progress"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="matchup-matrix__cell-progress-label">{progress}%</span>
        </div>
      )}

      {status === 'complete' && winRate !== undefined && (
        <div className="matchup-matrix__cell-body">
          <span className="matchup-matrix__cell-winrate">{winRate.toFixed(1)}%</span>
        </div>
      )}

      {status === 'error' && (
        <div className="matchup-matrix__cell-body matchup-matrix__cell-body--error">
          <span className="matchup-matrix__cell-error-icon" aria-label="Error">&#9888;</span>
        </div>
      )}
    </div>
  );
}
