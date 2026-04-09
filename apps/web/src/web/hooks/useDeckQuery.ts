import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getJavascriptEnvironment } from '@/web/layers/data';
import { DecksService } from '../services/DecksService';
import type { Deck } from '../../types/deck';

export type DeckQueryResult = UseQueryResult<Deck | null | undefined, Error> & {
  promise: Promise<Deck | null | undefined>;
};

export function deckQueryKey(id: string) {
  return ['decks', id] as const;
}

export function useDeckQuery(
  id: string | undefined
): DeckQueryResult {
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<Deck | null>(id ? deckQueryKey(id) : ['decks', null]);
    return {
      data: data ?? undefined,
      promise: Promise.resolve(data ?? undefined),
      isLoading: false,
      isError: false,
      isPending: false,
      status: 'success',
      fetchStatus: 'idle',
      error: null
    } as unknown as DeckQueryResult;
  }

  return useQuery({
    queryKey: id ? deckQueryKey(id) : ['decks', null],
    queryFn: async () => {
      if (!id) return null;
      const res = await new DecksService().getDeck(id);
      return res.data.data;
    },
    enabled: Boolean(id),
    staleTime: 0
  }) as DeckQueryResult;
}
