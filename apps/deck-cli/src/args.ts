import cac from 'cac';

export function resolveDefaultMcpPath(): string {
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

export function buildCli() {
  const cli = cac('johto');

  cli.command('run', 'Start a deck refinement session')
    .option('-d, --deck <path>', 'Deck file (.toml or .json). Repeatable.')
    .option('--provider <name>', 'anthropic (default) or chrome', { default: 'anthropic' })
    .option('--dry-run', 'Print system prompt and exit')
    .option('--stats', 'Print probability table before REPL')
    .option('--spotlight <id>', 'Highlight card in stats. Repeatable.')
    .option('--mcp-server <path>', 'Path to pokemon-mcp-server binary')
    .option('--browser-port <port>', 'Port for browser mode (default: random)')
    .action(async (options) => {
      const { runCommand } = await import('./commands/run');
      await runCommand(options);
    });

  cli.command('init', 'Interactive first-run setup wizard')
    .action(async () => {
      const { initCommand } = await import('./commands/init');
      await initCommand();
    });

  cli.command('sync-data', 'Refresh the card database')
    .option('--rebuild', 'Rebuild from JSON sources (requires Bun on PATH)')
    .option('--source <dir>', 'Path to tcg-data JSON tree (with --rebuild)')
    .action(async (options) => {
      const { syncDataCommand } = await import('./commands/sync-data');
      await syncDataCommand(options);
    });

  cli.command('doctor', 'Diagnose install — binaries, DB, API key, network')
    .action(async () => {
      const { doctorCommand } = await import('./commands/doctor');
      await doctorCommand();
    });

  cli.command('auth <action> [...args]', 'Auth management: set <provider> <key> | show')
    .action(async (action: string, args: string[]) => {
      const { authCommand } = await import('./commands/auth');
      if (action === 'set') {
        const provider = args[0];
        const key = args[1];
        if (!provider || !key) {
          console.error('Usage: johto auth set <provider> <key>');
          process.exit(1);
        }
        await authCommand.set(provider, key);
      } else if (action === 'show') {
        await authCommand.show();
      } else {
        console.error(`Unknown auth action: "${action}". Use "set" or "show".`);
        process.exit(1);
      }
    });

  cli.command('', 'Default: run')
    .option('-d, --deck <path>', '')
    .option('--provider <name>', '', { default: 'anthropic' })
    .option('--dry-run', '')
    .option('--stats', '')
    .option('--spotlight <id>', '')
    .option('--mcp-server <path>', '')
    .option('--browser-port <port>', '')
    .action(async (options) => {
      if (!options.deck) {
        cli.outputHelp();
        return;
      }
      const { runCommand } = await import('./commands/run');
      await runCommand(options);
    });

  cli.help();
  cli.version('0.1.0');
  return cli;
}
