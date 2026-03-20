import { server, build } from '@pokemon/build';

await build(server({ packages: 'bundle', external: [], env: 'disable' }));
