/**
 * Phase 2 — MCP server extensions (SPEC_02)
 *
 * Tests the two new tools: load_deck and validate_deck. Requires the release
 * binary to be built:
 *   cargo build --release --manifest-path apps/mcp-server/Cargo.toml
 *
 * If the binary is absent, all tests in this file are skipped.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mcpCall, MCP_AVAILABLE, DB_AVAILABLE, DECK_PATH, DB_PATH } from './helpers';

const skip = !MCP_AVAILABLE || !DB_AVAILABLE;
const skipReason = !MCP_AVAILABLE
  ? 'MCP release binary not found — run: cargo build --release --manifest-path apps/mcp-server/Cargo.toml'
  : 'SQLite database not found at ' + DB_PATH;

// Temp files written by tests that need malformed decks
const tmpDir = import.meta.dir;
const BAD_COUNT_DECK = join(tmpDir, '.tmp-bad-count.toml');
const ROTATED_CARD_DECK = join(tmpDir, '.tmp-rotated.toml');

beforeAll(async () => {
  if (skip) return;

  await Bun.write(
    BAD_COUNT_DECK,
    [
      'name = "Too Few Cards"',
      'format = "standard"',
      'regulation_marks = ["I"]',
      '[[cards]]',
      'id = "me1-58"',
      'quantity = 59',
    ].join('\n')
  );

  // 4 copies of Iono (sv2-185, mark G — rotated) + 56 legal Ralts = 60 total.
  // Only the R4 limit (4 copies) and total count (60) pass; LEGALITY fires for Iono.
  await Bun.write(
    ROTATED_CARD_DECK,
    [
      'name = "Rotation Test"',
      'format = "standard"',
      'regulation_marks = ["I"]',
      '[[cards]]',
      'id = "sv2-185"',    // Iono — regulation mark G (rotated out 2026-04-10)
      'quantity = 4',
      '[[cards]]',
      'id = "me1-58"',     // Ralts — regulation mark I (legal)
      'quantity = 56',
    ].join('\n')
  );
});

afterAll(async () => {
  await Bun.file(BAD_COUNT_DECK).exists() && Bun.file(BAD_COUNT_DECK).delete?.();
  await Bun.file(ROTATED_CARD_DECK).exists() && Bun.file(ROTATED_CARD_DECK).delete?.();
});

describe.skipIf(skip)(`Phase 2 — MCP server extensions${skip ? ` (SKIP: ${skipReason})` : ''}`, () => {
  // ── tools/list ────────────────────────────────────────────────────────────

  test('tools/list includes load_deck and validate_deck', async () => {
    type ToolsListResult = { tools: Array<{ name: string }> };
    const resp = await mcpCall<ToolsListResult>('tools/list');

    expect(resp.error).toBeUndefined();
    const names = resp.result!.tools.map((t) => t.name);
    expect(names).toContain('load_deck');
    expect(names).toContain('validate_deck');
  });

  // ── load_deck ─────────────────────────────────────────────────────────────

  test('load_deck returns totalCards: 60 for the example deck', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'load_deck',
      arguments: { path: DECK_PATH },
    });

    expect(resp.error).toBeUndefined();
    const deck = JSON.parse(resp.result!.content[0]!.text);
    expect(deck.totalCards).toBe(60);
  });

  test('load_deck enriches cards with a name field', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'load_deck',
      arguments: { path: DECK_PATH },
    });

    const deck = JSON.parse(resp.result!.content[0]!.text);
    const firstCard = deck.cards[0];
    expect(firstCard.card).not.toBeNull();
    expect(typeof firstCard.card.name).toBe('string');
    expect(firstCard.card.name.length).toBeGreaterThan(0);
  });

  test('load_deck exposes regulationMark (camelCase) on enriched cards', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'load_deck',
      arguments: { path: DECK_PATH },
    });

    const deck = JSON.parse(resp.result!.content[0]!.text);
    // At least one card in the deck has a regulation mark (Ralts = I)
    const cardsWithMark = deck.cards.filter(
      (c: { card: { regulationMark?: string | null } | null }) =>
        c.card?.regulationMark != null && c.card.regulationMark !== ''
    );
    expect(cardsWithMark.length).toBeGreaterThan(0);
  });

  test('load_deck returns snake_case totalCards (not total_cards)', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'load_deck',
      arguments: { path: DECK_PATH },
    });

    const deck = JSON.parse(resp.result!.content[0]!.text);
    // Confirm camelCase serialization is wired correctly
    expect(deck.totalCards).toBeDefined();
    expect((deck as Record<string, unknown>)['total_cards']).toBeUndefined();
  });

  test('load_deck returns an error for a non-existent path', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }>; isError: boolean };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'load_deck',
      arguments: { path: '/nonexistent/path/deck.toml' },
    });

    // Server should return a ToolError, reflected in result.isError or an RPC error
    const isErrorResult =
      resp.error != null ||
      resp.result?.isError === true ||
      (resp.result?.content[0]?.text ?? '').toLowerCase().includes('error');

    expect(isErrorResult).toBe(true);
  });

  // ── validate_deck ─────────────────────────────────────────────────────────

  test('validate_deck returns valid: true for the example deck', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'validate_deck',
      arguments: { path: DECK_PATH },
    });

    const report = JSON.parse(resp.result!.content[0]!.text);
    expect(report.valid).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.totalCards).toBe(60);
  });

  test('validate_deck catches R1 violation for a 59-card deck', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'validate_deck',
      arguments: { path: BAD_COUNT_DECK },
    });

    const report = JSON.parse(resp.result!.content[0]!.text);
    expect(report.valid).toBe(false);
    const rules = report.violations.map((v: { rule: string }) => v.rule);
    expect(rules).toContain('R1');
  });

  test('validate_deck catches LEGALITY violation for a G-mark card', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'validate_deck',
      arguments: { path: ROTATED_CARD_DECK },
    });

    const report = JSON.parse(resp.result!.content[0]!.text);
    expect(report.valid).toBe(false);
    const rules = report.violations.map((v: { rule: string }) => v.rule);
    expect(rules).toContain('LEGALITY');
  });

  test('validate_deck totalCards field is camelCase', async () => {
    type ToolCallResult = { content: Array<{ type: string; text: string }> };
    const resp = await mcpCall<ToolCallResult>('tools/call', {
      name: 'validate_deck',
      arguments: { path: DECK_PATH },
    });

    const report = JSON.parse(resp.result!.content[0]!.text);
    expect(report.totalCards).toBeDefined();
    expect((report as Record<string, unknown>)['total_cards']).toBeUndefined();
  });
});
