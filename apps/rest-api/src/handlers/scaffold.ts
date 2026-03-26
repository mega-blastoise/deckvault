import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import { transformCardRow, transformCardRowWithSet } from '../utils/transforms';
import type { MetaDeckRow } from '../services/postgres';

type ScaffoldTier = 'core' | 'engine' | 'consistency' | 'tech';

interface ScaffoldCard {
  card: {
    id: string;
    name: string;
    supertype: string;
    subtypes?: string[];
    number: string | number;
    regulationMark?: string;
    images?: { small: string; large: string };
    set: { id: string; name: string; ptcgoCode?: string };
    tcgplayer?: { url: string };
  };
  quantity: number;
  frequency: number;
  tier: ScaffoldTier;
}

interface ScaffoldDeck {
  archetype: string;
  variant: string;
  format: string;
  clusterSize: number;
  totalCards: number;
  flexSlots: number;
  core: ScaffoldCard[];
  engine: ScaffoldCard[];
  consistency: ScaffoldCard[];
  tech: ScaffoldCard[];
}

function classifyTier(frequency: number): ScaffoldTier | null {
  if (frequency >= 0.9) return 'core';
  if (frequency >= 0.7) return 'engine';
  if (frequency >= 0.4) return 'consistency';
  if (frequency >= 0.1) return 'tech';
  return null;
}

export const generateScaffold: Handler<Services> = async (ctx) => {
  let body: { archetype?: string; variant?: string; format?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return ctx.badRequest('Request body must be valid JSON');
  }

  const archetype = body.archetype?.trim();
  if (!archetype) return ctx.badRequest('archetype is required');

  const format = (body.format ?? 'standard').trim().toLowerCase();
  const variant = body.variant?.trim();

  const cluster = await ctx.services.pg.getArchetypeCluster(archetype, format, variant);
  if (cluster.length === 0) {
    return ctx.notFound(`No meta decks found for archetype "${archetype}" in ${format} format`);
  }

  const deckIds = cluster.map((d: MetaDeckRow) => d.id);
  const allCardRows = await ctx.services.pg.getMetaDeckCardsBatch(deckIds);

  // Build per-deck card maps
  const deckCardMaps = new Map<string, Map<string, number>>();
  for (const row of allCardRows) {
    let m = deckCardMaps.get(row.deck_id);
    if (!m) {
      m = new Map();
      deckCardMaps.set(row.deck_id, m);
    }
    m.set(row.card_id, row.quantity);
  }

  // Aggregate frequency and total quantity
  const appearances = new Map<string, number>();
  const totalQty = new Map<string, number>();

  for (const deck of cluster) {
    const cardMap = deckCardMaps.get(deck.id) ?? new Map();
    for (const [cardId, qty] of cardMap) {
      appearances.set(cardId, (appearances.get(cardId) ?? 0) + 1);
      totalQty.set(cardId, (totalQty.get(cardId) ?? 0) + qty);
    }
  }

  const clusterSize = cluster.length;

  type Classified = {
    cardId: string;
    frequency: number;
    quantity: number;
    tier: ScaffoldTier;
  };

  const classified: Classified[] = [];
  for (const [cardId, count] of appearances) {
    const frequency = count / clusterSize;
    const tier = classifyTier(frequency);
    if (!tier) continue;
    const avgQty = totalQty.get(cardId)! / count;
    classified.push({
      cardId,
      frequency,
      quantity: Math.min(4, Math.round(avgQty)),
      tier
    });
  }

  // Hydrate from SQLite in a single batch query
  const uniqueIds = classified.map((c) => c.cardId);
  const placeholders = uniqueIds.map(() => '?').join(',');
  const cardRows = ctx.services.db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE id IN (${placeholders})`,
    ...uniqueIds
  );
  const cardMap = new Map(cardRows.map((r) => [r.id, r]));

  const grouped: Record<ScaffoldTier, ScaffoldCard[]> = {
    core: [],
    engine: [],
    consistency: [],
    tech: []
  };

  for (const c of classified) {
    const row = cardMap.get(c.cardId);
    if (!row) continue;
    const setRow = ctx.services.db.findSetById(row.set_id) as SetRow | null;
    const card = setRow
      ? transformCardRowWithSet(row, setRow)
      : transformCardRow(row);

    grouped[c.tier].push({
      card: {
        id: card.id,
        name: card.name,
        supertype: card.supertype,
        subtypes: card.subtypes,
        number: card.number,
        regulationMark: card.regulationMark,
        images: card.images as { small: string; large: string } | undefined,
        set: { id: card.set?.id ?? row.set_id, name: card.set?.name ?? '', ptcgoCode: card.set?.ptcgoCode },
        tcgplayer: card.tcgplayer
      },
      quantity: c.quantity,
      frequency: Math.round(c.frequency * 1000) / 1000,
      tier: c.tier
    });
  }

  // Sort each tier: frequency descending, then alphabetical
  for (const tier of Object.values(grouped)) {
    tier.sort((a, b) => b.frequency - a.frequency || a.card.name.localeCompare(b.card.name));
  }

  const totalCards = Object.values(grouped)
    .flat()
    .reduce((sum, c) => sum + c.quantity, 0);

  const result: ScaffoldDeck = {
    archetype: (cluster[0] as MetaDeckRow)?.archetype ?? archetype,
    variant: variant ?? 'default',
    format,
    clusterSize,
    totalCards,
    flexSlots: Math.max(0, 60 - totalCards),
    ...grouped
  };

  return ctx.json({ data: result });
};
