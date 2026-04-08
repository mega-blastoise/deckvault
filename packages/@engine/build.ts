import { library, build } from '@pokemon/build';

await build(
  library({
    entrypoints: ['lib/index.ts', 'lib/types/index.ts', 'lib/browser.ts'],
    external: ['bun:sqlite', 'bun:ffi', 'bun:test']
  })
);
