import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'node:readline/promises';

import { parseArgs } from './args';
import { loadAndEnrichDeck } from './deck/loader';
import { McpClient } from './mcp/client';
import { buildSystemPrompt } from './agent/prompt';
import { runAgentTurn } from './agent/loop';
import { formatProbabilityReport } from './probability/format';
import type { ProbabilityReport } from './probability/types';
import type { McpToolResult } from './mcp/types';

async function main(): Promise<void> {
  const args = parseArgs();

  let apiKey: string | undefined;
  if (args.provider === 'anthropic' && !args.dryRun) {
    apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      console.error(
        'Error: ANTHROPIC_API_KEY environment variable is required for --provider anthropic'
      );
      process.exit(1);
    }
  }

  console.log('Starting MCP server...');
  const mcp = new McpClient(args.mcpServerPath);
  await mcp.initialize();
  console.log('MCP server ready.');

  const decks = await Promise.all(
    args.deckPaths.map((p) => {
      console.log(`Loading deck: ${p}`);
      return loadAndEnrichDeck(p, mcp);
    })
  );
  if (decks.length > 0) {
    console.log(`Loaded ${decks.length} deck(s): ${decks.map((d) => d.name).join(', ')}`);
  }

  if (args.stats) {
    for (const deckPath of args.deckPaths) {
      const rawResult = (await mcp.callTool('analyze_deck_probability', {
        path: deckPath,
        spotlight: args.spotlightIds.length > 0 ? args.spotlightIds : undefined,
      })) as McpToolResult;

      const text = rawResult.content.find((c) => c.type === 'text')?.text;
      if (text) {
        const report = JSON.parse(text) as ProbabilityReport;
        const deckName = decks.find((_, i) => args.deckPaths[i] === deckPath)?.name ?? deckPath;
        console.log('\n' + formatProbabilityReport(deckName, report));
      }
    }

    if (args.dryRun) {
      mcp.destroy();
      process.exit(0);
    }
  }

  if (args.provider === 'chrome') {
    if (decks.length > 1) {
      console.warn(
        'Warning: browser mode supports one deck at a time. Using first deck: ' +
          decks[0]!.name
      );
    }

    const { startBrowserServer } = await import('./browser/server');
    const { openInBrowser } = await import('./browser/open');

    const deck = decks[0] ?? null;
    const server = startBrowserServer(deck, mcp);
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

  if (args.dryRun) {
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
