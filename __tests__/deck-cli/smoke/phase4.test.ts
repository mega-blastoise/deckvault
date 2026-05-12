/**
 * Phase 4 — Agent system prompt content (SPEC_04)
 *
 * Runs the CLI in --dry-run mode and checks that all required rulebook strings
 * are present in the assembled system prompt. Requires both the CLI binary and
 * the MCP release binary to be built, and the SQLite database to be present.
 *
 * Run once and cache — this is the slowest phase since it spawns the MCP server
 * and loads the deck. All assertions share a single invocation.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { runCli, CLI_AVAILABLE, MCP_AVAILABLE, DB_AVAILABLE, DECK_PATH } from './helpers';

const skip = !CLI_AVAILABLE || !MCP_AVAILABLE || !DB_AVAILABLE;
const skipReason = [
  !CLI_AVAILABLE && 'CLI binary missing (bun run build in apps/deck-cli)',
  !MCP_AVAILABLE && 'MCP binary missing (cargo build --release in apps/mcp-server)',
  !DB_AVAILABLE  && 'SQLite database not found',
].filter(Boolean).join('; ');

let promptOutput = '';

describe.skipIf(skip)(`Phase 4 — Agent system prompt${skip ? ` (SKIP: ${skipReason})` : ''}`, () => {
  beforeAll(() => {
    const { stdout, stderr, exitCode } = runCli(['--deck', DECK_PATH, '--dry-run']);
    if (exitCode !== 0) {
      throw new Error(
        `--dry-run exited ${exitCode}.\nstdout: ${stdout}\nstderr: ${stderr}`
      );
    }
    promptOutput = stdout + stderr;
  });

  // ── Static layer — rulebook mechanics ────────────────────────────────────

  test('Weakness formula ×2 is present', () => {
    expect(promptOutput).toContain('×2');
  });

  test('Mega Evolution ex 3-prize rule is present', () => {
    expect(promptOutput).toMatch(/3 prize|3 Prize/);
  });

  test('ACE SPEC one-per-deck rule is present', () => {
    expect(promptOutput).toMatch(/ACE SPEC/i);
  });

  test('Lost Zone permanence rule is present', () => {
    expect(promptOutput).toContain('Lost Zone');
  });

  test('Asleep/Paralyzed cannot retreat rule is present', () => {
    expect(promptOutput).toContain('cannot retreat');
  });

  test('T1 no-Supporter rule (first player) is present', () => {
    // The prompt text wraps across lines, so use a whitespace-tolerant regex
    expect(promptOutput).toMatch(/first player\s+cannot play a Supporter/);
  });

  test('Mega Evolution ex evolution does NOT end your turn rule is present', () => {
    expect(promptOutput).toContain('does NOT end your turn');
  });

  test('Standard rotation marks H, I, J are documented', () => {
    // The prompt must state what is currently legal
    expect(promptOutput).toMatch(/H, I, J|H\/I\/J/);
  });

  test('G mark rotation-out date is documented', () => {
    expect(promptOutput).toContain('2026-04-10');
  });

  // ── Session layer — deck context ──────────────────────────────────────────

  test('loaded deck name appears in the prompt', () => {
    expect(promptOutput).toContain('Mega Gardevoir ex');
  });

  test('card names from the deck appear in the prompt', () => {
    expect(promptOutput).toContain('Ralts');
    expect(promptOutput).toContain('Kirlia');
  });

  test('regulation marks are rendered per card (Mark: label)', () => {
    expect(promptOutput).toContain('Mark:');
  });

  test('Pokémon section header is rendered', () => {
    expect(promptOutput).toContain('### Pokémon');
  });

  test('Trainers section header is rendered', () => {
    expect(promptOutput).toContain('### Trainers');
  });

  test('Energy section header is rendered', () => {
    expect(promptOutput).toContain('### Energy');
  });

  test('HP values are rendered for Pokémon cards', () => {
    expect(promptOutput).toMatch(/HP: \d+/);
  });

  test('total card count in session context equals 60', () => {
    expect(promptOutput).toMatch(/Total cards: 60/);
  });

  // ── Static layer — structural checks ─────────────────────────────────────

  test('damage calculation section is present', () => {
    expect(promptOutput).toMatch(/Damage Calculation/i);
  });

  test('Special Conditions table is present', () => {
    expect(promptOutput).toContain('Asleep');
    expect(promptOutput).toContain('Burned');
    expect(promptOutput).toContain('Confused');
    expect(promptOutput).toContain('Paralyzed');
    expect(promptOutput).toContain('Poisoned');
  });

  test('deck skeleton reference counts are present', () => {
    expect(promptOutput).toContain('12–18');   // Pokémon range
    expect(promptOutput).toContain('30–38');   // Trainer range
  });

  test('prize trade math section is present', () => {
    expect(promptOutput).toMatch(/Prize Trade/i);
  });

  test('--dry-run exits 0', () => {
    const { exitCode } = runCli(['--deck', DECK_PATH, '--dry-run']);
    expect(exitCode).toBe(0);
  });
});
