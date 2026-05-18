# SPEC_03: CLI Application

## Context

The CLI is a Bun TypeScript application that orchestrates the full session:
parse arguments → load and validate the deck file → enrich via MCP → build the system
prompt → open an interactive REPL backed by an Anthropic agent loop.

It is the only piece the user directly interacts with. Everything else is plumbing.

The application is built with `Bun.build()` and released as a proper compiled binary
(`dist/johto.mjs`) — not run directly from source. The `bun-johto` bin alias exists
for development only. This keeps the production entrypoint portable, deterministic, and
fast regardless of the local TypeScript source state.

---

## Prerequisites

- SPEC_01 (deck file format)
- SPEC_02 (MCP server `load_deck` and `validate_deck` tools)
- `ANTHROPIC_API_KEY` environment variable set (REPL mode only)
- `pokemon-mcp-server` binary built: `cargo build --release --manifest-path apps/mcp-server/Cargo.toml`

---

## New Package

Create `apps/deck-cli/` as a new workspace package. Because `turbo.json` already
pipelines `apps/*`, no root-level changes are needed — the package is automatically
discovered.

### `apps/deck-cli/package.json`

```json
{
  "name": "@pokemon/deck-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Competitive Pokemon TCG deck refinement CLI with Anthropic agent loop and browser mode.",
  "bin": {
    "johto":     "./dist/johto.mjs",
    "bun-johto": "./src/index.ts"
  },
  "files": [
    "dist",
    "decks"
  ],
  "engines": {
    "bun": ">=1.3"
  },
  "scripts": {
    "dev":      "bun run src/index.ts",
    "prebuild": "rm -rf dist",
    "build":    "bun build/index.ts",
    "start":    "bun run dist/johto.mjs",
    "typecheck": "tsc --noEmit",
    "test":     "bun test",
    "clean":    "rm -rf dist"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.0",
    "cac": "^6.7.14",
    "smol-toml": "^1.3.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

**Key decisions:**

| Point | Decision | Reason |
|---|---|---|
| `bin.johto` → `dist/johto.mjs` | Always runs the compiled bundle | Deterministic, no source transpile overhead at runtime |
| `bin.bun-johto` → `src/index.ts` | Direct source entry for development | `bun-johto --deck ...` works without a build step during active development |
| `packages: 'external'` in build | Deps kept external | Monorepo `node_modules` is always present; avoids bundling issues with native deps in `@anthropic-ai/sdk` |
| `cac` for arg parsing | Replaces manual `process.argv` loop | Consistent with other CLI packages in the ecosystem; built-in `--help` generation |
| No `@types/node` | `@types/bun` only | Bun's type definitions include the Node.js compat layer; no duplicate types needed |

### `apps/deck-cli/tsconfig.json`

Follows bundt monorepo conventions: `module: "Preserve"`, `verbatimModuleSyntax`,
`moduleResolution: "bundler"`, `types: ["bun"]`. `noEmit: true` — tsc is typecheck-only;
the bundler handles output.

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["bun"]
  },
  "include": ["src", "build"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Requirements

### 1. Build Script (`build/index.ts`)

The build script is the single source of truth for how the binary is produced.
It mirrors the pattern from `btop/build/index.ts` and `bundt/apps/cleo/build/index.ts`.

```typescript
#!/usr/bin/env bun

import { join } from 'node:path';

const ROOT  = import.meta.dir + '/..';
const start = performance.now();

