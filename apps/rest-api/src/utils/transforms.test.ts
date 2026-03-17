import { describe, it, expect } from 'bun:test';
import {
  transformSetRow,
  transformCardRow,
  transformCardRowWithSet
} from './transforms';
import type { CardRow, SetRow } from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function fullSetRow(): SetRow {
  return {
    id: 'base1',
    name: 'Base Set',
    series: 'Base',
    printed_total: 102,
    total: 102,
    legalities: '{"unlimited":"legal"}',
    ptcgo_code: 'BASE',
    release_date: '1999/01/09',
    updated_at: '2024-01-01T00:00:00.000Z',
    images:
      '{"symbol":"https://example.com/symbol.png","logo":"https://example.com/logo.png"}',
    created_at: '2024-01-01T00:00:00.000Z'
  };
}

function fullCardRow(): CardRow {
  return {
    id: 'base1-4',
    name: 'Charizard',
    supertype: 'Pokémon',
    subtypes: '["Stage 2"]',
    hp: 120,
    types: '["Fire"]',
    evolves_from: 'Charmeleon',
    evolves_to: null,
    rules: null,
    abilities: null,
    attacks:
      '[{"name":"Fire Spin","cost":["Fire","Fire","Fire"],"convertedEnergyCost":3,"damage":"80","text":""}]',
    weaknesses: '[{"type":"Water","value":"x2"}]',
    retreat_cost: '["Colorless","Colorless","Colorless"]',
    converted_retreat_cost: 3,
    set_id: 'base1',
    number: '4',
    artist: 'Mitsuhiro Arita',
    rarity: 'Rare Holo',
    flavor_text: 'It spits fire that is hot enough to melt boulders.',
    national_pokedex_numbers: '["6"]',
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/small.png","large":"https://example.com/large.png"}',
    tcgplayer_url: 'https://tcgplayer.com/card/123',
    cardmarket_url: 'https://cardmarket.com/card/456',
    regulation_mark: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  };
}

/** Trainer card: many nullable fields */
function trainerCardRow(): CardRow {
  return {
    id: 'gym1-64',
    name: 'Misty',
    supertype: 'Trainer',
    subtypes: '["Supporter"]',
    hp: null,
    types: '[]',
    evolves_from: null,
    evolves_to: null,
    rules: '["You may only have 4 Supporters in play at a time."]',
    abilities: null,
    attacks: null,
    weaknesses: null,
    retreat_cost: null,
    converted_retreat_cost: 0,
    set_id: 'gym1',
    number: '64',
    artist: 'Koichi Oyama',
    rarity: 'Uncommon',
    flavor_text: null,
    national_pokedex_numbers: null,
    legalities: '{"unlimited":"legal"}',
    images:
      '{"small":"https://example.com/misty-small.png","large":"https://example.com/misty-large.png"}',
    tcgplayer_url: null,
    cardmarket_url: null,
    regulation_mark: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  };
}

// ---------------------------------------------------------------------------
// transformSetRow
// ---------------------------------------------------------------------------

