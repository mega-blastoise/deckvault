import { existsSync } from 'node:fs';
import * as readline from 'node:readline/promises';

import { resolveDefaultMcpPath } from '../args';
import { loadAndEnrichDeck } from '../deck/loader';
import { McpClient } from '../mcp/client';
import { buildSystemPrompt } from '../agent/prompt';
import { runAgentTurn } from '../agent/loop';
import { formatProbabilityReport } from '../probability/format';
import { loadConfig, resolveDbPath } from '../config/loader';
import { resolveProvider, resolveProviderName, ProviderConfigError } from '../providers/resolve';
import { ProviderUnreachableError } from '../providers/types';
import type { AgentMessage } from '../providers/types';
import type { ProbabilityReport } from '../probability/types';
import type { McpToolResult } from '../mcp/types';

function preflightCardData(dbPath: string | undefined): void {
  // Only fail loudly when the user has *configured* a DB path that doesn't
  // exist. If no path is configured at all, let the MCP server use its own
  // default (or fail with its own message) — `johto doctor` is the right tool
  // for first-run diagnostics.
  if (!dbPath || existsSync(dbPath)) return;

  const lines = [
    `Error: card database not found at ${dbPath}`,
    '',
    'To install the bundled database:',
    '  npm install -g @johto-ai/card-data@latest',
    '',
    'Or set JOHTO_DB_PATH to the path of your pokemon-data.sqlite3.db.',
    'Run `johto doctor` to diagnose further.',
  ];
  console.error(lines.join('\n'));
  process.exit(1);
}

export interface RunOptions {
  readonly deck?: string | string[];
  readonly provider?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly showReasoning?: boolean;
  readonly browser?: boolean;
  readonly dryRun?: boolean;
  readonly stats?: boolean;
  readonly spotlight?: string | string[];
  readonly mcpServer?: string;
  readonly browserPort?: number;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

export async function runCommand(options: RunOptions): Promise<void> {
  const browser = options.browser === true;

  // Validate the provider name up front even on paths that never call a model,
  // so `--provider chrome` gets the migration message rather than being ignored.
  const config = await loadConfig();
  try {
    resolveProviderName(options.provider, config);
  } catch (err) {
    if (err instanceof ProviderConfigError) fail(err.message);
    throw err;
  }

  if (browser && options.dryRun) fail('--dry-run is not applicable with --browser');
  if (browser && options.stats) fail('--stats is not applicable with --browser');
  if (browser && options.provider) {
    fail(
      'Browser mode runs Gemini Nano on-device and takes no --provider.\n' +
        '  → drop --provider to use the browser builder, or drop --browser to use the REPL'
    );
  }

  const rawDeck = options.deck;
  const deckPaths: string[] = rawDeck ? (Array.isArray(rawDeck) ? rawDeck : [rawDeck]) : [];

  if (deckPaths.length === 0 && !browser) {
    fail('--deck is required (or pass --browser to open the deck builder)');
  }

  const rawSpotlight = options.spotlight;
  const spotlightIds: string[] = rawSpotlight
    ? Array.isArray(rawSpotlight)
      ? rawSpotlight
      : [rawSpotlight]
    : [];

  // Resolving the provider can hit the network (model auto-detection), so skip
  // it entirely on paths that never send a request.
  const needsProvider = !browser && !options.dryRun;
  let provider = null as Awaited<ReturnType<typeof resolveProvider>> | null;
  if (needsProvider) {
    try {
      provider = await resolveProvider({
        provider: options.provider,
        model: options.model,
        baseUrl: options.baseUrl
      });
    } catch (err) {
      if (err instanceof ProviderConfigError || err instanceof ProviderUnreachableError) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  const mcpServerPath = options.mcpServer ?? (await resolveDefaultMcpPath());
  const dbPath = await resolveDbPath();
  preflightCardData(dbPath);

  console.log('Starting MCP server...');
  const mcp = new McpClient(mcpServerPath, dbPath);
  await mcp.initialize();
  console.log('MCP server ready.');

  try {
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
          const deckName = decks[deckPaths.indexOf(deckPath)]?.name ?? deckPath;
          console.log('\n' + formatProbabilityReport(deckName, report));
        }
      }

      if (options.dryRun) {
        mcp.destroy();
        process.exit(0);
      }
    }

    if (browser) {
      if (decks.length > 1) {
        console.warn(
          'Warning: browser mode supports one deck at a time. Using first deck: ' + decks[0]!.name
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

    const active = provider!;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let messages: AgentMessage[] = [];

    console.log(`\nProvider: ${active.name} · model: ${active.model}`);
    console.log('Session ready. Type your question or "quit" to exit.\n');

    while (true) {
      let input: string;
      try {
        input = await rl.question('You: ');
      } catch {
        // stdin hit EOF (piped input or Ctrl-D) — readline is closed and any
        // further question() rejects. End the session instead of crashing.
        break;
      }
      const trimmed = input.trim();

      if (!trimmed) continue;
      if (trimmed === 'quit' || trimmed === 'exit') break;

      messages.push({ role: 'user', content: trimmed });
      try {
        messages = await runAgentTurn(active, messages, systemPrompt, mcp, {
          showReasoning: options.showReasoning === true
        });
      } catch (err) {
        if (err instanceof ProviderUnreachableError) {
          console.error(`\nError: ${err.message}`);
          break;
        }
        // Keep the session alive on API-level failures (rate limits, quota,
        // transient 5xx) — the conversation so far is still usable, and the
        // user can retry or quit. Only transport failures end the session.
        console.error(
          `\nRequest failed (${active.name}): ${err instanceof Error ? err.message : String(err)}`
        );
        messages.pop();
      }
    }

    rl.close();
    console.log('\nSession ended.');
  } finally {
    mcp.destroy();
  }
}
