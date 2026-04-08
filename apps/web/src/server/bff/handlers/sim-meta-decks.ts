import { Database } from 'bun:sqlite';
import type { BffContext } from '../types';

const DB_PATH = new URL('../../../../../../database/decks.sqlite3.db', import.meta.url).pathname;

interface DeckRow {
  id: string;
  name: string;
  description: string;
  tier: string | null;
  format: string;
  cards: string;
  cover_card_id: string | null;
  event_name: string | null;
  event_date: string | null;
  source_url: string | null;
}

export async function getSimMetaDecks(
  _request: Request,
  _params: Record<string, string>,
  _searchParams: URLSearchParams,
  context: BffContext
): Promise<Response> {
  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Ensure optional columns exist gracefully by selecting with COALESCE
    const rows = db.query<DeckRow, []>(`
      SELECT
        id,
        name,
        description,
        tier,
        format,
        cards,
        cover_card_id,
        event_name,
        event_date,
        source_url
      FROM decks
      WHERE format = 'standard'
      ORDER BY
        CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
        event_date DESC
    `).all();
    db.close();

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      tier: row.tier ?? 'C',
      format: row.format,
      cards: JSON.parse(row.cards) as Array<{ cardId: string; quantity: number }>,
      coverCardId: row.cover_card_id ?? '',
      eventName: row.event_name ?? '',
      eventDate: row.event_date ?? '',
      sourceUrl: row.source_url ?? ''
    }));

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'DB_ERROR',
          message: error instanceof Error ? error.message : 'Failed to load meta decks'
        }
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId }
      }
    );
  }
}
