import { describe, expect, it, beforeAll } from 'bun:test';
import {
  adaptCardRow,
  adaptPokemonRow,
  adaptTrainerRow,
  adaptEnergyRow,
  isStandardLegal,
  getLegalRegulationMarks,
  loadStandardCardPool,
  validateAceSpec,
  ROTATION_DATE,
  type SqliteCardRow
} from '../lib/adapter';
import type { PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition } from '../lib/types/card';

// Path is relative to CWD (packages/@engine/) when bun test runs.
const DB_PATH = '../../database/pokemon-data.sqlite3.db';

// --- Test fixtures (real card IDs from the DB) ---

const MIMIKYU_EX_ROW: SqliteCardRow = {
  id: 'svp-4',
  name: 'Mimikyu ex',
  supertype: 'Pokémon',
  subtypes: '["Basic","ex"]',
  hp: 190,
  types: '["Psychic"]',
  evolves_from: '[]',
  evolves_to: '[]',
  rules: '["Pokémon ex rule: When your Pokémon ex is Knocked Out, your opponent takes 2 Prize cards."]',
  abilities: '[]',
  attacks: '[{"name":"Void Return","cost":["Psychic"],"convertedEnergyCost":1,"damage":"30","text":"You may switch this Pokémon with 1 of your Benched Pokémon."},{"name":"Energy Burst","cost":["Psychic","Colorless","Colorless"],"convertedEnergyCost":3,"damage":"30×","text":"This attack does 30 damage for each Energy attached to both Active Pokémon."}]',
  weaknesses: '[{"type":"Metal","value":"×2"}]',
  retreat_cost: '["Colorless"]',
  converted_retreat_cost: 1,
  set_id: 'svp',
  regulation_mark: 'G',
  legalities: '{"unlimited":"Legal","standard":"Legal","expanded":"Legal"}'
};

const STADIUM_ROW: SqliteCardRow = {
  id: 'svp-45',
  name: 'Paradise Resort',
  supertype: 'Trainer',
  subtypes: '["Stadium"]',
  hp: -1,
  types: '[]',
  evolves_from: '[]',
  evolves_to: '[]',
  rules: '["The Retreat Cost of each Psyduck in play (both yours and your opponent\'s) is Colorless less.","You may play only 1 Stadium card during your turn."]',
  abilities: '[]',
  attacks: '[]',
  weaknesses: '[]',
  retreat_cost: '[]',
  converted_retreat_cost: 0,
  set_id: 'svp',
  regulation_mark: 'G',
  legalities: '{"unlimited":"Legal","standard":"Legal","expanded":"Legal"}'
};

const FIRE_ENERGY_ROW: SqliteCardRow = {
  id: 'base1-98',
  name: 'Fire Energy',
  supertype: 'Energy',
  subtypes: '["Basic"]',
  hp: -1,
  types: '[]',
  evolves_from: null,
  evolves_to: null,
  rules: '[]',
  abilities: null,
  attacks: null,
  weaknesses: null,
  retreat_cost: null,
  converted_retreat_cost: 0,
  set_id: 'base1',
  regulation_mark: null,
  legalities: '{"unlimited":"Legal","standard":"Legal","expanded":"Legal"}'
};

const RADIANT_ROW: SqliteCardRow = {
  id: 'swsh10-27',
  name: 'Radiant Heatran',
  supertype: 'Pokémon',
  subtypes: '["Basic","Radiant"]',
  hp: 130,
  types: '["Fire"]',
  evolves_from: '[]',
  evolves_to: '[]',
  rules: null,
  abilities: null,
  attacks: null,
  weaknesses: null,
  retreat_cost: '["Colorless","Colorless","Colorless"]',
  converted_retreat_cost: 3,
  set_id: 'swsh10',
  regulation_mark: 'F',
  legalities: '{"unlimited":"Legal","standard":"Legal","expanded":"Legal"}'
};

// --- Tests ---

describe('getLegalRegulationMarks', () => {
  it('returns G/H/I before rotation date', () => {
    const before = new Date('2026-01-01');
    expect(getLegalRegulationMarks(before)).toEqual(['G', 'H', 'I']);
  });

  it('returns H/I/J on rotation date', () => {
    expect(getLegalRegulationMarks(ROTATION_DATE)).toEqual(['H', 'I', 'J']);
  });

  it('returns H/I/J after rotation date', () => {
    const after = new Date('2027-01-01');
    expect(getLegalRegulationMarks(after)).toEqual(['H', 'I', 'J']);
  });
});

