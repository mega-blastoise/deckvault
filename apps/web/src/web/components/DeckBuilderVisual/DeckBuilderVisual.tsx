import React, { useState } from 'react';
import type { DeckCard } from '../../../types/deck';
import type { CardLegalityIssue } from '../../lib/deck-legality';
import './DeckBuilderVisual.css';

interface DeckBuilderVisualProps {
  cards: DeckCard[];
  legalityMap: Map<string, CardLegalityIssue>;
  onAddOne: (cardId: string) => void;
  onRemoveOne: (cardId: string) => void;
}

const SUPERTYPE_ORDER = ['Pokémon', 'Trainer', 'Energy'] as const;

const REASON_LABELS: Record<CardLegalityIssue['reason'], string> = {
  rotated: 'Rotated out of format',
  banned: 'Banned in this format',
  'format-illegal': 'Not legal in this format',
  'over-limit': 'Exceeds 4-copy limit'
};

interface VisualCardProps {
  deckCard: DeckCard;
  issue: CardLegalityIssue | null;
  onAddOne: () => void;
  onRemoveOne: () => void;
}

function VisualCard({ deckCard, issue, onAddOne, onRemoveOne }: VisualCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="deck-builder-visual__card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={deckCard.card.images?.small}
        alt={deckCard.card.name}
        className="deck-builder-visual__card-img"
      />
      <span className="deck-builder-visual__card-qty">×{deckCard.quantity}</span>
      {issue && (
        <span
          className={`deck-builder-visual__legality-badge deck-builder-visual__legality-badge--${issue.reason}`}
          title={REASON_LABELS[issue.reason]}
        >
          ⚠
        </span>
      )}
      {hovered && (
        <div className="deck-builder-visual__card-controls">
          <button type="button" className="deck-builder-visual__ctrl-btn" onClick={onRemoveOne}>−</button>
          <button type="button" className="deck-builder-visual__ctrl-btn" onClick={onAddOne}>+</button>
        </div>
      )}
    </div>
  );
}

export function DeckBuilderVisual({ cards, legalityMap, onAddOne, onRemoveOne }: DeckBuilderVisualProps) {
  const grouped = SUPERTYPE_ORDER.reduce<Record<string, DeckCard[]>>(
    (acc, type) => ({
      ...acc,
      [type]: cards
        .filter((dc) => dc.card.supertype === type)
        .sort((a, b) => a.card.name.localeCompare(b.card.name))
    }),
    {}
  );

  return (
    <div className="deck-builder-visual">
      {SUPERTYPE_ORDER.map((type) => {
        const lane = grouped[type] ?? [];
        if (lane.length === 0) return null;
        const total = lane.reduce((s, c) => s + c.quantity, 0);
        return (
          <div key={type} className="deck-builder-visual__lane">
            <h3 className="deck-builder-visual__lane-title">
              {type} <span className="deck-builder-visual__lane-count">({total})</span>
            </h3>
            <div className="deck-builder-visual__cards">
              {lane.map((dc) => (
                <VisualCard
                  key={dc.card.id}
                  deckCard={dc}
                  issue={legalityMap.get(dc.card.id) ?? null}
                  onAddOne={() => onAddOne(dc.card.id)}
                  onRemoveOne={() => onRemoveOne(dc.card.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
