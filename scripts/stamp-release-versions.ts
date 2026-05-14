#!/usr/bin/env bun
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2]!.replace(/^v/, '');
const DIST = 'dist-packages';

const targets = [
  ...readdirSync(`${DIST}/cli-platforms`).filter(d => d !== '_template').map((d) => `${DIST}/cli-platforms/${d}`),
  ...readdirSync(`${DIST}/mcp-server-platforms`).filter(d => d !== '_template').map((d) => `${DIST}/mcp-server-platforms/${d}`),
  `${DIST}/cli`,
  `${DIST}/card-data`,
];

for (const dir of targets) {
  const pkgPath = join(dir, 'package.json');
  try {
    const pkg = JSON.parse(await Bun.file(pkgPath).text()) as Record<string, unknown>;
    pkg['version'] = version;

    for (const key of ['dependencies', 'optionalDependencies'] as const) {
      const deps = pkg[key] as Record<string, string> | undefined;
      if (!deps) continue;
      for (const dep of Object.keys(deps)) {
        if (deps[dep] === 'workspace:*' && dep.startsWith('@johto/')) {
          deps[dep] = version;
        }
      }
    }

    await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // Skip dirs without package.json (e.g. _template)
  }
}
console.log(`Stamped ${targets.length} package.json files to ${version}`);
