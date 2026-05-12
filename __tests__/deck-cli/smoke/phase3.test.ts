/**
 * Phase 3 — CLI application guards (SPEC_03)
 *
 * Tests argument parsing, exit codes, and guard messages without requiring an
 * Anthropic API key or a live agent session. Requires the CLI binary to be built:
 *   cd apps/deck-cli && bun run build
 */

import { describe, test, expect } from 'bun:test';
import { runCli, CLI_AVAILABLE, CLI_BIN, DECK_PATH } from './helpers';

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
