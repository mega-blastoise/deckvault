import { hypergeometricCDF } from './hypergeometric';

export interface CardProbability {
  cardId: string;
  name: string;
  quantity: number;
  /** P(drawing >= 1 in opening hand of handSize) */
  probAtLeastOne: number;
  /** P(drawing >= 2 in opening hand of handSize) */
  probAtLeastTwo: number;
}

/**
 * For each unique card in the deck, compute the probability of drawing
 * at least 1 copy and at least 2 copies in an opening hand.
 *
 * @param deckCards - Array of { cardId, name, quantity } for all 60 cards
 * @param handSize - Default 7 (standard opening hand)
 * @param deckSize - Default 60
 */
export function openingHandProbabilities(
  deckCards: { cardId: string; name: string; quantity: number }[],
  handSize = 7,
  deckSize = 60
): CardProbability[] {
  return deckCards.map((card) => ({
    cardId: card.cardId,
    name: card.name,
    quantity: card.quantity,
    probAtLeastOne: hypergeometricCDF(deckSize, card.quantity, handSize, 1),
    probAtLeastTwo: hypergeometricCDF(deckSize, card.quantity, handSize, 2),
  }));
}

/**
 * Consistency score: probability of drawing all specified "combo" cards
 * by the end of turn 2 (opening hand of 7 + 2 draw steps = 9 cards seen).
 */
export function comboConsistency(
  deckSize: number,
  combo: { quantity: number }[],
  cardsSeen = 9
): number {
  // Approximation: multiply individual probabilities (assumes independence — acceptable for small combos)
  return combo.reduce(
    (acc, card) => acc * hypergeometricCDF(deckSize, card.quantity, cardsSeen, 1),
    1
  );
}
