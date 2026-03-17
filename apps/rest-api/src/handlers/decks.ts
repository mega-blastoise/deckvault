import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import type { Deck, DeckCardShape } from '../services/deckDatabase';

function generateId(): string {
  return `deck-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * GET /api/v1/decks
 * List all decks, sorted by updated_at descending
 */
export const listDecks: Handler<Services> = async (ctx) => {
  const decks = ctx.services.deckDb.listDecks();
  return ctx.json({ data: decks });
};

/**
 * GET /api/v1/decks/:id
 * Get a single deck by ID
 */
export const getDeck: Handler<Services> = async (ctx) => {
  const deck = ctx.services.deckDb.getDeck(ctx.params.id);
  if (!deck) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }
  return ctx.json({ data: deck });
};

interface CreateDeckBody {
  name?: unknown;
  description?: unknown;
  format?: unknown;
  cards?: unknown;
  coverCardId?: unknown;
}

/**
 * POST /api/v1/decks
 * Create a new deck
 */
export const createDeck: Handler<Services> = async (ctx) => {
  let body: CreateDeckBody;
  try {
    body = (await ctx.request.json()) as CreateDeckBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  if (!body.name || typeof body.name !== 'string') {
    return ctx.badRequest('name is required and must be a string');
  }

  const now = new Date().toISOString();
  const deck: Deck = {
    id: generateId(),
    name: body.name,
    description:
      typeof body.description === 'string' ? body.description : undefined,
    format: typeof body.format === 'string' ? body.format : 'standard',
    cards: Array.isArray(body.cards) ? (body.cards as DeckCardShape[]) : [],
    coverCardId:
      typeof body.coverCardId === 'string' ? body.coverCardId : undefined,
    createdAt: now,
    updatedAt: now
  };

  ctx.services.deckDb.createDeck(deck);
  return ctx.json({ data: deck }, 201);
};

/**
 * PUT /api/v1/decks/:id
 * Full replace of mutable deck fields
 */
export const updateDeck: Handler<Services> = async (ctx) => {
  const existing = ctx.services.deckDb.getDeck(ctx.params.id);
  if (!existing) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }

  let body: CreateDeckBody;
  try {
    body = (await ctx.request.json()) as CreateDeckBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  const updated: Deck = {
    ...existing,
    name:
      typeof body.name === 'string' ? body.name : existing.name,
    description:
      typeof body.description === 'string'
        ? body.description
        : existing.description,
    format:
      typeof body.format === 'string' ? body.format : existing.format,
    cards: Array.isArray(body.cards)
      ? (body.cards as DeckCardShape[])
      : existing.cards,
    coverCardId:
      typeof body.coverCardId === 'string'
        ? body.coverCardId
        : existing.coverCardId,
    updatedAt: new Date().toISOString()
  };

  ctx.services.deckDb.updateDeck(updated);
  return ctx.json({ data: updated });
};

/**
 * DELETE /api/v1/decks/:id
 * Delete a deck
 */
export const deleteDeck: Handler<Services> = async (ctx) => {
  const deleted = ctx.services.deckDb.deleteDeck(ctx.params.id);
  if (!deleted) {
    return ctx.notFound(`Deck '${ctx.params.id}' not found`);
  }
  return ctx.empty(204);
};
