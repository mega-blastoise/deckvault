import type React from 'react';
import type { DeckFormat } from '../../../types/deck';

export interface DeckItem {
  id: string;
  name: string;
  description?: string;
  cardCount: number;
  isValid: boolean;
  lastModified: string;
  coverCard?: {
    id: string;
    name: string;
    imageUrl: string;
  };
}

export interface DecksPageViewProps {
  headerRef: React.RefObject<HTMLDivElement | null>;
  deckListRef: React.RefObject<HTMLDivElement | null>;
  formatFilter: DeckFormat | 'all';
  deckToDelete: string | null;
  deckCount: number;
  isLoading: boolean;
  deckItems: DeckItem[];
  onFormatFilterChange: (format: DeckFormat | 'all') => void;
  onEdit: (deck: { id: string }) => void;
  onDelete: (deck: { id: string }) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDeckClick: (deckId: string) => void;
}
