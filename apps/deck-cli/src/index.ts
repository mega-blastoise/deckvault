import { buildCli } from './args';

const cli = buildCli();

try {
  cli.parse();
} catch (err) {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
}
