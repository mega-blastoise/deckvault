import React from 'react';

interface KeyCardSelectorProps {
  readonly deckCards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
  readonly keyCardIds: ReadonlyArray<string>;
  readonly onChange: (keyCardIds: ReadonlyArray<string>) => void;
}

const MAX_KEY_CARDS = 6;

function cardIdToDisplay(cardId: string): string {
  const match = cardId.match(/^([a-z0-9]+)[-](\d+[a-z]?)$/i);
  if (!match) return cardId;
  const [, set, num] = match;
  const setDisplay = (set ?? '').toUpperCase().replace('PT', '.');
  return `${setDisplay} #${num}`;
}

export function KeyCardSelector({ deckCards, keyCardIds, onChange }: KeyCardSelectorProps) {
  if (deckCards.length === 0) {
    return (
      <div className="sim-config__key-empty">
        Select a deck to choose key cards
      </div>
    );
  }

  const toggle = (cardId: string) => {
    if (keyCardIds.includes(cardId)) {
      onChange(keyCardIds.filter((id) => id !== cardId));
    } else if (keyCardIds.length < MAX_KEY_CARDS) {
      onChange([...keyCardIds, cardId]);
    }
  };

  return (
    <div className="sim-config__key-grid">
      {deckCards.map((card) => {
        const isSelected = keyCardIds.includes(card.cardId);
        const isDisabled = !isSelected && keyCardIds.length >= MAX_KEY_CARDS;
        return (
          <button
            key={card.cardId}
            type="button"
            className={`sim-config__key-card${isSelected ? ' sim-config__key-card--selected' : ''}${isDisabled ? ' sim-config__key-card--disabled' : ''}`}
            onClick={() => toggle(card.cardId)}
            disabled={isDisabled}
            title={isDisabled ? `Max ${MAX_KEY_CARDS} key cards` : card.cardId}
          >
            <span className="sim-config__key-card-id">{cardIdToDisplay(card.cardId)}</span>
            <span className="sim-config__key-card-count">&times;{card.count}</span>
          </button>
        );
      })}
    </div>
  );
}
