import { Database, type DatabaseOptions } from 'bun:sqlite';

// Database initialization
export const createDatabase = (
  path: string = ':memory:',
  options: DatabaseOptions = { create: true, readwrite: true }
): Database => {
  const db = new Database(path, options);
  db.run('PRAGMA foreign_keys = ON');
  if (!options.readonly) {
    db.run('PRAGMA journal_mode = WAL');
  }
  return db;
};

// Schema initialization
export const initSchema = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

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
    );

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
      regulation_mark TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pokemon_cards_set_id ON pokemon_cards(set_id);
  `);
};

// Read functions - Functional style

// Users
export const findUserById = (db: Database) => (id: number) =>
  db.query('SELECT * FROM users WHERE id = ?').get(id);

export const findUserByEmail = (db: Database) => (email: string) =>
  db.query('SELECT * FROM users WHERE email = ?').get(email);

export const findUserByUsername = (db: Database) => (username: string) =>
  db.query('SELECT * FROM users WHERE username = ?').get(username);

export const findAllUsers = (db: Database) => () =>
  db.query('SELECT * FROM users').all();

// Pokemon Card Sets
export const findSetById = (db: Database) => (id: string) =>
  db.query('SELECT * FROM pokemon_card_sets WHERE id = ?').get(id);

export const findSetByName = (db: Database) => (name: string) =>
  db.query('SELECT * FROM pokemon_card_sets WHERE name = ?').get(name);

export const findSetsBySeries = (db: Database) => (series: string) =>
  db.query('SELECT * FROM pokemon_card_sets WHERE series = ?').all(series);

export const findAllSets = (db: Database) => () =>
  db.query('SELECT * FROM pokemon_card_sets ORDER BY release_date DESC').all();

// Pokemon Cards
export const findCardById = (db: Database) => (id: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE id = ?').get(id);

export const findCardsByName = (db: Database) => (name: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE name LIKE ?').all(`%${name}%`);

export const findCardsBySetId = (db: Database) => (setId: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE set_id = ?').all(setId);

export const findCardsBySupertype = (db: Database) => (supertype: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE supertype = ?').all(supertype);

export const findCardsByRarity = (db: Database) => (rarity: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE rarity = ?').all(rarity);

export const findCardsByArtist = (db: Database) => (artist: string) =>
  db.query('SELECT * FROM pokemon_cards WHERE artist = ?').all(artist);

export const findAllCards =
  (db: Database) =>
  (limit: number = 100, offset: number = 0) =>
    db
      .query(
        `SELECT pokemon_cards.*
         FROM pokemon_cards
         JOIN pokemon_card_sets ON pokemon_cards.set_id = pokemon_card_sets.id
         ORDER BY pokemon_card_sets.release_date DESC, pokemon_cards.number ASC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset);

// Write functions - Functional style with prepared statements

// Users
export const insertUser = (db: Database) => {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)'
  );
  return (username: string, email: string, password: string) =>
    stmt.run(username, email, password);
};

export const updateUser = (db: Database) => {
  const stmt = db.prepare(
    'UPDATE users SET username = ?, email = ?, password = ?, updated_at = datetime("now") WHERE id = ?'
  );
  return (id: number, username: string, email: string, password: string) =>
    stmt.run(username, email, password, id);
};

export const deleteUser = (db: Database) => {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  return (id: number) => stmt.run(id);
};

