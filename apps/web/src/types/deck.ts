/**
 * Deck format definitions
 */
export type DeckFormat = 'standard' | 'expanded' | 'unlimited' | 'theme';

/**
 * A card entry in a deck with quantity
 */
export interface DeckCard {
  card: {
    name: string;
    id: string;
    supertype: string;
    subtype?: string;
    subtypes?: string[];
    number?: string;
    regulationMark?: string;
    images?: { small?: string; large?: string };
    set: {
      id: string;
      name: string;
      ptcgoCode?: string;
    };
    tcgplayer?: { url: string };
  };
  quantity: number;
}

/**
 * Deck data structure
 */
export interface Deck {
  id: string;
  name: string;
  description?: string;
  format: DeckFormat;
  cards: DeckCard[];
  coverCardId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validation error for deck validation
 */
export interface ValidationError {
  code: string;
  message: string;
  cardId?: string;
}

/**
 * Validation warning for deck validation
 */
export interface ValidationWarning {
  code: string;
  message: string;
  cardId?: string;
}

/**
 * Deck validation result
 */
export interface DeckValidation {
  isValid: boolean;
  totalCards: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  breakdown: {
    pokemon: number;
    trainer: number;
    energy: number;
    basicPokemon: number;
  };
}

/**
 * Extended Deck type with computed properties
 */
export interface DeckWithMeta extends Deck {
  validation: DeckValidation;
  cardCount: number;
  isComplete: boolean;
}

/**
 * Deck store structure for localStorage persistence
 */
export interface DeckStore {
  version: number;
  decks: Record<string, Deck>;
}

/**
 * Current deck store version for migrations
 */
export const DECK_STORE_VERSION = 1;

/**
 * Format display names
 */
export const FORMAT_NAMES: Record<DeckFormat, string> = {
  standard: 'Standard',
  expanded: 'Expanded',
  unlimited: 'Unlimited',
  theme: 'Theme'
};
