import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import { requireUser, getUser } from '../middleware/auth';
import { transformCardRowWithSet, transformCardRow } from '../utils/transforms';
import type { DeckRow, DeckCardRow } from '../services/postgres';
import type { DatabaseService } from '../services/database';

interface DeckCardInput {
  card: {
    name: string;
    id: string;
    supertype: string;
    subtype?: string;
    subtypes?: string[];
    number?: string;
    regulationMark?: string;
    images?: { small?: string; large?: string };
    set: { id: string; name: string };
  };
  quantity: number;
}

interface CreateDeckBody {
  name?: unknown;
  description?: unknown;
  format?: unknown;
  cards?: unknown;
  coverCardId?: unknown;
  versionLabel?: unknown;
}

function hydrateCards(db: DatabaseService, deckCards: DeckCardRow[]) {
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

function formatDeck(row: DeckRow, hydratedCards: ReturnType<typeof hydrateCards>) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    format: row.format,
    coverCardId: row.cover_card_id ?? undefined,
    isPublic: row.is_public,
    cards: hydratedCards,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * GET /api/v1/decks
 */
export const listDecks: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const db = ctx.services.db;
  const deckRows = await pg.listUserDecks(user.id);

  const decks = await Promise.all(
    deckRows.map(async (row) => {
      const cards = await pg.getDeckCards(row.id);
      return formatDeck(row, hydrateCards(db, cards));
    })
  );

  return ctx.json({ data: decks });
};

/**
 * GET /api/v1/decks/browse
 */
export const browseDecks: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const page = ctx.query.getNumber('page', 1);
  const limit = Math.min(ctx.query.getNumber('limit', 20), 100);
  const format = ctx.query.get('format');
  const q = ctx.query.get('q');

  const result = await pg.browseDecks({ page, limit, format, q });

  return ctx.json({
    data: result.data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      format: row.format,
      coverCardId: row.cover_card_id ?? undefined,
      cardCount: Number(row.card_count),
      updatedAt: row.updated_at,
      owner: {
        name: row.owner_name,
        avatarUrl: row.owner_avatar_url
      }
    })),
    pagination: {
      page,
      limit,
      total: result.total
    }
  });
};

/**
 * GET /api/v1/decks/:id
 */
export const getDeck: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const db = ctx.services.db;
  const row = await pg.getDeck(ctx.params.id);

  if (!row) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }

  const user = getUser(ctx);
  if (!row.is_public && (!user || user.id !== row.user_id)) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }

  const cards = await pg.getDeckCards(row.id);
  return ctx.json({ data: formatDeck(row, hydrateCards(db, cards)) });
};

/**
 * POST /api/v1/decks
 */
export const createDeck: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const db = ctx.services.db;

  let body: CreateDeckBody;
  try {
    body = (await ctx.request.json()) as CreateDeckBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  if (!body.name || typeof body.name !== 'string') {
    return ctx.badRequest('name is required and must be a string');
  }
  if (body.name.length > 120) {
    return ctx.badRequest('name must be 120 characters or fewer');
  }
  if (typeof body.description === 'string' && body.description.length > 500) {
    return ctx.badRequest('description must be 500 characters or fewer');
  }

  const row = await pg.createDeck({
    userId: user.id,
    name: body.name,
    description: typeof body.description === 'string' ? body.description : undefined,
    format: typeof body.format === 'string' ? body.format : 'standard',
    coverCardId: typeof body.coverCardId === 'string' ? body.coverCardId : undefined
  });

  if (Array.isArray(body.cards)) {
    const cardInputs = body.cards as DeckCardInput[];
    const dbCards = cardInputs.map((c) => ({
      cardId: c.card.id,
      quantity: c.quantity
    }));
    await pg.setDeckCards(row.id, dbCards);
  }

  const cards = await pg.getDeckCards(row.id);
  return ctx.json({ data: formatDeck(row, hydrateCards(db, cards)) }, 201);
};

/**
 * PUT /api/v1/decks/:id
 */
export const updateDeck: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const db = ctx.services.db;
  const existing = await pg.getDeck(ctx.params.id);

  if (!existing) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }
  if (existing.user_id !== user.id) {
    return ctx.error('Forbidden', 403);
  }

  let body: CreateDeckBody;
  try {
    body = (await ctx.request.json()) as CreateDeckBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  const updated = await pg.updateDeck(ctx.params.id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    format: typeof body.format === 'string' ? body.format : undefined,
    coverCardId: typeof body.coverCardId === 'string' ? body.coverCardId : undefined
  });

  if (Array.isArray(body.cards)) {
    const cardInputs = body.cards as DeckCardInput[];
    const dbCards = cardInputs.map((c) => ({
      cardId: c.card.id,
      quantity: c.quantity
    }));
    await pg.setDeckCards(ctx.params.id, dbCards);
  }

  const cards = await pg.getDeckCards(ctx.params.id);

  // Fire-and-forget version snapshot — does not block response
  const snapshotCards = cards.map((c) => ({ cardId: c.card_id, quantity: c.quantity }));
  const snapshotLabel = typeof body.versionLabel === 'string' ? body.versionLabel : undefined;
  pg.createVersionSnapshot(ctx.params.id, snapshotCards, snapshotLabel).catch(console.error);

  return ctx.json({ data: formatDeck(updated!, hydrateCards(db, cards)) });
};

/**
 * DELETE /api/v1/decks/:id
 */
export const deleteDeck: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const existing = await pg.getDeck(ctx.params.id);

  if (!existing) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }
  if (existing.user_id !== user.id) {
    return ctx.error('Forbidden', 403);
  }

  await pg.deleteDeck(ctx.params.id);
  return ctx.empty(204);
};
