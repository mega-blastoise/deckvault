import React, { useState, useCallback, useMemo } from 'react';
import { useCollectionQuery } from '../../hooks/useCollectionQuery';
import { useCollectionMutations } from '../../hooks/useCollectionMutations';
import {
  useSearchCards,
  toCardFormat,
  useCollectionCardsData,
  cardToDisplayFormat
} from '../../hooks';
import { useFadeIn } from '../../motion/hooks/useFadeIn';
import { useStagger } from '../../motion/hooks/useStagger';
import { pipeline } from '../../utils/pipeline';
import { CollectionPageView } from './View';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../../components/SearchBar/types';

function CollectionPageComponent() {
  const {
    cards: collectionCards,
    totalCards,
    uniqueCards,
    getQuantity,
    isLoading: collectionQueryLoading
  } = useCollectionQuery();

  const { addCard, removeCard } = useCollectionMutations();

  const { ref: headerRef } = useFadeIn({ y: 20, duration: 0.4 });
  const { containerRef: collectionGridRef } = useStagger({
    stagger: 0.03,
    y: 20,
    fromScale: 0.97,
    autoPlay: true
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<Pokemon.Card | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const collectionAsLegacy = useMemo(
    () => collectionCards.map((c) => ({ cardId: c.cardId, quantity: c.quantity, dateAdded: '' })),
    [collectionCards]
  );

  const { cards: collectionCardsData, isLoading: collectionLoading } =
    useCollectionCardsData(collectionAsLegacy);

  const displayCollectionCards: Pokemon.Card[] = useMemo(() => {
    return collectionCardsData.map((card) => {
      const formatted = cardToDisplayFormat(card);
      return {
        ...formatted,
        images: formatted.images
      } as unknown as Pokemon.Card;
    });
  }, [collectionCardsData]);

  const {
    cards: searchResults,
    isLoading: searchLoading,
    error,
    isError
  } = useSearchCards(searchQuery, { limit: 100, enabled: isSearchExpanded });

  const searchCards: Pokemon.Card[] = useMemo(() => {
    if (error || isError) return [];
    if (!searchResults) return [];

    return searchResults.map((card) => {
      const formatted = toCardFormat(card);
      return {
        ...formatted,
        images: formatted.images
      } as unknown as Pokemon.Card;
    });
  }, [searchResults, error, isError]);

  const handleSearch = useCallback((filters: SearchFilters) => {
    setSearchQuery(filters.query);
  }, []);

  const handleCardSelect = useCallback((card: Pokemon.Card) => {
    setSelectedCard(card);
  }, []);

  const handleAddToCollection = useCallback(
    (card: Pokemon.Card) => {
      const current = getQuantity(card.id);
      addCard(card.id, current + 1);
    },
    [addCard, getQuantity]
  );

  const handleRemoveFromCollection = useCallback(
    (card: Pokemon.Card) => {
      removeCard(card.id);
    },
    [removeCard]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedCard(null);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsSearchExpanded((prev) => !prev);
  }, []);

  const loading = collectionQueryLoading || collectionLoading;

  return (
    <CollectionPageView
      headerRef={headerRef}
      collectionGridRef={collectionGridRef}
      totalCards={totalCards}
      uniqueCards={uniqueCards}
      loading={loading}
      displayCollectionCards={displayCollectionCards}
      searchQuery={searchQuery}
      searchCards={searchCards}
      searchLoading={searchLoading}
      selectedCard={selectedCard}
      isSearchExpanded={isSearchExpanded}
      getQuantity={getQuantity}
      onSearch={handleSearch}
      onCardSelect={handleCardSelect}
      onAddToCollection={handleAddToCollection}
      onRemoveFromCollection={handleRemoveFromCollection}
      onCloseModal={handleCloseModal}
      onToggleSearch={toggleSearch}
      onExpandSearch={() => setIsSearchExpanded(true)}
    />
  );
}

export const CollectionPage = pipeline(React.memo)(CollectionPageComponent);
