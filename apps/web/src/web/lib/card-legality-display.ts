export type FormatLegality = 'standard' | 'expanded' | 'unlimited' | 'rotated';

export function getCardFormatBadge(card: {
  legalities?: { unlimited?: string; expanded?: string; standard?: string };
}): FormatLegality {
  if (card.legalities?.standard === 'Legal') return 'standard';
  if (card.legalities?.expanded === 'Legal') return 'expanded';
  if (card.legalities?.unlimited === 'Legal') return 'unlimited';
  return 'rotated';
}

export const FORMAT_BADGE_LABELS: Record<FormatLegality, string> = {
  standard: 'STD',
  expanded: 'EXP',
  unlimited: 'UNL',
  rotated: 'ROT'
};

export const FORMAT_BADGE_TITLES: Record<FormatLegality, string> = {
  standard: 'Standard legal',
  expanded: 'Expanded legal',
  unlimited: 'Unlimited legal',
  rotated: 'Rotated / not legal in Standard'
};
