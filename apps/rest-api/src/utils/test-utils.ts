/**
 * Shared test utilities: fixture data, in-memory DB seeding, mock service, app builder.
 */

import { Database } from 'bun:sqlite';
import * as sqlite from '@pokemon/database/sqlite';
import {
  createApp,
  createContainer,
  createRouter,
  cors,
  securityHeaders,
  rateLimit
} from '@pokemon/framework';

import { healthCheck, readyCheck, getApiDiscovery } from '../handlers/health';
import { getCards, getCardById, searchCards } from '../handlers/cards';
import {
  getSets,
  getSetById,
  getSetCards,
  getSetsBySeries
} from '../handlers/sets';

// ============================================================
// Fixture data
// ============================================================

/** 3 sets across 2 series */
export const TEST_SETS = [
  {
    id: 'base1',
    name: 'Base Set',
    series: 'Base',
    printed_total: 102,
    total: 102,
    legalities: '{"unlimited":"legal"}',
    ptcgo_code: 'BASE',
    release_date: '1999/01/09',
    updated_at: '2024-01-01T00:00:00.000Z',
    images:
      '{"symbol":"https://example.com/base-symbol.png","logo":"https://example.com/base-logo.png"}',
    created_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'gym1',
    name: 'Gym Heroes',
    series: 'Gym',
    printed_total: 132,
    total: 132,
    legalities: '{"unlimited":"legal"}',
    ptcgo_code: 'GYM1',
    release_date: '1999/08/14',
    updated_at: '2024-01-01T00:00:00.000Z',
    images:
      '{"symbol":"https://example.com/gym1-symbol.png","logo":"https://example.com/gym1-logo.png"}',
    created_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'gym2',
    name: 'Gym Challenge',
    series: 'Gym',
    printed_total: 132,
    total: 132,
    legalities: '{"unlimited":"legal"}',
    ptcgo_code: 'GYM2',
    release_date: '1999/09/22',
    updated_at: '2024-01-01T00:00:00.000Z',
    images:
      '{"symbol":"https://example.com/gym2-symbol.png","logo":"https://example.com/gym2-logo.png"}',
    created_at: '2024-01-01T00:00:00.000Z'
  }
] as const;

/**
 * 6 cards: 3 in base1, 2 in gym1, 1 in gym2.
 * Alphabetical order: Bulbasaur, Charizard, Erika, Lt. Surge, Misty, Pikachu
 * base1 by number: 4 (Charizard), 35 (Pikachu), 63 (Bulbasaur)
 */