// Pokemon Card Sets
export const insertSet = (db: Database) => {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pokemon_card_sets (
      id, name, series, printed_total, total, legalities,
      ptcgo_code, release_date, updated_at, images
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return (
    id: string,
    name: string,
    series: string,
    printedTotal: number | null,
    total: number | null,
    legalities: string | null,
    ptcgoCode: string | null,
    releaseDate: string | null,
    updatedAt: string | null,
    images: string | null
  ) =>
    stmt.run(
      id,
      name,
      series,
      printedTotal,
      total,
      legalities,
      ptcgoCode,
      releaseDate,
      updatedAt,
      images
    );
};

export const updateSet = (db: Database) => {
  const stmt = db.prepare(`
    UPDATE pokemon_card_sets
    SET name = ?, series = ?, printed_total = ?, total = ?, legalities = ?,
        ptcgo_code = ?, release_date = ?, updated_at = ?, images = ?
    WHERE id = ?
  `);
  return (
    id: string,
    name: string,
    series: string,
    printedTotal: number | null,
    total: number | null,
    legalities: string | null,
    ptcgoCode: string | null,
    releaseDate: string | null,
    updatedAt: string | null,
    images: string | null
  ) =>
    stmt.run(
      name,
      series,
      printedTotal,
      total,
      legalities,
      ptcgoCode,
      releaseDate,
      updatedAt,
      images,
      id
    );
};

export const deleteSet = (db: Database) => {
  const stmt = db.prepare('DELETE FROM pokemon_card_sets WHERE id = ?');
  return (id: string) => stmt.run(id);
};

// Pokemon Cards
export const insertCard = (db: Database) => {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pokemon_cards (
      id, name, supertype, subtypes, hp, types, evolves_from, evolves_to,
      rules, abilities, attacks, weaknesses, retreat_cost, converted_retreat_cost,
      set_id, number, artist, rarity, flavor_text, national_pokedex_numbers,
      legalities, images, tcgplayer_url, cardmarket_url, regulation_mark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return (
    id: string,
    name: string,
    supertype: string,
    subtypes: string,
    hp: number | null,
    types: string,
    evolvesFrom: string | null,
    evolvesTo: string | null,
    rules: string | null,
    abilities: string | null,
    attacks: string | null,
    weaknesses: string | null,
    retreatCost: string | null,
    convertedRetreatCost: number | null,
    setId: string,
    number: string,
    artist: string | null,
    rarity: string | null,
    flavorText: string | null,
    nationalPokedexNumbers: string | null,
    legalities: string | null,
    images: string | null,
    tcgplayerUrl: string | null,
    cardmarketUrl: string | null,
    regulationMark: string | null
  ) =>
    stmt.run(
      id,
      name,
      supertype,
      subtypes,
      hp,
      types,
      evolvesFrom,
      evolvesTo,
      rules,
      abilities,
      attacks,
      weaknesses,
      retreatCost,
      convertedRetreatCost,
      setId,
      number,
      artist,
      rarity,
      flavorText,
      nationalPokedexNumbers,
      legalities,
      images,
      tcgplayerUrl,
      cardmarketUrl,
      regulationMark
    );
};

export const updateCard = (db: Database) => {
  const stmt = db.prepare(`
    UPDATE pokemon_cards
    SET name = ?, supertype = ?, subtypes = ?, hp = ?, types = ?, evolves_from = ?,
        evolves_to = ?, rules = ?, abilities = ?, attacks = ?, weaknesses = ?,
        retreat_cost = ?, converted_retreat_cost = ?, set_id = ?, number = ?,
        artist = ?, rarity = ?, flavor_text = ?, national_pokedex_numbers = ?,
        legalities = ?, images = ?, tcgplayer_url = ?, cardmarket_url = ?,
        regulation_mark = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  return (
    id: string,
    name: string,
    supertype: string,
    subtypes: string,
    hp: number | null,
    types: string,
    evolvesFrom: string | null,
    evolvesTo: string | null,
    rules: string | null,
    abilities: string | null,
    attacks: string | null,
    weaknesses: string | null,
    retreatCost: string | null,
    convertedRetreatCost: number | null,
    setId: string,
    number: string,
    artist: string | null,
    rarity: string | null,
    flavorText: string | null,
    nationalPokedexNumbers: string | null,
    legalities: string | null,
    images: string | null,
    tcgplayerUrl: string | null,
    cardmarketUrl: string | null,
    regulationMark: string | null
  ) =>
    stmt.run(
      name,
      supertype,
      subtypes,
      hp,
      types,
      evolvesFrom,
      evolvesTo,
      rules,
      abilities,
      attacks,
      weaknesses,
      retreatCost,
      convertedRetreatCost,
      setId,
      number,
      artist,
      rarity,
      flavorText,
      nationalPokedexNumbers,
      legalities,
      images,
      tcgplayerUrl,
      cardmarketUrl,
      regulationMark,
      id
    );
};

export const deleteCard = (db: Database) => {
  const stmt = db.prepare('DELETE FROM pokemon_cards WHERE id = ?');
  return (id: string) => stmt.run(id);
};

// Utility functions
export const parseJSON = <T>(value: string | null): T | null =>
  value ? JSON.parse(value) : null;

export const parseJSONArray = <T>(value: string | null): T[] =>
  value ? JSON.parse(value) : [];

export const withJSONParsing = <T extends Record<string, any>>(
  row: T,
  jsonFields: (keyof T)[]
): T => ({
  ...row,
  ...Object.fromEntries(
    jsonFields.map((field) => [field, parseJSON(row[field] as string)])
  )
});
