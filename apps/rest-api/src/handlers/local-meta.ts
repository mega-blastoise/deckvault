import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import { requireUser } from '../middleware/auth';

interface ReportBody {
  archetype?: unknown;
  archetypeName?: unknown;
  format?: unknown;
  lgsName?: unknown;
  region?: unknown;
  result?: unknown;
}

export const createReport: Handler<Services> = async (ctx) => {
  const user = requireUser(ctx);
  const pg = ctx.services.pg;

  let body: ReportBody;
  try {
    body = (await ctx.request.json()) as ReportBody;
  } catch {
    return ctx.badRequest('Invalid JSON body');
  }

  if (!body.archetype || typeof body.archetype !== 'string' || body.archetype.length > 120) {
    return ctx.badRequest('archetype is required and must be 120 characters or fewer');
  }
  if (!body.archetypeName || typeof body.archetypeName !== 'string' || body.archetypeName.length > 120) {
    return ctx.badRequest('archetypeName is required and must be 120 characters or fewer');
  }
  if (body.format !== 'standard' && body.format !== 'expanded') {
    return ctx.badRequest('format must be "standard" or "expanded"');
  }
  if (typeof body.result === 'string' && !['win', 'loss', 'tie'].includes(body.result)) {
    return ctx.badRequest('result must be "win", "loss", or "tie"');
  }
  if (typeof body.lgsName === 'string' && body.lgsName.length > 200) {
    return ctx.badRequest('lgsName must be 200 characters or fewer');
  }
  if (typeof body.region === 'string' && body.region.length > 100) {
    return ctx.badRequest('region must be 100 characters or fewer');
  }

  const withinLimit = await pg.checkLgsRateLimit(user.id);
  if (!withinLimit) {
    return ctx.error('Rate limit exceeded: max 10 reports per day', 429);
  }

  const report = await pg.createLgsReport({
    userId: user.id,
    archetype: body.archetype,
    archetypeName: body.archetypeName,
    format: body.format,
    lgsName: typeof body.lgsName === 'string' ? body.lgsName : undefined,
    region: typeof body.region === 'string' ? body.region : undefined,
    result: typeof body.result === 'string' ? body.result : undefined
  });

  return ctx.json({ data: { id: report.id, archetype: report.archetype, reportedAt: report.reported_at } }, 201);
};

export const getFrequency: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const format = ctx.query.get('format') ?? undefined;
  const days = Math.min(ctx.query.getNumber('days', 30), 90);
  const limit = Math.min(ctx.query.getNumber('limit', 20), 100);

  const archetypes = await pg.getLgsFrequency({ format, days, limit });

  const total = archetypes.reduce((s, a) => s + a.reportCount, 0);

  return ctx.json({
    archetypes,
    generatedAt: new Date().toISOString(),
    dayRange: days,
    totalReports: total
  });
};
