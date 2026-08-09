import { loadConfig } from '../config/loader';
import type { JohtoConfig } from '../config/types';
import { PROVIDER_DEFAULTS } from './defaults';
import { createAnthropicProvider } from './anthropic';
import { createOpenAiCompatProvider } from './openai-compat';
import type { Provider, ProviderName } from './types';
import { isProviderName, PROVIDERS, ProviderUnreachableError } from './types';

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

interface ProviderSection {
  readonly api_key?: string;
  readonly model?: string;
  readonly base_url?: string;
  readonly max_tokens?: number;
  readonly effort?: string;
}

function section(config: JohtoConfig, provider: ProviderName): ProviderSection {
  return (config[provider] ?? {}) as ProviderSection;
}

export function resolveProviderName(flag: string | undefined, config: JohtoConfig): ProviderName {
  if (flag !== undefined) {
    if (flag === 'chrome') {
      throw new ProviderConfigError(
        '`--provider chrome` has been removed. Use `--browser` to start browser mode:\n' +
          '  johto run --browser [--deck <path>]'
      );
    }
    if (!isProviderName(flag)) {
      throw new ProviderConfigError(
        `Unknown provider "${flag}". Valid options: ${PROVIDERS.join(', ')}`
      );
    }
    return flag;
  }
  return config.defaults?.provider ?? 'anthropic';
}

export function resolveApiKey(provider: ProviderName, config: JohtoConfig): string | undefined {
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults.apiKeyEnv) {
    const fromEnv = process.env[defaults.apiKeyEnv];
    if (fromEnv) return fromEnv;
  }
  return section(config, provider).api_key;
}

export function resolveBaseUrl(
  provider: ProviderName,
  config: JohtoConfig,
  flag?: string
): string {
  const resolved = flag ?? section(config, provider).base_url ?? PROVIDER_DEFAULTS[provider].baseUrl;
  if (!resolved) {
    throw new ProviderConfigError(`No base URL configured for provider "${provider}".`);
  }
  return resolved;
}

/** Ollama exposes capabilities on its native API, one level above the /v1 shim. */
function nativeRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

async function listToolCapableOllamaModels(baseUrl: string): Promise<string[]> {
  const root = nativeRoot(baseUrl);
  const res = await fetch(`${root}/api/tags`);
  const body = (await res.json()) as { models?: { name: string }[] };
  const names = (body.models ?? []).map((m) => m.name);

  const capable = await Promise.all(
    names.map(async (name) => {
      try {
        const show = await fetch(`${root}/api/show`, {
          method: 'POST',
          body: JSON.stringify({ model: name })
        });
        const detail = (await show.json()) as { capabilities?: string[] };
        return detail.capabilities?.includes('tools') ? name : null;
      } catch {
        return null;
      }
    })
  );
  return capable.filter((n): n is string => n !== null);
}

async function detectLlamaCppModel(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/models`);
  const body = (await res.json()) as { data?: { id: string }[] };
  const first = body.data?.[0]?.id;
  if (!first) {
    throw new ProviderConfigError(
      `llama.cpp at ${baseUrl} reported no loaded model. Start llama-server with -m <model.gguf>.`
    );
  }
  return first;
}

async function resolveModel(
  provider: ProviderName,
  config: JohtoConfig,
  baseUrl: string,
  flag?: string
): Promise<string> {
  const configured = flag ?? section(config, provider).model ?? PROVIDER_DEFAULTS[provider].model;
  if (configured) return configured;

  if (provider === 'llamacpp') {
    try {
      return await detectLlamaCppModel(baseUrl);
    } catch (err) {
      if (err instanceof ProviderConfigError) throw err;
      throw new ProviderUnreachableError(
        provider,
        baseUrl,
        PROVIDER_DEFAULTS[provider].unreachableHint,
        err
      );
    }
  }

  // Ollama: no shipped default, so turn the missing value into a menu of the
  // models on this machine that can actually call tools.
  let capable: string[];
  try {
    capable = await listToolCapableOllamaModels(baseUrl);
  } catch (err) {
    throw new ProviderUnreachableError(
      provider,
      baseUrl,
      PROVIDER_DEFAULTS[provider].unreachableHint,
      err
    );
  }

  if (capable.length === 0) {
    throw new ProviderConfigError(
      `No tool-capable models are installed in Ollama at ${baseUrl}.\n` +
        '  → Pull one, e.g. `ollama pull qwen3-coder:30b`, then re-run with --model <name>.'
    );
  }

  throw new ProviderConfigError(
    'Provider "ollama" has no default model — pick one explicitly.\n' +
      `  → johto run --provider ollama --model <name>\n` +
      '  → or set [ollama] model = "<name>" in ~/.config/johto/config.toml\n\n' +
      `  Tool-capable models installed at ${baseUrl}:\n` +
      capable.map((n) => `    ${n}`).join('\n')
  );
}

export interface ResolveProviderOptions {
  readonly provider?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export async function resolveProvider(options: ResolveProviderOptions): Promise<Provider> {
  const config = await loadConfig();
  const name = resolveProviderName(options.provider, config);
  const defaults = PROVIDER_DEFAULTS[name];
  const conf = section(config, name);
  const maxTokens = conf.max_tokens ?? defaults.maxTokens;

  if (name === 'anthropic') {
    const apiKey = resolveApiKey(name, config);
    if (!apiKey) {
      throw new ProviderConfigError(
        'No Anthropic API key found.\n' +
          '  → export ANTHROPIC_API_KEY=sk-ant-...\n' +
          '  → or run `johto auth set anthropic <key>`'
      );
    }
    return createAnthropicProvider({
      apiKey,
      model: options.model ?? conf.model ?? defaults.model!,
      effort: conf.effort ?? 'high',
      maxTokens
    });
  }

  const baseUrl = resolveBaseUrl(name, config, options.baseUrl);
  const model = await resolveModel(name, config, baseUrl, options.model);

  let apiKey = resolveApiKey(name, config) ?? defaults.placeholderKey ?? '';
  if (name === 'openai' && !apiKey) {
    throw new ProviderConfigError(
      'No OpenAI API key found.\n' +
        '  → export OPENAI_API_KEY=sk-...\n' +
        '  → or run `johto auth set openai <key>`'
    );
  }

  return createOpenAiCompatProvider({
    provider: name,
    baseUrl,
    apiKey,
    model,
    maxTokens,
    unreachableHint: defaults.unreachableHint
  });
}
