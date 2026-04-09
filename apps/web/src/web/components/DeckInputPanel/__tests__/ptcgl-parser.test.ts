import { describe, it, expect } from 'bun:test';
import { parsePtcglList } from '../ptcgl-parser';

const ABBREVIATIONS = {
  OBF: 'sv3',
  PAL: 'sv2',
  SVI: 'sv1',
  SVE: 'sve',
  PAR: 'sv4',
  MEW: 'sv3pt5',
  PRE: 'sv8pt5',
  SSP: 'sv8'
};

describe('parsePtcglList', () => {
  it('resolves a standard card line', () => {
    const result = parsePtcglList('4 Charizard ex OBF 125', ABBREVIATIONS);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.cardId).toBe('sv3-125');
    expect(result.cards[0]!.count).toBe(4);
    expect(result.cards[0]!.resolved).toBe(true);
  });

  it('skips section headers', () => {
    const input = 'Pokemon: 14\nTrainer: 32\nEnergy: 14\nTotal Cards: 60\n4 Charizard ex OBF 125';
    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips blank lines', () => {
    const input = '\n\n4 Charizard ex OBF 125\n\n';
    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.cards).toHaveLength(1);
  });

  it('skips comment lines starting with #', () => {
    const input = '# This is a comment\n4 Charizard ex OBF 125';
    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.cards).toHaveLength(1);
  });

  it('skips comment lines starting with //', () => {
    const input = '// deck build v2\n4 Charizard ex OBF 125';
    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.cards).toHaveLength(1);
  });

  it('produces error for unknown set code', () => {
    const result = parsePtcglList('4 Some Card XYZ 99', ABBREVIATIONS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('XYZ');
    expect(result.cards[0]!.resolved).toBe(false);
  });

  it('calculates totalCards correctly', () => {
    const input = '4 Charizard ex OBF 125\n2 Charmander OBF 26\n4 Ultra Ball SVI 196';
    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.totalCards).toBe(10);
  });

  it('isValid is true when 60 cards and no errors', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `1 Card${i} PAL ${i + 1}`).join('\n');
    const result = parsePtcglList(lines, ABBREVIATIONS);
    expect(result.isValid).toBe(true);
    expect(result.totalCards).toBe(60);
    expect(result.errors).toHaveLength(0);
  });

  it('isValid is false when not 60 cards', () => {
    const result = parsePtcglList('4 Charizard ex OBF 125', ABBREVIATIONS);
    expect(result.isValid).toBe(false);
  });

  it('parses energy line with SVE abbreviation', () => {
    const result = parsePtcglList('10 Fire Energy SVE 2', ABBREVIATIONS);
    expect(result.cards[0]!.cardId).toBe('sve-2');
    expect(result.cards[0]!.count).toBe(10);
  });

  it('parses a full 60-card deck without errors', () => {
    const input = [
      'Pokemon: 14',
      '4 Charizard ex OBF 125',
      '4 Charmander OBF 26',
      '3 Charmeleon OBF 27',
      '3 Pidgeot ex OBF 164',
      '',
      'Trainer: 32',
      '4 Ultra Ball SVI 196',
      '4 Nest Ball SVI 181',
      '3 Rare Candy SVI 191',
      '3 Professor Sada SVI 189',
      '2 Boss Order PAR 172',
      '4 Arven SVI 166',
      '4 Iono PAL 185',
      '3 Judge SSP 176',
      '3 Super Rod PAL 188',
      '2 Counter Catcher PAR 160',
      '',
      'Energy: 14',
      '10 Fire Energy SVE 2',
      '4 Basic Fire Energy SVE 2',
      '',
      'Total Cards: 60'
    ].join('\n');

    const result = parsePtcglList(input, ABBREVIATIONS);
    expect(result.totalCards).toBe(60);
    expect(result.errors).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });

  it('produces errors for lines that do not match any pattern', () => {
    const result = parsePtcglList('this is not a card line', ABBREVIATIONS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.line).toBe(1);
  });
});