describe('isStandardLegal', () => {
  const preRotation = new Date('2026-01-01');

  it('accepts a standard-legal ex Pokemon (reg mark G)', () => {
    expect(isStandardLegal(MIMIKYU_EX_ROW, preRotation)).toBe(true);
  });

  it('accepts Basic Energy with null regulation mark', () => {
    expect(isStandardLegal(FIRE_ENERGY_ROW, preRotation)).toBe(true);
  });

  it('rejects Radiant Pokemon', () => {
    expect(isStandardLegal(RADIANT_ROW, preRotation)).toBe(false);
  });

  it('rejects cards with null regulation mark (non-Basic Energy)', () => {
    const noMark: SqliteCardRow = { ...MIMIKYU_EX_ROW, regulation_mark: null };
    expect(isStandardLegal(noMark, preRotation)).toBe(false);
  });

  it('rejects G-mark card after rotation', () => {
    const postRotation = new Date('2026-05-01');
    expect(isStandardLegal(MIMIKYU_EX_ROW, postRotation)).toBe(false);
  });

  it('rejects cards not Standard-legal per legalities field', () => {
    const expandedOnly: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      legalities: '{"unlimited":"Legal","expanded":"Legal"}'
    };
    expect(isStandardLegal(expandedOnly, preRotation)).toBe(false);
  });
});

describe('adaptPokemonRow', () => {
  it('adapts Mimikyu ex correctly', () => {
    const card = adaptPokemonRow(MIMIKYU_EX_ROW) as PokemonCardDefinition;
    expect(card.cardType).toBe('Pokemon');
    expect(card.id).toBe('svp-4');
    expect(card.name).toBe('Mimikyu ex');
    expect(card.stage).toBe('Basic');
    expect(card.subtypes).toContain('ex');
    expect(card.hp).toBe(190);
    expect(card.types).toContain('Psychic');
    expect(card.prizeValue).toBe(2);
    expect(card.retreatCost).toBe(1);
    expect(card.evolvesFrom).toBeNull();
  });

  it('normalizes × to x in weakness values', () => {
    const card = adaptPokemonRow(MIMIKYU_EX_ROW);
    expect(card.weaknesses[0]?.value).toBe('x2');
  });

  it('parses attack damage and modifier', () => {
    const card = adaptPokemonRow(MIMIKYU_EX_ROW);
    const burstAttack = card.attacks.find(a => a.name === 'Energy Burst');
    expect(burstAttack?.damage).toBe(30);
    expect(burstAttack?.damageModifier).toBe('x');
  });

  it('maps Stage 1 and Stage 2 correctly', () => {
    const stage1Row: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 1","ex"]'
    };
    const stage2Row: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 2","ex"]'
    };
    expect(adaptPokemonRow(stage1Row).stage).toBe('Stage1');
    expect(adaptPokemonRow(stage2Row).stage).toBe('Stage2');
  });

  it('sets prizeValue to 3 for Mega Evolution ex', () => {
    const megaRow: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 1","MEGA","ex"]'
    };
    expect(adaptPokemonRow(megaRow).prizeValue).toBe(3);
  });

  it('sets MegaEvolutionEx as subtype for MEGA cards', () => {
    const megaRow: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 1","MEGA","ex"]'
    };
    const card = adaptPokemonRow(megaRow);
    expect(card.subtypes).toContain('MegaEvolutionEx');
    expect(card.stage).toBe('Stage1');
  });

  it('does not include MegaEvolutionEx in PokemonStage', () => {
    const megaRow: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 2","MEGA","ex"]'
    };
    const card = adaptPokemonRow(megaRow);
    // Stage must be one of Basic/Stage1/Stage2 — never MegaEvolutionEx
    expect(['Basic', 'Stage1', 'Stage2']).toContain(card.stage);
  });

  it('parses evolvesFrom correctly', () => {
    const evolvesRow: SqliteCardRow = {
      ...MIMIKYU_EX_ROW,
      subtypes: '["Stage 1","ex"]',
      evolves_from: '"Pikachu"'
    };
    expect(adaptPokemonRow(evolvesRow).evolvesFrom).toBe('Pikachu');
  });
});

describe('adaptTrainerRow', () => {
  it('adapts Stadium card correctly', () => {
    const card = adaptTrainerRow(STADIUM_ROW) as TrainerCardDefinition;
    expect(card.cardType).toBe('Trainer');
    expect(card.id).toBe('svp-45');
    expect(card.subtypes).toContain('Stadium');
    expect(card.effectId).toBe('svp-45');
  });

  it('maps Pokémon Tool subtype', () => {
    const toolRow: SqliteCardRow = {
      ...STADIUM_ROW,
      subtypes: '["Pokémon Tool"]'
    };
    expect(adaptTrainerRow(toolRow).subtypes).toContain('PokemonTool');
  });

  it('maps ACE SPEC subtype from subtypes array', () => {
    const aceRow: SqliteCardRow = {
      ...STADIUM_ROW,
      subtypes: '["Item","ACE SPEC"]'
    };
    const card = adaptTrainerRow(aceRow);
    expect(card.subtypes).toContain('AceSpec');
    expect(card.subtypes).toContain('Item');
  });
});

