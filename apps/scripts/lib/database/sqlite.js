import { Database } from 'bun:sqlite';
import { inspect } from 'node:util';
import path from 'node:path';
import * as assert from 'node:assert/strict';

import picolors from 'picocolors';

import { sqlite } from '@pokemon/database';
import POKEMON_TCG_SETS_ALL from '@pokemon/data/sets.json';
import { createLogger } from '@pokemon/logger';
import { isPokemonCardSet, isPokemonCard } from '@pokemon/utils';

const DATABASE_PATH = path.resolve(
  process.cwd(),
  '..',
  '..',
  'database',
  'pokemon-data.sqlite3.db'
);
const DATABASE_OPTIONS = { create: true, readwrite: true, readonly: false };

const STATIC_TOTAL_SETS = 171;
const STATIC_TOTAL_CARDS = 20113;

const ENABLED_DB_SEED = process.env.SQLITE3_SEED_DATABASE === 'true';

const logger = createLogger('pokemon:scripts:db:sqlite');
const bright = (str) => picolors.bold(picolors.bgBlue(str));

/**
 * @type {Database}
 */
var db = null;

export const getSqlite3Database = () => {
  if (!db) {
    db = sqlite.createDatabase(DATABASE_PATH, DATABASE_OPTIONS);
  }

  return db;
};

/**
 * @param {Database} db
 */
export const initDatabase = async (db) => {
  if (ENABLED_DB_SEED) {
    await seed(db);
  }

  validateDB(db);
};

const seed = async (db, verbose = false) => {
  /**
   * Initialize database,
   * write tables, indexes
   */
  let errors = [];
  let start = performance.now();
  let end;
  let job;

  logger.info(`Starting ${bright((job = '(sqlite-db-init-schema-job)'))}`);
  sqlite.initSchema(db);
  logger.info(
    `Finished ${bright(job)} in ${(end = performance.now()) - start}ms`
  );

  /**
   * Write sets + cards
   */
  start = performance.now();

  for (const set of POKEMON_TCG_SETS_ALL.data) {
    let set_readable_name = set.series.concat(' ', set.name);
    logger.info(`Starting insertion of set ${set_readable_name}`);

    try {
      if (!isPokemonCardSet(set)) {
        throw new Error(`${set?.id} is not a valid set.`);
      }

      sqlite.insertSet(db)(
        set.id,
        set.name,
        set.series,
        set.printedTotal,
        set.total,
        JSON.stringify(set.legalities),
        set.ptcgoCode,
        set.releaseDate,
        set.updatedAt,
        JSON.stringify(set.images)
      );
      logger.info(`Set inserted`);

      try {
        logger.info(`Starting cards insertion for ${set_readable_name}`);
        const cards_json = await import(`@pokemon/data/cards/${set.id}`);

        if (cards_json?.data?.length > 0) {
          for (const card of cards_json?.data || []) {
            try {
              if (!isPokemonCard(card)) {
                console.log(inspect(card, false, 10, true));
                throw new Error(`${card?.id} is not a valid card instance`);
              }

              if (verbose) {
                logger.info(`Inserting card ${card?.id} - ${card?.name}`);
              }

              sqlite.insertCard(db)(
                card?.id,
                card?.name,
                card?.supertype,
                JSON.stringify(card?.subtypes || []),
                card?.hp || '-1',
                JSON.stringify(card?.types || []),
                JSON.stringify(card?.evolvesFrom || []),
                JSON.stringify(card?.evolvesTo || []),
                JSON.stringify(card?.rules || []),
                JSON.stringify(card?.abilities || []),
                JSON.stringify(card?.attacks || []),
                JSON.stringify(card?.weaknesses || []),
                JSON.stringify(card?.retreatCost || []),
                card?.convertedRetreatCost || 0,
                set.id,
                card?.number,
                card?.artist,
                card?.rarity,
                card?.flavorText,
                JSON.stringify(card?.nationalPokedexNumbers),
                JSON.stringify(card?.legalities || {}),
                JSON.stringify(card?.images || {}),
                card?.tcgplayer?.url,
                card?.cardmarket?.url
              );
            } catch (e) {
              console.error(
                `\nError inserting card: ${card?.id} - ${card?.name} from set ${set_readable_name}`
              );
              console.error(e);
              errors.push([set, e]);
              continue;
            }
          }
        } else {
          logger.warn('No cards found for ' + set_readable_name);
          continue;
        }
      } catch (e) {
        console.error(e);
        errors.push([set, e]);
      }
    } catch (e) {
      console.error(e);
      errors.push([set, e]);
      continue;
    }
  }

  end = performance.now();
  logger.info(`Finished writing all sets & cards in ${end - start}ms`);
};

const validateDB = (db) => {
  const sets = db
    .query('select count(id) as sets_unique_ids_count from pokemon_card_sets')
    .all();
  const cards = db
    .query('select count(id) as cards_unique_ids_count from pokemon_cards')
    .all();

  assert.ok(sets);
  assert.ok(cards);

  assert.ok(Array.isArray(sets));
  assert.ok(Array.isArray(cards));

  assert.strictEqual(STATIC_TOTAL_SETS, sets[0].sets_unique_ids_count);
  assert.strictEqual(STATIC_TOTAL_CARDS, cards[0].cards_unique_ids_count);
};
