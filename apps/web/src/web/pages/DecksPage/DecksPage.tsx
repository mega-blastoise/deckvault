import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useDecks } from '../../contexts/Deck';
import { useFadeIn } from '../../motion/hooks/useFadeIn';
import { useStagger } from '../../motion/hooks/useStagger';
import { ROUTES } from '../../routes';
import { pipeline } from '../../utils/pipeline';
import { DecksPageView } from './View';
import type { DeckFormat } from '../../../types/deck';

function DecksPageComponent() {
  const navigate = useNavigate();
  const { decks, deleteDeck, deckCount, isLoading } = useDecks();

  const { ref: headerRef } = useFadeIn({ y: 20, duration: 0.4 });
  const { containerRef: deckListRef } = useStagger({
    stagger: 0.05,
    y: 25,
    fromScale: 0.97,
    autoPlay: true
  });

  const [formatFilter, setFormatFilter] = useState<DeckFormat | 'all'>('all');
  const [deckToDelete, setDeckToDelete] = useState<string | null>(null);

  const filteredDecks =
    formatFilter === 'all'
      ? decks
      : decks.filter((deck) => deck.format === formatFilter);

  const deckItems = filteredDecks.map((deck) => {
    const cardCount = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

    const coverSource = deck.coverCardId
      ? deck.cards.find((c) => c.card.id === deck.coverCardId)
      : (deck.cards.find((c) => c.card.supertype === 'Pokémon') ?? deck.cards[0]);

    const coverCard = coverSource?.card.images?.small
      ? {
          id: coverSource.card.id,
          name: coverSource.card.name,
          imageUrl: coverSource.card.images.small
        }
      : undefined;

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      cardCount,
      isValid: cardCount === 60,
      lastModified: deck.updatedAt,
      coverCard
    };
  });

  const handleEdit = useCallback(
    (deck: { id: string }) => {
      navigate(ROUTES.DECK_EDIT(deck.id));
    },
    [navigate]
  );

  const handleDelete = useCallback((deck: { id: string }) => {
    setDeckToDelete(deck.id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deckToDelete) {
      await deleteDeck(deckToDelete);
      setDeckToDelete(null);
    }
  }, [deckToDelete, deleteDeck]);

  const handleDeckClick = useCallback(
    (deckId: string) => {
      navigate(ROUTES.DECK_DETAIL(deckId));
    },
    [navigate]
  );

  return (
    <DecksPageView
      headerRef={headerRef}
      deckListRef={deckListRef}
      formatFilter={formatFilter}
      deckToDelete={deckToDelete}
      deckCount={deckCount}
      isLoading={isLoading}
      deckItems={deckItems}
      onFormatFilterChange={setFormatFilter}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onConfirmDelete={handleConfirmDelete}
      onCancelDelete={() => setDeckToDelete(null)}
      onDeckClick={handleDeckClick}
    />
  );
}

export const DecksPage = pipeline(React.memo)(DecksPageComponent);
