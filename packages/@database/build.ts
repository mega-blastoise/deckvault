import { library, build } from '@pokemon/build';

await build(
  library({
    packages: 'bundle',
    external: ['pg', 'neo4j-driver', 'debug', 'chalk', 'node-emoji']
  })
);
