import { describe, it, expect } from 'bun:test';
import { prizeRisk } from '../prize-risk';

const sampleDeck = [
  { cardId: 'card-a', name: 'Boss\'s Orders', quantity: 1 },
  { cardId: 'card-b', name: 'Charizard ex', quantity: 2 },
  { cardId: 'card-c', name: 'Rare Candy', quantity: 4 },
  { cardId: 'card-d', name: 'Fire Energy', quantity: 12 },
];

describe('prizeRisk', () => {
  it('returns a result for each card', () => {
    const result = prizeRisk(sampleDeck);
    expect(result).toHaveLength(4);
  });

  it('4-copy card has probAtLeastOnePrized ≈ 0.3515', () => {
    const result = prizeRisk(sampleDeck);
    const candy = result.find((r) => r.quantity === 4)!;
    expect(Math.abs(candy.probAtLeastOnePrized - 0.3515)).toBeLessThan(0.001);
  });

  it('1-copy card has riskLevel === "critical" (10% chance of being prized)', () => {
    const result = prizeRisk(sampleDeck);
    const boss = result.find((r) => r.quantity === 1)!;
    expect(boss.riskLevel).toBe('critical');
  });

  it('12-copy energy card has probAtLeastOnePrized > 0.7', () => {
    const result = prizeRisk(sampleDeck);
    const energy = result.find((r) => r.quantity === 12)!;
    expect(energy.probAtLeastOnePrized).toBeGreaterThan(0.7);
  });

  it('probAllPrized is 0 for cards with quantity > 6', () => {
    const result = prizeRisk(sampleDeck);
    const energy = result.find((r) => r.quantity === 12)!;
    expect(energy.probAllPrized).toBe(0);
  });

  it('probAtLeastOnePrized is always between 0 and 1', () => {
    const result = prizeRisk(sampleDeck);
    for (const card of result) {
      expect(card.probAtLeastOnePrized).toBeGreaterThanOrEqual(0);
      expect(card.probAtLeastOnePrized).toBeLessThanOrEqual(1);
    }
  });
});
