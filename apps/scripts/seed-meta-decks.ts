import { Database } from 'bun:sqlite';
import { join } from 'node:path';

interface MetaDeckSeed {
  name: string;
  archetype: string;
  format: 'standard';
  tier: 'S' | 'A' | 'B' | 'C';
  placement: string;
  eventName: string;
  eventDate: string;
  sourceUrl: string;
  cards: ReadonlyArray<{ cardId: string; quantity: number }>;
}

const ROOT = join(import.meta.dir, '../../');
const DB_PATH = join(ROOT, 'database/decks.sqlite3.db');
const SEEDS_PATH = join(ROOT, 'database/seeds/data/meta_decks.json');

const seedsFile = Bun.file(SEEDS_PATH);
const seeds = (await seedsFile.json()) as MetaDeckSeed[];

const db = new Database(DB_PATH);

// Add optional columns if they don't exist yet
const pragmas = db.query<{ name: string }, []>('PRAGMA table_info(decks)').all();
const columns = new Set(pragmas.map((p) => p.name));

if (!columns.has('tier')) {
  db.run("ALTER TABLE decks ADD COLUMN tier TEXT");
}
if (!columns.has('event_name')) {
  db.run("ALTER TABLE decks ADD COLUMN event_name TEXT");
}
if (!columns.has('event_date')) {
  db.run("ALTER TABLE decks ADD COLUMN event_date TEXT");
}
if (!columns.has('source_url')) {
  db.run("ALTER TABLE decks ADD COLUMN source_url TEXT");
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO decks
    (id, name, description, format, cards, cover_card_id, created_at, updated_at, tier, event_name, event_date, source_url)
  VALUES
    ($id, $name, $description, $format, $cards, $cover_card_id, $created_at, $updated_at, $tier, $event_name, $event_date, $source_url)
`);

for (const seed of seeds) {
  const firstPokemonCard = seed.cards[0];
  const coverCardId = firstPokemonCard?.cardId ?? '';
  const description = `${seed.placement} at ${seed.eventName}`;

  insert.run({
    $id: seed.archetype,
    $name: seed.name,
    $description: description,
    $format: seed.format,
    $cards: JSON.stringify(seed.cards),
    $cover_card_id: coverCardId,
    $created_at: seed.eventDate,
    $updated_at: seed.eventDate,
    $tier: seed.tier,
    $event_name: seed.eventName,
    $event_date: seed.eventDate,
    $source_url: seed.sourceUrl
  });
}

db.close();
