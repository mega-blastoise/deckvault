import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { DecksService } from '../services/DecksService';
import type { Deck } from '../../types/deck';

export function deckQueryKey(id: string) {
  return ['decks', id] as const;
}

export function useDeckQuery(
  id: string | undefined
): UseQueryResult<Deck | null, Error> {
  return useQuery({
    queryKey: id ? deckQueryKey(id) : ['decks', null],
    queryFn: async () => {
      if (!id) return null;
      const res = await new DecksService().getDeck(id);
      return res.data.data;
    },
    enabled: Boolean(id),
    staleTime: 0
  });
}
