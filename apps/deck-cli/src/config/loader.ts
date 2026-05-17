import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'smol-toml';
import * as z from 'zod/mini';

import { JohtoConfigurationSchema } from './types';
import type { JohtoConfig } from './types';
import { MalformedJohtoConfig } from './error';

function validateConfig(raw: unknown): JohtoConfig {
  const config = z.safeParse(JohtoConfigurationSchema, raw);
  if (config.success) {
    return config.data;
  }

  console.error(config.error);
  throw new MalformedJohtoConfig(config.error);
}

export function getConfigPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg ?? join(homedir(), '.config');
  return join(base, 'johto', 'config.toml');
}

export async function loadConfig(): Promise<JohtoConfig | null> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    return validateConfig(parse(raw));
  } catch {
    return null;
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
  return config?.anthropic?.api_key;
}

export async function resolveDbPath(): Promise<string | undefined> {
  const envPath = process.env['JOHTO_DB_PATH'];
  if (envPath) return envPath;

  const config = await loadConfig();
  return config?.paths?.card_data;
}

export async function resolveMcpServerPath(): Promise<string | undefined> {
  const envPath = process.env['JOHTO_MCP_SERVER_PATH'];
  if (envPath) return envPath;

  const config = await loadConfig();
  return config?.paths?.mcp_server;
}
