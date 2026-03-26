import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import { requireUser } from '../middleware/auth';

interface CpEntryBody {
  eventName?: unknown;
  eventDate?: unknown;
  placement?: unknown;
  cpEarned?: unknown;
  format?: unknown;
  notes?: unknown;
}

const VALID_FORMATS = ['standard', 'expanded', 'unlimited'] as const;

export const listCpEntries: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const url = new URL(ctx.request.url);
  const season = url.searchParams.get('season') ?? undefined;

  const entries = await pg.listCpEntries(user.id, season);
  const totalCp = entries.reduce((sum, e) => sum + Number(e.cp_earned), 0);

  const currentYear = new Date().getFullYear();
  const seasonLabel = season ?? String(currentYear);

  return ctx.json({ entries, totalCp, season: seasonLabel });
};

export const createCpEntry: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;

  let body: CpEntryBody;
  try {
    body = (await ctx.request.json()) as CpEntryBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  if (!body.eventName || typeof body.eventName !== 'string' || body.eventName.length > 200) {
    return ctx.badRequest('eventName is required and must be 200 characters or fewer');
  }
  if (!body.eventDate || typeof body.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate)) {
    return ctx.badRequest('eventDate is required and must be YYYY-MM-DD');
  }
  if (
    body.cpEarned === undefined ||
    typeof body.cpEarned !== 'number' ||
    !Number.isInteger(body.cpEarned) ||
    body.cpEarned < 0 ||
    body.cpEarned > 500
  ) {
    return ctx.badRequest('cpEarned is required and must be an integer 0–500');
  }
  if (!body.format || !VALID_FORMATS.includes(body.format as (typeof VALID_FORMATS)[number])) {
    return ctx.badRequest('format must be "standard", "expanded", or "unlimited"');
  }
  if (body.placement !== undefined && (typeof body.placement !== 'string' || body.placement.length > 20)) {
    return ctx.badRequest('placement must be a string of 20 characters or fewer');
  }
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
    return ctx.badRequest('notes must be a string of 2000 characters or fewer');
  }

  const entry = await pg.createCpEntry({
    userId: user.id,
    eventName: body.eventName,
    eventDate: body.eventDate,
    placement: typeof body.placement === 'string' ? body.placement : undefined,
    cpEarned: body.cpEarned,
    format: body.format as string,
    notes: typeof body.notes === 'string' ? body.notes : undefined
  });

  return ctx.json(entry, 201);
};

export const deleteCpEntry: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;
  const { id } = ctx.params;

  const deleted = await pg.deleteCpEntry(id, user.id);
  if (!deleted) return ctx.notFound(`CP entry '${id}' not found`);

  return ctx.json({ ok: true });
};
