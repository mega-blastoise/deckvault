import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'smol-toml';

import type { JohtoConfig } from './types';

function validateConfig(raw: unknown): JohtoConfig {
  if (typeof raw !== 'object' || raw === null) return {};
  const c = raw as Record<string, unknown>;

  const anthropic =
    typeof c['anthropic'] === 'object' && c['anthropic'] !== null
      ? (() => {
          const a = c['anthropic'] as Record<string, unknown>;
          return {
            api_key: typeof a['api_key'] === 'string' ? a['api_key'] : undefined,
            model: typeof a['model'] === 'string' ? a['model'] : undefined,
          };
        })()
      : undefined;

  const paths =
    typeof c['paths'] === 'object' && c['paths'] !== null
      ? (() => {
          const p = c['paths'] as Record<string, unknown>;
          return {
            decks_dir: typeof p['decks_dir'] === 'string' ? p['decks_dir'] : undefined,
            card_data: typeof p['card_data'] === 'string' ? p['card_data'] : undefined,
            mcp_server: typeof p['mcp_server'] === 'string' ? p['mcp_server'] : undefined,
          };
        })()
      : undefined;

  const defaults =
    typeof c['defaults'] === 'object' && c['defaults'] !== null
      ? (() => {
          const d = c['defaults'] as Record<string, unknown>;
          const provider =
            d['provider'] === 'anthropic' || d['provider'] === 'chrome'
              ? (d['provider'] as 'anthropic' | 'chrome')
              : undefined;
          return { provider };
        })()
      : undefined;

  return { anthropic, paths, defaults };
}

export function getConfigPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg ?? join(homedir(), '.config');
  return join(base, 'johto', 'config.toml');
}

export async function loadConfig(): Promise<JohtoConfig> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    return validateConfig(parse(raw));
  } catch {
    return {};
  }
}

export async function saveConfig(config: JohtoConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  const toml = stringify(config as Record<string, unknown>);
  await writeFile(path, toml, 'utf-8');
}

export async function resolveApiKey(): Promise<string | undefined> {
  const envKey = process.env['ANTHROPIC_API_KEY'];
  if (envKey) return envKey;

  const config = await loadConfig();
  return config.anthropic?.api_key;
}

export async function resolveDbPath(): Promise<string | undefined> {
  const envPath = process.env['JOHTO_DB_PATH'];
  if (envPath) return envPath;

  const config = await loadConfig();
  return config.paths?.card_data;
}

export async function resolveMcpServerPath(): Promise<string | undefined> {
  const envPath = process.env['JOHTO_MCP_SERVER_PATH'];
  if (envPath) return envPath;

  const config = await loadConfig();
  return config.paths?.mcp_server;
}