const result = await Bun.build({
  entrypoints: [join(ROOT, 'src/index.ts')],
  outdir:      join(ROOT, 'dist'),
  target:      'bun',
  format:      'esm',
  naming:      { entry: 'johto.mjs' },
  minify:      false,
  sourcemap:   'linked',
  packages:    'external',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

if (!result.success) {
  for (const msg of result.logs) console.error(msg);
  process.exit(1);
}

// ── Shebang + permissions ──────────────────────────────────────────────────────
//
// Bun.build does not emit a shebang. Without it, the OS cannot execute the file
// directly as `johto` — it would need `bun johto`. We prepend it here, then
// make the file executable so `npx`/`bunx` and symlinked bin entries work.

const binPath = join(ROOT, 'dist/johto.mjs');
const content = await Bun.file(binPath).text();

if (!content.startsWith('#!')) {
  await Bun.write(binPath, '#!/usr/bin/env bun\n' + content);
}

Bun.spawnSync(['chmod', '+x', binPath]);

// ── Report ─────────────────────────────────────────────────────────────────────

const elapsed = (performance.now() - start).toFixed(0);
const sizeKb  = (result.outputs.reduce((n, o) => n + o.size, 0) / 1024).toFixed(1);
console.log(`✓  dist/johto.mjs  ${sizeKb} kB  ${elapsed}ms`);
```

`packages: 'external'` means `@anthropic-ai/sdk`, `cac`, and `smol-toml` are not
inlined — they are resolved from `node_modules` at runtime. This is correct for a
monorepo package where `node_modules` is always present and avoids potential issues
with Bun's bundler and packages that include native bindings.

---

### 2. Argument Parsing (`src/args.ts`)

Uses `cac` instead of a manual `process.argv` loop. `cac` handles `--help` generation,
type coercion, and repeated flags. `parseArgs()` takes no arguments — `cac` reads
`process.argv` internally.

```typescript
import cac from 'cac';

export type LlmProvider = 'anthropic' | 'chrome';

export interface CliArgs {
  readonly deckPaths: readonly string[];
  readonly dryRun: boolean;
  readonly mcpServerPath: string;
  readonly provider: LlmProvider;
}

export function parseArgs(): CliArgs {
  const cli = cac('johto');

  cli
    .option(
      '-d, --deck <path>',
      'Deck file (.toml or .json). Repeatable. Optional with --provider chrome.'
    )
    .option(
      '--provider <name>',
      'LLM provider: anthropic (default) or chrome (opens browser, no API key needed)',
      { default: 'anthropic' }
    )
    .option(
      '--mcp-server <path>',
      'Path to pokemon-mcp-server binary (default: auto-resolved from monorepo root)'
    )
    .option(
      '--dry-run',
      'Print assembled system prompt then exit without opening a session (REPL mode only)'
    );

  cli.help();
  cli.version('0.1.0');

  const { options } = cli.parse();

  // ── Provider validation ────────────────────────────────────────────────────

  const provider = options['provider'] as string;
  if (provider !== 'anthropic' && provider !== 'chrome') {
    console.error(`Error: Unknown provider "${provider}". Valid options: anthropic, chrome`);
    process.exit(1);
  }

  // ── --dry-run guard ────────────────────────────────────────────────────────

  if (options['dryRun'] && provider === 'chrome') {
    console.error('Error: --dry-run is not applicable in browser mode (--provider chrome)');
    process.exit(1);
  }

  // ── Deck paths ─────────────────────────────────────────────────────────────
  // cac collects repeated flags into an array; normalise single-value case.

  const raw = options['deck'];
  const deckPaths: string[] = raw
    ? Array.isArray(raw) ? raw : [raw]
    : [];

  if (deckPaths.length === 0 && provider !== 'chrome') {
    console.error('Error: --deck is required for --provider anthropic');
    process.exit(1);
  }

  // ── MCP server path ────────────────────────────────────────────────────────

  const mcpServerPath = (options['mcpServer'] as string | undefined)
    ?? resolveDefaultMcpPath();

  return {
    deckPaths,
    dryRun:        Boolean(options['dryRun']),
    mcpServerPath,
    provider:      provider as LlmProvider,
  };
}

function resolveDefaultMcpPath(): string {
  // Resolve relative to the monorepo root (three directories up from apps/deck-cli/src)
  const root = new URL('../../..', import.meta.url).pathname;
  return `${root}/apps/mcp-server/target/release/pokemon-mcp-server`;
}
```

**`cac` option-to-property mapping** (camelCase by convention):

| CLI flag | `options` key |
|---|---|
| `--deck` | `options.deck` |
| `--provider` | `options.provider` |
| `--mcp-server` | `options.mcpServer` |
| `--dry-run` | `options.dryRun` |

---

### 3. MCP Client (`src/mcp/client.ts`)

Spawns `pokemon-mcp-server` as a child process and communicates via stdin/stdout
JSON-RPC 2.0 (the stdio transport the server already implements).

```typescript
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
  private readonly pending = new Map<number, {
    resolve: (r: unknown) => void;
    reject: (e: Error) => void;
  }>();
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
```

### 4. MCP Wire Types (`src/mcp/types.ts`)

```typescript
export interface McpContent {
  readonly type: string;
  readonly text: string;
}

export interface McpToolResult {
  readonly content: readonly McpContent[];
  readonly isError: boolean | null;
}
```

---

### 5. Deck Types (`src/deck/types.ts`)

Mirror the Rust `EnrichedDeck` output shape for typed consumption in TypeScript.

```typescript
export interface DeckCardEntry {
  readonly id: string;
  readonly quantity: number;
}

export interface CardAttack {
  readonly name: string;
  readonly cost: readonly string[];
  readonly convertedEnergyCost: number;
  readonly damage: string;
  readonly text: string | null;
}

export interface CardAbility {
  readonly name: string;
  readonly text: string | null;
  readonly type: string;
}

export interface CardDetail {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;
  readonly subtypes: readonly string[];
  readonly hp: number | null;
  readonly types: readonly string[];
  readonly attacks: readonly CardAttack[];
  readonly abilities: readonly CardAbility[];
  readonly regulationMark: string | null;
  readonly setId: string;
  readonly rarity: string | null;
}

export interface EnrichedDeckCard {
  readonly id: string;
  readonly quantity: number;
  readonly card: CardDetail | null;
}

export interface EnrichedDeck {
  readonly name: string;
  readonly format: string;
  readonly regulationMarks: readonly string[];
  readonly totalCards: number;
  readonly cards: readonly EnrichedDeckCard[];
  readonly meta: Record<string, string> | null;
}
```

---

### 6. Deck Loader (`src/deck/loader.ts`)

```typescript
import { resolve } from 'node:path';
import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';
import type { EnrichedDeck } from './types';

export async function loadAndEnrichDeck(
  deckPath: string,
  mcp: McpClient
): Promise<EnrichedDeck> {
  const absolutePath = resolve(deckPath);
  const result = await mcp.callTool('load_deck', { path: absolutePath }) as McpToolResult;

  if (result.isError) {
    throw new Error(`MCP load_deck failed for ${deckPath}`);
  }

  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('load_deck returned no text content');
  }

  return JSON.parse(textContent.text) as EnrichedDeck;
}
```

---

### 7. Agent Tools (`src/agent/tools.ts`)

Exposes MCP server tools to the Anthropic agent. Each tool definition proxies to the
MCP client.

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';

export type AnthropicTool = Anthropic.Tool;

export const AGENT_TOOLS: readonly AnthropicTool[] = [
  {
    name: 'search_cards',
    description: 'Search Pokemon TCG cards by name, type, supertype, rarity, HP range, or set.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:     { type: 'string', description: 'Text search on card name or ID' },
        type:      { type: 'string', description: 'Filter by Pokemon type (Fire, Water, etc.)' },
        supertype: { type: 'string', description: "Filter by supertype ('Pokémon', 'Trainer', 'Energy')" },
        rarity:    { type: 'string', description: 'Filter by rarity' },
        set_id:    { type: 'string', description: 'Filter by set ID' },
        hp_min:    { type: 'integer', description: 'Minimum HP' },
        hp_max:    { type: 'integer', description: 'Maximum HP' },
        limit:     { type: 'integer', description: 'Max results (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_card_by_id',
    description: 'Get full details for a specific card by its ID (e.g. "sv3-125").',
    input_schema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Card ID' },
      },
    },
  },
  {
    name: 'compare_cards',
    description: 'Side-by-side comparison of two cards by ID.',
    input_schema: {
      type: 'object' as const,
      required: ['card_id_1', 'card_id_2'],
      properties: {
        card_id_1: { type: 'string' },
        card_id_2: { type: 'string' },
      },
    },
  },
  {
    name: 'validate_deck',
    description: 'Validate a deck file for Standard format legality.',
    input_schema: {
      type: 'object' as const,
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Absolute path to deck TOML or JSON file' },
      },
    },
  },
];

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  mcp: McpClient
): Promise<string> {
  try {
    const result = await mcp.callTool(name, input) as McpToolResult;
    return result.content.find((c) => c.type === 'text')?.text ?? '(no output)';
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

---

### 8. Agent Loop (`src/agent/loop.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { McpClient } from '../mcp/client';
import { AGENT_TOOLS, dispatchTool } from './tools';

const MODEL = 'claude-sonnet-4-5';

export async function runAgentTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  mcp: McpClient
): Promise<Anthropic.MessageParam[]> {
  const updated = [...messages];

  while (true) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: AGENT_TOOLS as Anthropic.Tool[],
      messages: updated,
    });

    process.stdout.write('\n');

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        process.stdout.write(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    updated.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      process.stdout.write('\n');
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      process.stdout.write(`\n[tool: ${block.name}]\n`);
      const output = await dispatchTool(
        block.name,
        block.input as Record<string, unknown>,
        mcp
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: output,
      });
    }

    updated.push({ role: 'user', content: toolResults });
  }

  return updated;
}
```

---

### 9. Deck Writer (`src/deck/writer.ts`)

Persists a proposed deck version as a new TOML file alongside the original.
Stub for now — the save flow is a future enhancement.

```typescript
import { resolve, dirname, basename, extname } from 'node:path';
import { stringify } from 'smol-toml';

