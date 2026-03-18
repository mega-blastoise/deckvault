import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import { requireUser } from '../middleware/auth';

export const getCollection: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const cards = await pg.getUserCollection(user.id);

  return ctx.json({
    data: cards.map((c) => ({
      cardId: c.card_id,
      quantity: c.quantity
    }))
  });
};

export const upsertCollectionCard: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const cardId = ctx.params.cardId;

  let body: { quantity?: unknown };
  try {
    body = (await ctx.request.json()) as { quantity?: unknown };
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  const quantity = typeof body.quantity === 'number' ? body.quantity : 1;
  if (quantity < 1) {
    return ctx.badRequest('Quantity must be at least 1');
  }

  const card = await pg.upsertCollectionCard(user.id, cardId, quantity);
  return ctx.json({
    data: { cardId: card.card_id, quantity: card.quantity }
  });
};

export const removeCollectionCard: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const cardId = ctx.params.cardId;

  const removed = await pg.removeCollectionCard(user.id, cardId);
  if (!removed) {
    return ctx.notFound(`Card '${cardId}' not in collection`);
  }

  return ctx.empty(204);
};
