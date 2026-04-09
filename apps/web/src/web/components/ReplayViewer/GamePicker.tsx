import React, { useState } from 'react';
import type { GamePickerEntry } from './types';
import type { PlayerId } from '@pokemon/engine/browser';

interface GamePickerProps {
  readonly games: ReadonlyArray<GamePickerEntry>;
  readonly selectedIndex: number;
  readonly onSelect: (gameIndex: number) => void;
}

type FilterMode = 'all' | 'p1wins' | 'p2wins' | 'draws';

const WIN_REASON_LABELS: Record<string, string> = {
  all_prizes_taken: 'Prizes',
  no_pokemon_in_play: 'No Pokemon',
  deck_out: 'Deck-out',
  tiebreaker: 'Tiebreaker'
};

function outcomeLabel(winner: PlayerId | 'draw'): string {
  if (winner === 'player1') return 'P1 Win';
  if (winner === 'player2') return 'P2 Win';
  return 'Draw';
}

function outcomeClass(winner: PlayerId | 'draw'): string {
  if (winner === 'player1') return 'game-picker__badge--p1win';
  if (winner === 'player2') return 'game-picker__badge--p2win';
  return 'game-picker__badge--draw';
}

export function GamePicker({ games, selectedIndex, onSelect }: GamePickerProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = games.filter((g) => {
    if (filter === 'p1wins') return g.winner === 'player1';
    if (filter === 'p2wins') return g.winner === 'player2';
    if (filter === 'draws') return g.winner === 'draw';
    return true;
  });

  const filters: Array<{ mode: FilterMode; label: string }> = [
    { mode: 'all', label: 'All' },
    { mode: 'p1wins', label: 'P1 Wins' },
    { mode: 'p2wins', label: 'P2 Wins' },
    { mode: 'draws', label: 'Draws' }
  ];

  return (
    <div className="game-picker">
      <div className="game-picker__filters">
        {filters.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`game-picker__filter-btn${filter === mode ? ' game-picker__filter-btn--active' : ''}`}
            onClick={() => setFilter(mode)}
          >
            {label}
          </button>
        ))}
        <span className="game-picker__count">{filtered.length} games</span>
      </div>

      <div className="game-picker__list">
        {filtered.map((game) => (
          <button
            key={game.gameIndex}
            type="button"
            disabled={!game.hasCapturedReplay}
            className={[
              'game-picker__item',
              game.gameIndex === selectedIndex ? 'game-picker__item--selected' : '',
              !game.hasCapturedReplay ? 'game-picker__item--no-replay' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => game.hasCapturedReplay && onSelect(game.gameIndex)}
            title={!game.hasCapturedReplay ? 'No replay captured for this game' : undefined}
          >
            <span className="game-picker__game-num">#{game.gameIndex + 1}</span>
            <span className={`game-picker__badge ${outcomeClass(game.winner)}`}>
              {outcomeLabel(game.winner)}
            </span>
            <span className="game-picker__reason">
              {WIN_REASON_LABELS[game.winReason] ?? game.winReason}
            </span>
            <span className="game-picker__turns">{game.totalTurns}T</span>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="game-picker__empty">No games match this filter</div>
        )}
      </div>
    </div>
  );
}
