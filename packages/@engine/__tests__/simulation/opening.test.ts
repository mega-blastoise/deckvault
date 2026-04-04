import { describe, it, expect } from 'bun:test';
import { analyzeOpeningHands } from '../../lib/simulation/opening';
import type { DeckInput } from '../../lib/simulation/opening';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition } from '../../lib/types/card';

function makeBasicPokemon(id: string, name: string): PokemonCardDefinition {
  return {
    cardType: 'Pokemon',
    id,
    name,
    stage: 'Basic',
    subtypes: [],
    hp: 70,
    types: ['Fire'],
    evolvesFrom: null,
    attacks: [],
    abilities: [],
    weaknesses: [],
    resistances: [],
    retreatCost: 1,
    rules: [],
    prizeValue: 1,
    regulationMark: 'H'
  };
}

function makeStage1Pokemon(id: string, name: string, evolvesFrom: string): PokemonCardDefinition {
  return {
    cardType: 'Pokemon',
    id,
    name,
    stage: 'Stage1',
    subtypes: [],
    hp: 100,
    types: ['Fire'],
    evolvesFrom,
    attacks: [],
    abilities: [],
    weaknesses: [],
    resistances: [],
    retreatCost: 1,
    rules: [],
    prizeValue: 1,
    regulationMark: 'H'
  };
}

function makeSupporter(id: string, name: string): TrainerCardDefinition {
  return {
    cardType: 'Trainer',
    id,
    name,
    subtypes: ['Supporter'],
    rules: [],
    effectId: id
  };
}

function makeEnergy(id: string, name: string): EnergyCardDefinition {
  return {
    cardType: 'Energy',
    id,
    name,
    subtype: 'Basic',
    provides: ['Fire'],
    rules: [],
    effectId: null,
    isAceSpec: false
  };
}

describe('analyzeOpeningHands', () => {
  it('returns mulliganRate 0 for an all-basics deck', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    defs.set(basic.id, basic);

    const deck: DeckInput = { name: 'All Basics', cards: [{ cardId: 'basic-1', count: 60 }] };
    const stats = analyzeOpeningHands(deck, defs, 100, 42);

    expect(stats.mulliganRate).toBe(0);
    expect(stats.averageMulligans).toBe(0);
    expect(stats.averageBasicsInOpeningHand).toBe(7);
  });

  it('returns mulliganRate > 0 for a deck with no basics', () => {
    const defs = new Map<string, CardDefinition>();
    const energy = makeEnergy('energy-1', 'Fire Energy');
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    defs.set(energy.id, energy);
    defs.set(basic.id, basic);

    // Deck with 59 energy + 1 basic => very low basic density, some mulligans expected
    const deck: DeckInput = {
      name: 'Low Basics',
      cards: [
        { cardId: 'energy-1', count: 59 },
        { cardId: 'basic-1', count: 1 }
      ]
    };
    const stats = analyzeOpeningHands(deck, defs, 200, 42);

    // With only 1 basic in 60 cards, mulligan rate should be significant
    expect(stats.mulliganRate).toBeGreaterThan(0);
  });

  it('detects supporters in opening hand', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    const supporter = makeSupporter('sup-1', 'Professor Research');
    defs.set(basic.id, basic);
    defs.set(supporter.id, supporter);

    const deck: DeckInput = {
      name: 'With Supporters',
      cards: [
        { cardId: 'basic-1', count: 30 },
        { cardId: 'sup-1', count: 30 }
      ]
    };
    const stats = analyzeOpeningHands(deck, defs, 100, 42);

    expect(stats.hasSupporterTurn1Rate).toBeGreaterThan(0);
  });

  it('detects energy in opening hand', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    const energy = makeEnergy('energy-1', 'Fire Energy');
    defs.set(basic.id, basic);
    defs.set(energy.id, energy);

    const deck: DeckInput = {
      name: 'With Energy',
      cards: [
        { cardId: 'basic-1', count: 30 },
        { cardId: 'energy-1', count: 30 }
      ]
    };
    const stats = analyzeOpeningHands(deck, defs, 100, 42);

    expect(stats.hasEnergyTurn1Rate).toBeGreaterThan(0);
  });

  it('detects evolution pairs in opening hand', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    const stage1 = makeStage1Pokemon('stage1-1', 'Charmeleon', 'Charmander');
    defs.set(basic.id, basic);
    defs.set(stage1.id, stage1);

    const deck: DeckInput = {
      name: 'With Evolutions',
      cards: [
        { cardId: 'basic-1', count: 30 },
        { cardId: 'stage1-1', count: 30 }
      ]
    };
    const stats = analyzeOpeningHands(deck, defs, 100, 42);

    expect(stats.hasEvolutionTargetRate).toBeGreaterThan(0);
  });

  it('returns all rates in [0, 1]', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    const supporter = makeSupporter('sup-1', 'Professor Research');
    const energy = makeEnergy('energy-1', 'Fire Energy');
    defs.set(basic.id, basic);
    defs.set(supporter.id, supporter);
    defs.set(energy.id, energy);

    const deck: DeckInput = {
      name: 'Mixed',
      cards: [
        { cardId: 'basic-1', count: 20 },
        { cardId: 'sup-1', count: 20 },
        { cardId: 'energy-1', count: 20 }
      ]
    };
    const stats = analyzeOpeningHands(deck, defs, 100, 42);

    expect(stats.mulliganRate).toBeGreaterThanOrEqual(0);
    expect(stats.mulliganRate).toBeLessThanOrEqual(1);
    expect(stats.hasSupporterTurn1Rate).toBeGreaterThanOrEqual(0);
    expect(stats.hasSupporterTurn1Rate).toBeLessThanOrEqual(1);
    expect(stats.hasEnergyTurn1Rate).toBeGreaterThanOrEqual(0);
    expect(stats.hasEnergyTurn1Rate).toBeLessThanOrEqual(1);
    expect(stats.hasEvolutionTargetRate).toBeGreaterThanOrEqual(0);
    expect(stats.hasEvolutionTargetRate).toBeLessThanOrEqual(1);
    expect(stats.idealOpeningRate).toBeGreaterThanOrEqual(0);
    expect(stats.idealOpeningRate).toBeLessThanOrEqual(1);
    expect(stats.averageBasicsInOpeningHand).toBeGreaterThanOrEqual(0);
    expect(stats.averageBasicsInOpeningHand).toBeLessThanOrEqual(7);
  });

  it('produces deterministic results with the same seed', () => {
    const defs = new Map<string, CardDefinition>();
    const basic = makeBasicPokemon('basic-1', 'Charmander');
    const energy = makeEnergy('energy-1', 'Fire Energy');
    defs.set(basic.id, basic);
    defs.set(energy.id, energy);

    const deck: DeckInput = {
      name: 'Test',
      cards: [
        { cardId: 'basic-1', count: 20 },
        { cardId: 'energy-1', count: 40 }
      ]
    };

    const stats1 = analyzeOpeningHands(deck, defs, 50, 99);
    const stats2 = analyzeOpeningHands(deck, defs, 50, 99);

    expect(stats1).toEqual(stats2);
  });
});
