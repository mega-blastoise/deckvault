import { server, build } from '@pokemon/build';

await build(
  server({
    env: 'disable',
    external: [],
    packages: 'bundle',
    splitting: true,
    naming: { entry: 'main.js' }
  })
);
