import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
  readonly id: number;
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
  readonly id: number;
}

/**
 * Ceiling for a single tool call. The slowest real tool (probability analysis
 * over a 60-card deck) lands well under a second, so this is a liveness guard
 * rather than a budget — it exists so a wedged server surfaces as an error
 * instead of a hang.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

export class McpClient {
  private readonly proc: ChildProcess;
  private readonly pending = new Map<
    number,
    {
      resolve: (r: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private idCounter = 1;
  private initialized = false;
  private readonly timeoutMs: number;
  private readonly readline: ReturnType<typeof createInterface>;
  /** Set once the child is gone, so later calls fail fast instead of hanging. */
  private dead: Error | null = null;

  /** Server stderr collected when captured, so it can be shown after teardown. */
  readonly stderrLog: string[] = [];

  constructor(
    serverPath: string,
    dbPath?: string,
    captureStderr = false,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    this.timeoutMs = timeoutMs;
    const env = dbPath
      ? { ...process.env, DATABASE_PATH: dbPath }
      : process.env;

    // fd 2 is normally inherited so the server's tracing output reaches the
    // terminal directly. Under the full-screen TUI that would draw straight
    // over the alternate screen, so capture it instead.
    this.proc = spawn(serverPath, [], {
      stdio: ['pipe', 'pipe', captureStderr ? 'pipe' : 'inherit'],
      env,
    });

    if (captureStderr && this.proc.stderr) {
      this.proc.stderr.on('data', (chunk: Buffer) => {
        this.stderrLog.push(chunk.toString());
      });
    }

    if (!this.proc.stdout || !this.proc.stdin) {
      throw new Error('Failed to open MCP server stdio');
    }

    this.readline = createInterface({ input: this.proc.stdout });
    this.readline.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // ignore malformed lines (server stderr leaking, tracing output, etc.)
      }
    });

    // A dead child produces no response for anything already in flight, so
    // every waiter has to be failed explicitly — otherwise a crashed server
    // reads as the CLI hanging, with no output and nothing to interrupt.
    this.proc.on('error', (err) => this.fail(new Error(`MCP server failed to start: ${err.message}`)));
    this.proc.on('exit', (code, signal) => {
      const how = signal ? `signal ${signal}` : `code ${code}`;
      this.fail(new Error(`MCP server exited unexpectedly (${how})`));
    });
  }

  /** Rejects every in-flight request and marks the client unusable. */
  private fail(err: Error): void {
    if (this.dead) return;
    this.dead = err;
    for (const [id, waiter] of this.pending) {
      this.pending.delete(id);
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'johto-deck-cli', version: '0.1.0' },
    });
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.initialized = true;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call('tools/call', { name, arguments: args });
  }

  private call(method: string, params?: unknown): Promise<unknown> {
    if (this.dead) return Promise.reject(this.dead);

    const id = this.idCounter++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out after ${this.timeoutMs}ms: ${method}`));
      }, this.timeoutMs);
      // Node keeps the event loop alive for a pending timer; this one must not
      // hold the process open on its own.
      timer.unref?.();

      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', method, params, id });
    });
  }

  private send(msg: unknown): void {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  destroy(): void {
    // Teardown is expected, so waiters get a clean cancellation rather than the
    // "exited unexpectedly" the exit handler would otherwise report.
    this.fail(new Error('MCP client destroyed'));
    // Closing the reader matters: an open pipe to the child's stdout is a live
    // libuv handle, so leaving it holds the event loop open and the process
    // never exits on its own. Callers that rely on process.exit() never noticed.
    this.readline.close();
    this.proc.stdout?.destroy();
    this.proc.stdin?.destroy();
    this.proc.kill();
  }
}
