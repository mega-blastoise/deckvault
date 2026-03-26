import type { DeckCard } from '../../types/deck';

const SUPERTYPE_ORDER = ['Pokémon', 'Trainer', 'Energy'] as const;

/**
 * Extract the card's collection number from its ID.
 * Card IDs are formatted as "{setId}-{number}" (e.g. "sv3-125", "sv3-TG01").
 * This is more reliable than the numeric `number` field which loses non-numeric suffixes.
 */
function extractNumber(card: DeckCard['card']): string {
  const dashIdx = card.id.indexOf('-');
  if (dashIdx !== -1) return card.id.substring(dashIdx + 1);
  return String((card as { number?: string | number }).number ?? '0');
}

/**
 * Serialize a deck card list to PTCGL-format text.
 * Output can be pasted directly into PTCGL or shared with other players.
 */
export function exportToPtcgl(cards: DeckCard[]): string {
  const sections: string[] = [];

  for (const supertype of SUPERTYPE_ORDER) {
    const group = cards.filter((dc) => dc.card.supertype === supertype);
    if (group.length === 0) continue;

    const total = group.reduce((s, dc) => s + dc.quantity, 0);
    const lines = group.map((dc) => {
      const setCode = dc.card.set.ptcgoCode ?? dc.card.set.id.toUpperCase();
      const number = extractNumber(dc.card);
      return `${dc.quantity} ${dc.card.name} ${setCode} ${number}`;
    });

    sections.push(`${supertype}: ${total}`);
    sections.push(...lines);
    sections.push('');
  }

  const totalCards = cards.reduce((s, dc) => s + dc.quantity, 0);
  sections.push(`Total Cards: ${totalCards}`);

  return sections.join('\n').trim();
}

export interface PtcglLine {
  qty: number;
  name: string;
  setCode: string;
  number: string;
  raw: string;
}

/**
 * Parse PTCGL-format deck text into structured lines.
 * Does not resolve card IDs — use the /api/v1/decks/ptcgl/resolve endpoint for that.
 */
export function parsePtcgl(text: string): PtcglLine[] {
  const result: PtcglLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(Pok[eé]mon|Trainer|Energy|Total)/i.test(line)) continue;
    const match = line.match(/^(\d+)\s+(.+?)\s+([A-Za-z0-9]+)\s+([\w-]+)\s*$/);
    if (!match) continue;
    const qty = parseInt(match[1], 10);
    if (isNaN(qty) || qty < 1) continue;
    result.push({ qty, name: match[2].trim(), setCode: match[3], number: match[4], raw: line });
  }
  return result;
}
