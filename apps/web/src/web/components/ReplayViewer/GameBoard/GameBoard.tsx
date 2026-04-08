import React from 'react';
import type { ReplayBoardState, ReplayPlayerState, SerializedCardDefinition } from '../types';
import { PokemonSlot } from './PokemonSlot';
import { ZoneIndicator } from './ZoneIndicator';

interface GameBoardProps {
  readonly boardState: ReplayBoardState;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
  readonly highlightedInstanceId?: string;
}

interface PlayerRowProps {
  readonly playerState: ReplayPlayerState;
  readonly label: string;
  readonly isOpponent: boolean;
  readonly highlightedInstanceId?: string;
}

const BENCH_SIZE = 5;

function PlayerRow({ playerState, label, isOpponent, highlightedInstanceId }: PlayerRowProps) {
  const benchSlots = Array.from({ length: BENCH_SIZE }, (_, i) => playerState.bench[i] ?? null);

  const benchRow = (
    <div className="game-board__bench-row">
      {benchSlots.map((slot, i) => (
        <PokemonSlot
          key={slot?.instanceId ?? `empty-bench-${i}`}
          slot={slot}
          isActive={false}
          isHighlighted={!!slot && slot.instanceId === highlightedInstanceId}
        />
      ))}
    </div>
  );

  const activeRow = (
    <div className="game-board__active-row">
      <PokemonSlot
        slot={playerState.active}
        isActive={true}
        isHighlighted={!!playerState.active && playerState.active.instanceId === highlightedInstanceId}
      />
    </div>
  );

  return (
    <div className={`game-board__player-section${isOpponent ? ' game-board__player-section--opponent' : ''}`}>
      <div className="game-board__player-header">
        <span className="game-board__player-label">{label}</span>
        <ZoneIndicator
          handCount={playerState.handCount}
          deckCount={playerState.deckCount}
          discardCount={playerState.discardCount}
          prizesRemaining={playerState.prizesRemaining}
        />
      </div>
      {isOpponent ? benchRow : null}
      {activeRow}
      {!isOpponent ? benchRow : null}
    </div>
  );
}

export function GameBoard({
  boardState,
  deck1Name,
  deck2Name,
  highlightedInstanceId
}: GameBoardProps) {
  return (
    <div className="game-board">
      <PlayerRow
        playerState={boardState.player2}
        label={`${deck2Name} (P2)`}
        isOpponent={true}
        highlightedInstanceId={highlightedInstanceId}
      />

      {boardState.stadium && (
        <div className="game-board__stadium">
          <span className="game-board__stadium-label">Stadium</span>
          <span className="game-board__stadium-name">{boardState.stadium.name}</span>
        </div>
      )}

      <PlayerRow
        playerState={boardState.player1}
        label={`${deck1Name} (P1)`}
        isOpponent={false}
        highlightedInstanceId={highlightedInstanceId}
      />

      <div className="game-board__turn-info">
        Turn {boardState.turnNumber} &mdash;{' '}
        {boardState.activePlayer === 'player1' ? deck1Name : deck2Name} active
      </div>
    </div>
  );
}
