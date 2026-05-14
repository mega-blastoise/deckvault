import * as readline from 'node:readline/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { loadConfig, saveConfig, getConfigPath } from '../config/loader';
import type { JohtoConfig } from '../config/types';

async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function initCommand(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\nJohto CLI — First-run setup\n');

  const existing = await loadConfig();

  const keyPrompt = existing.anthropic?.api_key
    ? 'Anthropic API key (leave blank to keep existing): '
    : 'Anthropic API key (leave blank to skip): ';
  const apiKeyInput = (await rl.question(keyPrompt)).trim();

  let apiKey = existing.anthropic?.api_key;
  if (apiKeyInput) {
    process.stdout.write('Validating API key... ');
    const valid = await validateApiKey(apiKeyInput);
    if (valid) {
      console.log('OK');
      apiKey = apiKeyInput;
    } else {
      console.log('FAILED — key will not be saved.');
    }
  }

  const defaultDecksDir = join(homedir(), 'johto', 'decks');
  const currentDecksDir = existing.paths?.decks_dir ?? defaultDecksDir;
  const decksDirInput = (
    await rl.question(`Default decks directory [${currentDecksDir}]: `)
  ).trim();
  const decksDir = decksDirInput || currentDecksDir;
  await mkdir(decksDir, { recursive: true });

  const currentProvider = existing.defaults?.provider ?? 'anthropic';
  const providerInput = (
    await rl.question(`Default provider (anthropic | chrome) [${currentProvider}]: `)
  ).trim();
  const provider =
    providerInput === 'anthropic' || providerInput === 'chrome'
      ? providerInput
      : currentProvider;

  rl.close();

  const config: JohtoConfig = {
    anthropic: {
      api_key: apiKey,
      model: existing.anthropic?.model,
    },
    paths: {
      decks_dir: decksDir,
      card_data: existing.paths?.card_data,
    },
    defaults: {
      provider,
    },
  };

  await saveConfig(config);

  const configPath = getConfigPath();
  console.log(`\nConfig written to: ${configPath}`);
  console.log('\nNext steps:');
  console.log(`  1. Place .toml or .json deck files in ${decksDir}`);
  console.log('  2. Run: johto run --deck <path>');
  console.log('  3. Run: johto doctor      to verify your install\n');
}
