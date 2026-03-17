import { useMemo } from 'react';
import type { Pokemon } from '@pokemon/clients';
import type {
  DeckCard,
  DeckFormat,
  DeckValidation,
  ValidationError,
  ValidationWarning
} from '../../types/deck';

/**
 * Format rules for deck validation
 */
export interface FormatRules {
  /** Exact number of cards required */
  deckSize: number;
  /** Maximum copies of the same card (except basic energy) */
  maxCopies: number;
  /** Minimum number of basic Pokemon required */
  minBasicPokemon: number;
  /** Legal sets for this format (empty = all sets allowed) */
  legalSets?: string[];
  /** Sets that are banned in this format */
  bannedSets?: string[];
  /** Specific cards banned in this format */
  bannedCards?: string[];
}

/**
 * Format rules by format type
 */
export const FORMAT_RULES: Record<DeckFormat, FormatRules> = {
  standard: {
    deckSize: 60,
    maxCopies: 4,
    minBasicPokemon: 1,
    // Standard format typically includes the last 2 years of sets
    // This would be dynamically determined by rotation dates
    legalSets: [],
    bannedCards: []
  },
  expanded: {
    deckSize: 60,
    maxCopies: 4,
    minBasicPokemon: 1,
    // Expanded includes Black & White onwards
    legalSets: [],
    bannedCards: []
  },
  unlimited: {
    deckSize: 60,
    maxCopies: 4,
    minBasicPokemon: 1
    // Unlimited allows all cards
  },
  theme: {
    deckSize: 60,
    maxCopies: 4,
    minBasicPokemon: 1
    // Theme decks are pre-constructed, so validation is relaxed
  }
};

/**
 * Check if a card is a basic energy
 */
function isBasicEnergy(card: Pokemon.Card): boolean {
  return (
    card.supertype === 'Energy' && (card.subtypes?.includes('Basic') ?? false)
  );
}

/**
 * Check if a card is a basic Pokemon
 */
function isBasicPokemon(card: Pokemon.Card): boolean {
  return (
    card.supertype === 'Pokémon' && (card.subtypes?.includes('Basic') ?? false)
  );
}

/**
 * Get the canonical card name for copy counting
 * Cards with the same name count towards the 4-copy limit
 */
function getCanonicalName(card: Pokemon.Card): string {
  return card.name;
}

/**
 * Validate a deck against format rules
 */
export function validateDeck(
  deckCards: DeckCard[],
  cardDetails: Map<string, Pokemon.Card>,
  format: DeckFormat
): DeckValidation {
  const rules = FORMAT_RULES[format];
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Count totals
  let totalCards = 0;
  let pokemonCount = 0;
  let trainerCount = 0;
  let energyCount = 0;
  let basicPokemonCount = 0;

  // Count copies by card name
  const copyCountByName: Record<string, { count: number; cardIds: string[] }> =
    {};

  // Process each card in the deck
  for (const deckCard of deckCards) {
    const card = cardDetails.get(deckCard.card.id);
    totalCards += deckCard.quantity;

    if (!card) {
      warnings.push({
        code: 'UNKNOWN_CARD',
        message: `Card details not found for ${deckCard.card.id}`,
        cardId: deckCard.card.id
      });
      continue;
    }

    // Count by supertype
    switch (card.supertype) {
      case 'Pokémon':
        pokemonCount += deckCard.quantity;
        if (isBasicPokemon(card)) {
          basicPokemonCount += deckCard.quantity;
        }
        break;
      case 'Trainer':
        trainerCount += deckCard.quantity;
        break;
      case 'Energy':
        energyCount += deckCard.quantity;
        break;
    }

    // Skip copy counting for basic energy
    if (isBasicEnergy(card)) {
      continue;
    }

    // Count copies by name
    const canonicalName = getCanonicalName(card);
    if (!copyCountByName[canonicalName]) {
      copyCountByName[canonicalName] = { count: 0, cardIds: [] };
    }
    copyCountByName[canonicalName].count += deckCard.quantity;
    copyCountByName[canonicalName].cardIds.push(deckCard.card.id);

    // Check format legality using card's legalities field
    if (format !== 'unlimited' && format !== 'theme') {
      const cardLegality = (card.legalities as any)?.[format as 'standard' | 'expanded'];
      if (cardLegality !== 'Legal') {
        errors.push({
          code: 'NOT_LEGAL_IN_FORMAT',
          message: `${card.name} is not legal in ${format} format`,
          cardId: deckCard.card.id
        });
      }
    }

    // Check for specifically banned cards
    if (rules.bannedCards?.includes(card.id)) {
      errors.push({
        code: 'BANNED_CARD',
        message: `${card.name} is banned in ${format} format`,
        cardId: deckCard.card.id
      });
    }
  }

  // Check copy limits
  for (const [cardName, { count, cardIds }] of Object.entries(
    copyCountByName
  )) {
    if (count > rules.maxCopies) {
      errors.push({
        code: 'TOO_MANY_COPIES',
        message: `Too many copies of ${cardName}: ${count}/${rules.maxCopies} allowed`,
        cardId: cardIds[0]
      });
    }
  }

  // Check deck size
  if (totalCards !== rules.deckSize) {
    errors.push({
      code: 'INVALID_DECK_SIZE',
      message: `Deck must contain exactly ${rules.deckSize} cards (currently ${totalCards})`
    });
  }

  // Check minimum basic Pokemon
  if (basicPokemonCount < rules.minBasicPokemon) {
    errors.push({
      code: 'NO_BASIC_POKEMON',
      message: `Deck must contain at least ${rules.minBasicPokemon} Basic Pokémon`
    });
  }

  // Add warnings for deck composition
  if (pokemonCount === 0) {
    warnings.push({
      code: 'NO_POKEMON',
      message: 'Deck has no Pokémon cards'
    });
  }

  if (energyCount === 0) {
    warnings.push({
      code: 'NO_ENERGY',
      message: 'Deck has no Energy cards - consider adding some'
    });
  }

  if (pokemonCount > 30) {
    warnings.push({
      code: 'HIGH_POKEMON_COUNT',
      message: `High Pokémon count (${pokemonCount}) may lead to inconsistent setup`
    });
  }

  if (energyCount > 25) {
    warnings.push({
      code: 'HIGH_ENERGY_COUNT',
      message: `High Energy count (${energyCount}) may reduce consistency`
    });
  }

  return {
    isValid: errors.length === 0,
    totalCards,
    errors,
    warnings,
    breakdown: {
      pokemon: pokemonCount,
      trainer: trainerCount,
      energy: energyCount,
      basicPokemon: basicPokemonCount
    }
  };
}

/**
 * Hook to validate a deck
 */
export function useDeckValidation(
  deckCards: DeckCard[],
  cardDetails: Pokemon.Card[],
  format: DeckFormat
): DeckValidation {
  return useMemo(() => {
    // Create a map for fast card lookups
    const cardMap = new Map<string, Pokemon.Card>();
    for (const card of cardDetails) {
      cardMap.set(card.id, card);
    }

    return validateDeck(deckCards, cardMap, format);
  }, [deckCards, cardDetails, format]);
}
