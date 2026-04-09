import type React from 'react';
import type { DeckFormat } from '../../../types/deck';
import type { BrowseDeck } from '@/web/services/DeckBrowseService';

export interface DeckBrowsePageViewProps {
  headerRef: React.RefObject<HTMLDivElement | null>;
  page: number;
  formatFilter: DeckFormat | 'all';
  searchQuery: string;
  decks: BrowseDeck[];
  isLoading: boolean;
  totalPages: number;
  onSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFormatFilterChange: (format: DeckFormat | 'all') => void;
  onPageChange: (updater: (p: number) => number) => void;
}
