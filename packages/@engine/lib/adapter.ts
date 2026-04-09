import { Database } from 'bun:sqlite';
import type {
  CardDefinition,
  PokemonCardDefinition,
  TrainerCardDefinition,
  EnergyCardDefinition,
  PokemonStage,
  PokemonSubtype,
  TrainerSubtype,
  EnergyType,
  AttackDefinition,
  AbilityDefinition,
  WeaknessDefinition
} from './types/card';
import { ENERGY_TYPES } from './types/card';
import {
  ROTATION_DATE,
  PRE_ROTATION_MARKS,
  POST_ROTATION_MARKS,
  getLegalRegulationMarks
} from './adapter-format';

export { ROTATION_DATE, PRE_ROTATION_MARKS, POST_ROTATION_MARKS, getLegalRegulationMarks };

// Raw row shape from the pokemon_cards SQLite table.
// JSON columns are stored as stringified arrays/objects.
// Note: the schema does not have a `resistances` column — defaults to [].
export interface SqliteCardRow {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;
  readonly subtypes: string;
  readonly hp: number | null;
  readonly types: string;
  readonly evolves_from: string | null;
  readonly evolves_to: string | null;
  readonly rules: string | null;
  readonly abilities: string | null;
  readonly attacks: string | null;
  readonly weaknesses: string | null;
  readonly retreat_cost: string | null;
  readonly converted_retreat_cost: number | null;
  readonly set_id: string;
  readonly regulation_mark: string | null;
  readonly legalities: string | null;
}

export function isStandardLegal(row: SqliteCardRow, formatDate: Date): boolean {
  const subtypes = safeParseArray<string>(row.subtypes);

  // Basic Energy is always legal regardless of regulation mark.
  if (row.supertype === 'Energy' && subtypes.includes('Basic')) return true;

  // Radiant Pokemon are never Standard-legal.
  if (subtypes.includes('Radiant')) return false;

  // Must have a regulation mark in the current legal set.
  if (!row.regulation_mark) return false;
  const legalMarks = getLegalRegulationMarks(formatDate);
  if (!(legalMarks as ReadonlyArray<string>).includes(row.regulation_mark)) return false;

  // Must be Standard-legal per the card's legalities JSON.
  const legalities = safeParseObj<Record<string, string>>(row.legalities);
  return legalities?.['standard'] === 'Legal';
}

// --- JSON parse helpers ---

function safeParseArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function safeParseObj<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// evolves_from is stored as a JSON-encoded string or empty array.
// e.g. '"Kadabra"' → 'Kadabra', '[]' → null, null → null
function parseEvolvesFrom(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string' && parsed.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

// --- Damage string parsing ---
// "120+" → { damage: 120, damageModifier: '+' }
// "30x"  → { damage: 30,  damageModifier: 'x' }
// "80-"  → { damage: 80,  damageModifier: '-' }
// "50"   → { damage: 50,  damageModifier: null }
// ""     → { damage: 0,   damageModifier: null }
function parseDamage(raw: string): { damage: number; damageModifier: '+' | '-' | 'x' | null } {
  if (!raw) return { damage: 0, damageModifier: null };
  const modifier = raw[raw.length - 1];
  if (modifier === '+' || modifier === '-' || modifier === 'x' || modifier === '×') {
    const effectiveModifier = modifier === '×' ? 'x' : modifier;
    return {
      damage: parseInt(raw.slice(0, -1), 10) || 0,
      damageModifier: effectiveModifier as '+' | '-' | 'x'
    };
  }
  return { damage: parseInt(raw, 10) || 0, damageModifier: null };
}

// Normalize "×2" (U+00D7) to "x2" (ASCII) in weakness/resistance values.
function normalizeMultiplicationSign(value: string): string {
  return value.replace(/×/g, 'x');
}

// Filter to valid EnergyType values only.
function toEnergyType(value: string): EnergyType | null {
  return (ENERGY_TYPES as ReadonlyArray<string>).includes(value)
    ? (value as EnergyType)
    : null;
}

function parseEnergyTypeArray(raw: string | null): ReadonlyArray<EnergyType> {
  return safeParseArray<string>(raw)
    .map(toEnergyType)
    .filter((t): t is EnergyType => t !== null);
}

// --- Stage mapping ---

const STAGE_MAP: Readonly<Record<string, PokemonStage>> = {
  'Basic': 'Basic',
  'Stage 1': 'Stage1',
  'Stage 2': 'Stage2'
};

function parsePokemonStage(subtypes: ReadonlyArray<string>): PokemonStage {
  for (const s of subtypes) {
    const mapped = STAGE_MAP[s];
    if (mapped) return mapped;
  }
  return 'Basic';
}

// --- Subtype mapping ---

const POKEMON_SUBTYPE_MAP: Readonly<Record<string, PokemonSubtype>> = {
  'ex': 'ex',
  'MEGA': 'MegaEvolutionEx',
  'Tera': 'Tera',
  'Ancient': 'Ancient',
  'Future': 'Future'
};

const TRAINER_SUBTYPE_MAP: Readonly<Record<string, TrainerSubtype>> = {
  'Item': 'Item',
  'Supporter': 'Supporter',
  'Stadium': 'Stadium',
  'Pokémon Tool': 'PokemonTool',
  'Technical Machine': 'TechnicalMachine',
  'ACE SPEC': 'AceSpec'
};

// --- Prize value ---
// 3 for Mega Evolution ex, 2 for ex, 1 for everything else.
function derivePrizeValue(subtypes: ReadonlyArray<string>): 1 | 2 | 3 {
  if (subtypes.includes('MEGA') && subtypes.includes('ex')) return 3;
  if (subtypes.includes('ex')) return 2;
  return 1;
}

// Passive (continuous modifier) ability names — never offered as player actions.
const PASSIVE_ABILITY_NAMES: ReadonlySet<string> = new Set([
  'Seasoned Skill',   // Bloodmoon Ursaluna ex: attacks cost [C] less per opponent prize taken
  'Skyliner',         // Latias ex: Basic Pokemon have no retreat cost
  'Diamond Coat',     // Duraludon ex: takes 30 less damage
  'Oceanic Curse',    // Wo-Chien ex: while Active, opponent can't play Items/Tools
  'Damp',             // Politoed: Pokemon lose self-KO abilities
  'Festival Lead',    // Alcremie ex: if Festival Grounds in play, attack twice
  'Fairy Zone'        // Sylveon ex: opponent's Dragon weakness becomes Psychic
]);

// Triggered ability names — fire automatically on game events, never a main-phase action.
const TRIGGERED_ABILITY_NAMES: ReadonlySet<string> = new Set([
  'Flying Entry',     // Pidgeot ex: when played from hand to Bench
  'Punk Up',          // Toxtricity: when evolved
  'Battle-Hardened',  // Garchomp ex: when played from hand to Bench
  'Freezing Shroud'   // Frosmoth: during Pokemon Checkup
]);

// --- Per-supertype adapters ---

interface RawAttack {
  name?: string;
  cost?: string[];
  damage?: string;
  text?: string;
}

interface RawAbility {
  name?: string;
  text?: string;
  type?: string;
}

interface RawWeakness {
  type?: string;
  value?: string;
}

export function adaptPokemonRow(row: SqliteCardRow): PokemonCardDefinition {
  const rawSubtypes = safeParseArray<string>(row.subtypes);
  const stage = parsePokemonStage(rawSubtypes);
  const subtypes = rawSubtypes
    .map(s => POKEMON_SUBTYPE_MAP[s])
    .filter((s): s is PokemonSubtype => s !== undefined);

  const rawAttacks = safeParseArray<RawAttack>(row.attacks);
  const attacks: AttackDefinition[] = rawAttacks.map(a => {
    const { damage, damageModifier } = parseDamage(a.damage ?? '');
    const cost = (a.cost ?? [])
      .map(toEnergyType)
      .filter((t): t is EnergyType => t !== null);
    const effectId = damage === 0 && !damageModifier && !a.text
      ? null
      : a.text
        ? `${row.id}:attack:${a.name ?? ''}`
        : null;
    return {
      name: a.name ?? '',
      cost,
      damage,
      damageModifier,
      text: a.text ?? '',
      effectId
    };
  });

  const rawAbilities = safeParseArray<RawAbility>(row.abilities);
  const abilities: AbilityDefinition[] = rawAbilities
    .filter(a => a.type === 'Ability')
    .map(a => ({
      name: a.name ?? '',
      text: a.text ?? '',
      type: 'Ability' as const,
      category: PASSIVE_ABILITY_NAMES.has(a.name ?? '') ? 'passive' as const
               : TRIGGERED_ABILITY_NAMES.has(a.name ?? '') ? 'triggered' as const
               : 'activated' as const,
      effectId: `${row.id}:ability:${a.name ?? ''}`
    }));

  const weaknesses: WeaknessDefinition[] = safeParseArray<RawWeakness>(row.weaknesses)
    .map(w => ({
      type: (w.type ?? '') as EnergyType,
      value: normalizeMultiplicationSign(w.value ?? '')
    }))
    .filter(w => toEnergyType(w.type) !== null);

  const retreatCost = safeParseArray<string>(row.retreat_cost).length;

  return {
    cardType: 'Pokemon',
    id: row.id,
    name: row.name,
    stage,
    subtypes,
    hp: row.hp ?? 0,
    types: parseEnergyTypeArray(row.types),
    evolvesFrom: parseEvolvesFrom(row.evolves_from),
    attacks,
    abilities,
    weaknesses,
    resistances: [],
    retreatCost,
    rules: safeParseArray<string>(row.rules),
    prizeValue: derivePrizeValue(rawSubtypes),
    regulationMark: row.regulation_mark ?? null
  };
}

export function adaptTrainerRow(row: SqliteCardRow): TrainerCardDefinition {
  const rawSubtypes = safeParseArray<string>(row.subtypes);
  const subtypes = rawSubtypes
    .map(s => TRAINER_SUBTYPE_MAP[s])
    .filter((s): s is TrainerSubtype => s !== undefined);

  return {
    cardType: 'Trainer',
    id: row.id,
    name: row.name,
    subtypes,
    rules: safeParseArray<string>(row.rules),
    effectId: row.id
  };
}

export function adaptEnergyRow(row: SqliteCardRow): EnergyCardDefinition {
  const rawSubtypes = safeParseArray<string>(row.subtypes);
  const subtype = rawSubtypes.includes('Basic') ? 'Basic' : 'Special';
  const rules = safeParseArray<string>(row.rules);

  // ACE SPEC detection: rules array contains a string matching "ACE SPEC".
  const isAceSpec = rules.some(r => r.toUpperCase().includes('ACE SPEC'));

  // Basic Energy provides energy matching its name (e.g. "Fire Energy" → ['Fire']).
  // Special Energy may provide multiple types — derive from name heuristic for basic,
  // effect registry handles special energy in SPEC_04.
  const provides: EnergyType[] = [];
  if (subtype === 'Basic') {
    const energyName = row.name.replace(' Energy', '');
    const type = toEnergyType(energyName);
    if (type) provides.push(type);
  }

  return {
    cardType: 'Energy',
    id: row.id,
    name: row.name,
    subtype,
    provides,
    rules,
    effectId: subtype === 'Basic' ? null : row.id,
    isAceSpec
  };
}

export function adaptCardRow(row: SqliteCardRow): CardDefinition {
  switch (row.supertype) {
    case 'Pokémon':
    case 'Pokemon':
      return adaptPokemonRow(row);
    case 'Trainer':
      return adaptTrainerRow(row);
    case 'Energy':
      return adaptEnergyRow(row);
    default:
      throw new Error(`Unknown supertype: ${row.supertype} for card ${row.id}`);
  }
}

// --- Standard card pool loader ---

export function loadStandardCardPool(
  dbPath: string,
  formatDate: Date
): ReadonlyMap<string, CardDefinition> {
  const db = new Database(dbPath, { readonly: true });
  const marks = getLegalRegulationMarks(formatDate);
  const placeholders = marks.map(() => '?').join(', ');

  const rows = db.query<SqliteCardRow, string[]>(`
    SELECT id, name, supertype, subtypes, hp, types, evolves_from, evolves_to,
           rules, abilities, attacks, weaknesses, retreat_cost,
           converted_retreat_cost, set_id, regulation_mark, legalities
    FROM pokemon_cards
    WHERE (
      regulation_mark IN (${placeholders})
      AND legalities LIKE '%"standard":"Legal"%'
      AND subtypes NOT LIKE '%Radiant%'
    )
    OR (supertype = 'Energy' AND subtypes LIKE '%"Basic"%')
  `).all(...marks);

  db.close();

  const map = new Map<string, CardDefinition>();
  for (const row of rows) {
    try {
      const card = adaptCardRow(row);
      map.set(card.id, card);
    } catch {
      // Skip rows with unknown supertypes
    }
  }
  return map;
}

// --- Deck validation ---

export interface DeckValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<string>;
}

// Validates ACE SPEC constraint: max 1 ACE SPEC card across Trainer + Energy cards.
// Full deck validation (60 card count, copy limits, format legality) is in SPEC_02.
export function validateAceSpec(cards: ReadonlyArray<CardDefinition>): DeckValidationResult {
  const aceSpecCards = cards.filter(c => {
    if (c.cardType === 'Trainer') {
      return c.subtypes.includes('AceSpec');
    }
    if (c.cardType === 'Energy') {
      return c.isAceSpec;
    }
    return false;
  });

  if (aceSpecCards.length > 1) {
    return {
      valid: false,
      errors: [
        `Deck contains ${aceSpecCards.length} ACE SPEC cards; maximum is 1. Found: ${aceSpecCards.map(c => c.name).join(', ')}`
      ]
    };
  }
  return { valid: true, errors: [] };
}
