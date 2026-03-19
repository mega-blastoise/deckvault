import React from 'react';
import './MetaDeckCard.css';

export interface MetaDeckSummary {
  id: string;
  name: string;
  archetype: string;
  format: string;
  placement: string | null;
  eventName: string | null;
  eventDate: string | null;
  lastUpdated: string;
  cardCount: number;
  ownedCardCount?: number;
  missingCards?: { cardId: string; name: string; quantity: number }[];
  buildable?: boolean;
  totalCards?: number;
}

interface MetaDeckCardProps {
  deck: MetaDeckSummary;
  onClone: (deckId: string) => void;
}

const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard',
  expanded: 'Expanded',
  unlimited: 'Unlimited'
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function MetaDeckCard({ deck, onClone }: MetaDeckCardProps) {
  const total = deck.totalCards ?? deck.cardCount;
  const owned = deck.ownedCardCount;
  const isCollectionAware = owned !== undefined;
  const missing = deck.missingCards ?? [];
  const missingCount = missing.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="meta-deck-card">
      <div className="meta-deck-card__header">
        <div className="meta-deck-card__title-row">
          <h3 className="meta-deck-card__name">{deck.name}</h3>
          <span className={`meta-deck-card__format-badge meta-deck-card__format-badge--${deck.format}`}>
            {FORMAT_LABELS[deck.format] ?? deck.format}
          </span>
        </div>
        {(deck.eventName || deck.placement) && (
          <p className="meta-deck-card__event">
            {deck.placement && <strong>{deck.placement}</strong>}
            {deck.placement && deck.eventName && ' · '}
            {deck.eventName}
            {deck.eventDate && <span className="meta-deck-card__date"> · {formatDate(deck.eventDate)}</span>}
          </p>
        )}
      </div>

      {isCollectionAware && (
        <div className="meta-deck-card__collection">
          <div
            className="meta-deck-card__progress-bar"
            style={{ '--progress': `${((owned!) / total) * 100}%` } as React.CSSProperties}
            role="progressbar"
            aria-valuenow={owned}
            aria-valuemax={total}
          />
          <div className="meta-deck-card__progress-label">
            {deck.buildable ? (
              <span className="meta-deck-card__buildable">✓ You can build this</span>
            ) : (
              <span>
                {owned}/{total} cards owned · Missing {missingCount}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="meta-deck-card__footer">
        <span className="meta-deck-card__card-count">{deck.cardCount} cards</span>
        <button
          type="button"
          className="meta-deck-card__build-btn"
          onClick={() => onClone(deck.id)}
        >
          Build This Deck
        </button>
      </div>
    </div>
  );
}
