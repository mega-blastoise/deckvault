#!/usr/bin/env bun
import { join } from 'node:path';

/**
 * Bundles the browser client into `page.client.js.txt`, which template.ts
 * imports with `{ type: 'text' }` and the server hands back from `/app.js`.
 * Keeping the output as a text-importable file preserves the single-binary
 * property: the compiled CLI carries the whole page, and the server never reads
 * from disk.
 *
 * The `.txt` extension is deliberate — a text import on a `.js` file hits a
 * loader conflict in Bun.
 */
const ROOT = join(import.meta.dir, '..');
const OUT = join(ROOT, 'src/browser/page.client.js.txt');

const result = await Bun.build({
  entrypoints: [join(ROOT, 'src/browser/app/main.tsx')],
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}

const artifact = result.outputs[0];
if (!artifact) {
  console.error('page build produced no output');
  process.exit(1);
}

const code = await artifact.text();
await Bun.write(OUT, code);
console.log(`✓  page.client.js.txt  ${(code.length / 1024).toFixed(1)} kB`);
