import { join, resolve } from 'node:path';

// ── Paths ────────────────────────────────────────────────────────────────────

export const MONOREPO_ROOT = resolve(join(import.meta.dir, '../../..'));

export const DB_PATH =
  process.env['DATABASE_PATH'] ??
  join(MONOREPO_ROOT, 'database/pokemon-data.sqlite3.db');

export const DECK_PATH = join(
  MONOREPO_ROOT,
  'apps/deck-cli/decks/example.toml'
);

export const MCP_BIN = join(
  MONOREPO_ROOT,
  'apps/mcp-server/target/release/pokemon-mcp-server'
);

export const CLI_BIN = join(
  MONOREPO_ROOT,
  'apps/deck-cli/dist/johto.mjs'
);

export const MCP_AVAILABLE = await Bun.file(MCP_BIN).exists();
export const CLI_AVAILABLE = await Bun.file(CLI_BIN).exists();
export const DB_AVAILABLE  = await Bun.file(DB_PATH).exists();

// ── MCP JSON-RPC helper ───────────────────────────────────────────────────────
//
// Spawns the release binary, sends one JSON-RPC request on stdin, closes stdin
// so the server exits, then returns the parsed response. Logs from the server
// go to stderr, so stdout contains only the JSON-RPC response line(s).

export interface McpResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string };
  id: number;
}

export async function mcpCall<T = unknown>(
  method: string,
  params?: unknown
): Promise<McpResponse<T>> {
  const proc = Bun.spawn([MCP_BIN], {
    env: { ...process.env, DATABASE_PATH: DB_PATH },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) + '\n');
  proc.stdin.end();

  const raw = await new Response(proc.stdout).text();
  await proc.exited;

  const line = raw.split('\n').find((l) => l.trim().startsWith('{'));
  if (!line) throw new Error(`No JSON response from MCP for "${method}". stdout: ${raw}`);

  return JSON.parse(line) as McpResponse<T>;
}

// ── CLI helper ────────────────────────────────────────────────────────────────
//
// Synchronous — suitable for guard/exit-code tests and dry-run output checks.
// Times out after 15 s to avoid hanging the test suite if MCP doesn't respond.

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(
  args: string[],
  env: Record<string, string> = {}
): CliResult {
  const proc = Bun.spawnSync([CLI_BIN, ...args], {
    env: { ...process.env, DATABASE_PATH: DB_PATH, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
}

// ── Browser server helper ─────────────────────────────────────────────────────
//
// Spawns the CLI in --provider chrome mode, waits for the server URL to appear
// on stdout, then returns the port and a stop() function.

export interface BrowserHandle {
  port: number;
  stop: () => void;
}

export async function startBrowserServer(
  extraArgs: string[] = [],
  timeoutMs = 8_000
): Promise<BrowserHandle> {
  const proc = Bun.spawn(
    [CLI_BIN, '--provider', 'chrome', ...extraArgs],
    {
      env: { ...process.env, DATABASE_PATH: DB_PATH },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );

  const portPromise: Promise<number> = (async () => {
    const decoder = new TextDecoder();
    let buf = '';
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) throw new Error('Process exited before printing URL. buf: ' + buf);
        buf += decoder.decode(value, { stream: true });
        const m = buf.match(/localhost:(\d+)/);
        if (m?.[1]) return parseInt(m[1], 10);
      }
    } finally {
      reader.releaseLock();
    }
  })();

  const port = await Promise.race([
    portPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Browser server did not start within ${timeoutMs}ms`));
      }, timeoutMs)
    ),
  ]);

  return { port, stop: () => proc.kill() };
}
