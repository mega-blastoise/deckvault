import { existsSync } from 'node:fs';

import { resolveDefaultMcpPath } from '../args';
import { createRenderer, selectRendererMode } from '../render';
import { loadAndEnrichDeck } from '../deck/loader';
import { McpClient } from '../mcp/client';
import { buildSystemPrompt } from '../agent/prompt';
import { runAgentTurn } from '../agent/loop';
import { formatProbabilityReport } from '../probability/format';
import { loadConfig, resolveDbPath } from '../config/loader';
import {
  resolveFallbackName,
  resolveProvider,
  resolveProviderChain,
  resolveProviderName,
  ProviderConfigError
} from '../providers/resolve';
import { ProviderUnreachableError } from '../providers/types';
import type { AgentMessage } from '../providers/types';
import type { ProbabilityReport } from '../probability/types';
import type { McpToolResult } from '../mcp/types';

/**
 * The full probability table is ~60 columns; the sidebar is 26. Render a
 * column-constrained view rather than letting the wide table wrap into noise.
 */
function formatProbabilityNarrow(report: ProbabilityReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(4);
  const row = (qty: number, name: string, p: number) =>
    `${String(qty).padStart(2)} ${name.slice(0, 15).padEnd(15)}${pct(p)}`;

  const lines = [`Opening hand (7/${report.deckSize})`, '─'.repeat(22)];
  for (const card of report.openingHand.slice(0, 14)) {
    lines.push(row(card.copies, card.name, card.pOpen));
  }

  const risky = report.prizedRisk.filter((p) => p.copies <= 2).slice(0, 6);
  if (risky.length > 0) {
    lines.push('', 'Prize risk', '─'.repeat(22));
    for (const card of risky) lines.push(row(card.copies, card.name, card.pPrized));
  }
  return lines.join('\n');
}

/** Credit exhausted, unauthorised, or rate limited — the backup can help. */
function isExhausted(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 401 || status === 402 || status === 403 || status === 429;
}

function describeError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  return status ? `HTTP ${status}` : err instanceof Error ? err.message : String(err);
}

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
  /** cac maps `--no-tui` to false; undefined means auto-detect. */
  readonly tui?: boolean;
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
  let providerNotice: string | null = null;
  if (needsProvider) {
    try {
      const resolved = await resolveProviderChain({
        provider: options.provider,
        model: options.model,
        baseUrl: options.baseUrl
      });
      provider = resolved.provider;
      providerNotice = resolved.notice;
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

  // Decided before the spawn so the MCP server's stderr is captured rather than
  // inherited when the full-screen TUI is about to take over the terminal.
  const rendererMode = browser ? { mode: 'plain' as const, reason: null } : selectRendererMode(options.tui);

  console.log('Starting MCP server...');
  const mcp = new McpClient(mcpServerPath, dbPath, rendererMode.mode === 'tui');
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

    let active = provider!;
    if (providerNotice) console.warn(`Note: ${providerNotice}`);
    const { renderer } = await createRenderer({
      tui: options.tui,
      showReasoning: options.showReasoning === true
    });
    if (rendererMode.reason) console.warn(`Note: ${rendererMode.reason}`);

    let messages: AgentMessage[] = [];
    let swappedProvider = false;
    await renderer.start({
      providerName: active.name,
      model: active.model,
      decks,
      loadStats:
        deckPaths.length > 0
          ? async () => {
              const reports: string[] = [];
              for (const deckPath of deckPaths) {
                const raw = (await mcp.callTool('analyze_deck_probability', {
                  path: deckPath,
                  spotlight: spotlightIds.length > 0 ? spotlightIds : undefined
                })) as McpToolResult;
                const text = raw.content.find((c) => c.type === 'text')?.text;
                if (!text) continue;
                const report = JSON.parse(text) as ProbabilityReport;
                reports.push(formatProbabilityNarrow(report));
              }
              return reports.join('\n\n');
            }
          : undefined
    });

    while (true) {
      const input = await renderer.prompt();
      if (input === null) break;
      if (!input) continue;

      messages.push({ role: 'user', content: input });
      try {
        messages = await runAgentTurn(active, messages, systemPrompt, mcp, renderer);
      } catch (err) {
        // Prepaid credit can run out mid-session, so swap to the backup once
        // and retry rather than ending the conversation. Safe because each
        // assistant turn records which provider produced it and the adapters
        // rebuild foreign-shaped history from the canonical fields.
        if (isExhausted(err) && !swappedProvider && options.provider === undefined) {
          const fallback = resolveFallbackName(active.name, await loadConfig());
          if (fallback) {
            try {
              const next = await resolveProvider({ provider: fallback });
              renderer.emit({
                type: 'notice',
                text: `${active.name} failed (${describeError(err)}) — switching to ${fallback} (${next.model})`
              });
              active = next;
              swappedProvider = true;
              messages = await runAgentTurn(active, messages, systemPrompt, mcp, renderer);
              continue;
            } catch {
              // Fall through to the generic handler below.
            }
          }
        }
        if (err instanceof ProviderUnreachableError) {
          renderer.emit({ type: 'error', text: `Error: ${err.message}` });
          break;
        }
        // Keep the session alive on API-level failures (rate limits, quota,
        // transient 5xx) — the conversation so far is still usable, and the
        // user can retry or quit. Only transport failures end the session.
        renderer.emit({
          type: 'error',
          text: `Request failed (${active.name}): ${err instanceof Error ? err.message : String(err)}`
        });
        messages.pop();
      }
    }

    await renderer.stop(messages);
  } finally {
    mcp.destroy();
  }
}
