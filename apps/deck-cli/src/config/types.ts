import * as z from 'zod/mini';

export const AnthropicConfigurationSchema = z.readonly(
  z.object({
    api_key: z.optional(z.string()),
    model: z.optional(z.string())
  })
);

export type AnthropicConfiguration = z.infer<
  typeof AnthropicConfigurationSchema
>;

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
    provider: z.optional(z.enum(['anthropic', 'chrome']))
  })
);

export type ProviderDefaultsConfiguration = z.infer<
  typeof ProviderDefaultsConfigurationSchema
>;

export const JohtoConfigurationSchema = z.readonly(
  z.object({
    anthropic: z.optional(AnthropicConfigurationSchema),
    paths: z.optional(PathsConfigurationSchema),
    defaults: z.optional(ProviderDefaultsConfigurationSchema)
  })
);

export type JohtoConfig = z.infer<typeof JohtoConfigurationSchema>;
