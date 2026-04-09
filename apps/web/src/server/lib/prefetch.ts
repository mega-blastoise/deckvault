import type { QueryClient } from '@tanstack/react-query';

import { fetchMetaDecks } from '@/web/services/MetaDecksService';
import { fetchBrowseDecks } from '@/web/services/DeckBrowseService';
import { fetchFrequency } from '@/web/services/LocalMetaService';
import { META_DECKS_QUERY_KEY_DEFAULT } from '@/web/hooks/useMetaDecksQuery';
import { DECK_BROWSE_QUERY_KEY_DEFAULT } from '@/web/hooks/useDeckBrowseQuery';
import { LOCAL_META_QUERY_KEY_DEFAULT } from '@/web/hooks/useLocalMetaQuery';
import { SetsService } from '@/web/services';

export async function prefetchForRoute(
  queryClient: QueryClient,
  pathname: string,
  _request: Request
): Promise<void> {
  if (pathname === '/meta-decks') {
    await prefetchMetaDecks(queryClient);
    return;
  }

  if (pathname === '/browse') {
    await prefetchSets(queryClient);
    return;
  }

  if (pathname === '/sets') {
    await prefetchSets(queryClient);
    return;
  }

  if (pathname === '/decks/browse') {
    await prefetchBrowseDecks(queryClient);
    return;
  }

  if (pathname === '/local-meta') {
    await prefetchLocalMeta(queryClient);
    return;
  }
}

async function prefetchMetaDecks(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.prefetchQuery({
      queryKey: META_DECKS_QUERY_KEY_DEFAULT,
      queryFn: () =>
        fetchMetaDecks({ format: 'all', archetype: '', collectionOnly: false }),
      staleTime: 5 * 60 * 1000
    });
  } catch (err) {
    console.warn('[prefetch] meta-decks failed:', err);
  }
}

async function prefetchSets(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.prefetchQuery({
      queryKey: ['sets', `page=${undefined}`, `count=${undefined}`],
      queryFn: () => new SetsService().getSets(undefined, undefined),
      staleTime: 5 * 60 * 1000
    });
  } catch (err) {
    console.warn('[prefetch] sets failed:', err);
  }
}

async function prefetchBrowseDecks(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.prefetchQuery({
      queryKey: DECK_BROWSE_QUERY_KEY_DEFAULT,
      queryFn: () => fetchBrowseDecks({ page: 1, limit: 20 }),
      staleTime: 5 * 60 * 1000
    });
  } catch (err) {
    console.warn('[prefetch] decks/browse failed:', err);
  }
}

async function prefetchLocalMeta(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.prefetchQuery({
      queryKey: LOCAL_META_QUERY_KEY_DEFAULT,
      queryFn: () => fetchFrequency('standard'),
      staleTime: 60_000
    });
  } catch (err) {
    console.warn('[prefetch] local-meta failed:', err);
  }
}
