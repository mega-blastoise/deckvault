import { loadConfig, saveConfig, getConfigPath } from '../config/loader';
import { PROVIDER_DEFAULTS } from '../providers/defaults';
import { resolveApiKey, resolveBaseUrl, resolveProviderName } from '../providers/resolve';
import { isProviderName, PROVIDERS } from '../providers/types';
import type { ProviderName } from '../providers/types';

const CREDENTIALED: readonly ProviderName[] = ['anthropic', 'openai'];

export const authCommand = {
  async set(provider: string, key: string): Promise<void> {
    if (!isProviderName(provider)) {
      console.error(`Error: Unknown provider "${provider}". Valid options: ${PROVIDERS.join(', ')}`);
      process.exit(1);
    }
    if (!CREDENTIALED.includes(provider)) {
      console.error(
        `Error: "${provider}" is a local endpoint and takes no API key.\n` +
          `  → set its address instead: [${provider}] base_url = "..." in ${getConfigPath()}`
      );
      process.exit(1);
    }

    const config = await loadConfig();
    await saveConfig({
      ...config,
      [provider]: { ...(config[provider] ?? {}), api_key: key }
    });

    console.log(`API key saved for ${provider}: ${key.slice(0, 7)}***`);
    console.log(`Config: ${getConfigPath()}`);
  },

  async show(): Promise<void> {
    const config = await loadConfig();
    const active = resolveProviderName(undefined, config);

    console.log(`Config: ${getConfigPath()}\n`);
    console.log(`  Active provider: ${active}${config.defaults?.provider ? '' : ' (default)'}\n`);

    for (const provider of PROVIDERS) {
      const defaults = PROVIDER_DEFAULTS[provider];
      const conf = (config[provider] ?? {}) as { model?: string };
      const marker = provider === active ? '*' : ' ';
      console.log(` ${marker} ${provider}`);
      console.log(`      model:    ${conf.model ?? defaults.model ?? '(not set)'}`);

      if (defaults.apiKeyEnv) {
        const key = resolveApiKey(provider, config);
        const source = process.env[defaults.apiKeyEnv] ? 'env' : 'config';
        console.log(`      key:      ${key ? `${key.slice(0, 7)}*** (${source})` : '(not set)'}`);
      } else {
        console.log(`      key:      not required`);
        console.log(`      endpoint: ${resolveBaseUrl(provider, config)}`);
      }
    }

    console.log(`\n  Decks dir:  ${config.paths?.decks_dir ?? '(not set)'}`);
    console.log(`  Card data:  ${config.paths?.card_data ?? '(not set)'}`);
    console.log(`  MCP server: ${config.paths?.mcp_server ?? '(not set)'}`);
  }
};
