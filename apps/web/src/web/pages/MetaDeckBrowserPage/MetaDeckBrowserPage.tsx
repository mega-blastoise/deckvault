import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/web/contexts/Auth';
import { ROUTES } from '@/web/routes';
import { MetaDeckCard } from '@/web/components/MetaDeckCard';
import type { MetaDeckSummary } from '@/web/components/MetaDeckCard';
import type { DeckFormat } from '../../../types/deck';
import './MetaDeckBrowserPage.css';

interface MetaDecksResponse {
  decks: MetaDeckSummary[];
  total: number;
  page: number;
  limit: number;
}

async function fetchMetaDecks(params: {
  format: string;
  archetype: string;
  collectionOnly: boolean;
}): Promise<MetaDecksResponse> {
  const sp = new URLSearchParams();
  if (params.format !== 'all') sp.set('format', params.format);
  if (params.archetype) sp.set('archetype', params.archetype);
  if (params.collectionOnly) sp.set('collectionOnly', 'true');
  sp.set('limit', '100');

  const res = await fetch(`/api/v1/meta-decks?${sp}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch meta decks');
  return res.json();
}

async function fetchMetaDeckDetail(id: string) {
  const res = await fetch(`/api/v1/meta-decks/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch meta deck');
  return res.json();
}

const FORMAT_OPTIONS: { value: DeckFormat | 'all'; label: string }[] = [
  { value: 'all', label: 'All Formats' },
  { value: 'standard', label: 'Standard' },
  { value: 'expanded', label: 'Expanded' },
  { value: 'unlimited', label: 'Unlimited' }
];

const TIER_OPTIONS = ['all', 'S', 'A', 'B', 'C', 'D'] as const;
type TierFilter = (typeof TIER_OPTIONS)[number];

export function MetaDeckBrowserPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [format, setFormat] = useState<DeckFormat | 'all'>('all');
  const [archetype, setArchetype] = useState('');
  const [collectionOnly, setCollectionOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['meta-decks', format, archetype, collectionOnly],
    queryFn: () => fetchMetaDecks({ format, archetype, collectionOnly }),
    staleTime: 5 * 60 * 1000
  });

  const handleClone = useCallback(
    async (metaDeckId: string) => {
      try {
        const detail = await fetchMetaDeckDetail(metaDeckId);
        navigate(ROUTES.DECK_NEW, {
          state: { cloneFromMetaDeck: detail }
        });
      } catch {
        navigate(ROUTES.DECK_NEW);
      }
    },
    [navigate]
  );

  const allDecks = data?.decks ?? [];
  const decks = tierFilter === 'all'
    ? allDecks
    : allDecks.filter((d) => d.tier === tierFilter);

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
                onClick={() => setFormat(opt.value)}
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
                onClick={() => setTierFilter(t)}
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
            onChange={(e) => setArchetype(e.target.value)}
          />
          {isAuthenticated && (
            <label className="meta-browser__toggle">
              <input
                type="checkbox"
                checked={collectionOnly}
                onChange={(e) => setCollectionOnly(e.target.checked)}
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
              <MetaDeckCard key={deck.id} deck={deck} onClone={handleClone} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
