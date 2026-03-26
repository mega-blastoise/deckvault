import { APIModel, getBaseAPIURL } from './APIModel';

export interface AdminStats {
  userCount: number;
  deckCount: number;
  collectionEntries: number;
  metaDeckCount: number;
  reportCount: number;
  signupsToday: number;
  signupsWeek: number;
  signupTrend: { date: string; count: number }[];
  topUsers: AdminUser[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  deck_count: number;
  collection_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminUserDetail extends AdminUser {
  decks: { id: string; name: string; format: string; created_at: string; updated_at: string }[];
}

export interface ActivityEvent {
  type: string;
  description: string;
  actor_name: string | null;
  actor_email: string | null;
  entity_id: string;
  created_at: string;
}

export interface MetaDeckAdmin {
  id: string;
  name: string;
  archetype: string;
  format: string;
  tier: string | null;
  event_name: string | null;
  event_date: string | null;
  card_count: number;
  created_at: string;
}

export interface LgsReportAdmin {
  id: string;
  user_id: string;
  reporter_name: string;
  archetype: string;
  archetype_name: string;
  format: string;
  lgs_name: string | null;
  region: string | null;
  result: string | null;
  reported_at: string;
}

export interface SystemHealth {
  tables: { name: string; row_count: number }[];
  migrations: { name: string; applied_at: string }[];
  uptime: number;
  pgVersion: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class AdminService extends APIModel {
  constructor() {
    const baseURL = getBaseAPIURL();
    super({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  protected override async request<T>(
    method: string,
    path: string,
    body?: unknown,
    config?: Parameters<APIModel['request']>[3]
  ) {
    return super.request<T>(method, path, body, {
      ...config,
      headers: { ...config?.headers, credentials: 'include' }
    });
  }

  // Override fetchWithTimeout to include credentials
  protected override async fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
    return super.fetchWithTimeout(url, { ...options, credentials: 'include' }, timeout);
  }

  getStats() {
    return this.get<{ data: AdminStats }>('/admin/stats');
  }

  getActivity(limit = 50) {
    return this.get<{ data: ActivityEvent[] }>('/admin/activity', { params: { limit } });
  }

  getUsers(opts: { page?: number; limit?: number; q?: string; sort?: string } = {}) {
    return this.get<{ data: AdminUser[]; total: number; page: number; limit: number }>(
      '/admin/users',
      { params: { page: opts.page ?? 1, limit: opts.limit ?? 20, ...(opts.q ? { q: opts.q } : {}), ...(opts.sort ? { sort: opts.sort } : {}) } }
    );
  }

  getUser(id: string) {
    return this.get<{ data: AdminUserDetail }>(`/admin/users/${id}`);
  }

  setUserRole(id: string, role: string) {
    return this.put<{ data: AdminUser }>(`/admin/users/${id}/role`, { role });
  }

  deleteUser(id: string) {
    return this.delete<{ ok: boolean }>(`/admin/users/${id}`);
  }

  getMetaDecks(opts: { page?: number; limit?: number; q?: string; format?: string } = {}) {
    return this.get<{ data: MetaDeckAdmin[]; total: number }>(
      '/admin/content/meta-decks',
      { params: { page: opts.page ?? 1, limit: opts.limit ?? 20, ...(opts.q ? { q: opts.q } : {}), ...(opts.format ? { format: opts.format } : {}) } }
    );
  }

  deleteMetaDeck(id: string) {
    return this.delete<{ ok: boolean }>(`/admin/content/meta-decks/${id}`);
  }

  getReports(opts: { page?: number; limit?: number; format?: string } = {}) {
    return this.get<{ data: LgsReportAdmin[]; total: number }>(
      '/admin/content/reports',
      { params: { page: opts.page ?? 1, limit: opts.limit ?? 20, ...(opts.format ? { format: opts.format } : {}) } }
    );
  }

  deleteReport(id: string) {
    return this.delete<{ ok: boolean }>(`/admin/content/reports/${id}`);
  }

  getSystem() {
    return this.get<{ data: SystemHealth }>('/admin/system');
  }

  getAnnouncements() {
    return this.get<{ data: Announcement[] }>('/admin/announcements');
  }

  createAnnouncement(input: { title: string; body: string; type: string; isActive: boolean; startsAt: string; endsAt: string | null }) {
    return this.post<{ data: Announcement }>('/admin/announcements', input);
  }

  updateAnnouncement(id: string, input: Partial<{ title: string; body: string; type: string; isActive: boolean; startsAt: string; endsAt: string | null }>) {
    return this.put<{ data: Announcement }>(`/admin/announcements/${id}`, input);
  }

  deleteAnnouncement(id: string) {
    return this.delete<{ ok: boolean }>(`/admin/announcements/${id}`);
  }

  getActiveAnnouncements() {
    return this.get<{ data: Announcement[] }>('/announcements/active');
  }

  getFlags() {
    return this.get<{ data: FeatureFlag[] }>('/admin/flags');
  }

  toggleFlag(id: string, enabled: boolean) {
    return this.put<{ data: FeatureFlag }>(`/admin/flags/${id}`, { enabled });
  }

  createFlag(input: { key: string; description: string; enabled: boolean }) {
    return this.post<{ data: FeatureFlag }>('/admin/flags', input);
  }

  deleteFlag(id: string) {
    return this.delete<{ ok: boolean }>(`/admin/flags/${id}`);
  }
}
