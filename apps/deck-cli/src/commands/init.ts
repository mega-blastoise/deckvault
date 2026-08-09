import * as readline from 'node:readline/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { loadConfig, saveConfig, getConfigPath } from '../config/loader';
import { PROVIDER_DEFAULTS } from '../providers/defaults';
import { resolveBaseUrl } from '../providers/resolve';
import { isProviderName, PROVIDERS } from '../providers/types';
import type { ProviderName } from '../providers/types';
import type { JohtoConfig } from '../config/types';

async function validateAnthropicKey(key: string, model: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function validateOpenAiKey(key: string, baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeLocalEndpoint(baseUrl: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id);
  } catch {
    return null;
  }
}

export async function initCommand(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\nJohto CLI — First-run setup\n');

    const existing = await loadConfig();
    const currentProvider: ProviderName = existing.defaults?.provider ?? 'anthropic';

    console.log('Providers:');
    for (const p of PROVIDERS) {
      console.log(`  ${p.padEnd(10)} ${PROVIDER_DEFAULTS[p].label}`);
    }
    const providerInput = (
      await rl.question(`\nDefault provider [${currentProvider}]: `)
    ).trim();
    const provider: ProviderName =
      providerInput && isProviderName(providerInput) ? providerInput : currentProvider;

    const defaults = PROVIDER_DEFAULTS[provider];
    const existingSection = (existing[provider] ?? {}) as {
      api_key?: string;
      model?: string;
      base_url?: string;
    };

    // Only ask for what this provider actually needs.
    let apiKey = existingSection.api_key;
    let baseUrl = existingSection.base_url;
    let model = existingSection.model ?? defaults.model ?? undefined;

    if (defaults.apiKeyEnv) {
      if (process.env[defaults.apiKeyEnv]) {
        console.log(`\n${defaults.apiKeyEnv} is set in your environment — using it.`);
      } else {
        const prompt = apiKey
          ? `${provider} API key (blank to keep existing): `
          : `${provider} API key (blank to skip): `;
        const entered = (await rl.question(prompt)).trim();
        if (entered) {
          process.stdout.write('Validating... ');
          const valid =
            provider === 'anthropic'
              ? await validateAnthropicKey(entered, model ?? defaults.model!)
              : await validateOpenAiKey(entered, resolveBaseUrl(provider, existing));
          console.log(valid ? 'OK' : 'FAILED — key will not be saved.');
          if (valid) apiKey = entered;
        }
      }
    } else {
      const current = baseUrl ?? defaults.baseUrl!;
      const entered = (await rl.question(`${provider} base URL [${current}]: `)).trim();
      baseUrl = entered || current;

      process.stdout.write('Probing endpoint... ');
      const models = await probeLocalEndpoint(baseUrl);
      if (models === null) {
        console.log('unreachable.');
        console.log(`  → ${defaults.unreachableHint}`);
      } else {
        console.log(`OK (${models.length} model(s))`);
        if (models.length > 0) {
          console.log(`  available: ${models.slice(0, 8).join(', ')}${models.length > 8 ? ' …' : ''}`);
        }
        const entered2 = (await rl.question(`  model [${model ?? models[0] ?? ''}]: `)).trim();
        model = entered2 || model || models[0];
      }
    }

    const defaultDecksDir = join(homedir(), 'johto', 'decks');
    const currentDecksDir = existing.paths?.decks_dir ?? defaultDecksDir;
    const decksDirInput = (
      await rl.question(`\nDefault decks directory [${currentDecksDir}]: `)
    ).trim();
    const decksDir = decksDirInput || currentDecksDir;
    await mkdir(decksDir, { recursive: true });

    const config: JohtoConfig = {
      ...existing,
      [provider]: {
        ...existingSection,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(model ? { model } : {}),
        ...(baseUrl ? { base_url: baseUrl } : {})
      },
      paths: { ...existing.paths, decks_dir: decksDir },
      defaults: { provider }
    };

    await saveConfig(config);

    console.log(`\nConfig written to: ${getConfigPath()}`);
    console.log('\nNext steps:');
    console.log(`  1. Place .toml or .json deck files in ${decksDir}`);
    console.log('  2. Run: johto run --deck <path>');
    console.log('  3. Run: johto doctor      to verify your install\n');
  } finally {
    rl.close();
  }
}
