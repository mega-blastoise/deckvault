/**
 * Phase 1 — Deck file format (SPEC_01)
 *
 * Pure schema tests: no process spawning, no network. Parses the example TOML
 * directly and validates it against all R1–R7 rules from the spec.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { parse } from 'smol-toml';
import { DECK_PATH } from './helpers';

// Known Basic Energy IDs that are exempt from the 4-copy limit.
// In live validation the MCP enriches these; here we identify them by ID prefix
// since Basic Energy sets (sve) carry no regulation mark.
const BASIC_ENERGY_IDS = new Set([
  'sve-1', 'sve-2', 'sve-3', 'sve-4', 'sve-5',
  'sve-6', 'sve-7', 'sve-8', 'sve-9', 'sve-10',
  'sve-11', 'sve-12', 'sve-13', 'sve-14', 'sve-15',
  'sve-16',
]);

// Legal regulation marks for current Standard rotation
const LEGAL_MARKS = new Set(['H', 'I', 'J']);

interface CardEntry {
  id: string;
  quantity: number;
}

interface DeckFile {
  name: string;
  format: string;
  regulation_marks: string[];
  cards: CardEntry[];
  meta?: Record<string, string>;
}

let deck: DeckFile;

beforeAll(async () => {
  const raw = await Bun.file(DECK_PATH).text();
  deck = parse(raw) as DeckFile;
});

describe('Phase 1 — Deck file format', () => {
  test('TOML file exists and is non-empty', async () => {
    const file = Bun.file(DECK_PATH);
    expect(await file.exists()).toBe(true);
    expect(await file.size).toBeGreaterThan(0);
  });

  test('smol-toml parses the file without error', async () => {
    const raw = await Bun.file(DECK_PATH).text();
    expect(() => parse(raw)).not.toThrow();
  });

  test('R1 — total card count is exactly 60', () => {
    const total = deck.cards.reduce((n, c) => n + c.quantity, 0);
    expect(total).toBe(60);
  });

  test('R2 — no duplicate card IDs', () => {
    const ids = deck.cards.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('R3 — all quantities are between 1 and 60 inclusive', () => {
    for (const card of deck.cards) {
      expect(card.quantity).toBeGreaterThanOrEqual(1);
      expect(card.quantity).toBeLessThanOrEqual(60);
    }
  });

  test('R4 — non-Basic Energy cards have at most 4 copies', () => {
    const violations = deck.cards.filter(
      (c) => !BASIC_ENERGY_IDS.has(c.id) && c.quantity > 4
    );
    expect(violations).toHaveLength(0);
  });

  test('R5 — format field is exactly "standard" (case-sensitive)', () => {
    expect(deck.format).toBe('standard');
  });

  test('R6 — regulation_marks is a non-empty array', () => {
    expect(Array.isArray(deck.regulation_marks)).toBe(true);
    expect(deck.regulation_marks.length).toBeGreaterThan(0);
  });

  test('R6 — all declared regulation marks are Standard-legal (H, I, or J)', () => {
    const illegal = deck.regulation_marks.filter((m) => !LEGAL_MARKS.has(m));
    expect(illegal).toHaveLength(0);
  });

  test('R7 — all card IDs are non-empty strings', () => {
    const blank = deck.cards.filter((c) => !c.id || c.id.trim() === '');
    expect(blank).toHaveLength(0);
  });

  test('deck contains at least one Basic Pokémon (required to start a game)', () => {
    // Ralts, Mewtwo, Jirachi are all Basics in this deck — we check by ID prefix
    // since the Pokémon supertypes aren't encoded in the TOML file itself.
    // The presence of any me1-5x / sv7-xx card in the expected Basic slots satisfies this.
    const knownBasicIds = ['me1-58', 'sv7-98', 'sv7-59'];
    const hasBasic = deck.cards.some((c) => knownBasicIds.includes(c.id));
    expect(hasBasic).toBe(true);
  });

  test('deck has a non-empty name', () => {
    expect(typeof deck.name).toBe('string');
    expect(deck.name.trim().length).toBeGreaterThan(0);
  });
});
