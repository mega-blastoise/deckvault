import { buildCli } from './args';

process.on('unhandledRejection', (reason) => {
  console.error('Fatal error:', reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

const cli = buildCli();

try {
  cli.parse();
} catch (err) {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
}
