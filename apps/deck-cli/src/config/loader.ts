import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'smol-toml';

import type { JohtoConfig } from './types';

export function getConfigPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg ?? join(homedir(), '.config');
  return join(base, 'johto', 'config.toml');
}

export async function loadConfig(): Promise<JohtoConfig> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    return parse(raw) as unknown as JohtoConfig;
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
