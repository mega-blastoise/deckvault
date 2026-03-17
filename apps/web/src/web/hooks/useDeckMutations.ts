import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DecksService } from '../services/DecksService';
import { DECKS_QUERY_KEY } from './useDecksQuery';
import { deckQueryKey } from './useDeckQuery';
import type { Deck } from '../../types/deck';

type CreateDeckInput = Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateDeckInput = Partial<Omit<Deck, 'id' | 'createdAt'>>;

export function useDeckMutations() {
  const queryClient = useQueryClient();

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: DECKS_QUERY_KEY });
    if (id) {
      queryClient.invalidateQueries({ queryKey: deckQueryKey(id) });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (input: CreateDeckInput) => {
      const res = await new DecksService().createDeck(input);
      return res.data.data;
    },
    onSuccess: () => invalidate()
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      input
    }: {
      id: string;
      input: UpdateDeckInput;
    }) => {
      const res = await new DecksService().updateDeck(id, input);
      return res.data.data;
    },
    onSuccess: (deck) => invalidate(deck.id)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await new DecksService().removeDeck(id);
      return id;
    },
    onSuccess: (id) => invalidate(id)
  });

  return { createMutation, updateMutation, deleteMutation };
}
