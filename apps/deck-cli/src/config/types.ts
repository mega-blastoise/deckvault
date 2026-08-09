import * as z from 'zod/mini';

import { PROVIDERS } from '../providers/types';

export const AnthropicConfigurationSchema = z.readonly(
  z.object({
    api_key: z.optional(z.string()),
    model: z.optional(z.string()),
    effort: z.optional(z.enum(['low', 'medium', 'high', 'xhigh', 'max'])),
    max_tokens: z.optional(z.number())
  })
);

export type AnthropicConfiguration = z.infer<typeof AnthropicConfigurationSchema>;

export const OpenAiConfigurationSchema = z.readonly(
  z.object({
    api_key: z.optional(z.string()),
    model: z.optional(z.string()),
    base_url: z.optional(z.string()),
    max_tokens: z.optional(z.number())
  })
);

export type OpenAiConfiguration = z.infer<typeof OpenAiConfigurationSchema>;

export const LocalProviderConfigurationSchema = z.readonly(
  z.object({
    base_url: z.optional(z.string()),
    model: z.optional(z.string()),
    max_tokens: z.optional(z.number())
  })
);

export type LocalProviderConfiguration = z.infer<typeof LocalProviderConfigurationSchema>;

export const PathsConfigurationSchema = z.readonly(
  z.object({
    decks_dir: z.optional(z.string()),
    card_data: z.optional(z.string()),
    mcp_server: z.optional(z.string())
  })
);

export type PathsConfiguration = z.infer<typeof PathsConfigurationSchema>;

export const ProviderDefaultsConfigurationSchema = z.readonly(
  z.object({
    provider: z.optional(z.enum(PROVIDERS))
  })
);

export type ProviderDefaultsConfiguration = z.infer<
  typeof ProviderDefaultsConfigurationSchema
>;

export const JohtoConfigurationSchema = z.readonly(
  z.object({
    anthropic: z.optional(AnthropicConfigurationSchema),
    openai: z.optional(OpenAiConfigurationSchema),
    ollama: z.optional(LocalProviderConfigurationSchema),
    llamacpp: z.optional(LocalProviderConfigurationSchema),
    paths: z.optional(PathsConfigurationSchema),
    defaults: z.optional(ProviderDefaultsConfigurationSchema)
  })
);

export type JohtoConfig = z.infer<typeof JohtoConfigurationSchema>;
