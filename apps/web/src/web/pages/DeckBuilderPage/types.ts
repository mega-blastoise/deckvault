import type { Pokemon } from '@pokemon/clients';
import type { DeckCard, DeckFormat, DeckValidation as DeckValidationType } from '../../../types/deck';
import type { SearchFilters } from '../../components/SearchBar/types';
import type { CardLegalityIssue } from '../../lib/deck-legality';

export interface DeckBuilderPageViewProps {
  // Identity
  isEditing: boolean;
  deckId: string | undefined;
  // Deck metadata (controlled from Component)
  deckName: string;
  deckDescription: string;
  deckFormat: DeckFormat;
  isDirty: boolean;
  isSaving: boolean;
  versionLabel: string;
  // Card browser
  searchCards: Pokemon.Card[];
  searchLoading: boolean;
  filterByLegality: boolean;
  searchQuery: string;
  // Deck contents
  deckCards: DeckCard[];
  legalityMap: Map<string, CardLegalityIssue>;
  validation: DeckValidationType;
  // Metadata callbacks
  onDeckNameChange: (name: string) => void;
  onDeckDescriptionChange: (desc: string) => void;
  onDeckFormatChange: (format: DeckFormat) => void;
  onVersionLabelChange: (label: string) => void;
  onFilterByLegalityChange: (val: boolean) => void;
  // Card manipulation callbacks
  onSearch: (filters: SearchFilters) => void;
  onAddCard: (card: Pokemon.Card) => void;
  onAddOne: (cardId: string) => void;
  onRemoveOne: (cardId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onImport: (cards: DeckCard[]) => void;
  // Action callbacks
  onSave: () => Promise<void>;
  onCancel: () => void;
}
