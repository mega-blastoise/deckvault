#!/usr/bin/env bun

import { join } from 'node:path';

const ROOT = import.meta.dir + '/..';
const start = performance.now();

const result = await Bun.build({
  entrypoints: [join(ROOT, 'src/index.ts')],
  outdir: join(ROOT, 'dist'),
  target: 'bun',
  format: 'esm',
  naming: { entry: 'johto.mjs' },
  minify: false,
  sourcemap: 'linked',
  packages: 'external',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

if (!result.success) {
  for (const msg of result.logs) console.error(msg);
  process.exit(1);
}

const binPath = join(ROOT, 'dist/johto.mjs');
const content = await Bun.file(binPath).text();

if (!content.startsWith('#!')) {
  await Bun.write(binPath, '#!/usr/bin/env bun\n' + content);
}

Bun.spawnSync(['chmod', '+x', binPath]);

const elapsed = (performance.now() - start).toFixed(0);
const sizeKb = (result.outputs.reduce((n, o) => n + o.size, 0) / 1024).toFixed(1);
console.log(`✓  dist/johto.mjs  ${sizeKb} kB  ${elapsed}ms`);