export const TEST_CARDS = [
  {
    id: 'base1-35',
    name: 'Pikachu',
    supertype: 'Pokémon',
    subtypes: '["Basic"]',
    hp: 60,
    types: '["Electric"]',
    evolves_from: null,
    evolves_to: '["Raichu"]',
    rules: null,
    abilities: null,
    attacks:
      '[{"name":"Spark","cost":["Electric"],"convertedEnergyCost":1,"damage":"20","text":""}]',
    weaknesses: '[{"type":"Fighting","value":"x2"}]',
    retreat_cost: '["Colorless"]',
    converted_retreat_cost: 1,
    set_id: 'base1',
    number: '35',
    artist: 'Mitsuhiro Arita',
    rarity: 'Common',
    flavor_text:
      'When several of these Pokémon gather, their electricity can build and cause lightning storms.',
    national_pokedex_numbers: '["25"]',
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/pikachu-small.png","large":"https://example.com/pikachu-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'base1-4',
    name: 'Charizard',
    supertype: 'Pokémon',
    subtypes: '["Stage 2"]',
    hp: 120,
    types: '["Fire"]',
    evolves_from: 'Charmeleon',
    evolves_to: null,
    rules: null,
    abilities: null,
    attacks:
      '[{"name":"Fire Spin","cost":["Fire","Fire","Fire"],"convertedEnergyCost":3,"damage":"80","text":""}]',
    weaknesses: '[{"type":"Water","value":"x2"}]',
    retreat_cost: '["Colorless","Colorless","Colorless"]',
    converted_retreat_cost: 3,
    set_id: 'base1',
    number: '4',
    artist: 'Mitsuhiro Arita',
    rarity: 'Rare Holo',
    flavor_text: 'It spits fire that is hot enough to melt boulders.',
    national_pokedex_numbers: '["6"]',
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/charizard-small.png","large":"https://example.com/charizard-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'base1-63',
    name: 'Bulbasaur',
    supertype: 'Pokémon',
    subtypes: '["Basic"]',
    hp: 40,
    types: '["Grass"]',
    evolves_from: null,
    evolves_to: '["Ivysaur"]',
    rules: null,
    abilities: null,
    attacks:
      '[{"name":"Leech Seed","cost":["Grass"],"convertedEnergyCost":1,"damage":"","text":"Unless already affected by Leech Seed, the Defending Pokémon is now affected by Leech Seed."}]',
    weaknesses: '[{"type":"Fire","value":"x2"}]',
    retreat_cost: null,
    converted_retreat_cost: 0,
    set_id: 'base1',
    number: '63',
    artist: 'Mitsuhiro Arita',
    rarity: 'Common',
    flavor_text: 'There is a seed on its back.',
    national_pokedex_numbers: '["1"]',
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/bulbasaur-small.png","large":"https://example.com/bulbasaur-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'gym1-64',
    name: 'Misty',
    supertype: 'Trainer',
    subtypes: '["Supporter"]',
    hp: null,
    types: '[]',
    evolves_from: null,
    evolves_to: null,
    rules: '["You may only have 4 Supporters in play at a time."]',
    abilities: null,
    attacks: null,
    weaknesses: null,
    retreat_cost: null,
    converted_retreat_cost: 0,
    set_id: 'gym1',
    number: '64',
    artist: 'Koichi Oyama',
    rarity: 'Uncommon',
    flavor_text: null,
    national_pokedex_numbers: null,
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/misty-small.png","large":"https://example.com/misty-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'gym1-63',
    name: 'Erika',
    supertype: 'Trainer',
    subtypes: '["Supporter"]',
    hp: null,
    types: '[]',
    evolves_from: null,
    evolves_to: null,
    rules: '["You may only have 4 Supporters in play at a time."]',
    abilities: null,
    attacks: null,
    weaknesses: null,
    retreat_cost: null,
    converted_retreat_cost: 0,
    set_id: 'gym1',
    number: '63',
    artist: 'Koichi Oyama',
    rarity: 'Rare',
    flavor_text: null,
    national_pokedex_numbers: null,
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/erika-small.png","large":"https://example.com/erika-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'gym2-65',
    name: 'Lt. Surge',
    supertype: 'Trainer',
    subtypes: '["Supporter"]',
    hp: null,
    types: '[]',
    evolves_from: null,
    evolves_to: null,
    rules: '["You may only have 4 Supporters in play at a time."]',
    abilities: null,
    attacks: null,
    weaknesses: null,
    retreat_cost: null,
    converted_retreat_cost: 0,
    set_id: 'gym2',
    number: '65',
    artist: 'Koichi Oyama',
    rarity: 'Uncommon',
    flavor_text: null,
    national_pokedex_numbers: null,
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/ltsurge-small.png","large":"https://example.com/ltsurge-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  }
] as const;

// ============================================================
// DB seeding
// ============================================================

const SCHEMA_SETS = `
  CREATE TABLE IF NOT EXISTS pokemon_card_sets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    series TEXT NOT NULL,
    printed_total INTEGER,
    total INTEGER,
    legalities TEXT,
    ptcgo_code TEXT,
    release_date TEXT,
    updated_at TEXT,
    images TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`;

const SCHEMA_CARDS = `
  CREATE TABLE IF NOT EXISTS pokemon_cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    supertype TEXT NOT NULL,
    subtypes TEXT NOT NULL,
    hp INTEGER,
    types TEXT NOT NULL,
    evolves_from TEXT,
    evolves_to TEXT,
    rules TEXT,
    abilities TEXT,
    attacks TEXT,
    weaknesses TEXT,
    retreat_cost TEXT,
    converted_retreat_cost INTEGER,
    set_id TEXT NOT NULL REFERENCES pokemon_card_sets(id),
    number TEXT NOT NULL,
    artist TEXT,
    rarity TEXT,
    flavor_text TEXT,
    national_pokedex_numbers TEXT,
    legalities TEXT,
    images TEXT,
    tcgplayer_url TEXT,
    cardmarket_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`;

/** Create tables and insert all fixture rows into the given Database */
export function seedDatabase(db: Database): void {
  db.run(SCHEMA_SETS);
  db.run(SCHEMA_CARDS);
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_cards_set_id ON pokemon_cards(set_id)'
  );

  const insertSet = db.prepare(`
    INSERT INTO pokemon_card_sets
      (id, name, series, printed_total, total, legalities, ptcgo_code, release_date, updated_at, images, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const s of TEST_SETS) {
    insertSet.run(
      s.id,
      s.name,
      s.series,
      s.printed_total,
      s.total,
      s.legalities,
      s.ptcgo_code,
      s.release_date,
      s.updated_at,
      s.images,
      s.created_at
    );
  }

  const insertCard = db.prepare(`
    INSERT INTO pokemon_cards
      (id, name, supertype, subtypes, hp, types, evolves_from, evolves_to,
       rules, abilities, attacks, weaknesses, retreat_cost, converted_retreat_cost,
       set_id, number, artist, rarity, flavor_text, national_pokedex_numbers,
       legalities, images, tcgplayer_url, cardmarket_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const c of TEST_CARDS) {
    insertCard.run(
      c.id,
      c.name,
      c.supertype,
      c.subtypes,
      c.hp,
      c.types,
      c.evolves_from,
      c.evolves_to,
      c.rules,
      c.abilities,
      c.attacks,
      c.weaknesses,
      c.retreat_cost,
      c.converted_retreat_cost,
      c.set_id,
      c.number,
      c.artist,
      c.rarity,
      c.flavor_text,
      c.national_pokedex_numbers,
      c.legalities,
      c.images,
      c.tcgplayer_url,
      c.cardmarket_url,
      c.created_at,
      c.updated_at
    );
  }
}

/** Fresh in-memory DB with schema + all fixture rows */
export function createSeededTestDb(): Database {
  const db = new Database(':memory:');
  seedDatabase(db);
  return db;
}

// ============================================================
// Mock DatabaseService
// ============================================================

/**
 * Duck-typed stand-in for DatabaseService backed by an already-open Database.
 * Structurally identical public API — works with the container at runtime.
 */
export function createMockDbService(db: Database) {
  return {
    async start() {
      /* no-op */
    },
    async stop() {
      /* no-op */
    },

    ping(): boolean {
      try {
        db.query('SELECT 1 as ok').get();
        return true;
      } catch {
        return false;
      }
    },

    query<T>(
      sql: string,
      ...params: (null | string | number | bigint | boolean | Uint8Array)[]
    ): T[] {
      return db.query(sql).all(...params) as T[];
    },

    queryOne<T>(
      sql: string,
      ...params: (null | string | number | bigint | boolean | Uint8Array)[]
    ): T | null {
      return (db.query(sql).get(...params) as T | null) ?? null;
    },

    findAllCards(limit: number, offset: number): unknown[] {
      return sqlite.findAllCards(db)(limit, offset) as unknown[];
    },

    findCardById(id: string): unknown | null {
      return (sqlite.findCardById(db)(id) as unknown) ?? null;
    },

    findSetById(id: string): unknown | null {
      return (sqlite.findSetById(db)(id) as unknown) ?? null;
    }
  };
}

// ============================================================
// Test app builder
// ============================================================

export interface BuildAppOptions {
  /** When set, adds rateLimit middleware with this max value */
  rateLimitMax?: number;
}

/**
 * Assemble a full app wired to an in-memory seeded DB.
 * Returns the app (for .handle()) and the raw Database (for direct inspection).
 */
export function buildTestApp(options: BuildAppOptions = {}) {
  const db = createSeededTestDb();
  const mockDb = createMockDbService(db);

  const container = createContainer()
    .register('config', () => ({}) as any)
    .register('db', () => mockDb as any);

  let app = createApp({ container })
    .use(cors({ origins: ['*'] }))
    .use(securityHeaders);

  if (options.rateLimitMax != null) {
    app = app.use(rateLimit({ windowMs: 60_000, max: options.rateLimitMax }));
  }

  app = app
    .routes(createRouter<any>('/health').get('/', healthCheck))
    .routes(createRouter<any>('/ready').get('/', readyCheck))
    .routes(
      createRouter<any>('/api/v1')
        .get('/endpoints', getApiDiscovery)
        .get('/', getApiDiscovery)
    )
    .routes(
      createRouter<any>('/api/v1/cards')
        .get('/search', searchCards)
        .get('/:id', getCardById)
        .get('/', getCards)
    )
    .routes(
      createRouter<any>('/api/v1/sets')
        .get('/series/:series', getSetsBySeries)
        .get('/:id/cards', getSetCards)
        .get('/:id', getSetById)
        .get('/', getSets)
    );

  return { app, db };
}

/** Shorthand: new Request with an absolute URL */
export function req(path: string, init: RequestInit = {}): Request {
  return new Request(`http://test${path}`, init);
}
