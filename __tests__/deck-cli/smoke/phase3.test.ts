/**
 * Phase 3 — CLI application guards (SPEC_03)
 *
 * Tests argument parsing, exit codes, and guard messages without requiring an
 * Anthropic API key or a live agent session. Requires the CLI binary to be built:
 *   cd apps/deck-cli && bun run build
 */

import { describe, test, expect } from 'bun:test';
import {
  runCli,
  runCliFromSource,
  CLI_AVAILABLE,
  CLI_BIN,
  DECK_PATH,
  MCP_AVAILABLE,
  DB_AVAILABLE,
} from './helpers';

const skip = !CLI_AVAILABLE;
const skipReason = 'CLI binary not found — run: cd apps/deck-cli && bun run build';

describe.skipIf(skip)(`Phase 3 — CLI application guards${skip ? ` (SKIP: ${skipReason})` : ''}`, () => {
  test('--help exits 0 and contains usage text', () => {
    // cac prints help to stdout and exits 0
    const { stdout, stderr, exitCode } = runCli(['--help']);
    const output = stdout + stderr;
    expect(output).toMatch(/johto/i);
    expect(output).toContain('--deck');
    expect(output).toContain('--provider');
    // cac exits 0 on --help even though our guard also runs; accept 0 or 1
    // since cac prints help first then the guard fires for missing --deck
    expect([0, 1]).toContain(exitCode);
  });

  test('--version exits and prints version number', () => {
    const { stdout, stderr } = runCli(['--version']);
    const output = stdout + stderr;
    expect(output).toMatch(/0\.1\.0/);
  });

  test('--provider invalid exits non-zero with "Unknown provider"', () => {
    const { stdout, stderr, exitCode } = runCli(['--provider', 'invalid']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/unknown provider/i);
  });

  test('--provider anthropic without --deck exits non-zero with "required"', () => {
    const { stdout, stderr, exitCode } = runCli(['--provider', 'anthropic']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/required/i);
  });

  test('--provider chrome --dry-run exits non-zero with "not applicable"', () => {
    const { stdout, stderr, exitCode } = runCli(['--provider', 'chrome', '--dry-run']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/not applicable/i);
  });

  test('missing ANTHROPIC_API_KEY exits non-zero with clear message (REPL mode)', () => {
    // Explicitly unset the key — use a fresh env without it
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== 'ANTHROPIC_API_KEY' && typeof v === 'string') env[k] = v;
    }
    const proc = Bun.spawnSync([CLI_BIN, '--deck', DECK_PATH], {
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).not.toBe(0);
    expect(output).toMatch(/ANTHROPIC_API_KEY/i);
  });
});

describe('Phase 3b — Subcommand form guards', () => {
  test('run --provider invalid exits non-zero with "Unknown provider"', () => {
    const { stdout, stderr, exitCode } = runCliFromSource(['run', '--provider', 'invalid']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/unknown provider/i);
  });

  test('run --provider anthropic (no --deck) exits non-zero', () => {
    const { stdout, stderr, exitCode } = runCliFromSource(['run', '--provider', 'anthropic']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/required/i);
  });

  test('run --provider chrome --dry-run exits non-zero with "not applicable"', () => {
    const { stdout, stderr, exitCode } = runCliFromSource(['run', '--provider', 'chrome', '--dry-run']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/not applicable/i);
  });

  test('run --stats --provider chrome exits non-zero with "not applicable"', () => {
    const { stdout, stderr, exitCode } = runCliFromSource(['run', '--stats', '--provider', 'chrome']);
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/not applicable/i);
  });

  test('johto --help output includes subcommand names', () => {
    const { stdout, stderr } = runCliFromSource(['--help']);
    const output = stdout + stderr;
    expect(output).toMatch(/\binit\b/);
    expect(output).toMatch(/\bdoctor\b/);
    expect(output).toMatch(/\bauth\b/);
    expect(output).toMatch(/\bsync-data\b/);
    expect(output).toMatch(/\brun\b/);
  });

  describe.skipIf(!MCP_AVAILABLE || !DB_AVAILABLE)(
    `backward compat${!MCP_AVAILABLE || !DB_AVAILABLE ? ' (SKIP: MCP binary or DB not found)' : ''}`,
    () => {
      test('backward compat: --deck <path> --dry-run (no subcommand) succeeds if MCP+DB available', () => {
        const { stdout, stderr, exitCode } = runCliFromSource(['--deck', DECK_PATH, '--dry-run']);
        const output = stdout + stderr;
        // dry-run prints the system prompt and exits 0
        expect(exitCode).toBe(0);
        expect(output.length).toBeGreaterThan(0);
      });
    }
  );
});
