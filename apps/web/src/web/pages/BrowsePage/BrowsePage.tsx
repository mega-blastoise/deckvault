import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useSearchCards, toCardFormat } from '../../hooks/useSearchCards';
import { useSets } from '../../hooks/useSets';
import { useSetCards } from '../../hooks/useSetCards';
import { useUseCaseCards } from '../../hooks/useUseCaseCards';
import { ROUTES } from '../../routes';
import { pipeline } from '../../utils/pipeline';
import { BrowsePageView } from './View';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../../components/SearchBar/types';
import type { CardFunctionalTag } from '../../../types/card-tags';
import type { BrowseMode } from './types';

type SetsData = { data: Pokemon.Set[] };
type SetCardsData = { data: Pokemon.Card[] };

function BrowsePageComponent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialMode = (searchParams.get('mode') === 'use-case' ? 'use-case' : 'name') as BrowseMode;
  const initialTags = searchParams.get('tags')
    ? (searchParams.get('tags')!.split(',').filter(Boolean) as CardFunctionalTag[])
    : [];

  const [mode, setMode] = useState<BrowseMode>(initialMode);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [selectedSetId, setSelectedSetId] = useState(searchParams.get('set') ?? '');
  const [selectedTags, setSelectedTags] = useState<CardFunctionalTag[]>(initialTags);
  const [tagFilter, setTagFilter] = useState('');

  const setsResult = useSets();
  const sets: Pokemon.Set[] = setsResult.data
    ? (setsResult.data.data as unknown as SetsData).data ?? []
    : [];

  const { cards: rawCards, isLoading: searchLoading, isError: searchError } = useSearchCards(
    searchQuery,
    { limit: 100, enabled: mode === 'name' && !selectedSetId }
  );

  const setCardsResult = useSetCards(selectedSetId, { enabled: mode === 'name' && !!selectedSetId });
  const allSetCards: Pokemon.Card[] = setCardsResult.data
    ? (setCardsResult.data.data as unknown as SetCardsData).data ?? []
    : [];

  const useCaseResult = useUseCaseCards(selectedTags, 60);
  const useCaseCards: Pokemon.Card[] = useMemo(() => {
    if (!useCaseResult.data) return [];
    const raw = (useCaseResult.data.data as unknown as { data: (Pokemon.Card & { metaUsageCount: number })[] }).data;
    return (raw ?? []) as Pokemon.Card[];
  }, [useCaseResult.data]);

  const isLoading = mode === 'use-case'
    ? useCaseResult.isLoading
    : selectedSetId
    ? setCardsResult.isLoading
    : searchLoading;

  const isError = mode === 'use-case'
    ? useCaseResult.isError
    : selectedSetId
    ? setCardsResult.isError
    : searchError;

  const cards: Pokemon.Card[] = useMemo(() => {
    if (mode === 'use-case') return useCaseCards;
    if (selectedSetId) {
      const q = searchQuery.toLowerCase().trim();
      return q ? allSetCards.filter((c) => c.name.toLowerCase().includes(q)) : allSetCards;
    }
    return rawCards.map((c) => toCardFormat(c) as unknown as Pokemon.Card);
  }, [mode, useCaseCards, selectedSetId, allSetCards, rawCards, searchQuery]);

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

  const handleModeChange = useCallback(
    (next: BrowseMode) => {
      setMode(next);
      const params = new URLSearchParams();
      if (next === 'use-case') {
        params.set('mode', 'use-case');
        if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
      }
      setSearchParams(params);
    },
    [selectedTags, setSearchParams]
  );

  const handleTagToggle = useCallback(
    (tag: CardFunctionalTag) => {
      const next = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      setSelectedTags(next);
      const params = new URLSearchParams({ mode: 'use-case' });
      if (next.length > 0) params.set('tags', next.join(','));
      setSearchParams(params);
    },
    [selectedTags, setSearchParams]
  );

  const handleCardSelect = useCallback(
    (card: Pokemon.Card) => {
      navigate(ROUTES.CARD(card.id));
    },
    [navigate]
  );

  const handleClearTags = useCallback(() => {
    setSelectedTags([]);
    setSearchParams({ mode: 'use-case' });
  }, [setSearchParams]);

  const emptyMessage = useMemo(() => {
    if (mode === 'use-case') {
      return selectedTags.length === 0
        ? 'Select a use case above to find cards.'
        : 'No cards found for the selected use cases.';
    }
    if (selectedSetId && searchQuery) return `No cards matching "${searchQuery}" in this set.`;
    if (selectedSetId) return 'No cards found in this set.';
    if (searchQuery) return `No cards found for "${searchQuery}".`;
    return 'Enter a card name to search, or pick a set.';
  }, [mode, selectedTags, selectedSetId, searchQuery]);

  return (
    <BrowsePageView
      mode={mode}
      searchQuery={searchQuery}
      selectedSetId={selectedSetId}
      selectedTags={selectedTags}
      tagFilter={tagFilter}
      sets={sets}
      cards={cards}
      isLoading={isLoading}
      isError={isError}
      emptyMessage={emptyMessage}
      onModeChange={handleModeChange}
      onSearch={handleSearch}
      onSetChange={handleSetChange}
      onTagToggle={handleTagToggle}
      onTagFilterChange={setTagFilter}
      onClearTags={handleClearTags}
      onCardSelect={handleCardSelect}
    />
  );
}

export const BrowsePage = pipeline(React.memo)(BrowsePageComponent);
