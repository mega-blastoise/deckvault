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
