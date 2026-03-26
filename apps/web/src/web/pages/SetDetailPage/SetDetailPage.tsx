import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useSet } from '@/web/hooks/useSet';
import { useSetCards } from '@/web/hooks/useSetCards';
import { CardGrid } from '@/web/components/CardGrid';
import { ROUTES } from '@/web/routes';
import type { Pokemon } from '@pokemon/clients';
import './SetDetailPage.css';

type SetData = { data: Pokemon.Set };
type SetCardsData = { data: Pokemon.Card[] };

function SetDetailPage() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();

  const setResult = useSet(setId ?? '');
  const cardsResult = useSetCards(setId ?? '');

  const set: Pokemon.Set | null = setResult.data
    ? (setResult.data.data as unknown as SetData).data ?? null
    : null;

  const cards: Pokemon.Card[] = cardsResult.data
    ? (cardsResult.data.data as unknown as SetCardsData).data ?? []
    : [];

  const handleCardSelect = useCallback(
    (card: Pokemon.Card) => {
      navigate(ROUTES.CARD(card.id));
    },
    [navigate]
  );

  const isLoading = setResult.isLoading || cardsResult.isLoading;

  if (setResult.isError) {
    return (
      <div className="page set-detail-page">
        <div className="page__header">
          <h1>Set Not Found</h1>
        </div>
        <div className="page__content">
          <div className="page__empty-state">
            <h2>Set not found</h2>
            <p>The set you&apos;re looking for doesn&apos;t exist.</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate(ROUTES.SETS)}
            >
              Browse Sets
            </button>
          </div>
        </div>
      </div>
    );
  }

  const logo = (set?.images as { logo?: string })?.logo;
  const symbol = (set?.images as { symbol?: string })?.symbol;

  return (
    <div className="page set-detail-page">
      <div className="set-detail-page__back">
        <button
          type="button"
          className="set-detail-page__back-btn"
          onClick={() => navigate(ROUTES.SETS)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          All Sets
        </button>
      </div>

      <div className="page__header set-detail-page__header">
        {logo ? (
          <img src={logo} alt={set?.name ?? ''} className="set-detail-page__logo" />
        ) : (
          <h1>{set?.name ?? 'Loading…'}</h1>
        )}
        <div className="set-detail-page__meta">
          {set?.series && (
            <span className="set-detail-page__series">{set.series}</span>
          )}
          {set?.releaseDate && (
            <span className="set-detail-page__date">{set.releaseDate}</span>
          )}
          {set && (
            <span className="set-detail-page__count">
              {cards.length > 0 ? `${cards.length}` : set.total ?? set.printedTotal} cards
            </span>
          )}
          {symbol && (
            <img src={symbol} alt="" className="set-detail-page__symbol" />
          )}
        </div>
      </div>

      <div className="page__content">
        <CardGrid
          cards={cards}
          onCardSelect={handleCardSelect}
          loading={isLoading}
          emptyMessage={isLoading ? 'Loading cards…' : 'No cards found.'}
        />
      </div>
    </div>
  );
}

export { SetDetailPage };
