import type { BffContext } from '../types';

interface CardDefinitionsRequest {
  cardIds: string[];
  formatDate?: string;
}

export async function postSimCardDefinitions(
  request: Request,
  _params: Record<string, string>,
  _searchParams: URLSearchParams,
  context: BffContext
): Promise<Response> {
  let body: CardDefinitionsRequest;
  try {
    body = (await request.json()) as CardDefinitionsRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId } }
    );
  }

  if (!Array.isArray(body.cardIds) || body.cardIds.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'cardIds must be a non-empty array' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId } }
    );
  }

  try {
    const { loadStandardCardPool } = await import('@pokemon/engine');
    const dbPath = new URL('../../../../../../database/pokemon-data.sqlite3.db', import.meta.url).pathname;
    const formatDate = body.formatDate ? new Date(body.formatDate) : new Date();
    const pool = loadStandardCardPool(dbPath, formatDate);

    const definitions: Record<string, unknown> = {};
    for (const id of body.cardIds) {
      const def = pool.get(id);
      if (def) {
        definitions[id] = def;
      }
    }

    return new Response(JSON.stringify({ data: definitions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'ENGINE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to load card definitions'
        }
      }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Request-ID': context.requestId } }
    );
  }
}
