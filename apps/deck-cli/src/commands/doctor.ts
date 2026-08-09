import { existsSync, statSync } from 'node:fs';
import { Database } from 'bun:sqlite';

import { resolveDefaultMcpPath } from '../args';
import { loadConfig, getConfigPath, resolveDbPath } from '../config/loader';
import { PROVIDER_DEFAULTS } from '../providers/defaults';
import {
  resolveApiKey,
  resolveBaseUrl,
  resolveProviderName,
  ProviderConfigError
} from '../providers/resolve';
import type { JohtoConfig } from '../config/types';
import type { ProviderName } from '../providers/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function check(ok: boolean, label: string, detail: string, results: boolean[]): void {
  console.log(`${ok ? '✓' : '✗'} ${label}  ${detail}`);
  results.push(ok);
}

function warn(label: string, detail: string): void {
  console.log(`⚠ ${label}  ${detail}`);
}

async function ping(url: string): Promise<{ ok: boolean; detail: string }> {
  const start = performance.now();
  try {
    // Any HTTP response proves the host is reachable; only transport failures
    // (DNS, TCP refused, timeout) count as unreachable.
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    return { ok: true, detail: `${(performance.now() - start).toFixed(0)}ms` };
  } catch (err) {
    return { ok: false, detail: `unreachable (${err instanceof Error ? err.message : err})` };
  }
}

async function checkProvider(
  provider: ProviderName,
  config: JohtoConfig,
  results: boolean[]
): Promise<void> {
  const defaults = PROVIDER_DEFAULTS[provider];
  const conf = (config[provider] ?? {}) as { model?: string };
  const model = conf.model ?? defaults.model;

  console.log(`\nActive provider: ${provider} (${defaults.label})`);
  console.log(`  model: ${model ?? '(not set — pass --model or set it in config)'}`);

  if (defaults.apiKeyEnv) {
    const key = resolveApiKey(provider, config);
    if (key) {
      const source = process.env[defaults.apiKeyEnv] ? 'env' : 'config';
      check(true, 'Credential', `${key.slice(0, 7)}*** (source: ${source})`, results);
    } else {
      check(
        false,
        'Credential',
        `not set — export ${defaults.apiKeyEnv} or run \`johto auth set ${provider} <key>\``,
        results
      );
    }
  } else {
    console.log('✓ Credential  not required for this provider');
  }

  const endpoint =
    provider === 'anthropic' ? 'https://api.anthropic.com' : resolveBaseUrl(provider, config);
  const probe = provider === 'anthropic' ? endpoint : `${endpoint}/models`;
  const { ok, detail } = await ping(probe);
  if (ok) {
    check(true, 'Endpoint', `${endpoint} (${detail})`, results);
  } else {
    check(false, 'Endpoint', `${endpoint} ${detail}`, results);
    console.log(`      → ${defaults.unreachableHint}`);
  }
}

export async function doctorCommand(): Promise<void> {
  const results: boolean[] = [];

  console.log('\nJohto Doctor\n');

  const cliBin = process.argv[1] ?? '(unknown)';
  if (cliBin.startsWith('/$bunfs/')) {
    // Compiled binaries report a virtual path for argv[1]; execPath is the
    // real file on disk.
    const real = process.execPath;
    const size = existsSync(real) ? ` (${formatBytes(statSync(real).size)})` : '';
    check(true, 'CLI binary', `${real}${size}`, results);
  } else if (existsSync(cliBin)) {
    check(true, 'CLI binary', `${cliBin} (${formatBytes(statSync(cliBin).size)})`, results);
  } else {
    check(true, 'CLI binary', `running via bun: ${cliBin}`, results);
  }

  let mcpPath: string | undefined;
  try {
    mcpPath = await resolveDefaultMcpPath();
  } catch {
    // not available
  }
  if (mcpPath) {
    check(existsSync(mcpPath), 'MCP server', mcpPath, results);
  } else {
    check(false, 'MCP server', 'Could not resolve path (set JOHTO_MCP_SERVER_PATH)', results);
  }

  const dbPath = await resolveDbPath();
  if (dbPath) {
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const cardCount = (db.query('SELECT COUNT(*) as c FROM pokemon_cards').get() as { c: number }).c;
        const setCount = (db.query('SELECT COUNT(*) as c FROM pokemon_card_sets').get() as { c: number }).c;
        db.close();
        check(true, 'Card database', `${dbPath} (${cardCount} cards, ${setCount} sets)`, results);
      } catch (err) {
        check(false, 'Card database', `${dbPath} (query error: ${err})`, results);
      }
    } else {
      check(false, 'Card database', `${dbPath} (file not found)`, results);
    }
  } else {
    warn('Card database', 'JOHTO_DB_PATH not set — MCP server will use its default');
  }

  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    check(
      true,
      'Config file',
      `${configPath} (modified: ${statSync(configPath).mtime.toISOString()})`,
      results
    );
  } else {
    warn('Config file', `${configPath} (not found — run johto init)`);
  }

  // Only the *active* provider is diagnosed. Checking every provider would
  // report a broken install to anyone who has deliberately configured one.
  const config = await loadConfig();
  try {
    await checkProvider(resolveProviderName(undefined, config), config, results);
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      check(false, 'Provider', err.message, results);
    } else {
      throw err;
    }
  }

  console.log('');
  if (results.some((r) => !r)) process.exit(1);
}
