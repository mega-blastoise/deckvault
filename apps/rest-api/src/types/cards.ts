import type { Pokemon } from '@pokemon/clients';

/**
 * Database row type for cards (with JSON fields as strings)
 */
export interface CardRow {
  id: string;
  name: string;
  supertype: string;
  subtypes: string;
  hp: number | null;
  types: string;
  evolves_from: string | null;
  evolves_to: string | null;
  rules: string | null;
  abilities: string | null;
  attacks: string | null;
  weaknesses: string | null;
  retreat_cost: string | null;
  converted_retreat_cost: number | null;
  set_id: string;
  number: string;
  artist: string | null;
  rarity: string | null;
  flavor_text: string | null;
  national_pokedex_numbers: string | null;
  legalities: string | null;
  images: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
  regulation_mark: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Ability type (not exported from @pokemon/clients)
 */
export interface Ability {
  name: string;
  text: string;
  type: string;
}

/**
 * Re-export Pokemon types for convenience
 */
export type Card = Pokemon.Card;
export type Attack = Pokemon.Attack;
export type Weakness = Pokemon.Weakness;
export type Resistance = Pokemon.Resistance;
