import { useMutation, useQueryClient } from '@tanstack/react-query';
import { COLLECTION_QUERY_KEY } from './useCollectionQuery';

export function useCollectionMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: COLLECTION_QUERY_KEY });
  };

  const upsertMutation = useMutation({
    mutationFn: async ({ cardId, quantity }: { cardId: string; quantity: number }) => {
      const res = await fetch(`/api/v1/collection/${cardId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      });
      if (!res.ok) throw new Error('Failed to update collection');
      return res.json();
    },
    onSuccess: invalidate
  });

  const removeMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const res = await fetch(`/api/v1/collection/${cardId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok && res.status !== 404) throw new Error('Failed to remove card');
      return cardId;
    },
    onSuccess: invalidate
  });

  const addCard = (cardId: string, quantity = 1) => {
    upsertMutation.mutate({ cardId, quantity });
  };

  const removeCard = (cardId: string) => {
    removeMutation.mutate(cardId);
  };

  const setQuantity = (cardId: string, quantity: number) => {
    if (quantity <= 0) {
      removeMutation.mutate(cardId);
    } else {
      upsertMutation.mutate({ cardId, quantity });
    }
  };

  return {
    addCard,
    removeCard,
    setQuantity,
    upsertMutation,
    removeMutation
  };
}
