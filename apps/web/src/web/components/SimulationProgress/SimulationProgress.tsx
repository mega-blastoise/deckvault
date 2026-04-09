import React from 'react';
import './SimulationProgress.css';

export interface SimulationProgressProps {
  readonly status: 'resolving' | 'running';
  readonly progress: number;
  readonly gamesCompleted: number;
  readonly totalGames: number;
  readonly onCancel: () => void;
}

export function SimulationProgress({
  status,
  progress,
  gamesCompleted,
  totalGames,
  onCancel
}: SimulationProgressProps) {
  const isResolving = status === 'resolving';
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="sim-progress">
      <div className="sim-progress__header">
        <span className="sim-progress__label">
          {isResolving ? 'Loading card data...' : 'Running simulation...'}
        </span>
        {!isResolving && (
          <span className="sim-progress__count">
            {gamesCompleted.toLocaleString()} / {totalGames.toLocaleString()} games
          </span>
        )}
      </div>

      <div
        className="sim-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isResolving ? undefined : clampedProgress}
        aria-label={isResolving ? 'Loading card data' : `Simulation ${clampedProgress}% complete`}
      >
        <div
          className={`sim-progress__bar ${isResolving ? 'sim-progress__bar--indeterminate' : ''}`}
          style={isResolving ? undefined : { width: `${clampedProgress}%` }}
        />
      </div>

      {!isResolving && (
        <span className="sim-progress__percent">{clampedProgress}%</span>
      )}

      <button
        type="button"
        className="sim-progress__cancel"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
