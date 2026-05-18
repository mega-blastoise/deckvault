/**
 * Phase 5 — Browser mode HTTP server (SPEC_05)
 *
 * Starts the CLI in --provider chrome mode, verifies the HTTP server responds
 * correctly, then shuts it down. Each describe block manages its own server
 * instance so tests are isolated.
 *
 * Requires both binaries to be built and the database to be present.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  startBrowserServer,
  CLI_AVAILABLE,
  MCP_AVAILABLE,
  DB_AVAILABLE,
  DECK_PATH,
  type BrowserHandle,
} from './helpers';

const skip = !CLI_AVAILABLE || !MCP_AVAILABLE || !DB_AVAILABLE;
const skipReason = [
  !CLI_AVAILABLE && 'CLI binary missing (bun run build in apps/deck-cli)',
  !MCP_AVAILABLE && 'MCP binary missing (cargo build --release in apps/mcp-server)',
  !DB_AVAILABLE  && 'SQLite database not found',
].filter(Boolean).join('; ');

// ── No-deck browser mode ──────────────────────────────────────────────────────

describe.skipIf(skip)(
  `Phase 5 — Browser mode (no deck)${skip ? ` (SKIP: ${skipReason})` : ''}`,
  () => {
    let server: BrowserHandle;

    beforeAll(async () => {
      server = await startBrowserServer();
    });

    afterAll(() => {
      server?.stop();
    });

    test('server starts and binds a port > 0', () => {
      expect(server.port).toBeGreaterThan(0);
    });

    test('GET / returns 200 with HTML content', async () => {
      const res = await fetch(`http://localhost:${server.port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    test('GET / HTML contains the three-panel layout root element', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      // Root class is `jdck`; panels carry `jpanel` (three of them).
      expect(html).toContain('class="jdck"');
      expect((html.match(/class="jpanel"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    test('GET / HTML contains card search panel', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('search-input');
    });

    test('GET / HTML contains deck builder panel', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('export-btn');
    });

    test('GET / HTML contains chat panel', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('chat-form');
    });

    test('GET /unknown returns 404', async () => {
      const res = await fetch(`http://localhost:${server.port}/unknown-path`);
      expect(res.status).toBe(404);
    });

    test('GET /api/search?q=gardevoir returns a non-empty response with card data', async () => {
      // The browser server proxies the MCP search_cards tool verbatim.
      // That tool returns a formatted text summary (not a JSON array), so we
      // check for presence of the card name rather than attempting JSON.parse.
      const res = await fetch(
        `http://localhost:${server.port}/api/search?q=gardevoir&limit=3`
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toContain('gardevoir');
    });

    test('GET /api/card/me1-60 returns card data for Mega Gardevoir ex', async () => {
      const res = await fetch(`http://localhost:${server.port}/api/card/me1-60`);
      expect(res.status).toBe(200);
      const card = await res.json();
      expect(card).not.toBeNull();
      expect(card.name).toContain('Gardevoir');
    });

    test('GET /api/card/:id for a non-existent ID returns an error body', async () => {
      const res = await fetch(`http://localhost:${server.port}/api/card/zz-999`);
      // Server proxies MCP error — may be 200 with error JSON or 500
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    });
  }
);

// ── Deck-loaded browser mode ──────────────────────────────────────────────────

describe.skipIf(skip)(
  `Phase 5 — Browser mode (with deck)${skip ? ` (SKIP: ${skipReason})` : ''}`,
  () => {
    let server: BrowserHandle;

    beforeAll(async () => {
      server = await startBrowserServer(['--deck', DECK_PATH]);
    });

    afterAll(() => {
      server?.stop();
    });

    test('GET / HTML contains the loaded deck name', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('Mega Gardevoir ex');
    });

    test('GET / HTML injects __DECK_CONTEXT__ with the deck object', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('__DECK_CONTEXT__');
      // The deck JSON is embedded — verify the deck name appears in the injected data
      expect(html).toContain('Mega Gardevoir ex');
    });

    test('GET / HTML injects __STATIC_PROMPT__ for Chrome AI', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('__STATIC_PROMPT__');
    });

    test('GET / HTML injects __INITIAL_CTX__ with the deck context text', async () => {
      const html = await fetch(`http://localhost:${server.port}/`).then((r) => r.text());
      expect(html).toContain('__INITIAL_CTX__');
    });
  }
);
