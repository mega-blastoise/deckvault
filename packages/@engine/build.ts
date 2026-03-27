import { library, build } from '@pokemon/build';

await build(
  library({
    entrypoints: ['lib/index.ts', 'lib/types/index.ts']
  })
);
