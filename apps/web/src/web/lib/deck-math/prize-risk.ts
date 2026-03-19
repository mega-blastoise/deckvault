import { hypergeometricPMF } from './hypergeometric';

export interface PrizeRisk {
  cardId: string;
  name: string;
  quantity: number;
  /** P(at least 1 copy is among the 6 prize cards) */
  probAtLeastOnePrized: number;
  /** P(ALL copies are prized — catastrophic loss) */
  probAllPrized: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Compute prize mapping risk for each card in the deck.
 * Uses hypergeometric: drawing 6 prizes from 60 cards.
 */
export function prizeRisk(
  deckCards: { cardId: string; name: string; quantity: number }[],
  deckSize = 60,
  prizeCount = 6
): PrizeRisk[] {
  return deckCards.map((card) => {
    // P(none prized) = C(60-qty, 6) / C(60, 6)
    const probNonePrized = hypergeometricPMF(deckSize, card.quantity, prizeCount, 0);
    const probAtLeastOnePrized = 1 - probNonePrized;

    // P(all prized) — only meaningful for 1-2 copy cards
    const probAllPrized =
      card.quantity <= prizeCount
        ? hypergeometricPMF(deckSize, card.quantity, prizeCount, card.quantity)
        : 0;

    const riskLevel = ((): PrizeRisk['riskLevel'] => {
      if (probAllPrized > 0.02) return 'critical';   // > 2% chance of total loss
      if (probAtLeastOnePrized > 0.5) return 'high';  // > 50% chance of losing a copy
      if (probAtLeastOnePrized > 0.25) return 'medium';
      return 'low';
    })();

    return { ...card, probAtLeastOnePrized, probAllPrized, riskLevel };
  });
}
