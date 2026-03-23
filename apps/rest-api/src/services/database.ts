import { Database } from 'bun:sqlite';
import * as sqlite from '@pokemon/database/sqlite';
import type { Service } from '@pokemon/framework';
import type { Config } from '../config';

/**
 * SQLite database service with lifecycle management.
 * Wraps bun:sqlite and @pokemon/database utilities behind
 * a single injectable service.
 */
export class DatabaseService implements Service {
  private db: Database | null = null;

  constructor(private readonly config: Config['database']) {}

  async start(): Promise<void> {
    this.db = sqlite.createDatabase(this.config.path, {
      readonly: this.config.readonly,
      readwrite: !this.config.readonly,
      create: false
    });

    /**
     * Backwards compatability with source db
     */
    try {
      this.db.run(
        'ALTER TABLE pokemon_cards ADD COLUMN regulation_mark TEXT'
      );
    } catch {
      // Column already exists
    }

    if (this.config.readonly) {
      this.db.run('PRAGMA query_only = ON;');
    }

    console.log(`[db] Connected to ${this.config.path}`);
  }

  async stop(): Promise<void> {
    this.db?.close();
    this.db = null;
    console.log('[db] Connection closed');
  }

  private get instance(): Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /** Health check — returns true if a simple query succeeds */
  ping(): boolean {
    try {
      this.instance.query('SELECT 1 as ok').get();
      return true;
    } catch {
      return false;
    }
  }

  /** Execute a query returning multiple rows */
  query<T>(
    sql: string,
    ...params: (null | string | number | bigint | boolean | Uint8Array)[]
  ): T[] {
    return this.instance.query(sql).all(...params) as T[];
  }

  /** Execute a query returning a single row or null */
  queryOne<T>(
    sql: string,
    ...params: (null | string | number | bigint | boolean | Uint8Array)[]
  ): T | null {
    return (this.instance.query(sql).get(...params) as T | null) ?? null;
  }

  /** Pre-built finder: paginated card list */
  findAllCards(limit: number, offset: number): unknown[] {
    return sqlite.findAllCards(this.instance)(limit, offset) as unknown[];
  }

  /** Pre-built finder: single card by ID */
  findCardById(id: string): unknown | null {
    return (sqlite.findCardById(this.instance)(id) as unknown) ?? null;
  }

  /** Pre-built finder: single set by ID */
  findSetById(id: string): unknown | null {
    return (sqlite.findSetById(this.instance)(id) as unknown) ?? null;
  }
}
