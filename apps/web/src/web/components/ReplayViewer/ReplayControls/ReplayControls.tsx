import React, { useEffect } from 'react';
import type { KeyMoment } from '../types';

interface ReplayControlsProps {
  readonly currentEventIndex: number;
  readonly totalEvents: number;
  readonly currentTurn: number;
  readonly totalTurns: number;
  readonly onPrevEvent: () => void;
  readonly onNextEvent: () => void;
  readonly onPrevTurn: () => void;
  readonly onNextTurn: () => void;
  readonly onJumpToStart: () => void;
  readonly onJumpToEnd: () => void;
  readonly keyMoments: ReadonlyArray<KeyMoment>;
  readonly onJumpToMoment: (eventIndex: number) => void;
}

export function ReplayControls({
  currentEventIndex,
  totalEvents,
  currentTurn,
  totalTurns,
  onPrevEvent,
  onNextEvent,
  onPrevTurn,
  onNextTurn,
  onJumpToStart,
  onJumpToEnd,
  keyMoments,
  onJumpToMoment
}: ReplayControlsProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) onPrevTurn();
          else onPrevEvent();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) onNextTurn();
          else onNextEvent();
          break;
        case 'Home':
          e.preventDefault();
          onJumpToStart();
          break;
        case 'End':
          e.preventDefault();
          onJumpToEnd();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrevEvent, onNextEvent, onPrevTurn, onNextTurn, onJumpToStart, onJumpToEnd]);

  const atStart = currentEventIndex <= 0;
  const atEnd = currentEventIndex >= totalEvents - 1;

  return (
    <div className="replay-controls">
      <div className="replay-controls__main">
        <button
          type="button"
          className="replay-controls__btn"
          onClick={onJumpToStart}
          disabled={atStart}
          title="Jump to start (Home)"
        >
          |&lt;&lt;
        </button>
        <button
          type="button"
          className="replay-controls__btn"
          onClick={onPrevTurn}
          disabled={atStart}
          title="Previous turn (Shift+Left)"
        >
          &lt;Turn
        </button>
        <button
          type="button"
          className="replay-controls__btn"
          onClick={onPrevEvent}
          disabled={atStart}
          title="Previous event (Left arrow)"
        >
          &lt;Event
        </button>

        <span className="replay-controls__position">
          Event {Math.max(0, currentEventIndex + 1)}/{totalEvents}
          {totalTurns > 0 && ` · Turn ${currentTurn}/${totalTurns}`}
        </span>

        <button
          type="button"
          className="replay-controls__btn"
          onClick={onNextEvent}
          disabled={atEnd}
          title="Next event (Right arrow)"
        >
          Event&gt;
        </button>
        <button
          type="button"
          className="replay-controls__btn"
          onClick={onNextTurn}
          disabled={atEnd}
          title="Next turn (Shift+Right)"
        >
          Turn&gt;
        </button>
        <button
          type="button"
          className="replay-controls__btn"
          onClick={onJumpToEnd}
          disabled={atEnd}
          title="Jump to end (End)"
        >
          &gt;&gt;|
        </button>
      </div>

      {keyMoments.length > 0 && (
        <div className="replay-controls__moments">
          <span className="replay-controls__moments-label">Jump to:</span>
          {keyMoments.map((moment) => (
            <button
              key={`${moment.type}-${moment.eventIndex}`}
              type="button"
              className={[
                'replay-controls__moment-btn',
                `replay-controls__moment-btn--${moment.type}`,
                moment.eventIndex === currentEventIndex ? 'replay-controls__moment-btn--active' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onJumpToMoment(moment.eventIndex)}
            >
              {moment.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
