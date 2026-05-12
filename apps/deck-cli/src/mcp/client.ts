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

export class McpClient {
  private readonly proc: ChildProcess;
  private readonly pending = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >();
  private idCounter = 1;
  private initialized = false;

  constructor(serverPath: string) {
    this.proc = spawn(serverPath, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    if (!this.proc.stdout || !this.proc.stdin) {
      throw new Error('Failed to open MCP server stdio');
    }

    const rl = createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // ignore malformed lines (server stderr leaking, tracing output, etc.)
      }
    });
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
    const id = this.idCounter++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', method, params, id });
    });
  }

  private send(msg: unknown): void {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  destroy(): void {
    this.proc.kill();
  }
}
