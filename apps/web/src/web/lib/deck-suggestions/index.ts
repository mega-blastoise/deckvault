import type { DeckCard } from '../../../types/deck';
import type { EnergyCurveResult } from '../deck-math/energy-curve';
import type { PrizeRisk } from '../deck-math/prize-risk';

export type WeaknessId =
  | 'draw_issues'
  | 'energy_slow'
  | 'bench_slow'
  | 'key_card_prized';

export type WeaknessSeverity = 'critical' | 'moderate' | 'minor';

export type SuggestionTag =
  | 'draw'
  | 'energy_search'
  | 'energy_acceleration'
  | 'energy_recovery'
  | 'pokemon_search'
  | 'bench_setup'
  | 'discard_recovery';

export interface AffectedCard {
  cardId: string;
  name: string;
  quantity: number;
}

export interface WeaknessReport {
  id: WeaknessId;
  severity: WeaknessSeverity;
  title: string;
  description: string;
  tags: SuggestionTag[];
  affectedCards: AffectedCard[];
}

export function analyzeWeaknesses(
  deckCards: DeckCard[],
  energyData: EnergyCurveResult,
  prizeData: PrizeRisk[]
): WeaknessReport[] {
  const reports: WeaknessReport[] = [];

  if (energyData.recommendation === 'too-few' || energyData.recommendation === 'lean') {
    const severity: WeaknessSeverity =
      energyData.recommendation === 'too-few' ? 'critical' : 'moderate';
    reports.push({
      id: 'energy_slow',
      severity,
      title: 'Energy Supply Is Thin',
      description: `Your deck has only ${energyData.totalEnergy} energy cards, which may leave you unable to power up attackers consistently. Consider adding more energy search or acceleration.`,
      tags: ['energy_search', 'energy_acceleration', 'energy_recovery'],
      affectedCards: []
    });
  }

  const supporterCount = deckCards.reduce((acc, dc) => {
    if (
      dc.card.supertype === 'Trainer' &&
      dc.card.subtypes?.includes('Supporter')
    ) {
      return acc + dc.quantity;
    }
    return acc;
  }, 0);

  if (supporterCount < 11) {
    const severity: WeaknessSeverity = supporterCount < 8 ? 'critical' : 'moderate';
    reports.push({
      id: 'draw_issues',
      severity,
      title: 'Low Supporter Count',
      description: `Your deck runs only ${supporterCount} Supporter${supporterCount === 1 ? '' : 's'}. Most competitive decks include 11 or more to ensure consistent draw power each turn.`,
      tags: ['draw'],
      affectedCards: []
    });
  }

  const basicCount = deckCards.reduce((acc, dc) => {
    if (
      dc.card.supertype === 'Pokémon' &&
      dc.card.subtypes?.includes('Basic')
    ) {
      return acc + dc.quantity;
    }
    return acc;
  }, 0);

  if (basicCount < 9) {
    const severity: WeaknessSeverity = basicCount < 6 ? 'critical' : 'moderate';
    reports.push({
      id: 'bench_slow',
      severity,
      title: 'Too Few Basic Pokémon',
      description: `Your deck contains only ${basicCount} Basic Pokémon. Running fewer than 9 increases the risk of mulliganing and struggling to fill your bench early.`,
      tags: ['pokemon_search', 'bench_setup'],
      affectedCards: []
    });
  }

  const prizedAtRisk = prizeData.filter(
    (p) => {
      const dc = deckCards.find((c) => c.card.id === p.cardId);
      return (
        p.quantity === 1 &&
        p.probAtLeastOnePrized > 0.85 &&
        dc !== undefined &&
        dc.card.supertype === 'Pokémon'
      );
    }
  );

  if (prizedAtRisk.length > 0) {
    const names = prizedAtRisk.map((p) => p.name).join(', ');
    reports.push({
      id: 'key_card_prized',
      severity: 'moderate',
      title: 'Key Pokémon Prize Liability',
      description: `${names} ${prizedAtRisk.length === 1 ? 'is a single copy with' : 'are single copies with'} over 85% chance of being prized, potentially locking you out of a critical piece.`,
      tags: ['discard_recovery'],
      affectedCards: prizedAtRisk.map((p) => ({
        cardId: p.cardId,
        name: p.name,
        quantity: p.quantity
      }))
    });
  }

  return reports;
}
