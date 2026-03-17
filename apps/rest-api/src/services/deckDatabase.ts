import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Service } from '@pokemon/framework';

export interface DeckCardShape {
  card: {
    name: string;
    id: string;
    supertype: string;
    subtype?: string;
    subtypes?: string[];
    images?: { small?: string; large?: string };
    set: { id: string; name: string };
  };
  quantity: number;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  format: string;
  cards: DeckCardShape[];
  coverCardId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeckRow {
  id: string;
  name: string;
  description: string | null;
  format: string;
  cards: string;
  cover_card_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    format: row.format,
    cards: JSON.parse(row.cards) as DeckCardShape[],
    coverCardId: row.cover_card_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class DeckDatabaseService implements Service {
  private db: Database | null = null;

  constructor(private readonly path: string) {}

  async start(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new Database(this.path, { create: true });
    this.db.run(`
      CREATE TABLE IF NOT EXISTS decks (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT,
        format        TEXT NOT NULL DEFAULT 'standard',
        cards         TEXT NOT NULL DEFAULT '[]',
        cover_card_id TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )
    `);
    console.log(`[deck-db] Connected to ${this.path}`);
  }

  async stop(): Promise<void> {
    this.db?.close();
    this.db = null;
    console.log('[deck-db] Connection closed');
  }

  private get instance(): Database {
    if (!this.db) throw new Error('Deck database not initialized');
    return this.db;
  }

  ping(): boolean {
    try {
      this.instance.query('SELECT 1 as ok').get();
      return true;
    } catch {
      return false;
    }
  }

  listDecks(): Deck[] {
    const rows = this.instance
      .query('SELECT * FROM decks ORDER BY updated_at DESC')
      .all() as DeckRow[];
    return rows.map(rowToDeck);
  }

  getDeck(id: string): Deck | null {
    const row = this.instance
      .query('SELECT * FROM decks WHERE id = ?')
      .get(id) as DeckRow | null;
    return row ? rowToDeck(row) : null;
  }

  createDeck(deck: Deck): void {
    this.instance
      .query(
        `INSERT INTO decks (id, name, description, format, cards, cover_card_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        deck.id,
        deck.name,
        deck.description ?? null,
        deck.format,
        JSON.stringify(deck.cards),
        deck.coverCardId ?? null,
        deck.createdAt,
        deck.updatedAt
      );
  }

  updateDeck(deck: Deck): void {
    this.instance
      .query(
        `UPDATE decks
         SET name = ?, description = ?, format = ?, cards = ?, cover_card_id = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        deck.name,
        deck.description ?? null,
        deck.format,
        JSON.stringify(deck.cards),
        deck.coverCardId ?? null,
        deck.updatedAt,
        deck.id
      );
  }

  deleteDeck(id: string): boolean {
    const result = this.instance
      .query('DELETE FROM decks WHERE id = ?')
      .run(id);
    return (result as { changes: number }).changes > 0;
  }
}
