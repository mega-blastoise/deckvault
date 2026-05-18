import { Database } from 'bun:sqlite';
import { join } from 'node:path';

interface SetRecord {
  readonly id: string;
  readonly name: string;
  readonly series: string;
  readonly printedTotal?: number;
  readonly total?: number;
  readonly legalities?: Record<string, string>;
  readonly ptcgoCode?: string;
  readonly releaseDate?: string;
  readonly updatedAt?: string;
  readonly images?: Record<string, string>;
}

export async function insertSets(db: Database, sourceDir: string, verbose: boolean): Promise<number> {
  const setsPath = join(sourceDir, 'sets.json');
  const setsData = (await Bun.file(setsPath).json()) as { data: readonly SetRecord[] };

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pokemon_card_sets (
      id, name, series, printed_total, total, legalities,
      ptcgo_code, release_date, updated_at, images
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const set of setsData.data) {
    stmt.run(
      set.id,
      set.name,
      set.series,
      set.printedTotal ?? null,
      set.total ?? null,
      JSON.stringify(set.legalities ?? null),
      set.ptcgoCode ?? null,
      set.releaseDate ?? null,
      set.updatedAt ?? null,
      JSON.stringify(set.images ?? null)
    );
    count++;
    if (verbose) console.log(`  Set: ${set.name}`);
  }

  return count;
}
