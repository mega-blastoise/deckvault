import { library, build } from '@pokemon/build';

await build(
  library({
    external: ['pg', 'neo4j-driver']
  })
);
