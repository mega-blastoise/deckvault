import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'node:readline/promises';

import { resolveDefaultMcpPath } from '../args';
import { loadAndEnrichDeck } from '../deck/loader';
import { McpClient } from '../mcp/client';
import { buildSystemPrompt } from '../agent/prompt';
import { runAgentTurn } from '../agent/loop';
import { formatProbabilityReport } from '../probability/format';
import { resolveApiKey, resolveDbPath } from '../config/loader';
import type { ProbabilityReport } from '../probability/types';
import type { McpToolResult } from '../mcp/types';

export interface RunOptions {
  readonly deck?: string | string[];
  readonly provider?: string;
  readonly dryRun?: boolean;
  readonly stats?: boolean;
  readonly spotlight?: string | string[];
  readonly mcpServer?: string;
  readonly browserPort?: number;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const provider = options.provider ?? 'anthropic';

  if (provider !== 'anthropic' && provider !== 'chrome') {
    console.error(`Error: Unknown provider "${provider}". Valid options: anthropic, chrome`);
    process.exit(1);
  }

  if (options.dryRun && provider === 'chrome') {
    console.error('Error: --dry-run is not applicable in browser mode (--provider chrome)');
    process.exit(1);
  }

  if (options.stats && provider === 'chrome') {
    console.error('Error: --stats is not applicable in browser mode (--provider chrome)');
    process.exit(1);
  }

  const rawDeck = options.deck;
  const deckPaths: string[] = rawDeck
    ? Array.isArray(rawDeck) ? rawDeck : [rawDeck]
    : [];

  if (deckPaths.length === 0 && provider !== 'chrome') {
    console.error('Error: --deck is required for --provider anthropic');
    process.exit(1);
  }

  const rawSpotlight = options.spotlight;
  const spotlightIds: string[] = rawSpotlight
    ? Array.isArray(rawSpotlight) ? rawSpotlight : [rawSpotlight]
    : [];

  let apiKey: string | undefined;
  if (provider === 'anthropic' && !options.dryRun) {
    apiKey = await resolveApiKey();
    if (!apiKey) {
      console.error(
        'Error: ANTHROPIC_API_KEY environment variable or config file key is required for --provider anthropic'
      );
      process.exit(1);
    }
  }

  const mcpServerPath = options.mcpServer ?? await resolveDefaultMcpPath();
  const dbPath = await resolveDbPath();

  console.log('Starting MCP server...');
  const mcp = new McpClient(mcpServerPath, dbPath);
  await mcp.initialize();
  console.log('MCP server ready.');

  const decks = await Promise.all(
    deckPaths.map((p) => {
      console.log(`Loading deck: ${p}`);
      return loadAndEnrichDeck(p, mcp);
    })
  );
  if (decks.length > 0) {
    console.log(`Loaded ${decks.length} deck(s): ${decks.map((d) => d.name).join(', ')}`);
  }

  if (options.stats) {
    for (const deckPath of deckPaths) {
      const rawResult = (await mcp.callTool('analyze_deck_probability', {
        path: deckPath,
        spotlight: spotlightIds.length > 0 ? spotlightIds : undefined,
      })) as McpToolResult;

      const text = rawResult.content.find((c) => c.type === 'text')?.text;
      if (text) {
        const report = JSON.parse(text) as ProbabilityReport;
        const deckName = decks.find((_, i) => deckPaths[i] === deckPath)?.name ?? deckPath;
        console.log('\n' + formatProbabilityReport(deckName, report));
      }
    }

    if (options.dryRun) {
      mcp.destroy();
      process.exit(0);
    }
  }

  if (provider === 'chrome') {
    if (decks.length > 1) {
      console.warn(
        'Warning: browser mode supports one deck at a time. Using first deck: ' +
          decks[0]!.name
      );
    }

    const { startBrowserServer } = await import('../browser/server');
    const { openInBrowser } = await import('../browser/open');

    const deck = decks[0] ?? null;
    const port = options.browserPort ?? 0;
    const server = startBrowserServer(deck, mcp, port);
    const url = `http://localhost:${server.port}`;

    console.log(`Serving deck at: ${url}`);
    if (!deck) console.log('No deck loaded — browser will open the deck builder.');
    console.log('Press Ctrl+C to stop.\n');
    openInBrowser(url);

    const shutdown = (): never => {
      server.close();
      mcp.destroy();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await new Promise<never>(() => {});
  }

  const systemPrompt = buildSystemPrompt(decks);

  if (options.dryRun) {
    console.log('\n--- SYSTEM PROMPT (dry run) ---\n');
    console.log(systemPrompt);
    mcp.destroy();
    process.exit(0);
  }

  const anthropic = new Anthropic({ apiKey });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const messages: Anthropic.MessageParam[] = [];

  console.log('\nSession ready. Type your question or "quit" to exit.\n');

  while (true) {
    const input = await rl.question('You: ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === 'quit' || trimmed === 'exit') break;

    messages.push({ role: 'user', content: trimmed });
    const updated = await runAgentTurn(anthropic, messages, systemPrompt, mcp);
    messages.splice(0, messages.length, ...updated);
  }

  rl.close();
  mcp.destroy();
  console.log('\nSession ended.');
}
