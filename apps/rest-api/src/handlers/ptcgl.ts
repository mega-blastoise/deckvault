import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import { transformCardRowWithSet, transformCardRow } from '../utils/transforms';

interface PtcglLine {
  qty: number;
  name: string;
  setCode: string;
  number: string;
}

function parsePtcglText(text: string): PtcglLine[] {
  const result: PtcglLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Skip section headers: "Pokémon: 18", "Trainer: 32", "Energy: 10", "Total Cards: 60"
    if (/^(Pok[eé]mon|Trainer|Energy|Total)/i.test(line)) continue;
    // Match: {qty} {name} {setCode} {number}
    // setCode: alphanumeric only; number: alphanumeric + optional hyphens
    const match = line.match(/^(\d+)\s+(.+?)\s+([A-Za-z0-9]+)\s+([\w-]+)\s*$/);
    if (!match) continue;
    const qty = parseInt(match[1], 10);
    if (isNaN(qty) || qty < 1) continue;
    result.push({ qty, name: match[2].trim(), setCode: match[3], number: match[4] });
  }
  return result;
}

function formatResolvedCard(
  card: ReturnType<typeof transformCardRowWithSet>,
  ptcgoCode: string | undefined
) {
  return {
    id: card.id,
    name: card.name,
    supertype: card.supertype,
    subtypes: card.subtypes,
    number: String(card.number),
    regulationMark: card.regulationMark,
    images: card.images,
    set: {
      id: card.set?.id ?? '',
      name: card.set?.name ?? '',
      ptcgoCode: ptcgoCode ?? (card.set as { ptcgoCode?: string })?.ptcgoCode
    }
  };
}

/**
 * POST /api/v1/decks/ptcgl/resolve
 * Accepts PTCGL-format deck text and resolves each line to a card in the database.
 * Primary lookup: set ptcgo_code + card number.
 * Fallback: exact card name match.
 */
export const resolvePtcgl: Handler<Services> = async (ctx) => {
  let body: { text?: unknown };
  try {
    body = (await ctx.request.json()) as { text?: unknown };
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  if (typeof body.text !== 'string' || !body.text.trim()) {
    return ctx.badRequest('text is required and must be a non-empty string');
  }

  const db = ctx.services.db;
  const lines = parsePtcglText(body.text);

  if (lines.length === 0) {
    return ctx.badRequest('No valid card lines found in the provided text');
  }

  const resolved: { quantity: number; card: ReturnType<typeof formatResolvedCard> }[] = [];
  const unresolved: string[] = [];

  for (const line of lines) {
    // Primary: lookup by ptcgo_code + number (most accurate, handles reprints)
    const cardRow = db.queryOne<CardRow>(
      `SELECT pc.* FROM pokemon_cards pc
       JOIN pokemon_card_sets s ON pc.set_id = s.id
       WHERE s.ptcgo_code = ? AND pc.number = ?
       LIMIT 1`,
      line.setCode,
      line.number
    );

    if (cardRow) {
      const setRow = db.findSetById(cardRow.set_id) as SetRow | null;
      const card = setRow
        ? transformCardRowWithSet(cardRow, setRow)
        : transformCardRow(cardRow);
      resolved.push({
        quantity: line.qty,
        card: formatResolvedCard(card, setRow?.ptcgo_code ?? undefined)
      });
      continue;
    }

    // Fallback: exact name match (picks most recent set)
    const nameRow = db.queryOne<CardRow>(
      `SELECT pc.* FROM pokemon_cards pc
       JOIN pokemon_card_sets s ON pc.set_id = s.id
       WHERE pc.name = ?
       ORDER BY s.release_date DESC
       LIMIT 1`,
      line.name
    );

    if (nameRow) {
      const setRow = db.findSetById(nameRow.set_id) as SetRow | null;
      const card = setRow
        ? transformCardRowWithSet(nameRow, setRow)
        : transformCardRow(nameRow);
      resolved.push({
        quantity: line.qty,
        card: formatResolvedCard(card, setRow?.ptcgo_code ?? undefined)
      });
    } else {
      unresolved.push(`${line.qty} ${line.name} ${line.setCode} ${line.number}`);
    }
  }

  return ctx.json({ resolved, unresolved });
};
