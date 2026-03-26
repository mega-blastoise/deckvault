import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import { requireUser } from '../middleware/auth';

// ─── Stats & Overview ────────────────────────────────────

export const getAdminStats: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const stats = await pg.getAdminStats();
  const trend = await pg.getSignupTrend(30);
  const topUsers = await pg.getTopUsers(5);
  return ctx.json({ data: { ...stats, signupTrend: trend, topUsers } });
};

export const getAdminActivity: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '50', 10), 100);
  const activity = await pg.getRecentActivity(limit);
  return ctx.json({ data: activity });
};

// ─── Users ───────────────────────────────────────────────

export const listUsersAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const page = parseInt(ctx.query.get('page') ?? '1', 10);
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '20', 10), 100);
  const q = ctx.query.get('q') ?? undefined;
  const sort = ctx.query.get('sort') ?? undefined;
  const result = await pg.listUsersAdmin({ page, limit, q, sort });
  return ctx.json({ data: result.data, total: result.total, page, limit });
};

export const getUserAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing user id');
  const user = await pg.getUserAdmin(id);
  if (!user) return ctx.notFound('User not found');

  const decks = await pg.listUserDecks(id);
  return ctx.json({ data: { ...user, decks } });
};

export const setUserRole: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing user id');

  let body: unknown;
  try { body = await ctx.request.json(); } catch { return ctx.badRequest('Invalid JSON'); }

  const { role } = body as Record<string, unknown>;
  if (role !== 'user' && role !== 'admin') {
    return ctx.badRequest('Role must be "user" or "admin"');
  }

  const currentUser = requireUser(ctx);
  if (currentUser.id === id && role !== 'admin') {
    return ctx.badRequest('Cannot remove your own admin role');
  }

  const updated = await pg.setUserRole(id, role);
  if (!updated) return ctx.notFound('User not found');
  return ctx.json({ data: updated });
};

export const deleteUserAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing user id');

  const currentUser = requireUser(ctx);
  if (currentUser.id === id) {
    return ctx.badRequest('Cannot delete your own account from admin panel');
  }

  const deleted = await pg.deleteUser(id);
  if (!deleted) return ctx.notFound('User not found');
  return ctx.json({ ok: true });
};

// ─── Content ─────────────────────────────────────────────

export const listMetaDecksAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const page = parseInt(ctx.query.get('page') ?? '1', 10);
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '20', 10), 100);
  const format = ctx.query.get('format') ?? undefined;
  const archetype = ctx.query.get('q') ?? undefined;
  const result = await pg.getMetaDecks({ page, limit, format, archetype });
  return ctx.json({ data: result.data, total: result.total, page, limit });
};

export const deleteMetaDeckAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing meta deck id');
  const deleted = await pg.deleteMetaDeckAdmin(id);
  if (!deleted) return ctx.notFound('Meta deck not found');
  return ctx.json({ ok: true });
};

export const listReportsAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const page = parseInt(ctx.query.get('page') ?? '1', 10);
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '20', 10), 100);
  const format = ctx.query.get('format') ?? undefined;
  const result = await pg.listReportsAdmin({ page, limit, format });
  return ctx.json({ data: result.data, total: result.total, page, limit });
};

export const deleteReportAdmin: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing report id');
  const deleted = await pg.deleteReport(id);
  if (!deleted) return ctx.notFound('Report not found');
  return ctx.json({ ok: true });
};

// ─── System ──────────────────────────────────────────────

export const getSystemHealth: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const health = await pg.getSystemHealth();
  return ctx.json({ data: health });
};

// ─── Announcements ───────────────────────────────────────

export const listAnnouncements: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const announcements = await pg.listAnnouncements();
  return ctx.json({ data: announcements });
};

export const createAnnouncement: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const user = requireUser(ctx);

  let body: unknown;
  try { body = await ctx.request.json(); } catch { return ctx.badRequest('Invalid JSON'); }

  const { title, body: announcementBody, type, isActive, startsAt, endsAt } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) return ctx.badRequest('Title is required');
  if (typeof announcementBody !== 'string' || !announcementBody.trim()) return ctx.badRequest('Body is required');

  const announcement = await pg.createAnnouncement({
    title: title.trim(),
    body: (announcementBody as string).trim(),
    type: typeof type === 'string' ? type : 'info',
    isActive: typeof isActive === 'boolean' ? isActive : true,
    startsAt: typeof startsAt === 'string' ? startsAt : new Date().toISOString(),
    endsAt: typeof endsAt === 'string' ? endsAt : null,
    createdBy: user.id
  });
  return ctx.json({ data: announcement }, 201);
};

export const updateAnnouncement: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing announcement id');

  let body: unknown;
  try { body = await ctx.request.json(); } catch { return ctx.badRequest('Invalid JSON'); }

  const { title, body: announcementBody, type, isActive, startsAt, endsAt } = body as Record<string, unknown>;

  const updated = await pg.updateAnnouncement(id, {
    title: typeof title === 'string' ? title.trim() : undefined,
    body: typeof announcementBody === 'string' ? announcementBody.trim() : undefined,
    type: typeof type === 'string' ? type : undefined,
    isActive: typeof isActive === 'boolean' ? isActive : undefined,
    startsAt: typeof startsAt === 'string' ? startsAt : undefined,
    endsAt: endsAt === null ? null : typeof endsAt === 'string' ? endsAt : undefined
  });

  if (!updated) return ctx.notFound('Announcement not found');
  return ctx.json({ data: updated });
};

export const deleteAnnouncement: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing announcement id');
  const deleted = await pg.deleteAnnouncement(id);
  if (!deleted) return ctx.notFound('Announcement not found');
  return ctx.json({ ok: true });
};

export const getActiveAnnouncements: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const announcements = await pg.getActiveAnnouncements();
  return ctx.json({ data: announcements });
};

// ─── Feature Flags ───────────────────────────────────────

export const listFlags: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const flags = await pg.listFeatureFlags();
  return ctx.json({ data: flags });
};

export const toggleFlag: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing flag id');

  let body: unknown;
  try { body = await ctx.request.json(); } catch { return ctx.badRequest('Invalid JSON'); }

  const { enabled } = body as Record<string, unknown>;
  if (typeof enabled !== 'boolean') return ctx.badRequest('enabled must be a boolean');

  const updated = await pg.toggleFeatureFlag(id, enabled);
  if (!updated) return ctx.notFound('Flag not found');
  return ctx.json({ data: updated });
};

export const createFlag: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;

  let body: unknown;
  try { body = await ctx.request.json(); } catch { return ctx.badRequest('Invalid JSON'); }

  const { key, description, enabled } = body as Record<string, unknown>;
  if (typeof key !== 'string' || !key.trim()) return ctx.badRequest('Key is required');

  const flag = await pg.createFeatureFlag({
    key: key.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    enabled: typeof enabled === 'boolean' ? enabled : false
  });
  return ctx.json({ data: flag }, 201);
};

export const deleteFlag: Handler<Services> = async (ctx) => {
  const pg = ctx.services.pg;
  const id = ctx.params.id;
  if (!id) return ctx.badRequest('Missing flag id');
  const deleted = await pg.deleteFeatureFlag(id);
  if (!deleted) return ctx.notFound('Flag not found');
  return ctx.json({ ok: true });
};
