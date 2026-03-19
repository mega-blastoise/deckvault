import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Service } from '@pokemon/framework';

type BunSQL = InstanceType<typeof Bun.SQL>;

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
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
  source_url: string | null;
  placement: string | null;
  event_name: string | null;
  event_date: string | null;
  last_updated: Date;
  created_at: Date;
  card_count: number;
}

export interface MetaDeckCardRow {
  id: string;
  meta_deck_id: string;
  card_id: string;
  quantity: number;
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

  // ─── Deck Versions ──────────────────────────────────────

  async createVersionSnapshot(
    deckId: string,
    cards: { cardId: string; quantity: number }[]
  ): Promise<void> {
    const maxRows = await this.instance`
      SELECT MAX(version) as max FROM deck_versions WHERE deck_id = ${deckId}
    `;
    const nextVersion = ((maxRows[0] as { max: number | null })?.max ?? 0) + 1;

    // Use unsafe() so that $3::jsonb is emitted literally — tagged template
    // literals do not reliably handle type casts appended after interpolations.
    await this.instance.unsafe(
      `INSERT INTO deck_versions (deck_id, version, cards) VALUES ($1, $2, $3::jsonb)`,
      [deckId, nextVersion, JSON.stringify(cards)]
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
}
