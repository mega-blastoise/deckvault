import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useSearchCards, toCardFormat } from '../hooks/useSearchCards';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { ROUTES } from '../routes';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../components/SearchBar/types';

function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');

  const { cards: rawCards, isLoading, isError } = useSearchCards(searchQuery, {
    limit: 100
  });

  const cards: Pokemon.Card[] = useMemo(
    () => rawCards.map((c) => toCardFormat(c) as unknown as Pokemon.Card),
    [rawCards]
  );

  const handleSearch = useCallback(
    (filters: SearchFilters) => {
      const q = filters.query ?? '';
      setSearchQuery(q);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      setSearchParams(params);
    },
    [setSearchParams]
  );

  const handleCardSelect = useCallback(
    (card: Pokemon.Card) => {
      navigate(ROUTES.CARD(card.id));
    },
    [navigate]
  );

  return (
    <div className="page browse-page">
      <div className="page__header">
        <h1>Browse Cards</h1>
        <p>Search across all Pokemon TCG cards.</p>
      </div>

      <div className="browse-page__toolbar">
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search by card name…"
          showFilters={false}
          loading={isLoading}
        />
      </div>

      {isError && (
        <div className="browse-page__error">
          <p>Failed to load cards. Please try again.</p>
        </div>
      )}

      <div className="page__content">
        <CardGrid
          cards={cards}
          onCardSelect={handleCardSelect}
          loading={isLoading}
          emptyMessage={
            searchQuery
              ? `No cards found for "${searchQuery}".`
              : 'Enter a card name to search.'
          }
        />
      </div>
    </div>
  );
}

export default BrowsePage;
