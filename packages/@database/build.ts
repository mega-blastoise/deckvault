import { library, build } from '@pokemon/build';

await build(
  library({
    entrypoints: ['lib/index.ts', 'lib/sqlite.ts'],
    external: ['pg', 'neo4j-driver']
  })
);
