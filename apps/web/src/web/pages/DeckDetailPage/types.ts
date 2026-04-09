import type { DeckQueryResult } from '@/web/hooks/useDeckQuery';

export interface DeckDetailPageViewProps {
  deckQuery: DeckQueryResult;
  deckId: string;
  currentUserId: string | undefined;
  onDelete: () => Promise<void>;
  onNavigateToCard: (cardId: string) => void;
}
