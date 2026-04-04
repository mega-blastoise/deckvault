import type { CardDefinition } from '../types/card';
import { createRngState, shuffle } from '../rng';

export interface DeckInput {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
}

export interface OpeningHandStats {
  readonly mulliganRate: number;
  readonly averageMulligans: number;
  readonly averageBasicsInOpeningHand: number;
  readonly hasSupporterTurn1Rate: number;
  readonly hasEnergyTurn1Rate: number;
  readonly hasEvolutionTargetRate: number;
  readonly idealOpeningRate: number;
}

function expandDeck(deck: DeckInput): ReadonlyArray<string> {
  return deck.cards.flatMap(({ cardId, count }) => Array(count).fill(cardId) as string[]);
}

function hasBasicInHand(
  hand: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, CardDefinition>
): boolean {
  return hand.some(id => {
    const d = definitions.get(id);
    return d?.cardType === 'Pokemon' && d.stage === 'Basic';
  });
}

function hasEvolutionPair(hand: ReadonlyArray<CardDefinition>): boolean {
  const basicNames = new Set(
    hand
      .filter(d => d.cardType === 'Pokemon' && d.stage === 'Basic')
      .map(d => d.name)
  );
  return hand.some(
    d =>
      d.cardType === 'Pokemon' &&
      d.stage !== 'Basic' &&
      d.evolvesFrom !== null &&
      basicNames.has(d.evolvesFrom)
  );
}

export function analyzeOpeningHands(
  deck: DeckInput,
  definitions: ReadonlyMap<string, CardDefinition>,
  sampleSize: number,
  seed: number
): OpeningHandStats {
  const expanded = expandDeck(deck);
  let rng = createRngState(seed);

  let totalMulligans = 0;
  let samplesMulliganed = 0;
  let totalBasics = 0;
  let supporterTurn1 = 0;
  let energyTurn1 = 0;
  let evolutionPairPresent = 0;
  let idealOpening = 0;

  for (let i = 0; i < sampleSize; i++) {
    const shuffleResult = shuffle([...expanded], rng);
    rng = shuffleResult.nextState;
    const hand = shuffleResult.result.slice(0, 7);

    let mulligans = 0;
    let finalHand = hand;
    let redrawRng = rng;
    while (!hasBasicInHand(finalHand, definitions)) {
      mulligans++;
      const redraw = shuffle([...expanded], redrawRng);
      redrawRng = redraw.nextState;
      finalHand = redraw.result.slice(0, 7);
    }
    rng = redrawRng;
    if (mulligans > 0) samplesMulliganed++;
    totalMulligans += mulligans;

    const handDefs = finalHand
      .map(id => definitions.get(id))
      .filter((d): d is CardDefinition => d !== undefined);
    const basics = handDefs.filter(d => d.cardType === 'Pokemon' && d.stage === 'Basic');
    const supporters = handDefs.filter(
      d => d.cardType === 'Trainer' && d.subtypes.includes('Supporter')
    );
    const energies = handDefs.filter(d => d.cardType === 'Energy');
    const hasEvo = hasEvolutionPair(handDefs);

    totalBasics += basics.length;
    if (supporters.length > 0) supporterTurn1++;
    if (energies.length > 0) energyTurn1++;
    if (hasEvo) evolutionPairPresent++;
    if (basics.length > 0 && supporters.length > 0 && energies.length > 0) idealOpening++;
  }

  return {
    mulliganRate: samplesMulliganed / sampleSize,
    averageMulligans: totalMulligans / sampleSize,
    averageBasicsInOpeningHand: totalBasics / sampleSize,
    hasSupporterTurn1Rate: supporterTurn1 / sampleSize,
    hasEnergyTurn1Rate: energyTurn1 / sampleSize,
    hasEvolutionTargetRate: evolutionPairPresent / sampleSize,
    idealOpeningRate: idealOpening / sampleSize
  };
}
