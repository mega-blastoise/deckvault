import 'dotenv/config.js';
import { browser, concurrent_build, report_outputs } from '@pokemon/build';

try {
  const outputs = await concurrent_build(
    browser({
      entrypoints: ['src/web/browser/browser.tsx'],
      naming: { entry: 'www/[name].[hash].[ext]' }
    }),
    browser({
      entrypoints: ['src/workers/simulation.worker.ts'],
      outdir: './out',
      naming: { entry: 'www/workers/[name].[ext]' }
    })
  );
  report_outputs(outputs);
} catch (e) {
  console.error('Build process failed:', e);
}
