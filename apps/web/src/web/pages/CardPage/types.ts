import type { Pokemon } from '@pokemon/clients';
import type { CardQueryResult } from '@/web/hooks/useCard';

export interface CardPageViewProps {
  cardQuery: CardQueryResult;
  getQuantity: (id: string) => number;
  onAddCard: (id: string) => void;
  onRemoveCard: (id: string) => void;
  onNavigateBack: () => void;
}
