import type { DeckFormat } from '../../../types/deck';
import type { MetaDeckSummary } from '@/web/components/MetaDeckCard';

export type TierFilter = 'all' | 'S' | 'A' | 'B' | 'C' | 'D';

export interface MetaDeckBrowserPageViewProps {
  format: DeckFormat | 'all';
  archetype: string;
  collectionOnly: boolean;
  tierFilter: TierFilter;
  decks: MetaDeckSummary[];
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  onFormatChange: (format: DeckFormat | 'all') => void;
  onArchetypeChange: (archetype: string) => void;
  onCollectionOnlyChange: (value: boolean) => void;
  onTierFilterChange: (tier: TierFilter) => void;
  onClone: (metaDeckId: string) => void;
}
