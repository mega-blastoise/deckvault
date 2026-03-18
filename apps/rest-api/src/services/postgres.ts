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

export class PostgresService implements Service {
  private db: BunSQL | null = null;

  constructor(private readonly url: string) {}

  async start(): Promise<void> {
    this.db = new Bun.SQL(this.url);

    // Ensure migrations tracking table exists
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
    try {
      return this.db !== null;
    } catch {
      return false;
    }
  }

  // ─── Users ──────────────────────────────────────────────

  async upsertUser(profile: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<UserRow> {
    const rows = await this.instance.unsafe(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()
       RETURNING *`,
      [profile.googleId, profile.email, profile.name, profile.avatarUrl]
    );
    return rows[0] as UserRow;
  }

  async getUserById(id: string): Promise<UserRow | null> {
    const rows = await this.instance.unsafe(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    return (rows[0] as UserRow) ?? null;
  }

  // ─── Decks ──────────────────────────────────────────────

  async listUserDecks(userId: string): Promise<DeckRow[]> {
    const rows = await this.instance.unsafe(
      `SELECT * FROM decks WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );
    return rows as DeckRow[];
  }

  async getDeck(id: string): Promise<DeckRow | null> {
    const rows = await this.instance.unsafe(
      `SELECT * FROM decks WHERE id = $1`,
      [id]
    );
    return (rows[0] as DeckRow) ?? null;
  }

  async getDeckCards(deckId: string): Promise<DeckCardRow[]> {
    const rows = await this.instance.unsafe(
      `SELECT * FROM deck_cards WHERE deck_id = $1`,
      [deckId]
    );
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
    const rows = await this.instance.unsafe(
      `INSERT INTO decks (user_id, name, description, format, cover_card_id, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.userId,
        input.name,
        input.description ?? null,
        input.format,
        input.coverCardId ?? null,
        input.isPublic ?? true
      ]
    );
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
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.format !== undefined) {
      sets.push(`format = $${idx++}`);
      values.push(input.format);
    }
    if (input.coverCardId !== undefined) {
      sets.push(`cover_card_id = $${idx++}`);
      values.push(input.coverCardId);
    }
    if (input.isPublic !== undefined) {
      sets.push(`is_public = $${idx++}`);
      values.push(input.isPublic);
    }

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
    const rows = await this.instance.unsafe(
      `DELETE FROM decks WHERE id = $1 RETURNING id`,
      [id]
    );
    return rows.length > 0;
  }

  async setDeckCards(
    deckId: string,
    cards: Array<{ cardId: string; quantity: number }>
  ): Promise<void> {
    await this.instance.unsafe(
      `DELETE FROM deck_cards WHERE deck_id = $1`,
      [deckId]
    );
    for (const card of cards) {
      await this.instance.unsafe(
        `INSERT INTO deck_cards (deck_id, card_id, quantity) VALUES ($1, $2, $3)`,
        [deckId, card.cardId, card.quantity]
      );
    }
  }

  // ─── Browse (public decks) ──────────────────────────────

  async browseDecks(opts: {
    page: number;
    limit: number;
    format?: string;
    q?: string;
  }): Promise<{ data: BrowseDeckRow[]; total: number }> {
    const conditions = ['d.is_public = true'];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.format) {
      conditions.push(`d.format = $${idx++}`);
      values.push(opts.format);
    }
    if (opts.q) {
      conditions.push(`d.name ILIKE $${idx++}`);
      values.push(`%${opts.q}%`);
    }

    const where = conditions.join(' AND ');
    const offset = (opts.page - 1) * opts.limit;

    const countResult = await this.instance.unsafe(
      `SELECT COUNT(*) as total FROM decks d WHERE ${where}`,
      values
    );
    const total = Number(countResult[0]?.total ?? 0);

    const dataValues = [...values, opts.limit, offset];
    const rows = await this.instance.unsafe(
      `SELECT d.*,
              u.name as owner_name,
              u.avatar_url as owner_avatar_url,
              COALESCE((SELECT SUM(dc.quantity) FROM deck_cards dc WHERE dc.deck_id = d.id), 0) as card_count
       FROM decks d
       JOIN users u ON u.id = d.user_id
       WHERE ${where}
       ORDER BY d.updated_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      dataValues
    );

    return { data: rows as BrowseDeckRow[], total };
  }

  // ─── Collection ─────────────────────────────────────────

  async getUserCollection(userId: string): Promise<CollectionRow[]> {
    const rows = await this.instance.unsafe(
      `SELECT * FROM user_collections WHERE user_id = $1`,
      [userId]
    );
    return rows as CollectionRow[];
  }

  async upsertCollectionCard(
    userId: string,
    cardId: string,
    quantity: number
  ): Promise<CollectionRow> {
    const rows = await this.instance.unsafe(
      `INSERT INTO user_collections (user_id, card_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = $3
       RETURNING *`,
      [userId, cardId, quantity]
    );
    return rows[0] as CollectionRow;
  }

  async removeCollectionCard(userId: string, cardId: string): Promise<boolean> {
    const rows = await this.instance.unsafe(
      `DELETE FROM user_collections WHERE user_id = $1 AND card_id = $2 RETURNING card_id`,
      [userId, cardId]
    );
    return rows.length > 0;
  }
}
