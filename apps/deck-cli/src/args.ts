import cac from 'cac';

export type LlmProvider = 'anthropic' | 'chrome';

export interface CliArgs {
  readonly deckPaths: readonly string[];
  readonly dryRun: boolean;
  readonly mcpServerPath: string;
  readonly provider: LlmProvider;
  readonly stats: boolean;
  readonly spotlightIds: readonly string[];
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
    )
    .option('--stats', 'Print probability table after deck load, before REPL')
    .option('--spotlight <id>', 'Pin card ID to ★ in --stats output. Repeatable.');

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

  if (options['stats'] && provider === 'chrome') {
    console.error(
      'Error: --stats is not applicable in browser mode (--provider chrome)'
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

  const rawSpotlight = options['spotlight'];
  const spotlightIds: string[] = rawSpotlight
    ? Array.isArray(rawSpotlight)
      ? rawSpotlight
      : [rawSpotlight]
    : [];

  const mcpServerPath =
    (options['mcpServer'] as string | undefined) ?? resolveDefaultMcpPath();

  return {
    deckPaths,
    dryRun: Boolean(options['dryRun']),
    mcpServerPath,
    provider: provider as LlmProvider,
    stats: Boolean(options['stats']),
    spotlightIds,
  };
}

function resolveDefaultMcpPath(): string {
  const fromEnv = process.env['JOHTO_MCP_SERVER_PATH'];
  if (fromEnv) return fromEnv;

  if (import.meta.url.startsWith('file://')) {
    const root = new URL('../../..', import.meta.url).pathname;
    return `${root}/apps/mcp-server/target/release/pokemon-mcp-server`;
  }

  throw new Error(
    'JOHTO_MCP_SERVER_PATH is not set and no monorepo-relative fallback is available. ' +
    'This is unexpected — run `johto doctor` to diagnose.'
  );
}
