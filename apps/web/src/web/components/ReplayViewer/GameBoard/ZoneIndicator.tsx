import React from 'react';

interface ZoneIndicatorProps {
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
  readonly prizesRemaining: number;
}

export function ZoneIndicator({
  handCount,
  deckCount,
  discardCount,
  prizesRemaining
}: ZoneIndicatorProps) {
  return (
    <div className="game-board__zone-indicator">
      <span className="game-board__zone-item">
        <span className="game-board__zone-icon">P</span>
        <span className="game-board__zone-count">{prizesRemaining}</span>
      </span>
      <span className="game-board__zone-item">
        <span className="game-board__zone-icon">H</span>
        <span className="game-board__zone-count">{handCount}</span>
      </span>
      <span className="game-board__zone-item">
        <span className="game-board__zone-icon">D</span>
        <span className="game-board__zone-count">{deckCount}</span>
      </span>
      <span className="game-board__zone-item">
        <span className="game-board__zone-icon">X</span>
        <span className="game-board__zone-count">{discardCount}</span>
      </span>
    </div>
  );
}
