export interface SyncDataOptions {
  readonly rebuild?: boolean;
  readonly source?: string;
}

async function isBunAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['bun', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

export async function syncDataCommand(options: SyncDataOptions): Promise<void> {
  const dbPath = process.env['JOHTO_DB_PATH'] ?? '(default)';

  if (!options.rebuild) {
    console.log(`Card database is up to date.`);
    console.log(`  DB path: ${dbPath}`);
    return;
  }

  if (!(await isBunAvailable())) {
    console.error('Error: --rebuild requires Bun >= 1.3 on PATH.');
    console.error('');
    console.error('Install Bun: https://bun.sh/docs/installation');
    console.error('Then re-run: johto sync-data --rebuild');
    process.exit(1);
  }

  console.log('Rebuilding card database from JSON sources...');

  const args = ['x', 'johto-card-data-rebuild'];
  if (options.source) {
    args.push('--source', options.source);
  }

  const proc = Bun.spawn(['bun', ...args], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`Rebuild failed with exit code ${exitCode}`);
    process.exit(exitCode);
  }

  console.log('Rebuild complete.');
}
