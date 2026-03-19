import React, { useState, useCallback, useRef } from 'react';
import type { DeckCard } from '../../../types/deck';

interface SimCard {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  imageSmall?: string;
  imageLarge?: string;
}

interface Props {
  cards: DeckCard[];
}

function buildPool(cards: DeckCard[]): SimCard[] {
  const pool: SimCard[] = [];
  let idx = 0;
  for (const dc of cards) {
    for (let i = 0; i < dc.quantity; i++) {
      pool.push({
        id: `${dc.card.id}-${i}-${idx++}`,
        name: dc.card.name,
        supertype: dc.card.supertype,
        subtypes: dc.card.subtypes,
        imageSmall: dc.card.images?.small,
        imageLarge: dc.card.images?.large,
      });
    }
  }
  return pool;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function hasBasic(hand: SimCard[]): boolean {
  return hand.some(
    (c) => c.supertype === 'Pokémon' && c.subtypes?.includes('Basic')
  );
}

type DealState = {
  hand: SimCard[];
  prizes: SimCard[];
  remainder: SimCard[];
  mulliganCount: number;
  revealedPrizes: Set<number>;
};

const EMPTY_STATE: DealState = {
  hand: [],
  prizes: [],
  remainder: [],
  mulliganCount: 0,
  revealedPrizes: new Set(),
};

function deal(pool: SimCard[], existingMulligans: number): DealState {
  const deck = shuffle(pool);
  const hand = deck.slice(0, 7);
  const prizes = deck.slice(7, 13);
  const remainder = deck.slice(13);
  const mulliganCount =
    !hasBasic(hand) ? existingMulligans + 1 : existingMulligans;
  return { hand, prizes, remainder, mulliganCount, revealedPrizes: new Set() };
}

function CardFace({ card, large = false }: { card: SimCard; large?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const src = large ? (card.imageLarge ?? card.imageSmall) : card.imageSmall;

  return (
    <div className={`sim-card ${large ? 'sim-card--large' : ''}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={card.name}
          className="sim-card__img"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="sim-card__placeholder">
          <span className={`sim-card__placeholder-type sim-card__placeholder-type--${card.supertype.toLowerCase().replace('é', 'e')}`}>
            {card.supertype.slice(0, 1)}
          </span>
          <span className="sim-card__placeholder-name">{card.name}</span>
        </div>
      )}
      <div className="sim-card__label">{card.name}</div>
    </div>
  );
}

function PrizeSlot({
  card,
  index,
  revealed,
  onReveal,
}: {
  card: SimCard;
  index: number;
  revealed: boolean;
  onReveal: (i: number) => void;
}) {
  return (
    <button
      type="button"
      className={`sim-prize ${revealed ? 'sim-prize--revealed' : 'sim-prize--hidden'}`}
      onClick={() => !revealed && onReveal(index)}
      title={revealed ? card.name : `Prize card ${index + 1} — click to reveal`}
    >
      <div className="sim-prize__inner">
        <div className="sim-prize__front">
          {revealed ? (
            <CardFace card={card} />
          ) : null}
        </div>
        <div className="sim-prize__back">
          <div className="sim-prize__back-design">
            <span className="sim-prize__back-label">{index + 1}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function HandSimulator({ cards }: Props) {
  const pool = useRef<SimCard[]>(buildPool(cards));
  const [state, setState] = useState<DealState>(EMPTY_STATE);
  const [isDealing, setIsDealing] = useState(false);

  const handleDeal = useCallback(() => {
    setIsDealing(true);
    setTimeout(() => {
      setState((prev) =>
        deal(pool.current, prev.hand.length === 0 ? 0 : prev.mulliganCount)
      );
      setIsDealing(false);
    }, 120);
  }, []);

  const handleReset = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  const revealPrize = useCallback((i: number) => {
    setState((prev) => ({
      ...prev,
      revealedPrizes: new Set([...prev.revealedPrizes, i]),
    }));
  }, []);

  const revealAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      revealedPrizes: new Set([0, 1, 2, 3, 4, 5]),
    }));
  }, []);

  const hasDealt = state.hand.length > 0;
  const handHasBasic = hasDealt && hasBasic(state.hand);
  const allPrizesRevealed = state.revealedPrizes.size === 6;

  return (
    <section className="analytics-panel analytics-panel--simulator">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Hand Simulator</h2>
        <div className="sim-actions">
          {hasDealt && (
            <button
              type="button"
              className="button button--ghost sim-actions__reset"
              onClick={handleReset}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className={`button button--primary${isDealing ? ' button--loading' : ''}`}
            onClick={handleDeal}
            disabled={isDealing}
          >
            {hasDealt ? 'Deal New Hand' : 'Deal Opening Hand'}
          </button>
        </div>
      </div>

      {!hasDealt && (
        <div className="sim-empty">
          <p className="sim-empty__text">
            Click <strong>Deal Opening Hand</strong> to randomly draw 7 cards and
            set 6 prizes — just like the start of a real match.
          </p>
        </div>
      )}

      {hasDealt && (
        <div className={`sim-layout${isDealing ? ' sim-layout--dealing' : ''}`}>

          {/* Status bar */}
          <div className="sim-status">
            <span className={`sim-status__basic ${handHasBasic ? 'sim-status__basic--ok' : 'sim-status__basic--fail'}`}>
              {handHasBasic ? '✓ Basic Pokémon in hand' : '✗ No Basic — Mulligan!'}
            </span>
            {state.mulliganCount > 0 && (
              <span className="sim-status__mulligans">
                Mulligans: <strong>{state.mulliganCount}</strong>
              </span>
            )}
            <span className="sim-status__remaining">
              Deck remaining: <strong>{state.remainder.length}</strong>
            </span>
          </div>

          {/* Opening hand */}
          <div className="sim-section">
            <div className="sim-section__header">
              <span className="sim-section__label">Opening Hand (7)</span>
            </div>
            <div className="sim-hand">
              {state.hand.map((card) => (
                <CardFace key={card.id} card={card} />
              ))}
            </div>
          </div>

          {/* Prize cards */}
          <div className="sim-section">
            <div className="sim-section__header">
              <span className="sim-section__label">Prize Cards (6)</span>
              {!allPrizesRevealed && (
                <button
                  type="button"
                  className="button button--ghost sim-section__reveal-all"
                  onClick={revealAll}
                >
                  Reveal All
                </button>
              )}
            </div>
            <div className="sim-prizes">
              {state.prizes.map((card, i) => (
                <PrizeSlot
                  key={card.id}
                  card={card}
                  index={i}
                  revealed={state.revealedPrizes.has(i)}
                  onReveal={revealPrize}
                />
              ))}
            </div>
            {!allPrizesRevealed && (
              <p className="sim-prizes__hint">Click a prize card to reveal it.</p>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