describe('adaptEnergyRow', () => {
  it('adapts Basic Energy correctly', () => {
    const card = adaptEnergyRow(FIRE_ENERGY_ROW) as EnergyCardDefinition;
    expect(card.cardType).toBe('Energy');
    expect(card.subtype).toBe('Basic');
    expect(card.provides).toContain('Fire');
    expect(card.effectId).toBeNull();
    expect(card.isAceSpec).toBe(false);
  });

  it('detects ACE SPEC energy from rules text', () => {
    const aceEnergyRow: SqliteCardRow = {
      ...FIRE_ENERGY_ROW,
      id: 'sv-acespec-energy',
      name: 'Neo Upper Energy',
      subtypes: '["Special"]',
      rules: '["Attach Neo Upper Energy to 1 of your Pokémon...","You can\'t have more than 1 ACE SPEC card in your deck."]',
      regulation_mark: 'H'
    };
    const card = adaptEnergyRow(aceEnergyRow);
    expect(card.isAceSpec).toBe(true);
    expect(card.subtype).toBe('Special');
    expect(card.effectId).toBe('sv-acespec-energy');
  });
});

describe('adaptCardRow', () => {
  it('dispatches to adaptPokemonRow for Pokémon supertype', () => {
    const card = adaptCardRow(MIMIKYU_EX_ROW);
    expect(card.cardType).toBe('Pokemon');
  });

  it('dispatches to adaptTrainerRow for Trainer supertype', () => {
    const card = adaptCardRow(STADIUM_ROW);
    expect(card.cardType).toBe('Trainer');
  });

  it('dispatches to adaptEnergyRow for Energy supertype', () => {
    const card = adaptCardRow(FIRE_ENERGY_ROW);
    expect(card.cardType).toBe('Energy');
  });

  it('throws on unknown supertype', () => {
    const badRow: SqliteCardRow = { ...FIRE_ENERGY_ROW, supertype: 'Mystery' };
    expect(() => adaptCardRow(badRow)).toThrow();
  });
});

describe('validateAceSpec', () => {
  it('accepts a deck with zero ACE SPEC cards', () => {
    const result = validateAceSpec([adaptCardRow(MIMIKYU_EX_ROW), adaptCardRow(STADIUM_ROW)]);
    expect(result.valid).toBe(true);
  });

  it('accepts a deck with exactly 1 ACE SPEC Trainer', () => {
    const aceTrainerRow: SqliteCardRow = {
      ...STADIUM_ROW,
      id: 'sv-ace-1',
      subtypes: '["Item","ACE SPEC"]',
      rules: '["You can\'t have more than 1 ACE SPEC card in your deck."]'
    };
    const result = validateAceSpec([adaptCardRow(MIMIKYU_EX_ROW), adaptCardRow(aceTrainerRow)]);
    expect(result.valid).toBe(true);
  });

  it('rejects a deck with 2 ACE SPEC cards', () => {
    const ace1: SqliteCardRow = {
      ...STADIUM_ROW,
      id: 'sv-ace-1',
      subtypes: '["Item","ACE SPEC"]',
      rules: '["You can\'t have more than 1 ACE SPEC card in your deck."]'
    };
    const ace2: SqliteCardRow = {
      ...STADIUM_ROW,
      id: 'sv-ace-2',
      subtypes: '["Item","ACE SPEC"]',
      rules: '["You can\'t have more than 1 ACE SPEC card in your deck."]'
    };
    const result = validateAceSpec([adaptCardRow(ace1), adaptCardRow(ace2)]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('loadStandardCardPool', () => {
  let pool: ReadonlyMap<string, ReturnType<typeof adaptCardRow>>;

  beforeAll(() => {
    pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
  });

  it('loads more than 4000 standard-legal cards', () => {
    expect(pool.size).toBeGreaterThan(4000);
  });

  it('includes Mimikyu ex (G-mark)', () => {
    expect(pool.has('svp-4')).toBe(true);
  });

  it('includes Basic Energy (always legal)', () => {
    expect(pool.has('base1-98')).toBe(true);
  });

  it('excludes Radiant Pokemon', () => {
    expect(pool.has('swsh10-27')).toBe(false);
  });

  it('all cards have the correct cardType field', () => {
    pool.forEach(card => {
      expect(['Pokemon', 'Trainer', 'Energy']).toContain(card.cardType);
    });
  });
});
