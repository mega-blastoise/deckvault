import React, { useState, useCallback, useMemo } from 'react';
import { Library, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useCollectionQuery } from '../hooks/useCollectionQuery';
import { useCollectionMutations } from '../hooks/useCollectionMutations';
import {
  useSearchCards,
  toCardFormat,
  useCollectionCardsData,
  cardToDisplayFormat
} from '../hooks';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { Modal } from '../components/Modal';
import { CardDetail } from '../components/CardDetail';
import { useFadeIn } from '../motion/hooks/useFadeIn';
import { useStagger } from '../motion/hooks/useStagger';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../components/SearchBar/types';

function CollectionPage() {
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
    <div className="page collection-page">
      <div ref={headerRef} className="page__header">
        <h1>My Collection</h1>
        <p>
          {totalCards} total cards ({uniqueCards} unique)
        </p>
      </div>

      <section className="collection-page__section">
        <div ref={collectionGridRef} className="page__content">
          {uniqueCards === 0 && !loading ? (
            <div className="page__empty-state">
              <span className="page__empty-icon">
                <Library size={48} aria-hidden="true" />
              </span>
              <h2>Your collection is empty</h2>
              <p>
                Search for cards below and click them to add to your collection.
              </p>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setIsSearchExpanded(true)}
              >
                Search for Cards
              </button>
            </div>
          ) : (
            <CardGrid
              cards={displayCollectionCards}
              onCardSelect={handleCardSelect}
              loading={loading}
              emptyMessage="Loading your collection..."
              renderCardOverlay={(card) => {
                const quantity = getQuantity(card.id);
                if (quantity > 0) {
                  return (
                    <div className="collection-page__card-quantity">
                      <span className="collection-page__quantity-badge">
                        {quantity}x
                      </span>
                    </div>
                  );
                }
                return null;
              }}
            />
          )}
        </div>
      </section>

      <section className="collection-page__add-section">
        <button
          type="button"
          className="collection-page__add-header"
          onClick={toggleSearch}
          aria-expanded={isSearchExpanded}
        >
          <div className="collection-page__add-header-content">
            <Search size={20} aria-hidden="true" />
            <span>Add More Cards</span>
          </div>
          {isSearchExpanded ? (
            <ChevronUp size={20} aria-hidden="true" />
          ) : (
            <ChevronDown size={20} aria-hidden="true" />
          )}
        </button>

        {isSearchExpanded && (
          <div className="collection-page__add-content">
            <div className="collection-page__search-bar">
              <SearchBar
                onSearch={handleSearch}
                placeholder="Search for cards to add..."
              />
            </div>

            <div className="collection-page__search-results">
              <CardGrid
                cards={searchCards}
                onCardSelect={handleCardSelect}
                loading={searchLoading}
                emptyMessage={
                  searchQuery.trim()
                    ? `No cards found for "${searchQuery}"`
                    : 'Start typing to search for cards'
                }
                renderCardOverlay={(card) => {
                  const quantity = getQuantity(card.id);
                  if (quantity > 0) {
                    return (
                      <div className="collection-page__card-quantity">
                        <span className="collection-page__quantity-badge">
                          {quantity}x
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </div>
          </div>
        )}
      </section>

      {selectedCard && (
        <Modal
          isOpen={!!selectedCard}
          onClose={handleCloseModal}
          title={selectedCard.name}
          size="large"
        >
          <CardDetail
            card={selectedCard}
            onClose={handleCloseModal}
            onAddToCollection={handleAddToCollection}
            onRemoveFromCollection={handleRemoveFromCollection}
            collectionQuantity={getQuantity(selectedCard.id)}
            isModal
          />
        </Modal>
      )}
    </div>
  );
}

export default CollectionPage;
