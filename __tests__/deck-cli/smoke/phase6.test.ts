/**
 * Phase 6 — Config file and auth subcommands (SPEC_09 Phase 5)
 *
 * Tests `johto auth set`, `johto auth show`, and the config file
 * read/write lifecycle. No compiled binary required — runs from source.
 *
 * All tests write to a temp XDG_CONFIG_HOME so they never touch the
 * real ~/.config/johto/config.toml.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';

import { runCliFromSource } from './helpers';

describe('Phase 6 — Config and auth', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'johto-phase6-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function withConfig(extra: Record<string, string> = {}): Record<string, string> {
    return { XDG_CONFIG_HOME: tmpDir, ...extra };
  }

  // tmpDir is assigned in beforeAll — configPath() is called lazily inside tests.
  function configPath(): string {
    return join(tmpDir, 'johto', 'config.toml');
  }

  const FAKE_KEY = 'sk-ant-test-key-0000000000000000000000000000000000000000';

  test('getConfigPath() returns $XDG_CONFIG_HOME/johto/config.toml when XDG_CONFIG_HOME is set', () => {
    const { stdout, stderr } = runCliFromSource(['auth', 'show'], withConfig());
    const output = stdout + stderr;
    // auth show always prints "Config: <path>"
    expect(output).toContain(join(tmpDir, 'johto', 'config.toml'));
  });

  test('johto auth set anthropic <key> exits 0', () => {
    const { exitCode } = runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    expect(exitCode).toBe(0);
  });

  test('johto auth set anthropic <key> writes a TOML file at the config path', async () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const raw = await readFile(configPath(), 'utf-8');
    expect(raw.length).toBeGreaterThan(0);
  });

  test('johto auth set anthropic <key> TOML contains the key', async () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const raw = await readFile(configPath(), 'utf-8');
    expect(raw).toContain(FAKE_KEY);
  });

  test('johto auth set anthropic <key> key is stored as api_key under [anthropic]', async () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const raw = await readFile(configPath(), 'utf-8');
    const parsed = parse(raw) as { anthropic?: { api_key?: string } };
    expect(parsed.anthropic?.api_key).toBe(FAKE_KEY);
  });

  test('johto auth show after set prints "Config: <path>"', () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const { stdout, stderr } = runCliFromSource(['auth', 'show'], withConfig());
    const output = stdout + stderr;
    expect(output).toContain(`Config: ${configPath()}`);
  });

  test('johto auth show after set prints redacted key (contains "***")', () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const { stdout, stderr } = runCliFromSource(['auth', 'show'], withConfig());
    const output = stdout + stderr;
    expect(output).toContain('***');
  });

  test('johto auth show source label is "config" (not "env") when ANTHROPIC_API_KEY env is absent', () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    // Explicitly strip ANTHROPIC_API_KEY from the env passed to the child process
    const env: Record<string, string> = { XDG_CONFIG_HOME: tmpDir };
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== 'ANTHROPIC_API_KEY' && typeof v === 'string') env[k] = v;
    }
    // Override XDG after the loop to ensure it wins
    env['XDG_CONFIG_HOME'] = tmpDir;
    const proc = Bun.spawnSync(
      ['bun', 'run', join(import.meta.dir, '../../../apps/deck-cli/src/index.ts'), 'auth', 'show'],
      {
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(output).toMatch(/source:\s*config/i);
  });

  test('johto auth show source label is "env" when ANTHROPIC_API_KEY env overrides', () => {
    runCliFromSource(['auth', 'set', 'anthropic', FAKE_KEY], withConfig());
    const { stdout, stderr } = runCliFromSource(
      ['auth', 'show'],
      withConfig({ ANTHROPIC_API_KEY: 'sk-ant-env-override-key' })
    );
    const output = stdout + stderr;
    expect(output).toMatch(/source:\s*env/i);
  });

  test('johto auth set with unknown provider exits non-zero', () => {
    const { exitCode, stdout, stderr } = runCliFromSource(
      ['auth', 'set', 'openai', 'sk-some-key'],
      withConfig()
    );
    const output = stdout + stderr;
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/unknown provider/i);
  });

  test('johto auth show with no config file exits 0 and prints "(not set)"', async () => {
    // Use a fresh temp dir that has no config file
    const freshDir = await mkdtemp(join(tmpdir(), 'johto-phase6-fresh-'));
    try {
      const { stdout, stderr, exitCode } = runCliFromSource(
        ['auth', 'show'],
        { XDG_CONFIG_HOME: freshDir }
      );
      const output = stdout + stderr;
      expect(exitCode).toBe(0);
      expect(output).toContain('(not set)');
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });
});
