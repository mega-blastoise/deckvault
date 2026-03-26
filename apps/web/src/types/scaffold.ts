import type { Pokemon } from '@pokemon/clients';

export type ScaffoldTier = 'core' | 'engine' | 'consistency' | 'tech';

export interface ScaffoldCard {
  card: Pick<Pokemon.Card, 'id' | 'name' | 'supertype' | 'subtypes' | 'number' | 'regulationMark' | 'images' | 'tcgplayer'> & {
    set: { id: string; name: string; ptcgoCode?: string };
  };
  quantity: number;
  frequency: number;
  tier: ScaffoldTier;
}

export interface ScaffoldDeck {
  archetype: string;
  variant: string;
  format: string;
  clusterSize: number;
  totalCards: number;
  flexSlots: number;
  core: ScaffoldCard[];
  engine: ScaffoldCard[];
  consistency: ScaffoldCard[];
  tech: ScaffoldCard[];
}

export interface ScaffoldRequest {
  archetype: string;
  variant?: string;
  format?: string;
}

export const TIER_META: Record<ScaffoldTier, { label: string; description: string; color: string }> = {
  core: {
    label: 'Core',
    description: 'Always include — appears in 90%+ of competitive lists',
    color: 'var(--focus-ring)'
  },
  engine: {
    label: 'Engine',
    description: 'Strongly recommended — appears in 70–90% of lists',
    color: 'var(--text-primary)'
  },
  consistency: {
    label: 'Consistency',
    description: 'Recommended — appears in 40–70% of lists',
    color: 'var(--text-secondary)'
  },
  tech: {
    label: 'Tech',
    description: 'Meta-dependent — appears in 10–40% of lists',
    color: 'var(--text-secondary)'
  }
};
