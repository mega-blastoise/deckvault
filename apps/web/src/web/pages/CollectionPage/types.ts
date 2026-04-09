import type React from 'react';
import type { Pokemon } from '@pokemon/clients';

export interface CollectionPageViewProps {
  headerRef: React.RefObject<HTMLDivElement | null>;
  collectionGridRef: React.RefObject<HTMLDivElement | null>;
  totalCards: number;
  uniqueCards: number;
  loading: boolean;
  displayCollectionCards: Pokemon.Card[];
  searchQuery: string;
  searchCards: Pokemon.Card[];
  searchLoading: boolean;
  selectedCard: Pokemon.Card | null;
  isSearchExpanded: boolean;
  getQuantity: (cardId: string) => number;
  onSearch: (filters: { query: string }) => void;
  onCardSelect: (card: Pokemon.Card) => void;
  onAddToCollection: (card: Pokemon.Card) => void;
  onRemoveFromCollection: (card: Pokemon.Card) => void;
  onCloseModal: () => void;
  onToggleSearch: () => void;
  onExpandSearch: () => void;
}
