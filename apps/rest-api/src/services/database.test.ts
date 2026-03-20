import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { DatabaseService } from './database';
import { seedDatabase } from '../utils/test-utils';
import type { Config } from '../config';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMP_DIR = '/tmp';

/** Create a fresh on-disk SQLite DB seeded with test fixtures, return its path */
function createTmpDb(): string {
  const path = join(
    TMP_DIR,
    `pokemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  seedDatabase(db);
  db.close();
  return path;
}

function dbConfig(path: string, readonly = false): Config['database'] {
  return { path, readonly };
}

function removeTmpDb(path: string) {
  if (existsSync(path)) unlinkSync(path);
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop / ping
// ---------------------------------------------------------------------------

describe('DatabaseService lifecycle', () => {
  let dbPath: string;
  let svc: DatabaseService;

  beforeEach(() => {
    dbPath = createTmpDb();
    svc = new DatabaseService(dbConfig(dbPath));
  });

  afterEach(() => {
    removeTmpDb(dbPath);
  });

  it('ping() returns false before start() is called', () => {
    // instance getter throws internally; ping() catches and returns false
    expect(svc.ping()).toBe(false);
  });

  it('ping() returns true after start()', async () => {
    await svc.start();
    expect(svc.ping()).toBe(true);
    await svc.stop();
  });

  it('ping() returns false after stop()', async () => {
    await svc.start();
    await svc.stop();
    expect(svc.ping()).toBe(false);
  });

  it('can be started again after stop (restart cycle)', async () => {
    await svc.start();
    expect(svc.ping()).toBe(true);
    await svc.stop();

    await svc.start();
    expect(svc.ping()).toBe(true);
    await svc.stop();
  });

  it('stop() is safe to call when never started', async () => {
    // Should not throw
    await svc.stop();
  });
});

// ---------------------------------------------------------------------------
// Query methods
// ---------------------------------------------------------------------------

describe('DatabaseService query methods', () => {
  let dbPath: string;
  let svc: DatabaseService;

  beforeEach(async () => {
    dbPath = createTmpDb();
    svc = new DatabaseService(dbConfig(dbPath, /* readonly */ false));
    await svc.start();
  });

  afterEach(async () => {
    await svc.stop();
    removeTmpDb(dbPath);
  });

  it('query() returns multiple rows', () => {
    const rows = svc.query<{ id: string }>(
      'SELECT id FROM pokemon_card_sets ORDER BY id'
    );
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(['base1', 'gym1', 'gym2']);
  });

  it('query() with params filters correctly', () => {
    const rows = svc.query<{ id: string; name: string }>(
      'SELECT id, name FROM pokemon_card_sets WHERE series = ?',
      'Gym'
    );
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(['gym1', 'gym2']);
  });

  it('query() returns empty array for no matches', () => {
    const rows = svc.query<unknown>(
      'SELECT * FROM pokemon_card_sets WHERE series = ?',
      'Nonexistent'
    );
    expect(rows).toEqual([]);
  });

  it('queryOne() returns a single row', () => {
    const row = svc.queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM pokemon_card_sets WHERE id = ?',
      'base1'
    );
    expect(row).not.toBeNull();
    expect(row!.id).toBe('base1');
    expect(row!.name).toBe('Base Set');
  });

  it('queryOne() returns null when no row matches', () => {
    const row = svc.queryOne<unknown>(
      'SELECT * FROM pokemon_card_sets WHERE id = ?',
      'nope'
    );
    expect(row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pre-built finders
// ---------------------------------------------------------------------------

describe('DatabaseService finders', () => {
  let dbPath: string;
  let svc: DatabaseService;

  beforeEach(async () => {
    dbPath = createTmpDb();
    svc = new DatabaseService(dbConfig(dbPath));
    await svc.start();
  });

  afterEach(async () => {
    await svc.stop();
    removeTmpDb(dbPath);
  });

  it('findAllCards returns paginated results', () => {
    const cards = svc.findAllCards(2, 0) as { id: string }[];
    expect(cards.length).toBe(2);
  });

  it('findAllCards with offset skips rows', () => {
    const all = svc.findAllCards(100, 0) as { id: string }[];
    const paged = svc.findAllCards(100, 3) as { id: string }[];
    expect(paged.length).toBe(all.length - 3);
  });

  it('findAllCards returns empty for offset beyond total', () => {
    const cards = svc.findAllCards(10, 999) as unknown[];
    expect(cards).toEqual([]);
  });

  it('findCardById returns the matching card', () => {
    const card = svc.findCardById('base1-4') as {
      id: string;
      name: string;
    } | null;
    expect(card).not.toBeNull();
    expect(card!.id).toBe('base1-4');
    expect(card!.name).toBe('Charizard');
  });

  it('findCardById returns null for unknown id', () => {
    const card = svc.findCardById('does-not-exist');
    expect(card).toBeNull();
  });

  it('findSetById returns the matching set', () => {
    const set = svc.findSetById('gym1') as { id: string; name: string } | null;
    expect(set).not.toBeNull();
    expect(set!.id).toBe('gym1');
    expect(set!.name).toBe('Gym Heroes');
  });

  it('findSetById returns null for unknown id', () => {
    const set = svc.findSetById('no-such-set');
    expect(set).toBeNull();
  });
});
