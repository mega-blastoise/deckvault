import React, { useEffect, useState } from 'react';
import type { MetaDeck, ResolvedDeck } from './types';

interface MetaDeckPickerProps {
  readonly onDeckResolved: (deck: ResolvedDeck) => void;
  readonly compact?: boolean;
}

const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

export function MetaDeckPicker({ onDeckResolved, compact = false }: MetaDeckPickerProps) {
  const [decks, setDecks] = useState<MetaDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/bff/sim/meta-decks')
      .then((r) => r.json() as Promise<{ data: MetaDeck[] }>)
      .then((json) => {
        const sorted = [...json.data].sort(
          (a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)
        );
        setDecks(sorted);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="deck-input-panel__loading">Loading meta decks...</div>;
  if (error) return <div className="deck-input-panel__error">Failed to load meta decks</div>;

  const handleSelect = (deck: MetaDeck) => {
    const resolved: ResolvedDeck = {
      name: deck.name,
      source: 'meta',
      totalCards: deck.cards.reduce((s, c) => s + c.quantity, 0),
      cards: deck.cards.map((c) => ({ cardId: c.cardId, count: c.quantity }))
    };
    onDeckResolved(resolved);
  };

  if (compact) {
    return (
      <ul className="deck-input-panel__meta-list">
        {decks.map((deck) => (
          <li key={deck.id}>
            <button
              type="button"
              className="deck-input-panel__meta-item"
              onClick={() => handleSelect(deck)}
            >
              <span className={`deck-input-panel__tier-badge deck-input-panel__tier-badge--${deck.tier.toLowerCase()}`}>
                {deck.tier}
              </span>
              <span className="deck-input-panel__meta-item-name">{deck.name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="deck-input-panel__meta-grid">
      {decks.map((deck) => (
        <button
          key={deck.id}
          type="button"
          className="deck-input-panel__meta-card"
          onClick={() => handleSelect(deck)}
        >
          <div className="deck-input-panel__meta-header">
            <span className={`deck-input-panel__tier-badge deck-input-panel__tier-badge--${deck.tier.toLowerCase()}`}>
              {deck.tier}
            </span>
            <span className="deck-input-panel__meta-name">{deck.name}</span>
          </div>
          <div className="deck-input-panel__meta-event">
            {deck.description}
          </div>
          <div className="deck-input-panel__meta-event-date">
            {deck.eventName} &bull; {deck.eventDate}
          </div>
        </button>
      ))}
    </div>
  );
}
