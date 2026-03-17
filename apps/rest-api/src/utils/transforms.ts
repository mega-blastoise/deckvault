import type { Pokemon } from '@pokemon/clients';
import { sqlite } from '@pokemon/database';
import type { CardRow, SetRow, Ability } from '../types';

// Reuse utilities from @pokemon/database
const { parseJSON, parseJSONArray } = sqlite;

/**
 * Transform a set row from the database to API format
 */
export function transformSetRow(row: SetRow): Pokemon.Set {
  return {
    id: row.id,
    name: row.name,
    series: row.series,
    printedTotal: row.printed_total || 0,
    total: row.total || 0,
    releaseDate: row.release_date || '',
    updatedAt: row.updated_at || '',
    ptcgoCode: row.ptcgo_code || undefined,
    legalities: parseJSON(row.legalities) || {},
    images: parseJSON(row.images) || { symbol: '', logo: '' }
  } as Pokemon.Set;
}

/**
 * Transform a card row from the database to API format
 * Note: This returns a card with minimal set information (just set_id)
 */
export function transformCardRow(row: CardRow): Pokemon.Card {
  return {
    id: row.id,
    name: row.name,
    supertype: row.supertype,
    subtypes: parseJSONArray<string>(row.subtypes),
    hp: row.hp?.toString() || '',
    types: parseJSONArray<string>(row.types),
    evolvesFrom: row.evolves_from || undefined,
    evolvesTo: parseJSONArray<string>(row.evolves_to),
    rules: parseJSONArray<string>(row.rules),
    abilities: parseJSONArray<Ability>(row.abilities),
    attacks: parseJSONArray<Pokemon.Attack>(row.attacks),
    weaknesses: parseJSONArray<Pokemon.Weakness>(row.weaknesses),
    resistances: parseJSONArray<Pokemon.Resistance>(row.weaknesses),
    retreatCost: parseJSONArray<string>(row.retreat_cost),
    convertedRetreatCost: row.converted_retreat_cost || 0,
    number: parseInt(row.number, 10) || 0,
    artist: row.artist || '',
    rarity: row.rarity || '',
    flavorText: row.flavor_text || undefined,
    nationalPokedexNumbers: parseJSONArray<string>(
      row.national_pokedex_numbers
    ),
    legalities: parseJSON(row.legalities) || { unlimited: '', expanded: '' },
    images: parseJSON(row.images) || { small: '', large: '' },
    tcgplayer: row.tcgplayer_url ? { url: row.tcgplayer_url } : undefined,
    cardmarket: row.cardmarket_url ? { url: row.cardmarket_url } : undefined,
    regulationMark: row.regulation_mark || undefined,
    set: { id: row.set_id } as Pokemon.Set
  } as Pokemon.Card;
}

/**
 * Transform a card row with full set information
 */
export function transformCardRowWithSet(
  cardRow: CardRow,
  setRow: SetRow
): Pokemon.Card {
  const card = transformCardRow(cardRow);
  card.set = transformSetRow(setRow);
  return card;
}
