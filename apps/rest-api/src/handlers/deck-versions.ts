import type { Handler } from '@pokemon/framework';
import type { Services, CardRow, SetRow } from '../types';
import { requireUser } from '../middleware/auth';
import { transformCardRowWithSet, transformCardRow } from '../utils/transforms';
import type { DatabaseService } from '../services/database';

interface VersionCardEntry {
  cardId: string;
  quantity: number;
}

function hydrateVersionCards(
  db: DatabaseService,
  cards: VersionCardEntry[]
) {
  if (cards.length === 0) return [];
  const cardIds = cards.map((c) => c.cardId);
  const placeholders = cardIds.map(() => '?').join(',');
  const rows = db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE id IN (${placeholders})`,
    ...cardIds
  );
  const cardMap = new Map<string, CardRow>();
  for (const row of rows) cardMap.set(row.id, row);

  return cards.map((entry) => {
    const cardRow = cardMap.get(entry.cardId);
    if (!cardRow) {
      return {
        card: { id: entry.cardId, name: entry.cardId, supertype: '', set: { id: '', name: '' } },
        quantity: entry.quantity
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
      quantity: entry.quantity
    };
  });
}

function computeDiff(
  cardsA: VersionCardEntry[],
  cardsB: VersionCardEntry[]
) {
  const mapA = new Map(cardsA.map((c) => [c.cardId, c.quantity]));
  const mapB = new Map(cardsB.map((c) => [c.cardId, c.quantity]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const added: { cardId: string; quantity: number; deltaQuantity: number }[] = [];
  const removed: { cardId: string; quantity: number; deltaQuantity: number }[] = [];
  const unchanged: { cardId: string; quantity: number }[] = [];

  for (const id of allIds) {
    const qA = mapA.get(id) ?? 0;
    const qB = mapB.get(id) ?? 0;
    if (qB > qA) added.push({ cardId: id, quantity: qB, deltaQuantity: qB - qA });
    else if (qB < qA) removed.push({ cardId: id, quantity: qA, deltaQuantity: qA - qB });
    else unchanged.push({ cardId: id, quantity: qA });
  }
  return { added, removed, unchanged };
}

/**
 * GET /api/v1/decks/:id/versions
 */
export const listVersions: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const deck = await pg.getDeck(ctx.params.id);

  if (!deck) return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  if (deck.user_id !== user.id) return ctx.error('Forbidden', 403);

  const page = ctx.query.getNumber('page', 1);
  const limit = Math.min(ctx.query.getNumber('limit', 20), 100);
  const { data, total } = await pg.listDeckVersions(ctx.params.id, page, limit);

  return ctx.json({
    data: {
      versions: data.map((v) => ({
        id: v.id,
        version: v.version,
        label: v.label ?? null,
        createdAt: v.created_at,
        cardCount: (v as unknown as { card_count: number }).card_count ?? 0
      })),
      total,
      page,
      limit
    }
  });
};

/**
 * GET /api/v1/decks/:id/versions/diff?a=:versionIdA&b=:versionIdB
 */
export const diffVersions: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const db = ctx.services.db;

  const deck = await pg.getDeck(ctx.params.id);
  if (!deck) return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  if (deck.user_id !== user.id) return ctx.error('Forbidden', 403);

  const aId = ctx.query.get('a');
  const bId = ctx.query.get('b');
  if (!aId || !bId) return ctx.badRequest('Query params a and b (version IDs) are required');

  const [vA, vB] = await Promise.all([pg.getDeckVersion(aId), pg.getDeckVersion(bId)]);
  if (!vA || vA.deck_id !== ctx.params.id) return ctx.notFound(`Version '${aId}' not found`);
  if (!vB || vB.deck_id !== ctx.params.id) return ctx.notFound(`Version '${bId}' not found`);

  const raw = computeDiff(vA.cards, vB.cards);

  const allEntries = [
    ...raw.added,
    ...raw.removed,
    ...raw.unchanged
  ];
  const hydrated = hydrateVersionCards(db, allEntries.map((e) => ({ cardId: e.cardId, quantity: e.quantity })));
  const hydratedMap = new Map(hydrated.map((h) => [h.card.id, h.card]));

  const summaryA = { id: vA.id, version: vA.version, label: vA.label, createdAt: vA.created_at };
  const summaryB = { id: vB.id, version: vB.version, label: vB.label, createdAt: vB.created_at };

  return ctx.json({
    data: {
      versionA: summaryA,
      versionB: summaryB,
      added: raw.added.map((e) => ({
        card: hydratedMap.get(e.cardId) ?? { id: e.cardId, name: e.cardId, supertype: '', set: { id: '', name: '' } },
        quantity: e.quantity,
        deltaQuantity: e.deltaQuantity
      })),
      removed: raw.removed.map((e) => ({
        card: hydratedMap.get(e.cardId) ?? { id: e.cardId, name: e.cardId, supertype: '', set: { id: '', name: '' } },
        quantity: e.quantity,
        deltaQuantity: e.deltaQuantity
      })),
      unchanged: raw.unchanged.map((e) => ({
        card: hydratedMap.get(e.cardId) ?? { id: e.cardId, name: e.cardId, supertype: '', set: { id: '', name: '' } },
        quantity: e.quantity
      }))
    }
  });
};

/**
 * GET /api/v1/decks/:id/versions/:versionId
 */
export const getVersion: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const db = ctx.services.db;

  const deck = await pg.getDeck(ctx.params.id);
  if (!deck) return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  if (deck.user_id !== user.id) return ctx.error('Forbidden', 403);

  const version = await pg.getDeckVersion(ctx.params.versionId);
  if (!version || version.deck_id !== ctx.params.id) {
    return ctx.notFound(`Version '${ctx.params.versionId}' not found`);
  }

  const hydratedCards = hydrateVersionCards(db, version.cards);

  return ctx.json({
    data: {
      id: version.id,
      version: version.version,
      label: version.label ?? null,
      createdAt: version.created_at,
      cards: hydratedCards
    }
  });
};

/**
 * PUT /api/v1/decks/:id/versions/:versionId/label
 */
export const updateVersionLabel: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;

  const deck = await pg.getDeck(ctx.params.id);
  if (!deck) return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  if (deck.user_id !== user.id) return ctx.error('Forbidden', 403);

  let body: { label?: unknown };
  try {
    body = (await ctx.request.json()) as { label?: unknown };
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }
  if (typeof body.label !== 'string') return ctx.badRequest('label must be a string');

  const updated = await pg.updateVersionLabel(ctx.params.versionId, body.label);
  if (!updated || updated.deck_id !== ctx.params.id) {
    return ctx.notFound(`Version '${ctx.params.versionId}' not found`);
  }

  return ctx.json({
    data: {
      id: updated.id,
      version: updated.version,
      label: updated.label,
      createdAt: updated.created_at
    }
  });
};
