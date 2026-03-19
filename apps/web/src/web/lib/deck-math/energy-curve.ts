export interface EnergyCurveResult {
  totalEnergy: number;
  basicEnergy: number;
  specialEnergy: number;
  energyRatio: number;           // totalEnergy / 60
  assessedAttachPerTurn: number; // estimated energy available by turn N using ratio
  recommendation: EnergyRecommendation;
  turnCurve: number[];           // [turn1, turn2, turn3, turn4, turn5] expected energy attached
}

export type EnergyRecommendation =
  | 'too-few'     // < 8 total
  | 'lean'        // 8-10 total
  | 'standard'    // 11-14 total (most decks)
  | 'heavy'       // 15-18 total
  | 'too-many';   // > 18 total

export interface CardSummary {
  supertype: 'Pokémon' | 'Trainer' | 'Energy';
  subtypes?: string[];
  quantity: number;
}

/**
 * Analyze energy distribution in a deck.
 * Classifies energy cards by supertype and computes the expected
 * energy attachment curve over 5 turns.
 */
export function energyCurveAnalysis(deckCards: CardSummary[], deckSize = 60): EnergyCurveResult {
  const energyCards = deckCards.filter((c) => c.supertype === 'Energy');
  const totalEnergy = energyCards.reduce((acc, c) => acc + c.quantity, 0);

  const basicEnergy = energyCards
    .filter((c) => !c.subtypes?.includes('Special'))
    .reduce((acc, c) => acc + c.quantity, 0);

  const specialEnergy = totalEnergy - basicEnergy;
  const energyRatio = totalEnergy / deckSize;

  // Expected energy in hand by turn N:
  // Turn T: player has seen (7 + T) cards. Expected energy = (7 + T) * energyRatio
  // Subtract 1 for energy already attached (simplified model)
  const turnCurve = [1, 2, 3, 4, 5].map((t) => {
    const cardsDrawn = 7 + t;
    const expectedInHand = cardsDrawn * energyRatio;
    return Math.min(totalEnergy, Math.max(0, expectedInHand - t));
  });

  const recommendation = ((): EnergyRecommendation => {
    if (totalEnergy < 8) return 'too-few';
    if (totalEnergy <= 10) return 'lean';
    if (totalEnergy <= 14) return 'standard';
    if (totalEnergy <= 18) return 'heavy';
    return 'too-many';
  })();

  return {
    totalEnergy,
    basicEnergy,
    specialEnergy,
    energyRatio,
    assessedAttachPerTurn: energyRatio,
    recommendation,
    turnCurve,
  };
}
