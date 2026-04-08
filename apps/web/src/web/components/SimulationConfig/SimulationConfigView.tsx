import React from 'react';
import type { SimulationConfigProps } from './types';
import { GAME_COUNT_STEPS } from './types';
import { KeyCardSelector } from './KeyCardSelector';

const ROTATION_DATE = '2026-04-10';
const TODAY = new Date().toISOString().split('T')[0]!;

export function SimulationConfigView({ config, onChange, playerDeckCards }: SimulationConfigProps) {
  const stepIndex = GAME_COUNT_STEPS.indexOf(config.gameCount as (typeof GAME_COUNT_STEPS)[number]);
  const sliderValue = stepIndex === -1 ? 3 : stepIndex;

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const count = GAME_COUNT_STEPS[idx];
    if (count !== undefined) {
      onChange({ ...config, gameCount: count });
    }
  };

  const handleFormatDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...config, formatDate: e.target.value });
  };

  const handleMatchupMode = (mode: 'single' | 'matrix') => {
    onChange({ ...config, matchupMode: mode });
  };

  const handleKeyCards = (keyCardIds: ReadonlyArray<string>) => {
    onChange({ ...config, keyCardIds });
  };

  const showRotationWarning = config.formatDate >= ROTATION_DATE;

  return (
    <div className="sim-config">
      <h3 className="sim-config__title">Simulation Settings</h3>

      <div className="sim-config__field">
        <label className="sim-config__label" htmlFor="sim-game-count">
          Games: <strong>{config.gameCount.toLocaleString()}</strong>
        </label>
        <input
          id="sim-game-count"
          type="range"
          className="sim-config__slider"
          min={0}
          max={GAME_COUNT_STEPS.length - 1}
          step={1}
          value={sliderValue}
          onChange={handleSlider}
        />
        <div className="sim-config__slider-labels">
          {GAME_COUNT_STEPS.map((v) => (
            <span key={v} className="sim-config__slider-tick">{v >= 1000 ? `${v / 1000}k` : v}</span>
          ))}
        </div>
      </div>

      <div className="sim-config__field">
        <label className="sim-config__label" htmlFor="sim-format-date">
          Format Date
        </label>
        <input
          id="sim-format-date"
          type="date"
          className="sim-config__date"
          value={config.formatDate}
          onChange={handleFormatDate}
        />
        {showRotationWarning && (
          <p className="sim-config__rotation-note">
            G-regulation mark cards rotate out on {ROTATION_DATE}
          </p>
        )}
      </div>

      <div className="sim-config__field">
        <span className="sim-config__label">Matchup Mode</span>
        <div className="sim-config__toggle-group">
          <button
            type="button"
            className={`sim-config__toggle${config.matchupMode === 'single' ? ' sim-config__toggle--active' : ''}`}
            onClick={() => handleMatchupMode('single')}
          >
            Single Matchup
          </button>
          <button
            type="button"
            className={`sim-config__toggle${config.matchupMode === 'matrix' ? ' sim-config__toggle--active' : ''}`}
            onClick={() => handleMatchupMode('matrix')}
          >
            Full Meta Sweep
          </button>
        </div>
      </div>

      <div className="sim-config__field">
        <span className="sim-config__label">
          Key Cards <span className="sim-config__label-hint">(max 6 for detailed analytics)</span>
        </span>
        <KeyCardSelector
          deckCards={playerDeckCards}
          keyCardIds={config.keyCardIds}
          onChange={handleKeyCards}
        />
      </div>
    </div>
  );
}
