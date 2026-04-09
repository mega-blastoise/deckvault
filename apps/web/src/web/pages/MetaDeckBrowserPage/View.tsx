import React from 'react';
import { MetaDeckCard } from '@/web/components/MetaDeckCard';
import { pipeline } from '../../utils/pipeline';
import type { DeckFormat } from '../../../types/deck';
import type { MetaDeckBrowserPageViewProps, TierFilter } from './types';

const FORMAT_OPTIONS: { value: DeckFormat | 'all'; label: string }[] = [
  { value: 'all', label: 'All Formats' },
  { value: 'standard', label: 'Standard' },
  { value: 'expanded', label: 'Expanded' },
  { value: 'unlimited', label: 'Unlimited' }
];

const TIER_OPTIONS: TierFilter[] = ['all', 'S', 'A', 'B', 'C', 'D'];

function MetaDeckBrowserPageViewComponent({
  format,
  archetype,
  collectionOnly,
  tierFilter,
  decks,
  isLoading,
  error,
  isAuthenticated,
  onFormatChange,
  onArchetypeChange,
  onCollectionOnlyChange,
  onTierFilterChange,
  onClone
}: MetaDeckBrowserPageViewProps) {
  return (
    <div className="meta-browser">
      <header className="meta-browser__header">
        <div>
          <h1 className="meta-browser__title">Meta Decks</h1>
          <p className="meta-browser__subtitle">
            Tournament-winning decklists — build one tailored to your collection
          </p>
        </div>
      </header>

      <div className="meta-browser__filters">
        <div className="meta-browser__filter-left">
          <div className="meta-browser__format-pills">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`meta-browser__pill ${format === opt.value ? 'meta-browser__pill--active' : ''}`}
                onClick={() => onFormatChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="meta-browser__tier-pills">
            {TIER_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`meta-browser__pill meta-browser__pill--tier${tierFilter === t ? ' meta-browser__pill--active' : ''}${t !== 'all' ? ` meta-browser__pill--tier-${t.toLowerCase()}` : ''}`}
                onClick={() => onTierFilterChange(t)}
              >
                {t === 'all' ? 'All Tiers' : t}
              </button>
            ))}
          </div>
        </div>

        <div className="meta-browser__filter-right">
          <input
            type="search"
            className="meta-browser__search"
            placeholder="Search archetype…"
            value={archetype}
            onChange={(e) => onArchetypeChange(e.target.value)}
          />
          {isAuthenticated && (
            <label className="meta-browser__toggle">
              <input
                type="checkbox"
                checked={collectionOnly}
                onChange={(e) => onCollectionOnlyChange(e.target.checked)}
              />
              <span>Only show decks I can build</span>
            </label>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="meta-browser__state">Loading meta decks…</div>
      )}

      {error && (
        <div className="meta-browser__state meta-browser__state--error">
          Failed to load meta decks. Please try again.
        </div>
      )}

      {!isLoading && !error && decks.length === 0 && (
        <div className="meta-browser__state">
          No decks found for the selected filters.
        </div>
      )}

      {!isLoading && decks.length > 0 && (
        <>
          <p className="meta-browser__count">{decks.length} decks</p>
          <div className="meta-browser__grid">
            {decks.map((deck) => (
              <MetaDeckCard key={deck.id} deck={deck} onClone={onClone} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const MetaDeckBrowserPageView = pipeline(React.memo)(MetaDeckBrowserPageViewComponent);
