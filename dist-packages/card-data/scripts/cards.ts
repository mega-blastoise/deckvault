import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

interface CardRecord {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;
  readonly subtypes?: string[];
  readonly hp?: string;
  readonly types?: string[];
  readonly evolvesFrom?: string;
  readonly evolvesTo?: string[];
  readonly rules?: string[];
  readonly abilities?: unknown[];
  readonly attacks?: unknown[];
  readonly weaknesses?: unknown[];
  readonly retreatCost?: string[];
  readonly convertedRetreatCost?: number;
  readonly set?: { readonly id: string };
  readonly number: string;
  readonly artist?: string;
  readonly rarity?: string;
  readonly flavorText?: string;
  readonly nationalPokedexNumbers?: number[];
  readonly legalities?: Record<string, string>;
  readonly images?: Record<string, string>;
  readonly tcgplayer?: { readonly url?: string };
  readonly cardmarket?: { readonly url?: string };
  readonly regulationMark?: string;
}

export async function insertCards(db: Database, sourceDir: string, verbose: boolean): Promise<number> {
  const cardsDir = join(sourceDir, 'cards');
  const setDirs = readdirSync(cardsDir).filter((d) => d.endsWith('.d'));

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pokemon_cards (
      id, name, supertype, subtypes, hp, types, evolves_from, evolves_to,
      rules, abilities, attacks, weaknesses, retreat_cost, converted_retreat_cost,
      set_id, number, artist, rarity, flavor_text, national_pokedex_numbers,
      legalities, images, tcgplayer_url, cardmarket_url, regulation_mark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const dir of setDirs) {
    const cardsPath = join(cardsDir, dir, 'cards.json');
    const file = Bun.file(cardsPath);
    if (!(await file.exists())) continue;

    const cardsData = (await file.json()) as { data: readonly CardRecord[] };

    for (const card of cardsData.data) {
      stmt.run(
        card.id,
        card.name,
        card.supertype,
        JSON.stringify(card.subtypes ?? []),
        card.hp ? parseInt(card.hp, 10) || null : null,
        JSON.stringify(card.types ?? []),
        JSON.stringify(card.evolvesFrom ?? []),
        JSON.stringify(card.evolvesTo ?? []),
        JSON.stringify(card.rules ?? []),
        JSON.stringify(card.abilities ?? []),
        JSON.stringify(card.attacks ?? []),
        JSON.stringify(card.weaknesses ?? []),
        JSON.stringify(card.retreatCost ?? []),
        card.convertedRetreatCost ?? 0,
        card.set?.id ?? '',
        card.number,
        card.artist ?? null,
        card.rarity ?? null,
        card.flavorText ?? null,
        JSON.stringify(card.nationalPokedexNumbers ?? null),
        JSON.stringify(card.legalities ?? {}),
        JSON.stringify(card.images ?? {}),
        card.tcgplayer?.url ?? null,
        card.cardmarket?.url ?? null,
        card.regulationMark ?? null
      );
      count++;
    }
    if (verbose) console.log(`  Set dir: ${dir} (${cardsData.data.length} cards)`);
  }

  return count;
}
