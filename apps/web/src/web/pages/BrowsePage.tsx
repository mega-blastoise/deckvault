import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useSearchCards, toCardFormat } from '../hooks/useSearchCards';
import { useSets } from '../hooks/useSets';
import { useSetCards } from '../hooks/useSetCards';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { ROUTES } from '../routes';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../components/SearchBar/types';

type SetsData = { data: Pokemon.Set[] };
type SetCardsData = { data: Pokemon.Card[] };

function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [selectedSetId, setSelectedSetId] = useState(searchParams.get('set') ?? '');

  const setsResult = useSets();
  const sets: Pokemon.Set[] = setsResult.data
    ? (setsResult.data.data as unknown as SetsData).data ?? []
    : [];

  const { cards: rawCards, isLoading: searchLoading, isError: searchError } = useSearchCards(
    searchQuery,
    { limit: 100, enabled: !selectedSetId }
  );

  const setCardsResult = useSetCards(selectedSetId, { enabled: !!selectedSetId });
  const allSetCards: Pokemon.Card[] = setCardsResult.data
    ? (setCardsResult.data.data as unknown as SetCardsData).data ?? []
    : [];

  const isLoading = selectedSetId ? setCardsResult.isLoading : searchLoading;
  const isError = selectedSetId ? setCardsResult.isError : searchError;

  const cards: Pokemon.Card[] = useMemo(() => {
    if (selectedSetId) {
      const q = searchQuery.toLowerCase().trim();
      return q
        ? allSetCards.filter((c) => c.name.toLowerCase().includes(q))
        : allSetCards;
    }
    return rawCards.map((c) => toCardFormat(c) as unknown as Pokemon.Card);
  }, [selectedSetId, allSetCards, rawCards, searchQuery]);

  const handleSearch = useCallback(
    (filters: SearchFilters) => {
      const q = filters.query ?? '';
      setSearchQuery(q);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (selectedSetId) params.set('set', selectedSetId);
      setSearchParams(params);
    },
    [setSearchParams, selectedSetId]
  );

  const handleSetChange = useCallback(
    (setId: string) => {
      setSelectedSetId(setId);
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (setId) params.set('set', setId);
      setSearchParams(params);
    },
    [searchQuery, setSearchParams]
  );

  const handleCardSelect = useCallback(
    (card: Pokemon.Card) => {
      navigate(ROUTES.CARD(card.id));
    },
    [navigate]
  );

  const emptyMessage = useMemo(() => {
    if (selectedSetId && searchQuery)
      return `No cards matching "${searchQuery}" in this set.`;
    if (selectedSetId) return 'No cards found in this set.';
    if (searchQuery) return `No cards found for "${searchQuery}".`;
    return 'Enter a card name to search, or pick a set.';
  }, [selectedSetId, searchQuery]);

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
        <select
          className="browse-page__set-filter"
          value={selectedSetId}
          onChange={(e) => handleSetChange(e.target.value)}
          aria-label="Filter by set"
        >
          <option value="">All Sets</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
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
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}

export default BrowsePage;
