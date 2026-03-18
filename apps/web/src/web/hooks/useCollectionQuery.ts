import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/Auth';

export interface CollectionItem {
  cardId: string;
  quantity: number;
}

export const COLLECTION_QUERY_KEY = ['collection'] as const;

async function fetchCollection(): Promise<CollectionItem[]> {
  const res = await fetch('/api/v1/collection', { credentials: 'include' });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: CollectionItem[] };
  return json.data;
}

export function useCollectionQuery() {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: COLLECTION_QUERY_KEY,
    queryFn: fetchCollection,
    enabled: isAuthenticated,
    staleTime: 30 * 1000
  });

  const cards = query.data ?? [];
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
  const uniqueCards = cards.length;

  const getQuantity = (cardId: string): number => {
    return cards.find((c) => c.cardId === cardId)?.quantity ?? 0;
  };

  const hasCard = (cardId: string): boolean => {
    return cards.some((c) => c.cardId === cardId);
  };

  return {
    cards,
    totalCards,
    uniqueCards,
    getQuantity,
    hasCard,
    isLoading: query.isLoading,
    isError: query.isError
  };
}
