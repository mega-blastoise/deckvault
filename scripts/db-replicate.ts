import { Database } from 'bun:sqlite';

import debug from 'debug';
import path from 'path';

const forcePurgeExistingDatabases = false;

const SOURCE_DB = path.resolve(
  import.meta.dir,
  '../database/pokemon-data.sqlite3.db'
);

const TARGETS = [
  '../apps/rest-api/database/pokemon-data.sqlite3.db',
  '../apps/graphql-api/database/pokemon-data.sqlite3.db',
  '../apps/mcp-server/database/pokemon-data.sqlite3.db',
  '../apps/tcg-api/database/pokemon-data.sqlite3.db'
];

await replicate();

function close(db: Database) {
  db.close();
}

async function makeCopy(buffer: Buffer, target: string) {
  await Bun.write(target, buffer, { createPath: true, mode: 0o644 });
}

async function replicate() {
  const log = debug('poke:db-replicate');
  log('Starting database replication process...');

  const overwrite =
    process.env.SQLITE_REPLICATE_OVERWRITE_DATABASES ||
    forcePurgeExistingDatabases;

  const sourceDb = new Database(SOURCE_DB, {
    readonly: true,
    create: false,
    readwrite: false
  });

  const snapshot = sourceDb.serialize();

  for (const target of TARGETS) {
    if ((await hasExistingDatabase(target)) && !overwrite) {
      log(
        `Database already exists at ${target} and overwrite is disabled, skipping.`
      );
      continue;
    }

    const targetPath = path.resolve(import.meta.dir, target);
    log(`Copying database to ${targetPath}`);
    await makeCopy(Buffer.from(snapshot), targetPath);
  }

  close(sourceDb);

  log('Database replication process completed.');
}

async function hasExistingDatabase(path: string) {
  return Bun.file(path).exists();
}
