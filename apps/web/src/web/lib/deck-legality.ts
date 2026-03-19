import type { DeckCard, DeckFormat } from '../../types/deck';

export interface CardLegalityIssue {
  cardId: string;
  reason: 'rotated' | 'banned' | 'format-illegal' | 'over-limit';
}

const STANDARD_LEGAL_MARKS = ['G', 'H', 'I'];
const EXPANDED_LEGAL_MARKS = ['D', 'E', 'F', 'G', 'H', 'I'];

export function getCardLegalityIssue(
  card: DeckCard['card'],
  format: DeckFormat,
  allDeckCards: DeckCard[]
): CardLegalityIssue | null {
  if (format === 'standard' && card.regulationMark) {
    if (!STANDARD_LEGAL_MARKS.includes(card.regulationMark)) {
      return { cardId: card.id, reason: 'rotated' };
    }
  }
  if (format === 'expanded' && card.regulationMark) {
    if (!EXPANDED_LEGAL_MARKS.includes(card.regulationMark)) {
      return { cardId: card.id, reason: 'rotated' };
    }
  }
  const isBasicEnergy = card.supertype === 'Energy' && !card.subtypes?.includes('Special');
  if (!isBasicEnergy) {
    const quantity = allDeckCards.find((dc) => dc.card.id === card.id)?.quantity ?? 0;
    if (quantity > 4) {
      return { cardId: card.id, reason: 'over-limit' };
    }
  }
  return null;
}
