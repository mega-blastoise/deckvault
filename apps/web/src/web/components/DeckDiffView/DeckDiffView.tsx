import React, { useState } from 'react';
import type { DeckDiff } from '../../hooks/useVersionsQuery';
import './DeckDiffView.css';

interface Props {
  diff: DeckDiff;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

type Card = DeckDiff['added'][number]['card'];

function CardRow({
  card,
  quantity,
  delta,
  variant
}: {
  card: Card;
  quantity: number;
  delta?: number;
  variant: 'added' | 'removed' | 'unchanged';
}) {
  const src = card.images?.small;
  return (
    <div className={`deck-diff__card-row deck-diff__card-row--${variant}`}>
      {src && <img src={src} alt={card.name} className="deck-diff__card-img" loading="lazy" />}
      <div className="deck-diff__card-info">
        <span className="deck-diff__card-name">{card.name}</span>
        <span className="deck-diff__card-set">{card.set.name}</span>
      </div>
      <span className="deck-diff__card-qty">×{quantity}</span>
      {delta !== undefined && (
        <span className={`deck-diff__delta deck-diff__delta--${variant}`}>
          {variant === 'added' ? `+${delta}` : `-${delta}`}
        </span>
      )}
    </div>
  );
}

export function DeckDiffView({ diff }: Props) {
  const [showUnchanged, setShowUnchanged] = useState(false);

  const vA = diff.versionA;
  const vB = diff.versionB;

  const totalChanges = diff.added.length + diff.removed.length;

  return (
    <div className="deck-diff">
      <div className="deck-diff__versions">
        <div className="deck-diff__version-label">
          <span className="deck-diff__version-num">v{vA.version}</span>
          <span className="deck-diff__version-date">{formatDate(vA.createdAt)}</span>
          {vA.label && <span className="deck-diff__version-tag">{vA.label}</span>}
        </div>
        <span className="deck-diff__vs">vs</span>
        <div className="deck-diff__version-label deck-diff__version-label--b">
          <span className="deck-diff__version-num">v{vB.version}</span>
          <span className="deck-diff__version-date">{formatDate(vB.createdAt)}</span>
          {vB.label && <span className="deck-diff__version-tag">{vB.label}</span>}
        </div>
      </div>

      {totalChanges === 0 && (
        <p className="deck-diff__no-changes">No card changes between these two versions.</p>
      )}

      {diff.added.length > 0 && (
        <section className="deck-diff__section">
          <h3 className="deck-diff__section-title deck-diff__section-title--added">
            ➕ Added ({diff.added.length} {diff.added.length === 1 ? 'card' : 'cards'})
          </h3>
          <div className="deck-diff__card-list">
            {diff.added.map((entry) => (
              <CardRow
                key={entry.card.id}
                card={entry.card}
                quantity={entry.quantity}
                delta={entry.deltaQuantity}
                variant="added"
              />
            ))}
          </div>
        </section>
      )}

      {diff.removed.length > 0 && (
        <section className="deck-diff__section">
          <h3 className="deck-diff__section-title deck-diff__section-title--removed">
            ➖ Removed ({diff.removed.length} {diff.removed.length === 1 ? 'card' : 'cards'})
          </h3>
          <div className="deck-diff__card-list">
            {diff.removed.map((entry) => (
              <CardRow
                key={entry.card.id}
                card={entry.card}
                quantity={entry.quantity}
                delta={entry.deltaQuantity}
                variant="removed"
              />
            ))}
          </div>
        </section>
      )}

      <section className="deck-diff__section">
        <button
          type="button"
          className="deck-diff__toggle"
          onClick={() => setShowUnchanged((v) => !v)}
        >
          ✓ Unchanged ({diff.unchanged.length} cards)
          <span className="deck-diff__toggle-arrow">{showUnchanged ? '▲' : '▼'}</span>
        </button>
        {showUnchanged && (
          <div className="deck-diff__card-list deck-diff__card-list--unchanged">
            {diff.unchanged.map((entry) => (
              <CardRow
                key={entry.card.id}
                card={entry.card}
                quantity={entry.quantity}
                variant="unchanged"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
