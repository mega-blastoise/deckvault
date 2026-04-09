import { Database } from 'bun:sqlite';
import { bffCache } from '../cache';
import type { BffContext } from '../types';

const CACHE_KEY = 'bff:sim:set-abbreviations';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — changes only on set release

const DB_PATH = new URL('../../../../../../database/pokemon-data.sqlite3.db', import.meta.url).pathname;

interface SetRow {
  id: string;
  ptcgo_code: string;
}

export async function getSimSetAbbreviations(
  _request: Request,
  _params: Record<string, string>,
  _searchParams: URLSearchParams,
  context: BffContext
): Promise<Response> {
  const cached = bffCache.get<Record<string, string>>(CACHE_KEY);
  if (cached) {
    return new Response(JSON.stringify({ data: cached }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Request-ID': context.requestId
      }
    });
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.query<SetRow, []>(
      `SELECT id, ptcgo_code FROM pokemon_card_sets WHERE ptcgo_code IS NOT NULL`
    ).all();
    db.close();

    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.ptcgo_code) {
        map[row.ptcgo_code] = row.id;
      }
    }

    bffCache.set(CACHE_KEY, map, CACHE_TTL);

    return new Response(JSON.stringify({ data: map }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'X-Request-ID': context.requestId
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'DB_ERROR',
          message: error instanceof Error ? error.message : 'Failed to load set abbreviations'
        }
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId }
      }
    );
  }
}
