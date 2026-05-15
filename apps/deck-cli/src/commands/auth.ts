import { loadConfig, saveConfig, resolveApiKey, getConfigPath } from '../config/loader';

export const authCommand = {
  async set(provider: string, key: string): Promise<void> {
    if (provider !== 'anthropic') {
      console.error(`Error: Unknown provider "${provider}". Only "anthropic" is supported.`);
      process.exit(1);
    }

    const config = await loadConfig();
    await saveConfig({
      ...config,
      anthropic: {
        ...config.anthropic,
        api_key: key,
      },
    });

    const redacted = key.slice(0, 7) + '***';
    console.log(`API key saved: ${redacted}`);
    console.log(`Config: ${getConfigPath()}`);
  },

  async show(): Promise<void> {
    const config = await loadConfig();
    const apiKey = await resolveApiKey();

    console.log(`Config: ${getConfigPath()}\n`);

    if (apiKey) {
      const source = process.env['ANTHROPIC_API_KEY'] ? 'env' : 'config';
      const redacted = apiKey.slice(0, 7) + '***';
      console.log(`  Anthropic API key: ${redacted} (source: ${source})`);
    } else {
      console.log('  Anthropic API key: (not set)');
    }

    console.log(`  Model: ${config.anthropic?.model ?? '(default)'}`);
    console.log(`  Provider: ${config.defaults?.provider ?? '(default: anthropic)'}`);
    console.log(`  Decks dir: ${config.paths?.decks_dir ?? '(not set)'}`);
    console.log(`  Card data: ${config.paths?.card_data ?? '(not set)'}`);
  },
};
