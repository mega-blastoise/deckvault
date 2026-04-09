import React from 'react';
import { Link } from 'react-router';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { ROUTES } from '@/web/routes';
import { pipeline } from '../../utils/pipeline';
import type { DeckFormat } from '../../../types/deck';
import type { DeckBrowsePageViewProps } from './types';

const FORMAT_FILTERS = ['all', 'standard', 'expanded', 'unlimited'] as const;

function DeckBrowsePageViewComponent({
  headerRef,
  page,
  formatFilter,
  searchQuery,
  decks,
  isLoading,
  totalPages,
  onSearch,
  onFormatFilterChange,
  onPageChange
}: DeckBrowsePageViewProps) {
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
            onChange={onSearch}
          />
        </div>
        <div className="decks-page__format-filter">
          {FORMAT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`decks-page__filter-btn ${formatFilter === f ? 'decks-page__filter-btn--active' : ''}`}
              onClick={() => onFormatFilterChange(f as DeckFormat | 'all')}
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
                onClick={() => onPageChange((p) => p - 1)}
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
                onClick={() => onPageChange((p) => p + 1)}
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

export const DeckBrowsePageView = pipeline(React.memo)(DeckBrowsePageViewComponent);
