import React from 'react';
import type { ArchetypeSelectorProps } from './types';

export function ArchetypeSelector({
  archetypes,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll
}: ArchetypeSelectorProps) {
  return (
    <div className="matchup-matrix__selector">
      <div className="matchup-matrix__selector-header">
        <span className="matchup-matrix__selector-title">Opponents ({selected.size} selected)</span>
        <div className="matchup-matrix__selector-actions">
          <button
            type="button"
            className="matchup-matrix__selector-btn"
            onClick={onSelectAll}
          >
            All
          </button>
          <button
            type="button"
            className="matchup-matrix__selector-btn"
            onClick={onDeselectAll}
          >
            None
          </button>
        </div>
      </div>
      <div className="matchup-matrix__selector-list">
        {archetypes.map((archetype) => {
          const isChecked = selected.has(archetype.id);
          const tierMod = archetype.tier.toLowerCase();
          return (
            <label
              key={archetype.id}
              className={`matchup-matrix__selector-item${isChecked ? ' matchup-matrix__selector-item--checked' : ''}`}
            >
              <input
                type="checkbox"
                className="matchup-matrix__selector-checkbox"
                checked={isChecked}
                onChange={() => onToggle(archetype.id)}
              />
              <span className={`matchup-matrix__tier-badge matchup-matrix__tier-badge--${tierMod}`}>
                {archetype.tier}
              </span>
              <span className="matchup-matrix__selector-name">{archetype.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
