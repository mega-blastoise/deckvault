import type { McpClient } from '../mcp/client';
import type { EnrichedDeck } from '../deck/types';
import { generatePage } from './template';

export interface BrowserServer {
  readonly port: number;
  readonly close: () => void;
}

interface McpToolResult {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text: string }>;
  readonly isError: boolean | null;
}

const CARD_ID_RE = /^[a-z0-9]+-[a-z0-9]+$/i;

export function startBrowserServer(
  deck: EnrichedDeck | null,
  mcp: McpClient,
  port = 0
): BrowserServer {
  const html = generatePage(deck);

  const server = Bun.serve({
    port,
    hostname: process.env['JOHTO_BROWSER_HOST'] ?? '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }

      if (url.pathname === '/') {
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (url.pathname === '/api/search') {
        return handleSearch(url.searchParams, mcp);
      }

      if (url.pathname.startsWith('/api/card/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/card/'.length));
        if (!CARD_ID_RE.test(id)) {
          return new Response(JSON.stringify({ error: 'invalid card id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return handleGetCard(id, mcp);
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  const serverPort = server.port ?? 0;
  return { port: serverPort, close: () => server.stop() };
}

async function handleSearch(
  params: URLSearchParams,
  mcp: McpClient
): Promise<Response> {
  const args: Record<string, unknown> = {};
  const q = params.get('q');
  const type = params.get('type');
  const supertype = params.get('supertype');
  const setId = params.get('set_id');
  const hpMin = params.get('hp_min');
  const hpMax = params.get('hp_max');
  const limit = params.get('limit');

  if (q) args['query'] = q;
  if (type) args['type'] = type;
  if (supertype) args['supertype'] = supertype;
  if (setId) args['set_id'] = setId;
  if (hpMin) args['hp_min'] = parseInt(hpMin, 10);
  if (hpMax) args['hp_max'] = parseInt(hpMax, 10);
  args['limit'] = limit ? Math.min(parseInt(limit, 10), 50) : 15;
  args['standard_only'] = true;
  args['format'] = 'json';

  try {
    const result = (await mcp.callTool('search_cards', args)) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';

    // Old MCP binary (pre-format:json) returns markdown text starting with "Found".
    // Serve an empty array so the browser doesn't crash on JSON.parse failure.
    const isJsonArray = text.trimStart().startsWith('[');
    const body = isJsonArray ? text : '[]';

    return new Response(body, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleGetCard(id: string, mcp: McpClient): Promise<Response> {
  try {
    const result = (await mcp.callTool('get_card_by_id', { id })) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? 'null';
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