export interface DeckVersionWrite {
  readonly originalPath: string;
  readonly name: string;
  readonly format: string;
  readonly regulationMarks: readonly string[];
  readonly cards: ReadonlyArray<{ readonly id: string; readonly quantity: number }>;
  readonly meta: Record<string, string>;
}

export function resolveVersionPath(originalPath: string, version: number): string {
  const dir  = dirname(resolve(originalPath));
  const base = basename(originalPath, extname(originalPath));
  return `${dir}/${base}.v${version}.toml`;
}

export async function writeDeckVersion(
  opts: DeckVersionWrite,
  version: number
): Promise<string> {
  const outPath = resolveVersionPath(opts.originalPath, version);
  const data = {
    name:             opts.name,
    format:           opts.format,
    regulation_marks: opts.regulationMarks,
    cards:            opts.cards.map((c) => ({ id: c.id, quantity: c.quantity })),
    meta:             opts.meta,
  };
  await Bun.write(outPath, stringify(data));
  return outPath;
}
```

---

### 10. Entry Point (`src/index.ts`)

Wires everything together. `parseArgs()` takes no arguments — `cac` reads `process.argv`
internally.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'node:readline/promises';
import { parseArgs } from './args';
import { McpClient } from './mcp/client';
import { loadAndEnrichDeck } from './deck/loader';
import { buildSystemPrompt } from './agent/prompt';
import { runAgentTurn } from './agent/loop';

async function main(): Promise<void> {
  const args = parseArgs();   // cac reads process.argv internally

  // API key guard — only for Anthropic REPL mode
  let apiKey: string | undefined;
  if (args.provider === 'anthropic') {
    apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      console.error(
        'Error: ANTHROPIC_API_KEY environment variable is required for --provider anthropic'
      );
      process.exit(1);
    }
  }

  // MCP server — required in both modes
  console.log('Starting MCP server...');
  const mcp = new McpClient(args.mcpServerPath);
  await mcp.initialize();
  console.log('MCP server ready.');

  // Deck loading — empty array is valid for --provider chrome
  const decks = await Promise.all(
    args.deckPaths.map((p) => {
      console.log(`Loading deck: ${p}`);
      return loadAndEnrichDeck(p, mcp);
    })
  );
  if (decks.length > 0) {
    console.log(`Loaded ${decks.length} deck(s): ${decks.map((d) => d.name).join(', ')}`);
  }

  // ── Browser mode (SPEC_05) ─────────────────────────────────────────────────

  if (args.provider === 'chrome') {
    if (decks.length > 1) {
      console.warn(
        'Warning: browser mode supports one deck at a time. Using first deck: ' +
          decks[0]!.name
      );
    }

    const { startBrowserServer } = await import('./browser/server');
    const { openInBrowser }      = await import('./browser/open');

    const deck   = decks[0] ?? null;
    const server = startBrowserServer(deck, mcp);
    const url    = `http://localhost:${server.port}`;

    console.log(`Serving deck at: ${url}`);
    if (!deck) console.log('No deck loaded — browser will open the deck builder.');
    console.log('Press Ctrl+C to stop.\n');
    openInBrowser(url);

    const shutdown = (): never => {
      server.close();
      mcp.destroy();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await new Promise<never>(() => {});
  }

  // ── Anthropic REPL mode ────────────────────────────────────────────────────

  const systemPrompt = buildSystemPrompt(decks);

  if (args.dryRun) {
    console.log('\n--- SYSTEM PROMPT (dry run) ---\n');
    console.log(systemPrompt);
    mcp.destroy();
    process.exit(0);
  }

  const anthropic = new Anthropic({ apiKey });
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });
  const messages: Anthropic.MessageParam[] = [];

  console.log('\nSession ready. Type your question or "quit" to exit.\n');

  while (true) {
    const input   = await rl.question('You: ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === 'quit' || trimmed === 'exit') break;

    messages.push({ role: 'user', content: trimmed });
    const updated = await runAgentTurn(anthropic, messages, systemPrompt, mcp);
    messages.splice(0, messages.length, ...updated);
  }

  rl.close();
  mcp.destroy();
  console.log('\nSession ended.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

---

## File Structure

```
apps/deck-cli/
├── package.json           # bin.johto → dist/johto.mjs | bin.bun-johto → src/index.ts
├── tsconfig.json          # bundt conventions: Preserve/bundler/verbatimModuleSyntax
├── build/
│   └── index.ts           # Bun.build() script — produces dist/johto.mjs
├── dist/                  # gitignored — created by `bun run build`
│   ├── johto.mjs          # bundled executable (shebang, chmod +x)
│   └── johto.mjs.map      # linked source map
├── src/
│   ├── index.ts           # entry point
│   ├── args.ts            # cac-based argument parsing
│   ├── mcp/
│   │   ├── client.ts      # JSON-RPC MCP client (stdin/stdout)
│   │   └── types.ts       # McpContent, McpToolResult
│   ├── deck/
│   │   ├── loader.ts      # loadAndEnrichDeck via MCP
│   │   ├── writer.ts      # writeDeckVersion (TOML write-back)
│   │   └── types.ts       # EnrichedDeck, CardDetail, etc.
│   ├── agent/
│   │   ├── loop.ts        # Anthropic streaming agent loop
│   │   ├── prompt.ts      # buildSystemPrompt (SPEC_04)
│   │   └── tools.ts       # AGENT_TOOLS + dispatchTool
│   └── browser/           # SPEC_05 — browser mode
│       ├── server.ts
│       ├── open.ts
│       └── template.ts
└── decks/
    └── example.toml       # bundled example deck
```

`dist/` is gitignored. The binary is never committed — it is produced locally or in CI
via `bun run build`.

---

## Acceptance Criteria

- [ ] `bun run build` in `apps/deck-cli` produces `dist/johto.mjs` with a `#!/usr/bin/env bun`
      shebang and executable permissions (`chmod +x`)
- [ ] `bun run typecheck` reports zero errors
- [ ] `bun run dev -- --help` prints usage without error (dev alias runs source directly)
- [ ] `./dist/johto.mjs --help` prints usage without error (production binary)
- [ ] `./dist/johto.mjs --deck ./decks/example.toml --dry-run` prints the system prompt
      and exits 0
- [ ] `./dist/johto.mjs --deck ./decks/example.toml` opens a REPL and receives a streamed
      response to the first message
- [ ] `./dist/johto.mjs --provider chrome` opens browser without error and without
      `ANTHROPIC_API_KEY` set
- [ ] If `ANTHROPIC_API_KEY` is unset and `--provider anthropic`, CLI exits with a clear
      error before spawning the MCP server
- [ ] If `--deck` path does not exist, MCP server returns an error that the CLI surfaces
      clearly
- [ ] MCP server child process is killed when the CLI exits (no zombie processes)
- [ ] `--provider invalid` exits with a clear error listing valid options
- [ ] `bun run build` is idempotent — running it twice produces identical output

---

## Dependencies

- SPEC_01 (deck file format)
- SPEC_02 (MCP server `load_deck` tool)
- SPEC_04 (agent system prompt — `buildSystemPrompt`)
- SPEC_05 (browser mode — `browser/` module, imported dynamically)

---

## Verification

```bash
cd apps/deck-cli

# Install deps
bun install

# Typecheck (no emit)
bun run typecheck

# Build
bun run build
# Expected: ✓  dist/johto.mjs  XX kB  XXXms

# Verify shebang
head -1 dist/johto.mjs
# Expected: #!/usr/bin/env bun

# Verify executable bit
ls -la dist/johto.mjs | grep -q 'x' && echo "PASS" || echo "FAIL"

# Help text from built binary
./dist/johto.mjs --help

# Dry run (no API call, no browser)
./dist/johto.mjs --deck ./decks/example.toml --dry-run

# Dev alias — runs source directly, no build required
bun run dev -- --deck ./decks/example.toml --dry-run

# Full REPL session (requires ANTHROPIC_API_KEY + built mcp-server)
ANTHROPIC_API_KEY=sk-ant-... ./dist/johto.mjs --deck ./decks/example.toml

# Rebuild is clean
bun run build && bun run build  # second run should produce same output
```
