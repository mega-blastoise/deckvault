import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/web/contexts/Auth';
import { ROUTES } from '@/web/routes';
import { useMetaDecksQuery } from '@/web/hooks/useMetaDecksQuery';
import { pipeline } from '../../utils/pipeline';
import { MetaDeckBrowserPageView } from './View';
import type { DeckFormat } from '../../../types/deck';
import type { TierFilter } from './types';
import './MetaDeckBrowserPage.css';

async function fetchMetaDeckDetail(id: string) {
  const res = await fetch(`/api/v1/meta-decks/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch meta deck');
  return res.json();
}

function MetaDeckBrowserPageComponent() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [format, setFormat] = useState<DeckFormat | 'all'>('all');
  const [archetype, setArchetype] = useState('');
  const [collectionOnly, setCollectionOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  const { data, isLoading, error } = useMetaDecksQuery({ format, archetype, collectionOnly });

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
    <MetaDeckBrowserPageView
      format={format}
      archetype={archetype}
      collectionOnly={collectionOnly}
      tierFilter={tierFilter}
      decks={decks}
      isLoading={isLoading}
      error={error ?? null}
      isAuthenticated={isAuthenticated}
      onFormatChange={setFormat}
      onArchetypeChange={setArchetype}
      onCollectionOnlyChange={setCollectionOnly}
      onTierFilterChange={setTierFilter}
      onClone={handleClone}
    />
  );
}

export const MetaDeckBrowserPage = pipeline(React.memo)(MetaDeckBrowserPageComponent);
