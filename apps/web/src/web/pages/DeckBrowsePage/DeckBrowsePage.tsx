import React, { useState, useCallback } from 'react';
import { useFadeIn } from '../../motion/hooks/useFadeIn';
import { useDeckBrowseQuery } from '../../hooks/useDeckBrowseQuery';
import { pipeline } from '../../utils/pipeline';
import { DeckBrowsePageView } from './View';
import type { DeckFormat } from '../../../types/deck';

function DeckBrowsePageComponent() {
  const [page, setPage] = useState(1);
  const [formatFilter, setFormatFilter] = useState<DeckFormat | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { ref: headerRef } = useFadeIn({ y: 20, duration: 0.4 });

  const { data, isLoading } = useDeckBrowseQuery({ page, formatFilter, searchQuery });

  const decks = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.limit)
    : 0;

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setPage(1);
    },
    []
  );

  const handleFormatFilterChange = useCallback((format: DeckFormat | 'all') => {
    setFormatFilter(format);
    setPage(1);
  }, []);

  return (
    <DeckBrowsePageView
      headerRef={headerRef}
      page={page}
      formatFilter={formatFilter}
      searchQuery={searchQuery}
      decks={decks}
      isLoading={isLoading}
      totalPages={totalPages}
      onSearch={handleSearch}
      onFormatFilterChange={handleFormatFilterChange}
      onPageChange={setPage}
    />
  );
}

export const DeckBrowsePage = pipeline(React.memo)(DeckBrowsePageComponent);
