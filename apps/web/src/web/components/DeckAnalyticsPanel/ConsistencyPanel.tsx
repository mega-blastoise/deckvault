import React, { useState, useMemo } from 'react';
import { comboConsistency } from '../../lib/deck-math';

interface CardOption {
  cardId: string;
  name: string;
  quantity: number;
}

interface Props {
  cards: CardOption[];
}

export function ConsistencyPanel({ cards }: Props) {
  const nonEnergy = useMemo(
    () => cards.filter((c) => c.quantity > 0).slice().sort((a, b) => b.quantity - a.quantity),
    [cards]
  );

  const [selected, setSelected] = useState<string[]>(() => {
    const top2 = nonEnergy.slice(0, 2).map((c) => c.cardId);
    return top2;
  });

  const selectedCards = selected
    .map((id) => nonEnergy.find((c) => c.cardId === id))
    .filter((c): c is CardOption => c !== undefined);

  const probability = comboConsistency(
    60,
    selectedCards.map((c) => ({ quantity: c.quantity })),
    9
  );

  const toggleCard = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Combo Consistency</h2>
      </div>

      <p className="analytics-panel__description">
        Select up to 3 cards to see the probability of holding all of them by turn 2.
      </p>

      <div className="analytics-panel__combo-grid">
        {nonEnergy.map((card) => {
          const isSelected = selected.includes(card.cardId);
          return (
            <button
              key={card.cardId}
              type="button"
              className={`analytics-panel__combo-chip${isSelected ? ' analytics-panel__combo-chip--selected' : ''}`}
              onClick={() => toggleCard(card.cardId)}
              disabled={!isSelected && selected.length >= 3}
            >
              <span className="analytics-panel__combo-chip-name">{card.name}</span>
              <span className="analytics-panel__combo-chip-qty">×{card.quantity}</span>
            </button>
          );
        })}
      </div>

      <div className="analytics-panel__combo-result">
        {selectedCards.length === 0 ? (
          <p className="analytics-panel__empty">Select at least one card above.</p>
        ) : (
          <>
            <div className="analytics-panel__combo-prob">
              <span className="analytics-panel__combo-prob-value">
                {(probability * 100).toFixed(1)}%
              </span>
              <span className="analytics-panel__combo-prob-label">
                P(all {selectedCards.length === 1 ? 'card' : 'cards'} by turn 2)
              </span>
            </div>
            <div className="analytics-panel__combo-cards">
              {selectedCards.map((c) => (
                <span key={c.cardId} className="analytics-panel__badge analytics-panel__badge--neutral">
                  {c.name} ×{c.quantity}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
