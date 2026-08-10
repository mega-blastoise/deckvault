import type { ProviderName } from './types';

export interface ProviderDefaults {
  readonly label: string;
  readonly baseUrl: string | null;
  readonly model: string | null;
  readonly maxTokens: number;
  readonly apiKeyEnv: string | null;
  /** Local endpoints accept any token; the SDK still requires a non-empty one. */
  readonly placeholderKey: string | null;
  readonly unreachableHint: string;
}

export const PROVIDER_DEFAULTS: Record<ProviderName, ProviderDefaults> = {
  anthropic: {
    label: 'Anthropic API',
    baseUrl: null,
    model: 'claude-sonnet-5',
    // max_tokens caps thinking *and* response text together, so adaptive
    // thinking needs far more headroom than a text-only budget.
    maxTokens: 64000,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    placeholderKey: null,
    unreachableHint: 'Check network connectivity, then run `johto doctor`.'
  },
  openai: {
    label: 'OpenAI API',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-terra',
    maxTokens: 32000,
    apiKeyEnv: 'OPENAI_API_KEY',
    placeholderKey: null,
    unreachableHint: 'Check network connectivity, then run `johto doctor`.'
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    // Deliberately unset: the installed library is machine-specific and only
    // some models support tools. resolveProvider lists the viable ones instead.
    model: null,
    maxTokens: 16000,
    apiKeyEnv: null,
    placeholderKey: 'ollama',
    unreachableHint:
      'Start Ollama, e.g. `docker start ollama`, or set [ollama] base_url in config.toml.'
  },
  llamacpp: {
    label: 'llama.cpp',
    baseUrl: 'http://localhost:9123/v1',
    // Auto-detected from /v1/models: llama-server hosts exactly one model.
    model: null,
    maxTokens: 16000,
    apiKeyEnv: null,
    placeholderKey: 'llamacpp',
    unreachableHint:
      'Start llama-server, e.g. `llama-server -m <model.gguf> --port 9123 --jinja`, ' +
      'or set [llamacpp] base_url in config.toml.'
  }
};
