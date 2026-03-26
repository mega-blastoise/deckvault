import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import {
  parsePaginationParams,
  createPaginationMeta,
  createPaginationLinks
} from '../utils/pagination';
import { transformCardRow, transformCardRowWithSet } from '../utils/transforms';
import type { CardRow, SetRow } from '../types';
import { TAG_PATTERNS, VALID_TAGS } from '../utils/card-tag-patterns';
import type { CardFunctionalTag } from '../utils/card-tag-patterns';

export const getCards: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const pagination = parsePaginationParams(ctx.query.raw);

  const total =
    db.queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM pokemon_cards'
    )?.total ?? 0;

  const rows = db.findAllCards(
    pagination.limit,
    pagination.offset
  ) as CardRow[];
  const cards = rows.map(transformCardRow);

  return ctx.json({
    data: cards,
    meta: createPaginationMeta(pagination, cards.length, total),
    links: createPaginationLinks('/api/v1/cards', pagination, total)
  });
};

export const getCardById: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const cardRow = db.findCardById(ctx.params.id) as CardRow | null;

  if (!cardRow) {
    return ctx.notFound(`Card '${ctx.params.id}' not found`);
  }

  const setRow = db.findSetById(cardRow.set_id) as SetRow | null;
  const card = setRow
    ? transformCardRowWithSet(cardRow, setRow)
    : transformCardRow(cardRow);

  return ctx.json({ data: card });
};

export const getCardsBatch: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const idsParam = ctx.query.get('ids');

  if (!idsParam) {
    return ctx.badRequest('Missing required query parameter: ids');
  }

  const ids = idsParam.split(',').filter(Boolean);

  if (ids.length === 0) {
    return ctx.badRequest('No valid IDs provided');
  }

  if (ids.length > 100) {
    return ctx.badRequest('Maximum 100 IDs per batch request');
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE id IN (${placeholders})`,
    ...ids
  );

  const cards = rows.map((row) => {
    const setRow = db.findSetById(row.set_id) as SetRow | null;
    return setRow
      ? transformCardRowWithSet(row, setRow)
      : transformCardRow(row);
  });

  return ctx.json({ data: cards });
};

export const searchCards: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const pagination = parsePaginationParams(ctx.query.raw);

  const name = ctx.query.get('name');
  const type = ctx.query.get('type');
  const rarity = ctx.query.get('rarity');
  const setId = ctx.query.get('set');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (name) {
    conditions.push('name LIKE ?');
    values.push(`%${name}%`);
  }
  if (type) {
    conditions.push('types LIKE ?');
    values.push(`%"${type}"%`);
  }
  if (rarity) {
    conditions.push('rarity = ?');
    values.push(rarity);
  }
  if (setId) {
    conditions.push('set_id = ?');
    values.push(setId);
  }

  if (conditions.length === 0) {
    return ctx.badRequest(
      'At least one search parameter is required (name, type, rarity, set)'
    );
  }

  const where = conditions.join(' AND ');

  const total =
    db.queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM pokemon_cards WHERE ${where}`,
      ...values
    )?.total ?? 0;

  const rows = db.query<CardRow>(
    `SELECT * FROM pokemon_cards WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
    ...values,
    pagination.limit,
    pagination.offset
  );

  const cards = rows.map(transformCardRow);

  const searchBase = new URL('/api/v1/cards/search', 'http://localhost');
  if (name) searchBase.searchParams.set('name', name);
  if (type) searchBase.searchParams.set('type', type);
  if (rarity) searchBase.searchParams.set('rarity', rarity);
  if (setId) searchBase.searchParams.set('set', setId);

  return ctx.json({
    data: cards,
    meta: createPaginationMeta(pagination, cards.length, total),
    links: createPaginationLinks(
      searchBase.pathname + '?' + searchBase.searchParams.toString(),
      pagination,
      total
    )
  });
};

export const getCardsByUseCase: Handler<Services> = async (ctx) => {
  const tagsParam = ctx.query.get('tags') ?? '';
  const rawTags = tagsParam
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (rawTags.length === 0) {
    return ctx.badRequest(
      `At least one tag is required. Valid tags: ${[...VALID_TAGS].join(', ')}`
    );
  }

  const invalidTags = rawTags.filter((t) => !VALID_TAGS.has(t as CardFunctionalTag));
  if (invalidTags.length > 0) {
    return ctx.badRequest(
      `Invalid tag(s): ${invalidTags.join(', ')}. Valid tags: ${[...VALID_TAGS].join(', ')}`
    );
  }

  const tags = rawTags as CardFunctionalTag[];
  const limit = Math.min(100, Math.max(1, Number(ctx.query.get('limit') ?? '60')));

  const patterns = tags.flatMap((tag) => TAG_PATTERNS[tag] ?? []);
  const cardRows = ctx.services.db.findCardsByTags(patterns, limit) as CardRow[];

  if (cardRows.length === 0) {
    return ctx.json({ data: [], tags });
  }

  const cardIds = cardRows.map((r) => r.id);
  const usageMap = await ctx.services.pg.getMetaUsageCounts(cardIds);

  const db = ctx.services.db;
  const cards = cardRows
    .map((row) => {
      const setRow = db.findSetById(row.set_id) as SetRow | null;
      const card = setRow
        ? transformCardRowWithSet(row, setRow)
        : transformCardRow(row);
      return { ...card, metaUsageCount: usageMap.get(row.id) ?? 0 };
    })
    .sort(
      (a, b) =>
        (b.metaUsageCount ?? 0) - (a.metaUsageCount ?? 0) ||
        a.name.localeCompare(b.name)
    );

  return ctx.json({ data: cards, tags });
};
