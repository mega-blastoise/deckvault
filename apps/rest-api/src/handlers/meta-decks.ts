import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import { getUser } from '../middleware/auth';
import { transformCardRowWithSet, transformCardRow } from '../utils/transforms';
import type { DatabaseService } from '../services/database';
import type { MetaDeckCardRow, MetaDeckRow } from '../services/postgres';

function hydrateMetaCards(db: DatabaseService, deckCards: MetaDeckCardRow[]) {
  if (deckCards.length === 0) return [];

  const cardIds = deckCards.map((c) => c.card_id);
  const placeholders = cardIds.map(() => '?').join(',');
  const rows = db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE id IN (${placeholders})`,
    ...cardIds
  );

  const cardMap = new Map<string, CardRow>();
  for (const row of rows) {
    cardMap.set(row.id, row);
  }

  return deckCards.map((dc) => {
    const cardRow = cardMap.get(dc.card_id);
    if (!cardRow) {
      return {
        card: { id: dc.card_id, name: dc.card_id, supertype: '', set: { id: '', name: '' } },
        quantity: dc.quantity
      };
    }

    const setRow = db.findSetById(cardRow.set_id) as SetRow | null;
    const card = setRow
      ? transformCardRowWithSet(cardRow, setRow)
      : transformCardRow(cardRow);

    return {
      card: {
        id: card.id,
        name: card.name,
        supertype: card.supertype,
        subtypes: card.subtypes,
        number: card.number,
        regulationMark: card.regulationMark,
        images: card.images,
        set: card.set ?? { id: cardRow.set_id, name: '' }
      },
      quantity: dc.quantity
    };
  });
}

function formatMetaDeckSummary(row: MetaDeckRow) {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype,
    format: row.format,
    tier: row.tier ?? null,
    placement: row.placement,
    eventName: row.event_name,
    eventDate: row.event_date,
    lastUpdated: row.last_updated,
    cardCount: Number(row.card_count)
  };
}

export const listMetaDecks: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const db = ctx.services.db;
  const url = new URL(ctx.request.url);

  const format = url.searchParams.get('format') ?? 'all';
  const archetype = url.searchParams.get('archetype') ?? '';
  const collectionOnly = url.searchParams.get('collectionOnly') === 'true';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));

  const { data: rows, total } = await pg.getMetaDecks({
    format: format !== 'all' ? format : undefined,
    archetype: archetype || undefined,
    page,
    limit
  });

  const user = getUser(ctx);

  // Collection-aware enrichment — only when authenticated
  if (user) {
    const collection = await pg.getUserCollection(user.id);
    const ownedMap = new Map<string, number>();
    for (const c of collection) {
      ownedMap.set(c.card_id, c.quantity);
    }

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const metaCards = await pg.getMetaDeckCards(row.id);
        const hydratedCards = hydrateMetaCards(db, metaCards);

        let ownedCardCount = 0;
        const missingCards: { cardId: string; name: string; quantity: number }[] = [];

        for (const { card, quantity } of hydratedCards) {
          const owned = ownedMap.get(card.id) ?? 0;
          const effective = Math.min(owned, quantity);
          ownedCardCount += effective;
          if (owned < quantity) {
            missingCards.push({
              cardId: card.id,
              name: card.name,
              quantity: quantity - owned
            });
          }
        }

        const totalCards = metaCards.reduce((s, c) => s + c.quantity, 0);
        const buildable = missingCards.length === 0;

        return {
          ...formatMetaDeckSummary(row),
          ownedCardCount,
          missingCards,
          buildable,
          totalCards
        };
      })
    );

    const filtered = collectionOnly ? enriched.filter((d) => d.buildable) : enriched;

    return ctx.json({
      decks: filtered,
      total: collectionOnly ? filtered.length : total,
      page,
      limit
    });
  }

  return ctx.json({
    decks: rows.map(formatMetaDeckSummary),
    total,
    page,
    limit
  });
};

export const getMetaDeck: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const db = ctx.services.db;
  const { id } = ctx.params;

  const row = await pg.getMetaDeck(id);
  if (!row) return ctx.notFound(`Meta deck '${id}' not found`);

  const metaCards = await pg.getMetaDeckCards(id);
  const hydratedCards = hydrateMetaCards(db, metaCards);

  return ctx.json({
    ...formatMetaDeckSummary(row),
    cards: hydratedCards
  });
};
