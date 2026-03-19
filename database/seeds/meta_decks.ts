/**
 * Seed script: curated meta decklists
 * Usage: bun run database/seeds/meta_decks.ts
 *
 * Reads POSTGRES_URL from environment (or .env.local at project root).
 * Idempotent: upserts on (name, event_date) to avoid duplicates.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const pgUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!pgUrl) {
  console.error('Set POSTGRES_URL or DATABASE_URL before running this script');
  process.exit(1);
}

interface SeedCard {
  cardId: string;
  quantity: number;
}

interface SeedDeck {
  name: string;
  archetype: string;
  format: string;
  placement?: string;
  eventName?: string;
  eventDate?: string;
  sourceUrl?: string;
  cards: SeedCard[];
}

const dataPath = join(import.meta.dir, 'data/meta_decks.json');
const decks: SeedDeck[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

const db = new Bun.SQL(pgUrl);

let inserted = 0;
let skipped = 0;

for (const deck of decks) {
  // Check if already seeded (idempotent on name + event_date)
  const existing = await db.unsafe(
    `SELECT id FROM meta_decks WHERE name = $1 AND event_date IS NOT DISTINCT FROM $2::date`,
    [deck.name, deck.eventDate ?? null]
  );

  if (existing.length > 0) {
    console.log(`[skip] ${deck.name}`);
    skipped++;
    continue;
  }

  const result = await db.unsafe(
    `INSERT INTO meta_decks (name, archetype, format, placement, event_name, event_date, source_url, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, now())
     RETURNING id`,
    [
      deck.name,
      deck.archetype,
      deck.format,
      deck.placement ?? null,
      deck.eventName ?? null,
      deck.eventDate ?? null,
      deck.sourceUrl ?? null
    ]
  );

  const metaDeckId: string = result[0].id;

  for (const card of deck.cards) {
    await db.unsafe(
      `INSERT INTO meta_deck_cards (meta_deck_id, card_id, quantity) VALUES ($1, $2, $3)`,
      [metaDeckId, card.cardId, card.quantity]
    );
  }

  console.log(`[ok]   ${deck.name} (${deck.cards.length} card entries)`);
  inserted++;
}

db.close();
console.log(`\nDone — ${inserted} inserted, ${skipped} skipped`);
