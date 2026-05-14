#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';

import { insertSets } from './sets';
import { insertCards } from './cards';

interface RebuildOptions {
  readonly sourceDir: string;
  readonly outputPath: string;
  readonly verbose?: boolean;
}

export async function rebuild(opts: RebuildOptions): Promise<void> {
  if (existsSync(opts.outputPath)) {
    unlinkSync(opts.outputPath);
  }

  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const db = new Database(opts.outputPath, { create: true, readwrite: true });
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');

  const schema = await Bun.file(join(import.meta.dir, 'schema.sql')).text();
  db.exec(schema);

  const setCount = await insertSets(db, opts.sourceDir, opts.verbose ?? false);
  const cardCount = await insertCards(db, opts.sourceDir, opts.verbose ?? false);

  db.close();
  console.log(`Rebuilt ${opts.outputPath}: ${setCount} sets, ${cardCount} cards`);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  const outIdx = args.indexOf('--out');
  const sourceDir = sourceIdx >= 0 ? args[sourceIdx + 1]! : './tcg-data';
  const outputPath = outIdx >= 0 ? args[outIdx + 1]! : './data/pokemon-data.sqlite3.db';
  await rebuild({ sourceDir, outputPath, verbose: args.includes('--verbose') });
}
