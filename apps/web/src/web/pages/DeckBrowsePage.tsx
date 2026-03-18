import React, { useState, useCallback } from 'react';
import { Link } from 'react-router';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../routes';
import { useFadeIn } from '../motion/hooks/useFadeIn';
import type { DeckFormat } from '../../types/deck';

interface BrowseDeck {
  id: string;
  name: string;
  description?: string;
  format: string;
  coverCardId?: string;
  cardCount: number;
  updatedAt: string;
  owner: {
    name: string;
    avatarUrl: string | null;
  };
}

interface BrowseResponse {
  data: BrowseDeck[];
  pagination: { page: number; limit: number; total: number };
}

async function fetchBrowseDecks(params: {
  page: number;
  limit: number;
  format?: string;
  q?: string;
}): Promise<BrowseResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page));
  searchParams.set('limit', String(params.limit));
  if (params.format) searchParams.set('format', params.format);
  if (params.q) searchParams.set('q', params.q);

  const res = await fetch(`/api/v1/decks/browse?${searchParams}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to fetch decks');
  return res.json();
}

function DeckBrowsePage() {
  const [page, setPage] = useState(1);
  const [formatFilter, setFormatFilter] = useState<DeckFormat | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { ref: headerRef } = useFadeIn({ y: 20, duration: 0.4 });

  const { data, isLoading } = useQuery({
    queryKey: ['decks', 'browse', page, formatFilter, searchQuery],
    queryFn: () =>
      fetchBrowseDecks({
        page,
        limit: 20,
        format: formatFilter === 'all' ? undefined : formatFilter,
        q: searchQuery || undefined
      })
  });

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

  return (
    <div className="page decks-browse-page">
      <div ref={headerRef} className="page__header">
        <h1>Browse Decks</h1>
        <p>Explore public decks from the community</p>
      </div>

      <div className="decks-browse-page__toolbar">
        <div className="decks-browse-page__search">
          <input
            type="text"
            placeholder="Search decks by name..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
        <div className="decks-page__format-filter">
          {(['all', 'standard', 'expanded', 'unlimited'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`decks-page__filter-btn ${formatFilter === f ? 'decks-page__filter-btn--active' : ''}`}
              onClick={() => {
                setFormatFilter(f);
                setPage(1);
              }}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="page__content">
          <div className="page__empty-state">
            <p>Loading decks...</p>
          </div>
        </div>
      ) : decks.length === 0 ? (
        <div className="page__content">
          <div className="page__empty-state">
            <span className="page__empty-icon">
              <Layers size={64} aria-hidden="true" />
            </span>
            <h2>No decks found</h2>
            <p>
              {searchQuery
                ? `No decks match "${searchQuery}"`
                : 'No public decks available yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="page__content">
          <div className="decks-browse-page__grid">
            {decks.map((deck) => (
              <Link
                key={deck.id}
                to={ROUTES.DECK_DETAIL(deck.id)}
                className="decks-browse-page__card"
              >
                <div className="decks-browse-page__card-header">
                  <h3 className="decks-browse-page__card-name">{deck.name}</h3>
                  <span className="decks-browse-page__card-format">
                    {deck.format}
                  </span>
                </div>
                <div className="decks-browse-page__card-meta">
                  <span className="decks-browse-page__card-count">
                    {deck.cardCount} cards
                  </span>
                  <div className="decks-browse-page__card-owner">
                    {deck.owner.avatarUrl && (
                      <img
                        src={deck.owner.avatarUrl}
                        alt=""
                        className="decks-browse-page__card-avatar"
                      />
                    )}
                    <span className="decks-browse-page__card-owner-name">
                      {deck.owner.name}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="decks-browse-page__pagination">
              <button
                type="button"
                className="button button--secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="decks-browse-page__pagination-info">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="button button--secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DeckBrowsePage;
