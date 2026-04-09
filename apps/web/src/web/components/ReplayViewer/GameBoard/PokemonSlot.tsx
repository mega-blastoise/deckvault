import React from 'react';
import type { ReplayPokemonSlot } from '../types';

interface PokemonSlotProps {
  readonly slot: ReplayPokemonSlot | null;
  readonly isActive: boolean;
  readonly isHighlighted: boolean;
}

const ENERGY_COLORS: Record<string, string> = {
  Grass: '#4caf50',
  Fire: '#f44336',
  Water: '#2196f3',
  Lightning: '#ffeb3b',
  Psychic: '#9c27b0',
  Fighting: '#ff9800',
  Darkness: '#212121',
  Metal: '#9e9e9e',
  Dragon: '#673ab7',
  Fairy: '#e91e63',
  Colorless: '#bdbdbd'
};

function hpBarClass(current: number, max: number): string {
  if (max === 0) return 'game-board__hp-bar--full';
  const ratio = current / max;
  if (ratio > 0.5) return 'game-board__hp-bar--high';
  if (ratio > 0.25) return 'game-board__hp-bar--mid';
  return 'game-board__hp-bar--low';
}

export function PokemonSlot({ slot, isActive, isHighlighted }: PokemonSlotProps) {
  if (!slot) {
    return (
      <div
        className={`game-board__pokemon-slot game-board__pokemon-slot--empty${isActive ? ' game-board__pokemon-slot--active' : ''}`}
      >
        <span className="game-board__slot-empty-label">Empty</span>
      </div>
    );
  }

  const hpPercent = slot.hp > 0 ? Math.round((slot.currentHp / slot.hp) * 100) : 0;

  return (
    <div
      className={[
        'game-board__pokemon-slot',
        isActive ? 'game-board__pokemon-slot--active' : 'game-board__pokemon-slot--bench',
        isHighlighted ? 'game-board__pokemon-slot--highlighted' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="game-board__slot-name">{slot.name}</div>
      <div className="game-board__slot-stage">{slot.evolutionStage}</div>

      <div className="game-board__hp-track">
        <div
          className={`game-board__hp-bar ${hpBarClass(slot.currentHp, slot.hp)}`}
          style={{ width: `${hpPercent}%` }}
        />
      </div>
      <div className="game-board__slot-hp">
        {slot.currentHp}/{slot.hp} HP
      </div>

      {slot.damageCounters > 0 && (
        <div className="game-board__damage-counters">
          {slot.damageCounters * 10} dmg
        </div>
      )}

      {slot.attachedEnergy.length > 0 && (
        <div className="game-board__energy-row">
          {slot.attachedEnergy.map((e, idx) => (
            <span
              key={`${e.cardId}-${idx}`}
              className="game-board__energy-pip"
              style={{ backgroundColor: ENERGY_COLORS[e.type] ?? ENERGY_COLORS['Colorless'] }}
              title={e.type}
            />
          ))}
        </div>
      )}

      {slot.attachedTools.length > 0 && (
        <div className="game-board__tools-row">
          {slot.attachedTools.map((t) => (
            <span key={t.cardId} className="game-board__tool-badge">{t.name}</span>
          ))}
        </div>
      )}

      {slot.specialConditions.length > 0 && (
        <div className="game-board__conditions-row">
          {slot.specialConditions.map((c) => (
            <span key={c} className={`game-board__condition game-board__condition--${c.toLowerCase()}`}>
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
