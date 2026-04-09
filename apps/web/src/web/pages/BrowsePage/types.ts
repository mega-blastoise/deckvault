import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '@/web/components/SearchBar/types';
import type { CardFunctionalTag } from '../../../types/card-tags';

export type BrowseMode = 'name' | 'use-case';

export interface BrowsePageViewProps {
  mode: BrowseMode;
  searchQuery: string;
  selectedSetId: string;
  selectedTags: CardFunctionalTag[];
  tagFilter: string;
  sets: Pokemon.Set[];
  cards: Pokemon.Card[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  onModeChange: (mode: BrowseMode) => void;
  onSearch: (filters: SearchFilters) => void;
  onSetChange: (setId: string) => void;
  onTagToggle: (tag: CardFunctionalTag) => void;
  onTagFilterChange: (value: string) => void;
  onClearTags: () => void;
  onCardSelect: (card: Pokemon.Card) => void;
}
