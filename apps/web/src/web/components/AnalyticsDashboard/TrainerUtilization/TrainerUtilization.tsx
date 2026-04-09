import React from 'react';
import type { TrainerUtilizationEntry } from '../types';
import './TrainerUtilization.css';

interface TrainerUtilizationProps {
  readonly entries: ReadonlyArray<TrainerUtilizationEntry>;
}

function utilizationColor(playRate: number): string {
  if (playRate >= 0.7) return 'trainer-util__entry--green';
  if (playRate >= 0.3) return 'trainer-util__entry--yellow';
  return 'trainer-util__entry--red';
}

export function TrainerUtilization({ entries }: TrainerUtilizationProps) {
  if (entries.length === 0) {
    return (
      <div className="trainer-util trainer-util--empty">
        <p className="trainer-util__empty">No trainer data available</p>
      </div>
    );
  }

  return (
    <div className="trainer-util">
      <ul className="trainer-util__list">
        {entries.map((entry) => (
          <li
            key={entry.cardId}
            className={`trainer-util__entry ${utilizationColor(entry.playRate)}`}
          >
            <div className="trainer-util__entry-header">
              <span className="trainer-util__card-name">{entry.cardName}</span>
              <span className="trainer-util__play-rate">
                {(entry.playRate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="trainer-util__bar-wrap">
              <div
                className="trainer-util__bar"
                style={{ width: `${entry.utilizationScore * 100}%` }}
              />
            </div>
            <div className="trainer-util__stats">
              <span>Played in {(entry.playRate * 100).toFixed(0)}% of games</span>
              <span>Avg {entry.avgCopiesPlayed.toFixed(1)} copies</span>
              {!isNaN(entry.avgTurnFirstPlayed) && (
                <span>First played T{entry.avgTurnFirstPlayed.toFixed(1)}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
