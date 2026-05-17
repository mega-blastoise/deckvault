#!/usr/bin/env bun
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';

const raw = process.argv[2] ?? '';
const version = semver.valid(raw.replace(/^v/, ''));
if (!version) {
  console.error(`Expected tag of form vX.Y.Z(-prerelease), got: "${raw}"`);
  process.exit(1);
}

const DIST = 'dist-packages';

const targets = [
  ...readdirSync(`${DIST}/cli-platforms`).filter((d) => d !== '_template').map((d) => `${DIST}/cli-platforms/${d}`),
  ...readdirSync(`${DIST}/mcp-server-platforms`).filter((d) => d !== '_template').map((d) => `${DIST}/mcp-server-platforms/${d}`),
  `${DIST}/cli`,
];

for (const dir of targets) {
  const pkgPath = join(dir, 'package.json');
  try {
    const pkg = await Bun.file(pkgPath).json();
    pkg.version = version;

    for (const key of ['dependencies', 'optionalDependencies'] as const) {
      const deps = pkg[key] as Record<string, string> | undefined;
      if (!deps) continue;
      for (const dep of Object.keys(deps)) {
        if (deps[dep] === 'workspace:*' && dep.startsWith('@johto-ai/')) {
          deps[dep] = version;
        }
      }
    }

    const peerDeps = pkg.peerDependencies as Record<string, string> | undefined;
    if (peerDeps) {
      for (const dep of Object.keys(peerDeps)) {
        if (peerDeps[dep] === 'workspace:*' && dep === '@johto-ai/card-data') {
          peerDeps[dep] = '>=0.1.0';
        }
      }
    }

    await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // Skip dirs without package.json (e.g. _template)
  }
}

console.log(`Stamped ${targets.length} package.json files to ${version}`);
