import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getJavascriptEnvironment } from '@/web/layers/data';
import { DecksService } from '../services/DecksService';
import type { Deck } from '../../types/deck';

export const DECKS_QUERY_KEY = ['decks'] as const;

export function useDecksQuery(): UseQueryResult<Deck[], Error> {
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<Deck[]>([...DECKS_QUERY_KEY]);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false
    } as UseQueryResult<Deck[], Error>;
  }

  return useQuery({
    queryKey: DECKS_QUERY_KEY,
    queryFn: async () => {
      const res = await new DecksService().listDecks();
      return res.data.data;
    },
    staleTime: 0
  });
}
