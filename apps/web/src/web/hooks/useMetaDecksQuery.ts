import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getJavascriptEnvironment } from '@/web/layers/data';
import {
  fetchMetaDecks,
  type MetaDecksResponse
} from '@/web/services/MetaDecksService';

export type { MetaDecksResponse };

export const META_DECKS_QUERY_KEY_DEFAULT = ['meta-decks', 'all', '', false] as const;

interface MetaDecksParams {
  format: string;
  archetype: string;
  collectionOnly: boolean;
}

export function useMetaDecksQuery(
  params: MetaDecksParams
): UseQueryResult<MetaDecksResponse, Error> {
  const queryKey = ['meta-decks', params.format, params.archetype, params.collectionOnly];
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<MetaDecksResponse>(queryKey);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false
    } as UseQueryResult<MetaDecksResponse, Error>;
  }

  return useQuery({
    queryKey,
    queryFn: () => fetchMetaDecks(params),
    staleTime: 5 * 60 * 1000
  });
}
