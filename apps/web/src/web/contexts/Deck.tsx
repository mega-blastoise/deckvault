import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDecksQuery, DECKS_QUERY_KEY } from '../hooks/useDecksQuery';
import { useDeckMutations } from '../hooks/useDeckMutations';
import { DecksService } from '../services/DecksService';
import type { Deck, DeckCard, DeckFormat, DeckStore } from '../../types/deck';
import { STORAGE_KEYS } from '../../types/collection';

export interface DeckContextValue {
  decks: Deck[];
  currentDeck: Deck | null;
  isLoading: boolean;
  createDeck: (deck: Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Deck>;
  updateDeck: (
    id: string,
    updates: Partial<Omit<Deck, 'id' | 'createdAt'>>
  ) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  getDeck: (id: string) => Deck | undefined;
  setCurrentDeck: (id: string | null) => void;
  addCardToDeck: (deckId: string, card: DeckCard['card'], quantity?: number) => Promise<void>;
  removeCardFromDeck: (deckId: string, cardId: string, quantity?: number) => Promise<void>;
  setCardQuantityInDeck: (deckId: string, cardId: string, quantity: number) => Promise<void>;
  deckCount: number;
  getDecksByFormat: (format: DeckFormat) => Deck[];
}

const DeckContext = createContext<DeckContextValue | null>(null);

interface DeckProviderProps {
  children: React.ReactNode;
}

export function DeckProvider({ children }: DeckProviderProps) {
  const queryClient = useQueryClient();
  const { data: decks = [], isLoading } = useDecksQuery();
  const { createMutation, updateMutation, deleteMutation } = useDeckMutations();

  const [currentDeckId, setCurrentDeckId] = React.useState<string | null>(null);

  // localStorage migration: on first mount, migrate any existing decks
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEYS.DECKS);
    if (!raw) return;

    let store: DeckStore;
    try {
      store = JSON.parse(raw) as DeckStore;
    } catch {
      window.localStorage.removeItem(STORAGE_KEYS.DECKS);
      return;
    }

    const existing = Object.values(store.decks ?? {});
    if (existing.length === 0) {
      window.localStorage.removeItem(STORAGE_KEYS.DECKS);
      return;
    }

    const service = new DecksService();
    Promise.all(
      existing.map((deck) =>
        service.createDeck({
          name: deck.name,
          description: deck.description,
          format: deck.format,
          cards: deck.cards,
          coverCardId: deck.coverCardId
        })
      )
    )
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEYS.DECKS);
        queryClient.invalidateQueries({ queryKey: DECKS_QUERY_KEY });
      })
      .catch(() => {
        // silently fail — don't erase localStorage if migration fails
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentDeck = useMemo(
    () => (currentDeckId ? (decks.find((d) => d.id === currentDeckId) ?? null) : null),
    [currentDeckId, decks]
  );

  const createDeck = useCallback(
    async (deckData: Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>): Promise<Deck> => {
      return createMutation.mutateAsync(deckData);
    },
    [createMutation]
  );

  const updateDeck = useCallback(
    async (id: string, updates: Partial<Omit<Deck, 'id' | 'createdAt'>>) => {
      await updateMutation.mutateAsync({ id, input: updates });
    },
    [updateMutation]
  );

  const deleteDeck = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
      if (currentDeckId === id) setCurrentDeckId(null);
    },
    [deleteMutation, currentDeckId]
  );

  const getDeck = useCallback(
    (id: string): Deck | undefined => decks.find((d) => d.id === id),
    [decks]
  );

  const setCurrentDeck = useCallback((id: string | null) => {
    setCurrentDeckId(id);
  }, []);

  const addCardToDeck = useCallback(
    async (deckId: string, card: DeckCard['card'], quantity: number = 1) => {
      const deck = decks.find((d) => d.id === deckId);
      if (!deck) return;

      const existing = deck.cards.find((c) => c.card.id === card.id);
      const newCards: DeckCard[] = existing
        ? deck.cards.map((c) =>
            c.card.id === card.id
              ? { ...c, quantity: c.quantity + quantity }
              : c
          )
        : [...deck.cards, { card, quantity }];

      await updateMutation.mutateAsync({
        id: deckId,
        input: { cards: newCards }
      });
    },
    [decks, updateMutation]
  );

  const removeCardFromDeck = useCallback(
    async (deckId: string, cardId: string, quantity: number = 1) => {
      const deck = decks.find((d) => d.id === deckId);
      if (!deck) return;

      const newCards = deck.cards
        .map((c) => {
          if (c.card.id !== cardId) return c;
          const newQty = c.quantity - quantity;
          return newQty > 0 ? { ...c, quantity: newQty } : null;
        })
        .filter((c): c is DeckCard => c !== null);

      await updateMutation.mutateAsync({ id: deckId, input: { cards: newCards } });
    },
    [decks, updateMutation]
  );

  const setCardQuantityInDeck = useCallback(
    async (deckId: string, cardId: string, quantity: number) => {
      const deck = decks.find((d) => d.id === deckId);
      if (!deck) return;

      const newCards: DeckCard[] =
        quantity <= 0
          ? deck.cards.filter((c) => c.card.id !== cardId)
          : deck.cards.some((c) => c.card.id === cardId)
          ? deck.cards.map((c) =>
              c.card.id === cardId ? { ...c, quantity } : c
            )
          : deck.cards;

      await updateMutation.mutateAsync({ id: deckId, input: { cards: newCards } });
    },
    [decks, updateMutation]
  );

  const getDecksByFormat = useCallback(
    (format: DeckFormat): Deck[] => decks.filter((d) => d.format === format),
    [decks]
  );

  const value: DeckContextValue = {
    decks,
    currentDeck,
    isLoading,
    createDeck,
    updateDeck,
    deleteDeck,
    getDeck,
    setCurrentDeck,
    addCardToDeck,
    removeCardFromDeck,
    setCardQuantityInDeck,
    deckCount: decks.length,
    getDecksByFormat
  };

  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>;
}

export function useDecks(): DeckContextValue {
  const context = useContext(DeckContext);
  if (!context) {
    throw new Error('useDecks must be used within a DeckProvider');
  }
  return context;
}
