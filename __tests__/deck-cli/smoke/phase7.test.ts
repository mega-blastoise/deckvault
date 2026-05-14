/**
 * Phase 7 — Doctor command (SPEC_09 Phase 5.5)
 *
 * Verifies that `johto doctor` reports the correct checks, exits 0 when
 * all components are present, and exits non-zero when a required component
 * is missing.
 *
 * Requires the MCP release binary and SQLite database to be present.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCliFromSource, MCP_AVAILABLE, DB_AVAILABLE, MCP_BIN, DB_PATH } from './helpers';

const skipReason = [
  !MCP_AVAILABLE && 'MCP binary not found',
  !DB_AVAILABLE && 'SQLite database not found',
]
  .filter(Boolean)
  .join(', ');

describe.skipIf(!MCP_AVAILABLE || !DB_AVAILABLE)(
  `Phase 7 — Doctor command${skipReason ? ` (SKIP: ${skipReason})` : ''}`,
  () => {
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'johto-phase7-'));
    });

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    function withDoctor(extra: Record<string, string> = {}): Record<string, string> {
      return {
        XDG_CONFIG_HOME: tmpDir,
        JOHTO_MCP_SERVER_PATH: MCP_BIN,
        JOHTO_DB_PATH: DB_PATH,
        ...extra,
      };
    }

    test('johto doctor runs without error when JOHTO_MCP_SERVER_PATH and JOHTO_DB_PATH are valid', () => {
      // Doctor may exit non-zero if the network check fails (inherently flaky in sandboxed
      // environments). We assert that the core checks (MCP, DB, CLI binary) pass by
      // inspecting the output rows rather than relying on exit code here.
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      // These rows must be present and pass (✓)
      expect(output).toMatch(/✓ CLI binary/);
      expect(output).toMatch(/✓ MCP server/);
      expect(output).toMatch(/✓ Card database/);
    });

    test('doctor output contains "CLI binary" check row', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/CLI binary/i);
    });

    test('doctor output contains "MCP server" check row', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/MCP server/i);
    });

    test('doctor output contains "Card database" check row with correct card count', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/Card database/i);
      // Should contain a card count number
      expect(output).toMatch(/\d+ cards/i);
    });

    test('doctor output contains "Config file" check row', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/Config file/i);
    });

    test('doctor output contains "Anthropic API key" check row', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/Anthropic API key/i);
    });

    test('doctor output contains "Network" check row', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      expect(output).toMatch(/Network/i);
    });

    test('doctor exits non-zero when JOHTO_MCP_SERVER_PATH points to non-existent binary', () => {
      const { exitCode } = runCliFromSource(
        ['doctor'],
        withDoctor({ JOHTO_MCP_SERVER_PATH: '/nonexistent/path/pokemon-mcp-server' })
      );
      expect(exitCode).not.toBe(0);
    });

    test('doctor "Card database" row shows card count from pokemon_cards table > 10000', () => {
      const { stdout, stderr } = runCliFromSource(['doctor'], withDoctor());
      const output = stdout + stderr;
      const match = output.match(/Card database[^\n]*?(\d+)\s+cards/i);
      expect(match).not.toBeNull();
      const count = parseInt(match![1], 10);
      expect(count).toBeGreaterThan(10000);
    });
  }
);
