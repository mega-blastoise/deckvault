import React from 'react';
import { CardGrid } from '../../components/CardGrid';
import { SearchBar } from '../../components/SearchBar';
import { pipeline } from '../../utils/pipeline';
import { TAG_CATEGORIES, TAG_LABELS } from '../../../types/card-tags';
import type { BrowsePageViewProps } from './types';

function BrowsePageViewComponent({
  mode,
  searchQuery,
  selectedSetId,
  selectedTags,
  tagFilter,
  sets,
  cards,
  isLoading,
  isError,
  emptyMessage,
  onModeChange,
  onSearch,
  onSetChange,
  onTagToggle,
  onTagFilterChange,
  onClearTags,
  onCardSelect
}: BrowsePageViewProps) {
  return (
    <div className="page browse-page">
      <div className="page__header">
        <h1>Browse Cards</h1>
        <p>Search across all Pokemon TCG cards.</p>
      </div>

      <div className="browse-page__mode-toggle">
        <button
          type="button"
          className={`browse-page__mode-btn${mode === 'name' ? ' browse-page__mode-btn--active' : ''}`}
          onClick={() => onModeChange('name')}
        >
          Name / Set
        </button>
        <button
          type="button"
          className={`browse-page__mode-btn${mode === 'use-case' ? ' browse-page__mode-btn--active' : ''}`}
          onClick={() => onModeChange('use-case')}
        >
          Use Case
        </button>
      </div>

      {mode === 'name' && (
        <div className="browse-page__toolbar">
          <SearchBar
            onSearch={onSearch}
            placeholder="Search by card name…"
            showFilters={false}
            loading={isLoading}
          />
          <select
            className="browse-page__set-filter"
            value={selectedSetId}
            onChange={(e) => onSetChange(e.target.value)}
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
      )}

      {mode === 'use-case' && (
        <div className="browse-page__use-case-panel">
          <input
            type="search"
            className="browse-page__tag-search"
            placeholder="Filter use cases…"
            value={tagFilter}
            onChange={(e) => onTagFilterChange(e.target.value)}
            aria-label="Filter use case tags"
          />
          {TAG_CATEGORIES.map((category) => {
            const q = tagFilter.toLowerCase();
            const visibleTags = q
              ? category.tags.filter((t) => TAG_LABELS[t].toLowerCase().includes(q))
              : category.tags;
            if (visibleTags.length === 0) return null;
            return (
              <div key={category.label} className="browse-page__tag-group">
                <span className="browse-page__tag-group-label">{category.label}</span>
                <div className="browse-page__tag-pills">
                  {visibleTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`browse-page__tag-pill${selectedTags.includes(tag) ? ' browse-page__tag-pill--active' : ''}`}
                      onClick={() => onTagToggle(tag)}
                    >
                      {TAG_LABELS[tag]}
                      {selectedTags.includes(tag) && <span className="browse-page__tag-pill-x"> ×</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              className="browse-page__tag-clear"
              onClick={onClearTags}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {isError && (
        <div className="browse-page__error">
          <p>Failed to load cards. Please try again.</p>
        </div>
      )}

      <div className="page__content">
        <CardGrid
          cards={cards}
          onCardSelect={onCardSelect}
          loading={isLoading}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}

export const BrowsePageView = pipeline(React.memo)(BrowsePageViewComponent);
