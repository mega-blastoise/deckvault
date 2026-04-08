import React from 'react';
import type { GameEvent } from '@pokemon/engine/browser';
import type { ReplayBoardState, SerializedCardDefinition, KeyMoment, GamePickerEntry } from './types';
import { GameBoard } from './GameBoard';
import { EventLogPanel } from './EventLogPanel';
import { ReplayControls } from './ReplayControls';
import { GamePicker } from './GamePicker';

interface ReplayViewerViewProps {
  readonly boardState: ReplayBoardState;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
  readonly events: ReadonlyArray<GameEvent>;
  readonly currentEventIndex: number;
  readonly currentTurn: number;
  readonly totalTurns: number;
  readonly totalEvents: number;
  readonly keyMoments: ReadonlyArray<KeyMoment>;
  readonly games: ReadonlyArray<GamePickerEntry>;
  readonly selectedGameIndex: number;
  readonly highlightedInstanceId?: string;
  readonly onPrevEvent: () => void;
  readonly onNextEvent: () => void;
  readonly onPrevTurn: () => void;
  readonly onNextTurn: () => void;
  readonly onJumpToStart: () => void;
  readonly onJumpToEnd: () => void;
  readonly onJumpToMoment: (eventIndex: number) => void;
  readonly onEventClick: (index: number) => void;
  readonly onSelectGame: (gameIndex: number) => void;
}

export function ReplayViewerView({
  boardState,
  definitions,
  deck1Name,
  deck2Name,
  events,
  currentEventIndex,
  currentTurn,
  totalTurns,
  totalEvents,
  keyMoments,
  games,
  selectedGameIndex,
  highlightedInstanceId,
  onPrevEvent,
  onNextEvent,
  onPrevTurn,
  onNextTurn,
  onJumpToStart,
  onJumpToEnd,
  onJumpToMoment,
  onEventClick,
  onSelectGame
}: ReplayViewerViewProps) {
  return (
    <div className="replay-viewer">
      <div className="replay-viewer__game-picker">
        <GamePicker
          games={games}
          selectedIndex={selectedGameIndex}
          onSelect={onSelectGame}
        />
      </div>

      <div className="replay-viewer__board">
        <GameBoard
          boardState={boardState}
          definitions={definitions}
          deck1Name={deck1Name}
          deck2Name={deck2Name}
          highlightedInstanceId={highlightedInstanceId}
        />
      </div>

      <div className="replay-viewer__event-log">
        <EventLogPanel
          events={events}
          currentEventIndex={currentEventIndex}
          definitions={definitions}
          deck1Name={deck1Name}
          deck2Name={deck2Name}
          onEventClick={onEventClick}
        />
      </div>

      <div className="replay-viewer__controls">
        <ReplayControls
          currentEventIndex={currentEventIndex}
          totalEvents={totalEvents}
          currentTurn={currentTurn}
          totalTurns={totalTurns}
          onPrevEvent={onPrevEvent}
          onNextEvent={onNextEvent}
          onPrevTurn={onPrevTurn}
          onNextTurn={onNextTurn}
          onJumpToStart={onJumpToStart}
          onJumpToEnd={onJumpToEnd}
          keyMoments={keyMoments}
          onJumpToMoment={onJumpToMoment}
        />
      </div>
    </div>
  );
}
