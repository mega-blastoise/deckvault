import { describe, it, expect } from 'bun:test';
import { energyCurveAnalysis } from '../energy-curve';
import type { CardSummary } from '../energy-curve';

function makeDeck(energyCount: number, basicEnergyCount = energyCount): CardSummary[] {
  const deck: CardSummary[] = [];
  const specialCount = energyCount - basicEnergyCount;

  if (basicEnergyCount > 0) {
    deck.push({ supertype: 'Energy', subtypes: [], quantity: basicEnergyCount });
  }
  if (specialCount > 0) {
    deck.push({ supertype: 'Energy', subtypes: ['Special'], quantity: specialCount });
  }

  const trainerCount = 60 - energyCount - 20;
  deck.push({ supertype: 'Pokémon', quantity: 20 });
  deck.push({ supertype: 'Trainer', quantity: trainerCount });

  return deck;
}

describe('energyCurveAnalysis', () => {
  it('12 basic energy returns recommendation === "standard"', () => {
    const result = energyCurveAnalysis(makeDeck(12));
    expect(result.recommendation).toBe('standard');
  });

  it('6 energy returns recommendation === "too-few"', () => {
    const result = energyCurveAnalysis(makeDeck(6, 6));
    expect(result.recommendation).toBe('too-few');
  });

  it('9 energy returns recommendation === "lean"', () => {
    const result = energyCurveAnalysis(makeDeck(9, 9));
    expect(result.recommendation).toBe('lean');
  });

  it('16 energy returns recommendation === "heavy"', () => {
    const result = energyCurveAnalysis(makeDeck(16, 16));
    expect(result.recommendation).toBe('heavy');
  });

  it('20 energy returns recommendation === "too-many"', () => {
    const result = energyCurveAnalysis(makeDeck(20, 20));
    expect(result.recommendation).toBe('too-many');
  });

  it('totalEnergy is correct', () => {
    const result = energyCurveAnalysis(makeDeck(12));
    expect(result.totalEnergy).toBe(12);
  });

  it('basicEnergy and specialEnergy split correctly', () => {
    const result = energyCurveAnalysis(makeDeck(12, 9));
    expect(result.basicEnergy).toBe(9);
    expect(result.specialEnergy).toBe(3);
  });

  it('turnCurve has 5 values', () => {
    const result = energyCurveAnalysis(makeDeck(12));
    expect(result.turnCurve).toHaveLength(5);
  });

  it('turnCurve values are non-negative', () => {
    const result = energyCurveAnalysis(makeDeck(12));
    for (const v of result.turnCurve) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('energyRatio equals totalEnergy / 60', () => {
    const result = energyCurveAnalysis(makeDeck(12));
    expect(Math.abs(result.energyRatio - 12 / 60)).toBeLessThan(1e-10);
  });
});
