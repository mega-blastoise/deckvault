import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { DecksService } from '../services/DecksService';
import type { Deck } from '../../types/deck';

export const DECKS_QUERY_KEY = ['decks'] as const;

export function useDecksQuery(): UseQueryResult<Deck[], Error> {
  return useQuery({
    queryKey: DECKS_QUERY_KEY,
    queryFn: async () => {
      const res = await new DecksService().listDecks();
      return res.data.data;
    },
    staleTime: 0
  });
}
