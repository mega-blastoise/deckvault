import React, { useState } from 'react';
import type { CardProbability } from '../../lib/deck-math';
import { openingHandProbabilities } from '../../lib/deck-math';

interface Props {
  deckCards: { cardId: string; name: string; quantity: number }[];
}

const HAND_SIZES = [5, 6, 7, 8] as const;

export function OpeningHandPanel({ deckCards }: Props) {
  const [handSize, setHandSize] = useState(7);

  const data: CardProbability[] = openingHandProbabilities(deckCards, handSize)
    .slice()
    .sort((a, b) => b.probAtLeastOne - a.probAtLeastOne);

  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Opening Hand</h2>
        <div className="analytics-panel__controls">
          <span className="analytics-panel__control-label">Hand size</span>
          {HAND_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`analytics-panel__size-btn${handSize === size ? ' analytics-panel__size-btn--active' : ''}`}
              onClick={() => setHandSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-panel__table-wrapper">
        <table className="analytics-panel__table">
          <thead>
            <tr>
              <th>Card</th>
              <th className="analytics-panel__col-num">Copies</th>
              <th className="analytics-panel__col-num">P(≥1)</th>
              <th className="analytics-panel__col-num">P(≥2)</th>
              <th className="analytics-panel__col-bar">Probability</th>
            </tr>
          </thead>
          <tbody>
            {data.map((card) => (
              <tr key={card.cardId}>
                <td className="analytics-panel__card-name">{card.name}</td>
                <td className="analytics-panel__col-num">{card.quantity}</td>
                <td className="analytics-panel__col-num analytics-panel__prob">
                  {(card.probAtLeastOne * 100).toFixed(1)}%
                </td>
                <td className="analytics-panel__col-num analytics-panel__prob analytics-panel__prob--dim">
                  {card.quantity >= 2 ? `${(card.probAtLeastTwo * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="analytics-panel__col-bar">
                  <div className="analytics-panel__bar-track">
                    <div
                      className="analytics-panel__bar-fill"
                      style={{ width: `${(card.probAtLeastOne * 100).toFixed(1)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
