import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Service } from '@pokemon/framework';

type BunSQL = InstanceType<typeof Bun.SQL>;

export interface MagicLinkTokenRow {
  id: string;
  user_id: string;
  email: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface UserRow {
  id: string;
  google_id: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdminUserRow extends UserRow {
  deck_count: number;
  collection_count: number;
  report_count: number;
}

export interface AdminStats {
  userCount: number;
  deckCount: number;
  collectionEntries: number;
  metaDeckCount: number;
  reportCount: number;
  signupsToday: number;
  signupsWeek: number;
}

export interface SignupTrendPoint {
  date: string;
  count: number;
}

export interface ActivityEvent {
  type: string;
  description: string;
  actor_name: string | null;
  actor_email: string | null;
  entity_id: string;
  created_at: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  type: string;
  is_active: boolean;
  starts_at: Date;
  ends_at: Date | null;
  created_by: string | null;
  created_at: Date;
}

export interface FeatureFlagRow {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SystemHealth {
  tables: { name: string; row_count: number }[];
  migrations: { name: string; applied_at: string }[];
  uptime: number;
  pgVersion: string;
}

export interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  format: string;
  cover_card_id: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DeckCardRow {
  deck_id: string;
  card_id: string;
  quantity: number;
}

export interface CollectionRow {
  user_id: string;
  card_id: string;
  quantity: number;
}

export interface BrowseDeckRow extends DeckRow {
  owner_name: string;
  owner_avatar_url: string | null;
  card_count: number;
}

export interface DeckVersionRow {
  id: string;
  deck_id: string;
  version: number;
  label: string | null;
  cards: { cardId: string; quantity: number }[];
  created_at: Date;
}

export interface MetaDeckRow {
  id: string;
  name: string;
  archetype: string;
  format: string;
  tier: string | null;
  source_url: string | null;
  placement: string | null;
  event_name: string | null;
  event_date: string | null;
  last_updated: Date;
  created_at: Date;
  card_count: number;
}

export interface CpEntryRow {
  id: string;
  user_id: string;
  event_name: string;
  event_date: string;
  placement: string | null;
  cp_earned: number;
  format: string;
  notes: string | null;
  created_at: Date;
}

export interface MetaDeckCardRow {
  id: string;
  meta_deck_id: string;
  card_id: string;
  quantity: number;
}

export interface LgsReportRow {
  id: string;
  user_id: string;
  archetype: string;
  archetype_name: string;
  format: string;
  lgs_name: string | null;
  region: string | null;
  result: string | null;
  reported_at: Date;
}

export interface ArchetypeFrequency {
  archetype: string;
  archetypeName: string;
  format: string;
  reportCount: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  winRate: number | null;
  lastSeen: string;
}

export class PostgresService implements Service {
  private db: BunSQL | null = null;

  constructor(private readonly url: string) {}

  async start(): Promise<void> {
    this.db = new Bun.SQL(this.url);

    // DDL must use unsafe — tagged templates are for parameterized DML only
    await this.db.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await this.runMigrations();
    console.log('[pg] Connected and migrations applied');
  }

  async stop(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    console.log('[pg] Connection closed');
  }

  private get instance(): BunSQL {
    if (!this.db) throw new Error('PostgreSQL not initialized');
    return this.db;
  }

  private async runMigrations(): Promise<void> {
    const migrationsDir = join(import.meta.dir, '../../migrations');
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql') && f !== '005_migrations_tracking.sql')
        .sort();
    } catch {
      console.warn('[pg] No migrations directory found');
      return;
    }

    for (const file of files) {
      // Migration filenames are internal constants, not user input — unsafe is correct here
      const applied = await this.instance.unsafe(
        `SELECT 1 FROM _migrations WHERE name = $1`,
        [file]
      );
      if (applied.length > 0) continue;

      const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');
      await this.instance.unsafe(sqlContent);
      await this.instance.unsafe(
        `INSERT INTO _migrations (name) VALUES ($1)`,
        [file]
      );
      console.log(`[pg] Applied migration: ${file}`);
    }
  }

  ping(): boolean {
    return this.db !== null;
  }

  // ─── Users ──────────────────────────────────────────────

  async upsertUser(profile: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<UserRow> {
    const rows = await this.instance`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES (${profile.googleId}, ${profile.email}, ${profile.name}, ${profile.avatarUrl})
      ON CONFLICT (google_id) DO UPDATE SET
        email      = EXCLUDED.email,
        name       = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = now()
      RETURNING *
    `;
    return rows[0] as UserRow;
  }

  async getUserById(id: string): Promise<UserRow | null> {
    const rows = await this.instance`SELECT * FROM users WHERE id = ${id}`;
    return (rows[0] as UserRow) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.instance`SELECT * FROM users WHERE email = ${email}`;
    return (rows[0] as UserRow) ?? null;
  }

  async upsertEmailUser(email: string): Promise<UserRow> {
    const name = email.split('@')[0] ?? email;
    const rows = await this.instance`
      INSERT INTO users (email, name)
      VALUES (${email}, ${name})
      ON CONFLICT (email) DO UPDATE SET updated_at = now()
      RETURNING *
    `;
    return rows[0] as UserRow;
  }

  async createMagicLinkToken(email: string, token: string, expiresAt: Date): Promise<void> {
    await this.instance`
      INSERT INTO magic_link_tokens (email, token, expires_at)
      VALUES (${email}, ${token}, ${expiresAt})
    `;
  }

  async consumeMagicLinkToken(token: string): Promise<{ email: string } | null> {
    const rows = await this.instance`
      UPDATE magic_link_tokens
      SET used_at = now()
      WHERE token = ${token}
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING email
    `;
    if (rows.length === 0) return null;
    const row = rows[0] as { email: string };
    return { email: row.email };
  }

  // ─── Decks ──────────────────────────────────────────────

  async listUserDecks(userId: string): Promise<DeckRow[]> {
    const rows = await this.instance`
      SELECT * FROM decks WHERE user_id = ${userId} ORDER BY updated_at DESC
    `;
    return rows as DeckRow[];
  }

  async getDeck(id: string): Promise<DeckRow | null> {
    const rows = await this.instance`SELECT * FROM decks WHERE id = ${id}`;
    return (rows[0] as DeckRow) ?? null;
  }

  async getDeckCards(deckId: string): Promise<DeckCardRow[]> {
    const rows = await this.instance`SELECT * FROM deck_cards WHERE deck_id = ${deckId}`;
    return rows as DeckCardRow[];
  }

  async createDeck(input: {
    userId: string;
    name: string;
    description?: string;
    format: string;
    coverCardId?: string;
    isPublic?: boolean;
  }): Promise<DeckRow> {
    const rows = await this.instance`
      INSERT INTO decks (user_id, name, description, format, cover_card_id, is_public)
      VALUES (
        ${input.userId},
        ${input.name},
        ${input.description ?? null},
        ${input.format},
        ${input.coverCardId ?? null},
        ${input.isPublic ?? true}
      )
      RETURNING *
    `;
    return rows[0] as DeckRow;
  }

  async updateDeck(
    id: string,
    input: {
      name?: string;
      description?: string;
      format?: string;
      coverCardId?: string;
      isPublic?: boolean;
    }
  ): Promise<DeckRow | null> {
    // Dynamic SET is safe here: SET clause keys are hardcoded column names,
    // never user input. Only values are user-supplied and remain parameterized.
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.format !== undefined) { sets.push(`format = $${idx++}`); values.push(input.format); }
    if (input.coverCardId !== undefined) { sets.push(`cover_card_id = $${idx++}`); values.push(input.coverCardId); }
    if (input.isPublic !== undefined) { sets.push(`is_public = $${idx++}`); values.push(input.isPublic); }

    if (sets.length === 0) return this.getDeck(id);

    sets.push(`updated_at = now()`);
    values.push(id);

    const rows = await this.instance.unsafe(
      `UPDATE decks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return (rows[0] as DeckRow) ?? null;
  }

  async deleteDeck(id: string): Promise<boolean> {
    const rows = await this.instance`DELETE FROM decks WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }

  async setDeckCards(
    deckId: string,
    cards: Array<{ cardId: string; quantity: number }>
  ): Promise<void> {
    await this.instance.transaction(async (tx) => {
      await tx`DELETE FROM deck_cards WHERE deck_id = ${deckId}`;
      for (const card of cards) {
        await tx`
          INSERT INTO deck_cards (deck_id, card_id, quantity)
          VALUES (${deckId}, ${card.cardId}, ${card.quantity})
        `;
      }
    });
  }

  // ─── Browse (public decks) ──────────────────────────────

  async browseDecks(opts: {
    page: number;
    limit: number;
    format?: string;
    q?: string;
  }): Promise<{ data: BrowseDeckRow[]; total: number }> {
    const format = opts.format ?? null;
    const likeQ = opts.q ? `%${opts.q}%` : null;
    const offset = (opts.page - 1) * opts.limit;

    const countRows = await this.instance`
      SELECT COUNT(*) as total
      FROM decks d
      WHERE d.is_public = true
        AND (${format}::text IS NULL OR d.format = ${format})
        AND (${likeQ}::text IS NULL OR d.name ILIKE ${likeQ})
    `;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.instance`
      SELECT d.*,
             u.name as owner_name,
             u.avatar_url as owner_avatar_url,
             COALESCE((SELECT SUM(dc.quantity) FROM deck_cards dc WHERE dc.deck_id = d.id), 0) as card_count
      FROM decks d
      JOIN users u ON u.id = d.user_id
      WHERE d.is_public = true
        AND (${format}::text IS NULL OR d.format = ${format})
        AND (${likeQ}::text IS NULL OR d.name ILIKE ${likeQ})
      ORDER BY d.updated_at DESC
      LIMIT ${opts.limit} OFFSET ${offset}
    `;

    return { data: rows as BrowseDeckRow[], total };
  }

  // ─── Collection ─────────────────────────────────────────

  async getUserCollection(userId: string): Promise<CollectionRow[]> {
    const rows = await this.instance`
      SELECT * FROM user_collections WHERE user_id = ${userId}
    `;
    return rows as CollectionRow[];
  }

  async upsertCollectionCard(
    userId: string,
    cardId: string,
    quantity: number
  ): Promise<CollectionRow> {
    const rows = await this.instance`
      INSERT INTO user_collections (user_id, card_id, quantity)
      VALUES (${userId}, ${cardId}, ${quantity})
      ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = ${quantity}
      RETURNING *
    `;
    return rows[0] as CollectionRow;
  }

  async removeCollectionCard(userId: string, cardId: string): Promise<boolean> {
    const rows = await this.instance`
      DELETE FROM user_collections WHERE user_id = ${userId} AND card_id = ${cardId} RETURNING card_id
    `;
    return rows.length > 0;
  }

  // ─── Meta Decks ──────────────────────────────────────────

  async getMetaDecks(opts: {
    format?: string;
    archetype?: string;
    page: number;
    limit: number;
  }): Promise<{ data: MetaDeckRow[]; total: number }> {
    const format = opts.format ?? null;
    const likeArchetype = opts.archetype ? `%${opts.archetype}%` : null;
    const offset = (opts.page - 1) * opts.limit;

    const countRows = await this.instance`
      SELECT COUNT(*) as total
      FROM meta_decks
      WHERE (${format}::text IS NULL OR format = ${format})
        AND (${likeArchetype}::text IS NULL OR name ILIKE ${likeArchetype} OR archetype ILIKE ${likeArchetype})
    `;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.instance`
      SELECT md.*,
             COALESCE((SELECT SUM(mdc.quantity) FROM meta_deck_cards mdc WHERE mdc.meta_deck_id = md.id), 0) AS card_count
      FROM meta_decks md
      WHERE (${format}::text IS NULL OR md.format = ${format})
        AND (${likeArchetype}::text IS NULL OR md.name ILIKE ${likeArchetype} OR md.archetype ILIKE ${likeArchetype})
      ORDER BY md.event_date DESC NULLS LAST, md.created_at DESC
      LIMIT ${opts.limit} OFFSET ${offset}
    `;

    return { data: rows as MetaDeckRow[], total };
  }

  async getMetaDeck(id: string): Promise<MetaDeckRow | null> {
    const rows = await this.instance`
      SELECT md.*,
             COALESCE((SELECT SUM(mdc.quantity) FROM meta_deck_cards mdc WHERE mdc.meta_deck_id = md.id), 0) AS card_count
      FROM meta_decks md
      WHERE md.id = ${id}
    `;
    return (rows[0] as MetaDeckRow) ?? null;
  }

  async getMetaDeckCards(metaDeckId: string): Promise<MetaDeckCardRow[]> {
    const rows = await this.instance`
      SELECT * FROM meta_deck_cards WHERE meta_deck_id = ${metaDeckId}
    `;
    return rows as MetaDeckCardRow[];
  }

  async getMetaUsageCounts(cardIds: string[]): Promise<Map<string, number>> {
    if (cardIds.length === 0) return new Map();
    const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await this.instance.unsafe<{ card_id: string; usage_count: string }[]>(
      `SELECT card_id, COUNT(*)::text AS usage_count
       FROM meta_deck_cards
       WHERE card_id IN (${placeholders})
       GROUP BY card_id`,
      cardIds
    );
    return new Map(rows.map((r) => [r.card_id, Number(r.usage_count)]));
  }

  async getArchetypeCluster(
    archetype: string,
    format: string,
    variant?: string
  ): Promise<MetaDeckRow[]> {
    const lower = archetype.toLowerCase();
    // Use trigram similarity with a substring fallback so both "dragapult" and
    // "dragapullt" (typo) resolve correctly. Threshold 0.2 is intentionally
    // permissive — the cluster is used for frequency analysis, not exact matching.
    const rows = await this.instance<MetaDeckRow[]>`
      SELECT md.*,
             COALESCE((SELECT SUM(mdc.quantity) FROM meta_deck_cards mdc WHERE mdc.meta_deck_id = md.id), 0) AS card_count
      FROM meta_decks md
      WHERE md.format = ${format}
        AND (
          similarity(LOWER(md.archetype), ${lower}) > 0.2
          OR LOWER(md.archetype) LIKE ${'%' + lower + '%'}
        )
      ORDER BY similarity(LOWER(md.archetype), ${lower}) DESC,
               md.event_date DESC NULLS LAST
    `;

    if (variant) {
      const filtered = rows.filter((r) =>
        r.name.toLowerCase().includes(variant.toLowerCase())
      );
      if (filtered.length >= 3) return filtered;
    }

    return rows;
  }

  async getMetaDeckCardsBatch(
    deckIds: string[]
  ): Promise<{ deck_id: string; card_id: string; quantity: number }[]> {
    if (deckIds.length === 0) return [];
    const placeholders = deckIds.map((_, i) => `$${i + 1}`).join(', ');
    return this.instance.unsafe<{ deck_id: string; card_id: string; quantity: number }[]>(
      `SELECT deck_id, card_id, quantity FROM meta_deck_cards WHERE deck_id IN (${placeholders})`,
      deckIds
    );
  }

  // ─── Deck Versions ──────────────────────────────────────

  async createVersionSnapshot(
    deckId: string,
    cards: { cardId: string; quantity: number }[],
    label?: string
  ): Promise<void> {
    const maxRows = await this.instance`
      SELECT MAX(version) as max FROM deck_versions WHERE deck_id = ${deckId}
    `;
    const nextVersion = ((maxRows[0] as { max: number | null })?.max ?? 0) + 1;

    // Use unsafe() so that type casts are emitted literally
    await this.instance.unsafe(
      `INSERT INTO deck_versions (deck_id, version, label, cards) VALUES ($1, $2, $3, $4::jsonb)`,
      [deckId, nextVersion, label ?? null, JSON.stringify(cards)]
    );

    // Rolling window: keep only the 50 most recent versions
    await this.instance`
      DELETE FROM deck_versions
      WHERE deck_id = ${deckId}
        AND version NOT IN (
          SELECT version FROM deck_versions
          WHERE deck_id = ${deckId}
          ORDER BY version DESC
          LIMIT 50
        )
    `;
  }

  async listDeckVersions(
    deckId: string,
    page: number,
    limit: number
  ): Promise<{ data: DeckVersionRow[]; total: number }> {
    const countRows = await this.instance`
      SELECT COUNT(*) as total FROM deck_versions WHERE deck_id = ${deckId}
    `;
    const total = Number((countRows[0] as { total: number }).total ?? 0);
    const offset = (page - 1) * limit;

    const rows = await this.instance`
      SELECT id, deck_id, version, label, created_at,
             CASE WHEN jsonb_typeof(cards) = 'array' THEN jsonb_array_length(cards) ELSE 0 END AS card_count
      FROM deck_versions
      WHERE deck_id = ${deckId}
      ORDER BY version DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return { data: rows as unknown as DeckVersionRow[], total };
  }

  async getDeckVersion(versionId: string): Promise<DeckVersionRow | null> {
    const rows = await this.instance`
      SELECT * FROM deck_versions WHERE id = ${versionId}
    `;
    const row = rows[0] as DeckVersionRow | undefined;
    if (!row) return null;
    // Bun.SQL returns JSONB columns as raw strings — parse explicitly
    if (typeof row.cards === 'string') {
      row.cards = JSON.parse(row.cards) as DeckVersionRow['cards'];
    }
    return row;
  }

  async updateVersionLabel(versionId: string, label: string): Promise<DeckVersionRow | null> {
    const rows = await this.instance`
      UPDATE deck_versions SET label = ${label} WHERE id = ${versionId} RETURNING *
    `;
    return (rows[0] as DeckVersionRow) ?? null;
  }

  // ─── Local Meta ──────────────────────────────────────────

  async checkLgsRateLimit(userId: string): Promise<boolean> {
    const rows = await this.instance`
      SELECT COUNT(*) as count FROM lgs_reports
      WHERE user_id = ${userId}
        AND reported_at >= DATE_TRUNC('day', NOW())
    `;
    const count = Number((rows[0] as { count: number } | undefined)?.count ?? 0);
    return count < 10;
  }

  async createLgsReport(input: {
    userId: string;
    archetype: string;
    archetypeName: string;
    format: string;
    lgsName?: string;
    region?: string;
    result?: string;
  }): Promise<LgsReportRow> {
    const rows = await this.instance`
      INSERT INTO lgs_reports (user_id, archetype, archetype_name, format, lgs_name, region, result)
      VALUES (
        ${input.userId},
        ${input.archetype},
        ${input.archetypeName},
        ${input.format},
        ${input.lgsName ?? null},
        ${input.region ?? null},
        ${input.result ?? null}
      )
      RETURNING *
    `;
    return rows[0] as LgsReportRow;
  }

  async getLgsFrequency(opts: {
    format?: string;
    days?: number;
    limit?: number;
  }): Promise<ArchetypeFrequency[]> {
    const days = opts.days ?? 30;
    const limit = opts.limit ?? 20;

    let rows: unknown[];
    if (opts.format) {
      rows = await this.instance`
        SELECT archetype, archetype_name, format,
               report_count, win_count, loss_count, tie_count, last_seen
        FROM local_meta_frequency
        WHERE format = ${opts.format}
          AND last_seen >= NOW() - (${days} * INTERVAL '1 day')
        LIMIT ${limit}
      `;
    } else {
      rows = await this.instance`
        SELECT archetype, archetype_name, format,
               report_count, win_count, loss_count, tie_count, last_seen
        FROM local_meta_frequency
        WHERE last_seen >= NOW() - (${days} * INTERVAL '1 day')
        LIMIT ${limit}
      `;
    }

    return (rows as Array<{
      archetype: string;
      archetype_name: string;
      format: string;
      report_count: number;
      win_count: number;
      loss_count: number;
      tie_count: number;
      last_seen: string;
    }>).map((r) => {
      const total = Number(r.win_count) + Number(r.loss_count) + Number(r.tie_count);
      return {
        archetype: r.archetype,
        archetypeName: r.archetype_name,
        format: r.format,
        reportCount: Number(r.report_count),
        winCount: Number(r.win_count),
        lossCount: Number(r.loss_count),
        tieCount: Number(r.tie_count),
        winRate: total > 0 ? Math.round((Number(r.win_count) / total) * 100) / 100 : null,
        lastSeen: String(r.last_seen)
      };
    });
  }

  // ─── CP Tracker ──────────────────────────────────────────

  async listCpEntries(userId: string, season?: string): Promise<CpEntryRow[]> {
    const rows = season
      ? await this.instance`
          SELECT * FROM cp_entries
          WHERE user_id = ${userId}
            AND date_part('year', event_date) = ${Number(season)}
          ORDER BY event_date DESC, created_at DESC
        `
      : await this.instance`
          SELECT * FROM cp_entries
          WHERE user_id = ${userId}
          ORDER BY event_date DESC, created_at DESC
        `;
    return rows as CpEntryRow[];
  }

  async createCpEntry(input: {
    userId: string;
    eventName: string;
    eventDate: string;
    placement?: string;
    cpEarned: number;
    format: string;
    notes?: string;
  }): Promise<CpEntryRow> {
    const rows = await this.instance`
      INSERT INTO cp_entries (user_id, event_name, event_date, placement, cp_earned, format, notes)
      VALUES (
        ${input.userId},
        ${input.eventName},
        ${input.eventDate}::date,
        ${input.placement ?? null},
        ${input.cpEarned},
        ${input.format},
        ${input.notes ?? null}
      )
      RETURNING *
    `;
    return rows[0] as CpEntryRow;
  }

  async deleteCpEntry(id: string, userId: string): Promise<boolean> {
    const rows = await this.instance`
      DELETE FROM cp_entries WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `;
    return rows.length > 0;
  }

  // ─── Admin: Stats ──────────────────────────────────────

  async getAdminStats(): Promise<AdminStats> {
    const rows = await this.instance`
      SELECT
        (SELECT COUNT(*) FROM users)::int AS user_count,
        (SELECT COUNT(*) FROM decks)::int AS deck_count,
        (SELECT COUNT(*) FROM user_collections)::int AS collection_entries,
        (SELECT COUNT(*) FROM meta_decks)::int AS meta_deck_count,
        (SELECT COUNT(*) FROM lgs_reports)::int AS report_count,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE)::int AS signups_today,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS signups_week
    `;
    const r = rows[0] as Record<string, number>;
    return {
      userCount: r.user_count,
      deckCount: r.deck_count,
      collectionEntries: r.collection_entries,
      metaDeckCount: r.meta_deck_count,
      reportCount: r.report_count,
      signupsToday: r.signups_today,
      signupsWeek: r.signups_week
    };
  }

  async getSignupTrend(days: number): Promise<SignupTrendPoint[]> {
    const rows = await this.instance`
      SELECT d::date::text AS date, COALESCE(COUNT(u.id), 0)::int AS count
      FROM generate_series(CURRENT_DATE - ${days} * INTERVAL '1 day', CURRENT_DATE, '1 day') AS d
      LEFT JOIN users u ON u.created_at::date = d::date
      GROUP BY d
      ORDER BY d
    `;
    return rows as unknown as SignupTrendPoint[];
  }

  async getRecentActivity(limit: number): Promise<ActivityEvent[]> {
    const rows = await this.instance`
      (
        SELECT 'user_signup' AS type,
               'signed up' AS description,
               u.name AS actor_name,
               u.email AS actor_email,
               u.id::text AS entity_id,
               u.created_at::text AS created_at
        FROM users u
        ORDER BY u.created_at DESC
        LIMIT ${limit}
      )
      UNION ALL
      (
        SELECT 'deck_created' AS type,
               'created deck "' || d.name || '"' AS description,
               u.name AS actor_name,
               u.email AS actor_email,
               d.id::text AS entity_id,
               d.created_at::text AS created_at
        FROM decks d
        JOIN users u ON u.id = d.user_id
        ORDER BY d.created_at DESC
        LIMIT ${limit}
      )
      UNION ALL
      (
        SELECT 'report_submitted' AS type,
               'reported ' || lr.archetype_name || ' at ' || COALESCE(lr.lgs_name, 'unknown LGS') AS description,
               u.name AS actor_name,
               u.email AS actor_email,
               lr.id::text AS entity_id,
               lr.reported_at::text AS created_at
        FROM lgs_reports lr
        JOIN users u ON u.id = lr.user_id
        ORDER BY lr.reported_at DESC
        LIMIT ${limit}
      )
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows as unknown as ActivityEvent[];
  }

  async getTopUsers(limit: number): Promise<AdminUserRow[]> {
    const rows = await this.instance`
      SELECT u.*,
             COALESCE(dc.cnt, 0)::int AS deck_count,
             COALESCE(cc.cnt, 0)::int AS collection_count,
             COALESCE(rc.cnt, 0)::int AS report_count
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM decks GROUP BY user_id) dc ON dc.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM user_collections GROUP BY user_id) cc ON cc.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM lgs_reports GROUP BY user_id) rc ON rc.user_id = u.id
      ORDER BY COALESCE(dc.cnt, 0) + COALESCE(cc.cnt, 0) DESC
      LIMIT ${limit}
    `;
    return rows as unknown as AdminUserRow[];
  }

  // ─── Admin: Users ──────────────────────────────────────

  async listUsersAdmin(opts: {
    page: number;
    limit: number;
    q?: string;
    sort?: string;
  }): Promise<{ data: AdminUserRow[]; total: number }> {
    const likeQ = opts.q ? `%${opts.q}%` : null;
    const offset = (opts.page - 1) * opts.limit;

    const countRows = await this.instance`
      SELECT COUNT(*) AS total FROM users
      WHERE (${likeQ}::text IS NULL OR name ILIKE ${likeQ} OR email ILIKE ${likeQ})
    `;
    const total = Number(countRows[0]?.total ?? 0);

    const sortCol = opts.sort === 'decks' ? 'deck_count'
      : opts.sort === 'collection' ? 'collection_count'
      : opts.sort === 'name' ? 'u.name'
      : 'u.created_at';
    const dir = opts.sort === 'name' ? 'ASC' : 'DESC';

    const rows = await this.instance.unsafe(
      `SELECT u.*,
              COALESCE(dc.cnt, 0)::int AS deck_count,
              COALESCE(cc.cnt, 0)::int AS collection_count,
              COALESCE(rc.cnt, 0)::int AS report_count
       FROM users u
       LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM decks GROUP BY user_id) dc ON dc.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM user_collections GROUP BY user_id) cc ON cc.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM lgs_reports GROUP BY user_id) rc ON rc.user_id = u.id
       WHERE ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
       ORDER BY ${sortCol} ${dir}
       LIMIT $2 OFFSET $3`,
      [likeQ, opts.limit, offset]
    );

    return { data: rows as unknown as AdminUserRow[], total };
  }

  async getUserAdmin(id: string): Promise<AdminUserRow | null> {
    const rows = await this.instance`
      SELECT u.*,
             COALESCE(dc.cnt, 0)::int AS deck_count,
             COALESCE(cc.cnt, 0)::int AS collection_count,
             COALESCE(rc.cnt, 0)::int AS report_count
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM decks GROUP BY user_id) dc ON dc.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM user_collections GROUP BY user_id) cc ON cc.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM lgs_reports GROUP BY user_id) rc ON rc.user_id = u.id
      WHERE u.id = ${id}
    `;
    return (rows[0] as unknown as AdminUserRow) ?? null;
  }

  async setUserRole(id: string, role: string): Promise<UserRow | null> {
    const rows = await this.instance`
      UPDATE users SET role = ${role}, updated_at = now() WHERE id = ${id} RETURNING *
    `;
    return (rows[0] as UserRow) ?? null;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.instance.transaction(async (tx) => {
      await tx`DELETE FROM deck_cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = ${id})`;
      await tx`DELETE FROM deck_versions WHERE deck_id IN (SELECT id FROM decks WHERE user_id = ${id})`;
      await tx`DELETE FROM decks WHERE user_id = ${id}`;
      await tx`DELETE FROM user_collections WHERE user_id = ${id}`;
      await tx`DELETE FROM cp_entries WHERE user_id = ${id}`;
      await tx`DELETE FROM lgs_reports WHERE user_id = ${id}`;
      await tx`DELETE FROM magic_link_tokens WHERE email IN (SELECT email FROM users WHERE id = ${id})`;
      const rows = await tx`DELETE FROM users WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    });
  }

  // ─── Admin: Content ────────────────────────────────────

  async deleteMetaDeckAdmin(id: string): Promise<boolean> {
    return this.instance.transaction(async (tx) => {
      await tx`DELETE FROM meta_deck_cards WHERE meta_deck_id = ${id}`;
      const rows = await tx`DELETE FROM meta_decks WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    });
  }

  async listReportsAdmin(opts: {
    page: number;
    limit: number;
    format?: string;
  }): Promise<{ data: (LgsReportRow & { reporter_name: string })[]; total: number }> {
    const format = opts.format ?? null;
    const offset = (opts.page - 1) * opts.limit;

    const countRows = await this.instance`
      SELECT COUNT(*) AS total FROM lgs_reports
      WHERE (${format}::text IS NULL OR format = ${format})
    `;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.instance`
      SELECT lr.*, u.name AS reporter_name
      FROM lgs_reports lr
      JOIN users u ON u.id = lr.user_id
      WHERE (${format}::text IS NULL OR lr.format = ${format})
      ORDER BY lr.reported_at DESC
      LIMIT ${opts.limit} OFFSET ${offset}
    `;
    return { data: rows as unknown as (LgsReportRow & { reporter_name: string })[], total };
  }

  async deleteReport(id: string): Promise<boolean> {
    const rows = await this.instance`DELETE FROM lgs_reports WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }

  // ─── Admin: System ─────────────────────────────────────

  async getSystemHealth(): Promise<SystemHealth> {
    const tableRows = await this.instance`
      SELECT relname AS name, n_live_tup::int AS row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
    `;

    const migrationRows = await this.instance`
      SELECT name, applied_at::text FROM _migrations ORDER BY id
    `;

    const versionRows = await this.instance`SELECT version() AS v`;
    const pgVersion = String((versionRows[0] as { v: string }).v).split(' ').slice(0, 2).join(' ');

    return {
      tables: tableRows as unknown as { name: string; row_count: number }[],
      migrations: migrationRows as unknown as { name: string; applied_at: string }[],
      uptime: process.uptime(),
      pgVersion
    };
  }

  // ─── Announcements ─────────────────────────────────────

  async listAnnouncements(): Promise<AnnouncementRow[]> {
    const rows = await this.instance`
      SELECT * FROM announcements ORDER BY created_at DESC
    `;
    return rows as AnnouncementRow[];
  }

  async createAnnouncement(input: {
    title: string;
    body: string;
    type: string;
    isActive: boolean;
    startsAt: string;
    endsAt: string | null;
    createdBy: string;
  }): Promise<AnnouncementRow> {
    const rows = await this.instance`
      INSERT INTO announcements (title, body, type, is_active, starts_at, ends_at, created_by)
      VALUES (
        ${input.title},
        ${input.body},
        ${input.type},
        ${input.isActive},
        ${input.startsAt}::timestamptz,
        ${input.endsAt}::timestamptz,
        ${input.createdBy}
      )
      RETURNING *
    `;
    return rows[0] as AnnouncementRow;
  }

  async updateAnnouncement(
    id: string,
    input: { title?: string; body?: string; type?: string; isActive?: boolean; startsAt?: string; endsAt?: string | null }
  ): Promise<AnnouncementRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.body !== undefined) { sets.push(`body = $${idx++}`); values.push(input.body); }
    if (input.type !== undefined) { sets.push(`type = $${idx++}`); values.push(input.type); }
    if (input.isActive !== undefined) { sets.push(`is_active = $${idx++}`); values.push(input.isActive); }
    if (input.startsAt !== undefined) { sets.push(`starts_at = $${idx++}::timestamptz`); values.push(input.startsAt); }
    if (input.endsAt !== undefined) { sets.push(`ends_at = $${idx++}::timestamptz`); values.push(input.endsAt); }

    if (sets.length === 0) return null;
    values.push(id);

    const rows = await this.instance.unsafe(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return (rows[0] as AnnouncementRow) ?? null;
  }

  async deleteAnnouncement(id: string): Promise<boolean> {
    const rows = await this.instance`DELETE FROM announcements WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }

  async getActiveAnnouncements(): Promise<AnnouncementRow[]> {
    const rows = await this.instance`
      SELECT * FROM announcements
      WHERE is_active = true
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY created_at DESC
    `;
    return rows as AnnouncementRow[];
  }

  // ─── Feature Flags ─────────────────────────────────────

  async listFeatureFlags(): Promise<FeatureFlagRow[]> {
    const rows = await this.instance`SELECT * FROM feature_flags ORDER BY key`;
    return rows as FeatureFlagRow[];
  }

  async toggleFeatureFlag(id: string, enabled: boolean): Promise<FeatureFlagRow | null> {
    const rows = await this.instance`
      UPDATE feature_flags SET enabled = ${enabled}, updated_at = now() WHERE id = ${id} RETURNING *
    `;
    return (rows[0] as FeatureFlagRow) ?? null;
  }

  async createFeatureFlag(input: { key: string; description: string; enabled: boolean }): Promise<FeatureFlagRow> {
    const rows = await this.instance`
      INSERT INTO feature_flags (key, description, enabled)
      VALUES (${input.key}, ${input.description}, ${input.enabled})
      RETURNING *
    `;
    return rows[0] as FeatureFlagRow;
  }

  async deleteFeatureFlag(id: string): Promise<boolean> {
    const rows = await this.instance`DELETE FROM feature_flags WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
}
