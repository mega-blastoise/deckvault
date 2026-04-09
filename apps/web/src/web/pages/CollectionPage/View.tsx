import React from 'react';
import { Library, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { CardGrid } from '../../components/CardGrid';
import { SearchBar } from '../../components/SearchBar';
import { Modal } from '../../components/Modal';
import { CardDetail } from '../../components/CardDetail';
import { pipeline } from '../../utils/pipeline';
import type { CollectionPageViewProps } from './types';

function CollectionPageViewComponent({
  headerRef,
  collectionGridRef,
  totalCards,
  uniqueCards,
  loading,
  displayCollectionCards,
  searchQuery,
  searchCards,
  searchLoading,
  selectedCard,
  isSearchExpanded,
  getQuantity,
  onSearch,
  onCardSelect,
  onAddToCollection,
  onRemoveFromCollection,
  onCloseModal,
  onToggleSearch,
  onExpandSearch
}: CollectionPageViewProps) {
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
                onClick={onExpandSearch}
              >
                Search for Cards
              </button>
            </div>
          ) : (
            <CardGrid
              cards={displayCollectionCards}
              onCardSelect={onCardSelect}
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
          onClick={onToggleSearch}
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
                onSearch={onSearch}
                placeholder="Search for cards to add..."
              />
            </div>

            <div className="collection-page__search-results">
              <CardGrid
                cards={searchCards}
                onCardSelect={onCardSelect}
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
          onClose={onCloseModal}
          title={selectedCard.name}
          size="large"
        >
          <CardDetail
            card={selectedCard}
            onClose={onCloseModal}
            onAddToCollection={onAddToCollection}
            onRemoveFromCollection={onRemoveFromCollection}
            collectionQuantity={getQuantity(selectedCard.id)}
            isModal
          />
        </Modal>
      )}
    </div>
  );
}

export const CollectionPageView = pipeline(React.memo)(CollectionPageViewComponent);
