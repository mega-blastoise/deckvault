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

  const provider = options['provider'] as string;
  if (provider !== 'anthropic' && provider !== 'chrome') {
    console.error(`Error: Unknown provider "${provider}". Valid options: anthropic, chrome`);
    process.exit(1);
  }

  if (options['dryRun'] && provider === 'chrome') {
    console.error(
      'Error: --dry-run is not applicable in browser mode (--provider chrome)'
    );
    process.exit(1);
  }

  const raw = options['deck'];
  const deckPaths: string[] = raw
    ? Array.isArray(raw)
      ? raw
      : [raw]
    : [];

  if (deckPaths.length === 0 && provider !== 'chrome') {
    console.error('Error: --deck is required for --provider anthropic');
    process.exit(1);
  }

  const mcpServerPath =
    (options['mcpServer'] as string | undefined) ?? resolveDefaultMcpPath();

  return {
    deckPaths,
    dryRun: Boolean(options['dryRun']),
    mcpServerPath,
    provider: provider as LlmProvider,
  };
}

function resolveDefaultMcpPath(): string {
  const root = new URL('../../..', import.meta.url).pathname;
  return `${root}/apps/mcp-server/target/release/pokemon-mcp-server`;
}
