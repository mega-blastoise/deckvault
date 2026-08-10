import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stringify } from 'smol-toml';

import { buildSystemPrompt } from '../agent/prompt';
import { runAgentTurn } from '../agent/loop';
import { loadAndEnrichDeck } from '../deck/loader';
import { resolveDecklist } from '../deck/decklist';
import {
  DeckStoreError,
  deleteDeck,
  listDecks,
  nextVersionSlug,
  readDeck,
  renameDeck,
  resolveDeckPath,
  writeDeck,
  type DeckDocument
} from '../deck/store';
import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';
import type { AgentMessage } from '../providers/types';
import { resolveProviderChain } from '../providers/resolve';
import { createWebRenderer } from '../render/web';
import { pageAssets, renderPage } from './template';

export interface DeckServerOptions {
  readonly mcp: McpClient;
  readonly decksDir: string;
  readonly port: number;
  readonly initialSlug: string | null;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const fail = (message: string, status = 400): Response => json({ error: message }, status);

function textOf(result: McpToolResult): string | null {
  return result.content.find((c) => c.type === 'text')?.text ?? null;
}

/**
 * MCP's deck tools take a file path, but the editor needs to validate what is
 * on screen rather than what was last saved. Write the in-flight document to a
 * temp file, run the tool against it, then remove it.
 */
async function withTempDeck<T>(
  doc: DeckDocument,
  run: (path: string) => Promise<T>
): Promise<T> {
  const path = join(tmpdir(), `johto-draft-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`);
  await Bun.write(path, stringify(doc as unknown as Record<string, unknown>));
  try {
    return await run(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}

interface CardBrief {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;
  readonly hp?: number | null;
}

/**
 * Picks the card that best represents a deck, for the gallery tile.
 *
 * Deck files lead with tech cards — the first entry in a Typhlosion list is as
 * likely to be Budew as Typhlosion — so file order makes a poor cover. Decks are
 * almost always named after their ace, so match the deck name against card names
 * first, then fall back to the beefiest Pokémon, then to anything at all.
 *
 * Resolution costs one point lookup per card, so results are cached against the
 * file's mtime and recomputed only when the deck actually changes.
 */
function createCoverResolver(mcp: McpClient) {
  const cache = new Map<string, string | null>();

  return async function resolveCover(deck: {
    slug: string;
    name: string;
    modifiedAt: string;
    cardIds: readonly string[];
    coverCardId: string | null;
  }): Promise<string | null> {
    if (deck.coverCardId) return deck.coverCardId;

    const key = `${deck.slug}:${deck.modifiedAt}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const cards: CardBrief[] = [];
    for (const id of deck.cardIds) {
      try {
        const result = (await mcp.callTool('get_card_by_id', { id })) as McpToolResult;
        const body = textOf(result);
        if (body) cards.push(JSON.parse(body) as CardBrief);
      } catch {
        // A missing card just can't be the cover.
      }
    }

    const pokemon = cards.filter((c) => /^pok/i.test(c.supertype ?? ''));
    const deckName = deck.name.toLowerCase();
    const named = pokemon.find((c) => deckName.includes(c.name.toLowerCase()));
    const biggest = [...pokemon].sort((a, b) => (b.hp ?? 0) - (a.hp ?? 0))[0];
    const cover = named?.id ?? biggest?.id ?? cards[0]?.id ?? null;

    cache.set(key, cover);
    return cover;
  };
}

export function startDeckServer(options: DeckServerOptions): { port: number; close: () => void } {
  const { mcp, decksDir } = options;
  const resolveCover = createCoverResolver(mcp);

  const server = Bun.serve({
    port: options.port,
    // Bound to loopback: this process can write files, so it must never be
    // reachable from the network.
    hostname: process.env['JOHTO_BROWSER_HOST'] ?? '127.0.0.1',
    idleTimeout: 0,

    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        if (path === '/favicon.ico') return new Response(null, { status: 204 });

        if (path === '/') {
          return new Response(renderPage({ decksDir, initialSlug: options.initialSlug }), {
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }

        if (path === '/app.js') {
          return new Response(pageAssets.js, {
            headers: { 'content-type': 'text/javascript; charset=utf-8' }
          });
        }

        if (path === '/app.css') {
          return new Response(pageAssets.css, {
            headers: { 'content-type': 'text/css; charset=utf-8' }
          });
        }

        // ---------------------------------------------------------- decks
        if (path === '/api/decks' && req.method === 'GET') {
          const decks = await listDecks(decksDir);
          const withCovers = await Promise.all(
            decks.map(async (deck) => ({ ...deck, coverCardId: await resolveCover(deck) }))
          );
          return json({ decksDir, decks: withCovers });
        }

        const deckMatch = /^\/api\/decks\/([^/]+)$/.exec(path);
        if (deckMatch) {
          const slug = decodeURIComponent(deckMatch[1]!);
          if (req.method === 'GET') return json(await readDeck(decksDir, slug));
          if (req.method === 'PUT') {
            const doc = (await req.json()) as DeckDocument;
            const written = await writeDeck(decksDir, slug, doc);
            return json({ slug, path: written });
          }
          if (req.method === 'DELETE') {
            await deleteDeck(decksDir, slug);
            return json({ slug, deleted: true });
          }
        }

        const versionMatch = /^\/api\/decks\/([^/]+)\/version$/.exec(path);
        if (versionMatch && req.method === 'POST') {
          const slug = decodeURIComponent(versionMatch[1]!);
          const doc = (await req.json()) as DeckDocument;
          const versionSlug = await nextVersionSlug(decksDir, slug);
          const written = await writeDeck(decksDir, versionSlug, doc);
          return json({ slug: versionSlug, path: written });
        }

        const renameMatch = /^\/api\/decks\/([^/]+)\/rename$/.exec(path);
        if (renameMatch && req.method === 'POST') {
          const from = decodeURIComponent(renameMatch[1]!);
          const { to } = (await req.json()) as { to: string };
          const written = await renameDeck(decksDir, from, to);
          return json({ slug: to, path: written });
        }

        // ----------------------------------------------------- validation
        if (path === '/api/validate' && req.method === 'POST') {
          const doc = (await req.json()) as DeckDocument;
          const report = await withTempDeck(doc, async (tmp) => {
            const result = (await mcp.callTool('validate_deck', { path: tmp })) as McpToolResult;
            const body = textOf(result);
            return body ? JSON.parse(body) : null;
          });
          return json(report ?? { valid: false, violations: [] });
        }

        if (path === '/api/probability' && req.method === 'POST') {
          const doc = (await req.json()) as DeckDocument;
          const report = await withTempDeck(doc, async (tmp) => {
            const result = (await mcp.callTool('analyze_deck_probability', {
              path: tmp
            })) as McpToolResult;
            const body = textOf(result);
            return body ? JSON.parse(body) : null;
          });
          return json(report ?? {});
        }

        // --------------------------------------------------------- import
        if (path === '/api/import' && req.method === 'POST') {
          const { text } = (await req.json()) as { text: string };
          return json(await resolveDecklist(text ?? '', mcp));
        }

        // ---------------------------------------------------------- cards
        if (path === '/api/search') {
          const args: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams) {
            // Query strings are all text, but the MCP schema types limit as an
            // integer and standard_only as a boolean, and the Rust side reads
            // them with as_i64/as_bool — a string silently drops the filter.
            if (/^\d+$/.test(value)) args[key] = Number(value);
            else if (value === 'true' || value === 'false') args[key] = value === 'true';
            else args[key] = value;
          }
          args['format'] = 'json';
          const result = (await mcp.callTool('search_cards', args)) as McpToolResult;
          const body = textOf(result);
          return json(body ? JSON.parse(body) : []);
        }

        if (path.startsWith('/api/card/')) {
          const id = decodeURIComponent(path.slice('/api/card/'.length));
          const result = (await mcp.callTool('get_card_by_id', { id })) as McpToolResult;
          const body = textOf(result);
          return json(body ? JSON.parse(body) : null);
        }

        // ----------------------------------------------------------- chat
        if (path === '/api/chat' && req.method === 'POST') {
          const { message, history, deck } = (await req.json()) as {
            message: string;
            history?: AgentMessage[];
            deck?: string | null;
          };
          if (!message?.trim()) return fail('message is required');

          const { provider, notice } = await resolveProviderChain({});
          const decks = deck
            ? [await loadAndEnrichDeck(resolveDeckPath(decksDir, deck), mcp)]
            : [];
          const systemPrompt = buildSystemPrompt(decks);

          const { renderer, stream } = createWebRenderer(message);
          // start() emits the session event carrying provider and model. The
          // browser needs it to report which backend answered, which is not
          // knowable in advance once the Anthropic fallback can fire.
          await renderer.start({
            providerName: provider.name,
            model: provider.model,
            decks
          });
          if (notice) renderer.emit({ type: 'notice', text: notice });

          // Deliberately not awaited: the response must start streaming now,
          // and the loop writes into it as it goes.
          void (async () => {
            const messages: AgentMessage[] = [
              ...(history ?? []),
              { role: 'user', content: message }
            ];
            try {
              const updated = await runAgentTurn(provider, messages, systemPrompt, mcp, renderer);
              await renderer.stop(updated);
            } catch (err) {
              renderer.emit({
                type: 'error',
                text: err instanceof Error ? err.message : String(err)
              });
              await renderer.stop(messages);
            }
          })();

          return new Response(stream, {
            headers: {
              'content-type': 'application/x-ndjson; charset=utf-8',
              'cache-control': 'no-store'
            }
          });
        }

        return new Response('Not found', { status: 404 });
      } catch (err) {
        if (err instanceof DeckStoreError) return fail(err.message, 400);
        const message = err instanceof Error ? err.message : String(err);
        if (/ENOENT/.test(message)) return fail('Deck not found', 404);
        return fail(message, 500);
      }
    }
  });

  return { port: server.port ?? options.port, close: () => server.stop(true) };
}
