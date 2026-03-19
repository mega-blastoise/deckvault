import { describe, it, expect } from 'bun:test';
import { openingHandProbabilities, comboConsistency } from '../opening-hand';

const sampleDeck = [
  { cardId: 'card-a', name: 'Charizard ex', quantity: 3 },
  { cardId: 'card-b', name: 'Rare Candy', quantity: 4 },
  { cardId: 'card-c', name: 'Fire Energy', quantity: 12 },
];

describe('openingHandProbabilities', () => {
  it('returns a result for each card', () => {
    const result = openingHandProbabilities(sampleDeck);
    expect(result).toHaveLength(3);
  });

  it('probAtLeastOne is higher for higher-quantity cards', () => {
    const result = openingHandProbabilities(sampleDeck);
    const q3 = result.find((r) => r.quantity === 3)!;
    const q4 = result.find((r) => r.quantity === 4)!;
    expect(q4.probAtLeastOne).toBeGreaterThan(q3.probAtLeastOne);
  });

  it('probAtLeastTwo <= probAtLeastOne for same card', () => {
    const result = openingHandProbabilities(sampleDeck);
    for (const card of result) {
      expect(card.probAtLeastTwo).toBeLessThanOrEqual(card.probAtLeastOne);
    }
  });

  it('respects custom handSize', () => {
    const hand5 = openingHandProbabilities(sampleDeck, 5);
    const hand7 = openingHandProbabilities(sampleDeck, 7);
    for (let i = 0; i < sampleDeck.length; i++) {
      expect(hand7[i]!.probAtLeastOne).toBeGreaterThanOrEqual(hand5[i]!.probAtLeastOne);
    }
  });
});

describe('comboConsistency', () => {
  it('returns a value between 0 and 1', () => {
    const p = comboConsistency(60, [{ quantity: 4 }, { quantity: 3 }]);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('is lower for harder-to-assemble combos', () => {
    const easy = comboConsistency(60, [{ quantity: 4 }]);
    const hard = comboConsistency(60, [{ quantity: 4 }, { quantity: 1 }]);
    expect(easy).toBeGreaterThan(hard);
  });
});
