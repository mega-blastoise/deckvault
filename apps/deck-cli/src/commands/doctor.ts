import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';

import { resolveDefaultMcpPath } from '../args';
import { loadConfig, getConfigPath, resolveApiKey } from '../config/loader';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function check(
  ok: boolean,
  label: string,
  detail: string,
  results: boolean[]
): void {
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${label}  ${detail}`);
  results.push(ok);
}

function warn(label: string, detail: string): void {
  console.log(`⚠ ${label}  ${detail}`);
}

export async function doctorCommand(): Promise<void> {
  const results: boolean[] = [];

  console.log('\nJohto Doctor\n');

  // CLI binary
  const cliBin = process.argv[1] ?? '(unknown)';
  const cliExists = cliBin ? existsSync(cliBin) : false;
  if (cliExists) {
    const st = statSync(cliBin);
    check(true, 'CLI binary', `${cliBin} (${formatBytes(st.size)})`, results);
  } else {
    check(true, 'CLI binary', `running via bun: ${cliBin}`, results);
  }

  // MCP server binary
  let mcpPath: string | undefined;
  try {
    mcpPath = resolveDefaultMcpPath();
  } catch {
    // not available
  }
  if (mcpPath) {
    const mcpExists = existsSync(mcpPath);
    check(mcpExists, 'MCP server', mcpPath, results);
  } else {
    check(false, 'MCP server', 'Could not resolve path (set JOHTO_MCP_SERVER_PATH)', results);
  }

  // Card database
  const dbPath = process.env['JOHTO_DB_PATH'];
  if (dbPath) {
    const dbExists = existsSync(dbPath);
    if (dbExists) {
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

  // Config file
  const configPath = getConfigPath();
  const configExists = existsSync(configPath);
  if (configExists) {
    const st = statSync(configPath);
    check(true, 'Config file', `${configPath} (modified: ${st.mtime.toISOString()})`, results);
  } else {
    warn('Config file', `${configPath} (not found — run johto init)`);
  }

  // API key
  const apiKey = await resolveApiKey();
  if (apiKey) {
    const redacted = apiKey.slice(0, 7) + '***';
    check(true, 'Anthropic API key', redacted, results);
  } else {
    check(false, 'Anthropic API key', 'Not set (env or config)', results);
  }

  // Network check
  try {
    const start = performance.now();
    const res = await fetch('https://api.anthropic.com', { method: 'HEAD' });
    const latency = (performance.now() - start).toFixed(0);
    check(res.ok || res.status === 401, 'Network (api.anthropic.com)', `${latency}ms`, results);
  } catch (err) {
    check(false, 'Network (api.anthropic.com)', `unreachable: ${err}`, results);
  }

  console.log('');

  const hasFailure = results.some((r) => !r);
  if (hasFailure) {
    process.exit(1);
  }
}
