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

export function startBrowserServer(
  deck: EnrichedDeck | null,
  mcp: McpClient
): BrowserServer {
  const html = generatePage(deck);

  const server = Bun.serve({
    port: 0,
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
        return handleGetCard(id, mcp);
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  const port = server.port ?? 0;
  return { port, close: () => server.stop() };
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
  args['standard_only'] = true; // browser builder only works with in-rotation cards

  try {
    const result = (await mcp.callTool('search_cards', args)) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? '';

    // The search_cards MCP tool returns formatted markdown text, not JSON.
    // Parse each result line to extract (name, id, types, hp) for the browser.
    // Line format: "- **Card Name** (card-id) | types | HP: N | rarity | Set: sid"
    const cards: Array<Record<string, unknown>> = [];
    for (const line of text.split('\n')) {
      // Format: "- **Card Name** (card-id) | types | HP: N | rarity | Set: set-id"
      const m = line.match(/^- \*\*(.+?)\*\* \(([^)]+)\) \| ([^|]*) \| HP: ([^|]*) \| [^|]* \| Set: (\S+)/);
      if (m) {
        const id = m[2]!.trim();
        const hpStr = m[4]!.trim();
        const cardSetId = m[5]!.trim();
        const isNoHp = hpStr === 'N/A';
        const dash = id.indexOf('-');
        const num = dash >= 0 ? id.slice(dash + 1) : id;
        cards.push({
          id,
          name: m[1]!.trim(),
          supertype: isNoHp ? '' : 'Pokémon',
          subtypes: [],
          hp: isNoHp ? null : parseInt(hpStr, 10),
          types: m[3]!.trim() ? m[3]!.trim().split(', ') : [],
          attacks: [],
          abilities: [],
          regulationMark: null,
          setId: cardSetId,
          number: num,
          rarity: null,
          images: {
            small: 'https://images.pokemontcg.io/' + cardSetId + '/' + num + '.png',
            large: 'https://images.pokemontcg.io/' + cardSetId + '/' + num + '_hires.png',
          },
        });
      }
    }

    return new Response(JSON.stringify(cards), {
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
