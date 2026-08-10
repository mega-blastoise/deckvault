import { z } from 'zod';

/**
 * The shape `load_deck` returns from the Rust MCP server.
 *
 * These schemas are the single source of truth: the TypeScript types below are
 * inferred from them, so there is no hand-maintained mirror that can drift from
 * what actually gets validated. The server sends more fields than the CLI uses
 * (artist, legalities, market URLs, and so on); Zod's default object behaviour
 * strips unknown keys, which keeps this a deliberate subset rather than a
 * contract that breaks every time the card model grows a field.
 *
 * Nullable scalars are `.nullish()` rather than `.nullable()` — serde emits an
 * explicit null today, but a future `skip_serializing_if` would omit the key
 * entirely, and that shouldn't be a parse failure.
 */

export const DeckCardEntrySchema = z.object({
  id: z.string(),
  quantity: z.number().int()
});

export const CardAttackSchema = z.object({
  name: z.string(),
  cost: z.array(z.string()).default([]),
  convertedEnergyCost: z.number().default(0),
  damage: z.string().default(''),
  text: z.string().nullish().default(null)
});

export const CardAbilitySchema = z.object({
  name: z.string(),
  text: z.string().nullish().default(null),
  type: z.string()
});

export const CardImagesSchema = z.object({
  small: z.string().nullish().default(null),
  large: z.string().nullish().default(null)
});

export const CardDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  supertype: z.string(),
  subtypes: z.array(z.string()).default([]),
  hp: z.number().nullish().default(null),
  types: z.array(z.string()).default([]),
  attacks: z.array(CardAttackSchema).default([]),
  abilities: z.array(CardAbilitySchema).default([]),
  regulationMark: z.string().nullish().default(null),
  setId: z.string(),
  number: z.string(),
  rarity: z.string().nullish().default(null),
  images: CardImagesSchema.nullish().default(null)
});

export const EnrichedDeckCardSchema = z.object({
  id: z.string(),
  quantity: z.number().int(),
  // An unresolved id is a real, expected state — the deck references a card the
  // database doesn't have — so this is null rather than a parse failure.
  card: CardDetailSchema.nullish().default(null)
});

export const EnrichedDeckSchema = z.object({
  name: z.string(),
  format: z.string(),
  regulationMarks: z.array(z.string()).default([]),
  totalCards: z.number().int(),
  cards: z.array(EnrichedDeckCardSchema).default([]),
  meta: z.record(z.string(), z.string()).nullish().default(null)
});

export type DeckCardEntry = z.infer<typeof DeckCardEntrySchema>;
export type CardAttack = z.infer<typeof CardAttackSchema>;
export type CardAbility = z.infer<typeof CardAbilitySchema>;
export type CardImages = z.infer<typeof CardImagesSchema>;
export type CardDetail = z.infer<typeof CardDetailSchema>;
export type EnrichedDeckCard = z.infer<typeof EnrichedDeckCardSchema>;
export type EnrichedDeck = z.infer<typeof EnrichedDeckSchema>;
