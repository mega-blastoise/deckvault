import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getJavascriptEnvironment } from '@/web/layers/data';
import {
  fetchBrowseDecks,
  type BrowseResponse
} from '@/web/services/DeckBrowseService';

export type { BrowseResponse };
export type { BrowseDeck } from '@/web/services/DeckBrowseService';

export const DECK_BROWSE_QUERY_KEY_DEFAULT = ['decks', 'browse', 1, 'all', ''] as const;

interface DeckBrowseParams {
  page: number;
  formatFilter: string;
  searchQuery: string;
}

export function useDeckBrowseQuery(
  params: DeckBrowseParams
): UseQueryResult<BrowseResponse, Error> {
  const queryKey = ['decks', 'browse', params.page, params.formatFilter, params.searchQuery];
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<BrowseResponse>(queryKey);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false
    } as UseQueryResult<BrowseResponse, Error>;
  }

  return useQuery({
    queryKey,
    queryFn: () =>
      fetchBrowseDecks({
        page: params.page,
        limit: 20,
        format: params.formatFilter === 'all' ? undefined : params.formatFilter,
        q: params.searchQuery || undefined
      })
  });
}
