import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { resolveDefaultMcpPath } from '../args';
import { resolveDbPath } from '../config/loader';
import { resolveDecksDir } from '../deck/store';
import { McpClient } from '../mcp/client';
import { openInBrowser } from '../browser/open';
import { startDeckServer } from '../browser/server';

export interface DecksOptions {
  readonly deck?: string;
  readonly port?: number;
  readonly mcpServer?: string;
  readonly noOpen?: boolean;
}

export async function decksCommand(options: DecksOptions): Promise<void> {
  const decksDir = await resolveDecksDir();
  if (!existsSync(decksDir)) {
    await mkdir(decksDir, { recursive: true });
    console.log(`Created decks directory: ${decksDir}`);
  }

  const mcpServerPath = options.mcpServer ?? (await resolveDefaultMcpPath());
  const dbPath = await resolveDbPath();

  console.log('Starting MCP server...');
  const mcp = new McpClient(mcpServerPath, dbPath);
  await mcp.initialize();

  // A --deck path is a convenience for opening straight to one deck; the server
  // only ever addresses decks by slug within decksDir.
  const initialSlug = options.deck ? basename(options.deck, extname(options.deck)) : null;

  const server = startDeckServer({
    mcp,
    decksDir,
    port: options.port ?? 0,
    initialSlug
  });

  const url = `http://localhost:${server.port}`;
  console.log(`\nDecks:  ${decksDir}`);
  console.log(`Open:   ${url}`);
  console.log('Press Ctrl+C to stop.\n');

  if (!options.noOpen) openInBrowser(url);

  const shutdown = (): never => {
    server.close();
    mcp.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<never>(() => {});
}
