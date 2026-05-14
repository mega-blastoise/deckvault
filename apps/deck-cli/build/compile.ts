#!/usr/bin/env bun

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

interface Target {
  readonly bunTarget: string;
  readonly npmOs: 'linux' | 'darwin';
  readonly npmCpu: 'x64' | 'arm64';
  readonly suffix: string;
}

const TARGETS: readonly Target[] = [
  { bunTarget: 'bun-linux-x64', npmOs: 'linux', npmCpu: 'x64', suffix: 'linux-x64' },
  { bunTarget: 'bun-linux-arm64', npmOs: 'linux', npmCpu: 'arm64', suffix: 'linux-arm64' },
  { bunTarget: 'bun-darwin-x64', npmOs: 'darwin', npmCpu: 'x64', suffix: 'darwin-x64' },
  { bunTarget: 'bun-darwin-arm64', npmOs: 'darwin', npmCpu: 'arm64', suffix: 'darwin-arm64' }
];

const ROOT = join(import.meta.dir, '..');
const ENTRYPOINT = join(ROOT, 'src/index.ts');
const MONO_ROOT = join(ROOT, '../..');
const OUT_BASE = join(MONO_ROOT, 'dist-packages/cli-platforms');
const TMPL_DIR = join(OUT_BASE, '_template');

const requestedSuffix = Bun.argv[2];
const targets = requestedSuffix
  ? TARGETS.filter((t) => t.suffix === requestedSuffix)
  : [...TARGETS];

if (requestedSuffix && targets.length === 0) {
  console.error(
    `Unknown suffix "${requestedSuffix}". Valid: ${TARGETS.map((t) => t.suffix).join(', ')}`
  );
  process.exit(1);
}

for (const target of targets) {
  const outDir = join(OUT_BASE, target.suffix);
  const binDir = join(outDir, 'bin');
  mkdirSync(binDir, { recursive: true });

  console.log(`Building ${target.suffix} (${target.bunTarget})...`);
  const proc = Bun.spawn(
    [
      'bun',
      'build',
      ENTRYPOINT,
      '--compile',
      `--target=${target.bunTarget}`,
      '--minify',
      '--sourcemap=none',
      `--outfile=${join(binDir, 'johto')}`
    ],
    { stdout: 'inherit', stderr: 'inherit' }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`Build failed for ${target.suffix} (exit ${exitCode})`);
    process.exit(1);
  }

  const pkgTmpl = await Bun.file(join(TMPL_DIR, 'package.json.tmpl')).text();
  const pkg = pkgTmpl
    .replaceAll('${SUFFIX}', target.suffix)
    .replaceAll('${OS}', target.npmOs)
    .replaceAll('${CPU}', target.npmCpu);
  await Bun.write(join(outDir, 'package.json'), pkg);

  const readmeTmpl = await Bun.file(join(TMPL_DIR, 'README.md.tmpl')).text();
  const readme = readmeTmpl.replaceAll('${SUFFIX}', target.suffix);
  await Bun.write(join(outDir, 'README.md'), readme);

  console.log(`Done: ${target.suffix} -> ${binDir}/johto`);
}
