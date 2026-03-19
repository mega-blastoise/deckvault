import React, { useRef, useState } from 'react';
import type { DeckCard } from '../../../types/deck';
import type { CardLegalityIssue } from '../../lib/deck-legality';
import './DeckBuilderList.css';

interface DeckBuilderListProps {
  cards: DeckCard[];
  legalityMap: Map<string, CardLegalityIssue>;
  onAddOne: (cardId: string) => void;
  onRemoveOne: (cardId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const REASON_LABELS: Record<CardLegalityIssue['reason'], string> = {
  rotated: 'Rotated out of format',
  banned: 'Banned in this format',
  'format-illegal': 'Not legal in this format',
  'over-limit': 'Exceeds 4-copy limit'
};

export function DeckBuilderList({ cards, legalityMap, onAddOne, onRemoveOne, onReorder }: DeckBuilderListProps) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(dropIndex: number) {
    const dragIndex = dragIndexRef.current;
    if (dragIndex !== null && dragIndex !== dropIndex) {
      onReorder(dragIndex, dropIndex);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  if (cards.length === 0) {
    return (
      <div className="deck-builder-list__empty">
        <p>Click cards to add them to your deck</p>
      </div>
    );
  }

  return (
    <ul className="deck-builder-list">
      {cards.map((dc, index) => {
        const issue = legalityMap.get(dc.card.id);
        return (
          <li
            key={dc.card.id}
            className={`deck-builder-list__item${dragOverIndex === index ? ' deck-builder-list__item--drag-over' : ''}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          >
            <img
              src={dc.card.images?.small}
              alt={dc.card.name}
              className="deck-builder-list__card-image"
            />
            <div className="deck-builder-list__card-info">
              <span className="deck-builder-list__card-name">{dc.card.name}</span>
              {issue && (
                <span
                  className={`deck-builder-list__legality-badge deck-builder-list__legality-badge--${issue.reason}`}
                  title={REASON_LABELS[issue.reason]}
                >
                  ⚠
                </span>
              )}
            </div>
            <div className="deck-builder-list__controls">
              <button type="button" className="deck-builder-list__qty-btn" onClick={() => onRemoveOne(dc.card.id)}>−</button>
              <span className="deck-builder-list__qty">{dc.quantity}</span>
              <button type="button" className="deck-builder-list__qty-btn" onClick={() => onAddOne(dc.card.id)}>+</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
