import React, { useEffect, useRef } from 'react';
import type { GameEvent } from '@pokemon/engine/browser';
import type { SerializedCardDefinition } from '../types';
import { renderEventText } from './EventRenderer';

interface EventLogPanelProps {
  readonly events: ReadonlyArray<GameEvent>;
  readonly currentEventIndex: number;
  readonly definitions: Record<string, SerializedCardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
  readonly onEventClick: (index: number) => void;
}

export function EventLogPanel({
  events,
  currentEventIndex,
  definitions,
  deck1Name,
  deck2Name,
  onEventClick
}: EventLogPanelProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentEventIndex]);

  return (
    <div className="event-log">
      <div className="event-log__header">Event Log</div>
      <div className="event-log__list">
        {events.map((event, index) => {
          const text = renderEventText(event, definitions, deck1Name, deck2Name);
          const isCurrent = index === currentEventIndex;
          const isTurnMarker = event.type === 'TURN_STARTED' || event.type === 'GAME_OVER';

          return (
            <button
              key={index}
              type="button"
              ref={isCurrent ? activeRef : null}
              className={[
                'event-log__item',
                isCurrent ? 'event-log__item--current' : '',
                isTurnMarker ? 'event-log__item--turn-marker' : '',
                index > currentEventIndex ? 'event-log__item--future' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onEventClick(index)}
            >
              <span className="event-log__index">{index}</span>
              <span className="event-log__text">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
