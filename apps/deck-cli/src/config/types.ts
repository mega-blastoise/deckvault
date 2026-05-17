import * as z from 'zod/mini';

export const AnthropicConfigurationSchema = z.readonly(
  z.object({
    api_key: z.string(),
    model: z.string()
  })
);

export type AnthropicConfiguration = z.infer<
  typeof AnthropicConfigurationSchema
>;

export const PathsConfigurationSchema = z.readonly(
  z.object({
    decks_dir: z.string(),
    card_data: z.string(),
    mcp_server: z.string()
  })
);

export type PathsConfiguration = z.infer<typeof PathsConfigurationSchema>;

export const ProviderDefaultsConfigurationSchema = z.readonly(
  z.object({
    provider: z.enum(['anthropic', 'chrome'])
  })
);

export type ProviderDefaultsConfiguration = z.infer<
  typeof PathsConfigurationSchema
>;

export const JohtoConfigurationSchema = z.readonly(
  z.object({
    anthropic: AnthropicConfigurationSchema,
    paths: PathsConfigurationSchema,
    defaults: PathsConfigurationSchema
  })
);

export type JohtoConfig = z.infer<typeof JohtoConfigurationSchema>;
