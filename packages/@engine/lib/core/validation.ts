import type { CardDefinition, PokemonCardDefinition } from '../types/card';
import type { GameResult } from './result';
import { ok, err } from './result';
import { getLegalRegulationMarks } from '../adapter';

export function validateDeck(
  cardIds: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, CardDefinition>,
  formatDate: Date
): GameResult<void> {
  if (cardIds.length !== 60) {
    return err('INVALID_DECK', `Deck must contain exactly 60 cards, got ${cardIds.length}`);
  }

  const cards = cardIds.map(id => definitions.get(id)).filter((c): c is CardDefinition => c !== undefined);

  // At least 1 Basic Pokemon
  const hasBasic = cards.some(c => c.cardType === 'Pokemon' && c.stage === 'Basic');
  if (!hasBasic) {
    return err('INVALID_DECK', 'Deck must contain at least 1 Basic Pokemon');
  }

  // Max 4 copies per name (Basic Energy exempt)
  const nameCounts = new Map<string, number>();
  for (const card of cards) {
    const isBasicEnergy = card.cardType === 'Energy' && card.subtype === 'Basic';
    if (isBasicEnergy) continue;
    nameCounts.set(card.name, (nameCounts.get(card.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count > 4) {
      return err('INVALID_DECK', `Too many copies of "${name}": ${count} (max 4)`);
    }
  }

  // Max 1 ACE SPEC
  const aceSpecCount = cards.filter(c => {
    if (c.cardType === 'Trainer') return c.subtypes.includes('AceSpec');
    if (c.cardType === 'Energy') return c.isAceSpec;
    return false;
  }).length;
  if (aceSpecCount > 1) {
    return err('INVALID_DECK', `Deck contains ${aceSpecCount} ACE SPEC cards; maximum is 1`);
  }

  // Standard legality
  const legalMarks = getLegalRegulationMarks(formatDate);
  for (const card of cards) {
    if (card.cardType === 'Energy' && card.subtype === 'Basic') continue;
    if (card.cardType === 'Pokemon') {
      const poke = card as PokemonCardDefinition;
      if ((poke.subtypes as ReadonlyArray<string>).includes('Radiant')) {
        return err('INVALID_DECK', `Radiant Pokemon "${poke.name}" are not Standard-legal`);
      }
      if (!poke.regulationMark || !(legalMarks as ReadonlyArray<string>).includes(poke.regulationMark)) {
        return err('INVALID_DECK', `Pokemon "${poke.name}" is not Standard-legal (mark: ${poke.regulationMark ?? 'none'})`);
      }
    }
  }

  return ok(undefined);
}