describe('transformSetRow', () => {
  it('maps all fields from a fully-populated row', () => {
    const set = transformSetRow(fullSetRow());
    expect(set.id).toBe('base1');
    expect(set.name).toBe('Base Set');
    expect(set.series).toBe('Base');
    expect(set.printedTotal).toBe(102);
    expect(set.total).toBe(102);
    expect(set.releaseDate).toBe('1999/01/09');
    expect(set.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(set.ptcgoCode).toBe('BASE');
    expect(set.legalities).toEqual({ unlimited: 'legal' });
    expect(set.images).toEqual({
      symbol: 'https://example.com/symbol.png',
      logo: 'https://example.com/logo.png'
    });
  });

  it('defaults printedTotal and total to 0 when null', () => {
    const row = fullSetRow();
    row.printed_total = null;
    row.total = null;
    const set = transformSetRow(row);
    expect(set.printedTotal).toBe(0);
    expect(set.total).toBe(0);
  });

  it('defaults releaseDate and updatedAt to empty string when null', () => {
    const row = fullSetRow();
    row.release_date = null;
    row.updated_at = null;
    const set = transformSetRow(row);
    expect(set.releaseDate).toBe('');
    expect(set.updatedAt).toBe('');
  });

  it('ptcgoCode is undefined when null', () => {
    const row = fullSetRow();
    row.ptcgo_code = null;
    const set = transformSetRow(row);
    expect(set.ptcgoCode).toBeUndefined();
  });

  it('legalities defaults to empty object when null', () => {
    const row = fullSetRow();
    row.legalities = null;
    const set = transformSetRow(row);
    expect(set.legalities).toEqual({});
  });

  it('images defaults to symbol/logo empty strings when null', () => {
    const row = fullSetRow();
    row.images = null;
    const set = transformSetRow(row);
    expect(set.images).toEqual({ symbol: '', logo: '' });
  });
});

// ---------------------------------------------------------------------------
// transformCardRow
// ---------------------------------------------------------------------------

describe('transformCardRow', () => {
  it('maps all fields from a fully-populated Pokémon row', () => {
    const card = transformCardRow(fullCardRow());

    expect(card.id).toBe('base1-4');
    expect(card.name).toBe('Charizard');
    expect(card.supertype).toBe('Pokémon');
    expect(card.subtypes).toEqual(['Stage 2']);
    expect(card.hp).toBe('120');
    expect(card.types).toEqual(['Fire']);
    expect(card.evolvesFrom).toBe('Charmeleon');
    expect(card.evolvesTo).toEqual([]);
    expect(card.rules).toEqual([]);
    expect(card.abilities).toEqual([]);
    expect(card.attacks).toEqual([
      {
        name: 'Fire Spin',
        cost: ['Fire', 'Fire', 'Fire'],
        convertedEnergyCost: 3,
        damage: '80',
        text: ''
      }
    ]);
    expect(card.weaknesses).toEqual([{ type: 'Water', value: 'x2' }]);
    expect(card.retreatCost).toEqual(['Colorless', 'Colorless', 'Colorless']);
    expect(card.convertedRetreatCost).toBe(3);
    expect(card.number).toBe(4);
    expect(card.artist).toBe('Mitsuhiro Arita');
    expect(card.rarity).toBe('Rare Holo');
    expect(card.flavorText).toBe(
      'It spits fire that is hot enough to melt boulders.'
    );
    expect(card.nationalPokedexNumbers).toEqual(['6']);
    expect(card.legalities).toEqual({ unlimited: 'legal' });
    expect(card.images).toEqual({
      small: 'https://example.com/small.png',
      large: 'https://example.com/large.png'
    });
    expect(card.tcgplayer).toEqual({ url: 'https://tcgplayer.com/card/123' });
    expect(card.cardmarket).toEqual({ url: 'https://cardmarket.com/card/456' });
    expect(card.set).toEqual({ id: 'base1' });
  });

  it('hp is empty string when null (Trainer cards)', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.hp).toBe('');
  });

  it('attacks is empty array when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.attacks).toEqual([]);
  });

  it('weaknesses is empty array when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.weaknesses).toEqual([]);
  });

  it('resistances mirrors weaknesses (known bug: sourced from row.weaknesses)', () => {
    // The current implementation populates resistances from row.weaknesses.
    // This is a pre-existing bug — there is no resistances column in the DB schema.
    // This test documents the actual behaviour.
    const card = transformCardRow(fullCardRow());
    expect(card.resistances).toEqual(card.weaknesses);
  });

  it('resistances is empty array when weaknesses is null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.resistances).toEqual([]);
  });

  it('retreatCost is empty array when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.retreatCost).toEqual([]);
  });

  it('convertedRetreatCost defaults to 0 when null', () => {
    const row = fullCardRow();
    row.converted_retreat_cost = null;
    const card = transformCardRow(row);
    expect(card.convertedRetreatCost).toBe(0);
  });

  it('evolvesFrom is undefined when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.evolvesFrom).toBeUndefined();
  });

  it('flavorText is undefined when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.flavorText).toBeUndefined();
  });

  it('tcgplayer is undefined when url is null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.tcgplayer).toBeUndefined();
  });

  it('cardmarket is undefined when url is null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.cardmarket).toBeUndefined();
  });

  it('rules is parsed from JSON array', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.rules).toEqual([
      'You may only have 4 Supporters in play at a time.'
    ]);
  });

  it('nationalPokedexNumbers is empty array when null', () => {
    const card = transformCardRow(trainerCardRow());
    expect(card.nationalPokedexNumbers).toEqual([]);
  });

  it('number is parsed as integer', () => {
    const row = fullCardRow();
    row.number = '035'; // leading zero
    const card = transformCardRow(row);
    expect(card.number).toBe(35);
  });

  it('number defaults to 0 for non-numeric string', () => {
    const row = fullCardRow();
    row.number = 'promo';
    const card = transformCardRow(row);
    expect(card.number).toBe(0);
  });

  it('artist defaults to empty string when null', () => {
    const row = fullCardRow();
    row.artist = null;
    const card = transformCardRow(row);
    expect(card.artist).toBe('');
  });

  it('rarity defaults to empty string when null', () => {
    const row = fullCardRow();
    row.rarity = null;
    const card = transformCardRow(row);
    expect(card.rarity).toBe('');
  });

  it('legalities defaults to fallback when null', () => {
    const row = fullCardRow();
    row.legalities = null;
    const card = transformCardRow(row);
    expect(card.legalities).toEqual({ unlimited: '', expanded: '' });
  });

  it('images defaults to fallback when null', () => {
    const row = fullCardRow();
    row.images = null;
    const card = transformCardRow(row);
    expect(card.images).toEqual({ small: '', large: '' });
  });

  it('set contains only the set_id stub', () => {
    const card = transformCardRow(fullCardRow());
    expect(card.set).toEqual({ id: 'base1' });
  });
});

// ---------------------------------------------------------------------------
// transformCardRowWithSet
// ---------------------------------------------------------------------------

describe('transformCardRowWithSet', () => {
  it('merges full set data into the card', () => {
    const card = transformCardRowWithSet(fullCardRow(), fullSetRow());

    // Card fields still correct
    expect(card.id).toBe('base1-4');
    expect(card.name).toBe('Charizard');

    // Set is fully populated (not just { id })
    expect(card.set.id).toBe('base1');
    expect(card.set.name).toBe('Base Set');
    expect(card.set.series).toBe('Base');
    expect(card.set.printedTotal).toBe(102);
    expect(card.set.images).toEqual({
      symbol: 'https://example.com/symbol.png',
      logo: 'https://example.com/logo.png'
    });
  });

  it('works with a trainer card and different set', () => {
    const gymSet: SetRow = {
      id: 'gym1',
      name: 'Gym Heroes',
      series: 'Gym',
      printed_total: 132,
      total: 132,
      legalities: '{"unlimited":"legal"}',
      ptcgo_code: 'GYM1',
      release_date: '1999/08/14',
      updated_at: '2024-01-01T00:00:00.000Z',
      images:
        '{"symbol":"https://example.com/gym1-symbol.png","logo":"https://example.com/gym1-logo.png"}',
      created_at: '2024-01-01T00:00:00.000Z'
    };

    const card = transformCardRowWithSet(trainerCardRow(), gymSet);
    expect(card.name).toBe('Misty');
    expect(card.set.name).toBe('Gym Heroes');
    expect(card.set.series).toBe('Gym');
  });
});
