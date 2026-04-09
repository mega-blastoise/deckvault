import React from 'react';
import { useAuth } from '../../contexts/Auth';
import { useDecksQuery } from '../../hooks/useDecksQuery';
import type { ResolvedDeck } from './types';

interface SavedDeckPickerProps {
  readonly onDeckResolved: (deck: ResolvedDeck) => void;
}

export function SavedDeckPicker({ onDeckResolved }: SavedDeckPickerProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: decks, isLoading, error } = useDecksQuery();

  if (authLoading) {
    return <div className="deck-input-panel__loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="deck-input-panel__auth-prompt">
        <p>Sign in to use saved decks</p>
        <a href="/sign-in" className="button button--primary">
          Sign In
        </a>
      </div>
    );
  }

  if (isLoading) {
    return <div className="deck-input-panel__loading">Loading decks...</div>;
  }

  if (error) {
    return <div className="deck-input-panel__error">Failed to load decks</div>;
  }

  if (!decks?.length) {
    return (
      <div className="deck-input-panel__empty">
        <p>No saved decks found.</p>
        <a href="/decks/new" className="button button--secondary">
          Build a Deck
        </a>
      </div>
    );
  }

  return (
    <ul className="deck-input-panel__deck-list">
      {decks.map((deck) => {
        const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
        const coverSrc = deck.cards[0]?.card?.images?.small;

        const handleSelect = () => {
          const resolved: ResolvedDeck = {
            name: deck.name,
            source: 'saved',
            totalCards,
            cards: deck.cards.map((dc) => ({ cardId: dc.card.id, count: dc.quantity }))
          };
          onDeckResolved(resolved);
        };

        return (
          <li key={deck.id} className="deck-input-panel__deck-row" onClick={handleSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleSelect()}>
            {coverSrc && (
              <img src={coverSrc} alt="" className="deck-input-panel__deck-thumb" loading="lazy" />
            )}
            <div className="deck-input-panel__deck-info">
              <span className="deck-input-panel__deck-name">{deck.name}</span>
              <span className="deck-input-panel__deck-count">{totalCards} cards</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
