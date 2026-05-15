# SPEC_09: Packaging and Distribution

## Context

SPEC_01 through SPEC_08 produced a fully functional `johto` CLI inside the monorepo.
Today the tool requires:

- A checked-out copy of `deckvault/`
- A locally-built `apps/mcp-server` release binary
- The `database/pokemon-data.sqlite3.db` SQLite file (~19 MB)
- Bun ≥ 1.3 on the host
- `ANTHROPIC_API_KEY` in the environment (REPL mode only)

This spec defines how to ship the tool as a public, installable CLI with no
monorepo checkout, no Rust toolchain on the host, and no manual database setup.

Three distribution channels are in scope:

1. **npm** — primary path. `npm install -g @johto/cli` (or `bunx @johto/cli`).
2. **Docker / GHCR** — secondary path. `docker run ... ghcr.io/.../johto`.
3. **GitHub Release binaries + curl installer** — tertiary path. `curl -fsSL https://johto.dev/install.sh | sh`.

The release artifact for v1 is a coordinated set of 9 npm packages, a multi-arch
Docker image, and per-platform release tarballs — all produced by a single
tag-triggered GitHub Actions workflow.

---

## Prerequisites

- SPEC_01 through SPEC_07 complete and merged
- `apps/deck-cli` builds cleanly via `bun run build` producing `dist/johto.mjs`
- `apps/mcp-server` builds cleanly via `cargo build --release` producing
  `target/release/pokemon-mcp-server`
- The pokemon-tcg-data git submodule (or fork) and the JSON-to-SQLite scaffold
  script that builds `database/pokemon-data.sqlite3.db` from raw JSON are
  identifiable in the repo (used as the source-of-truth for `@johto/card-data`)

---

## Non-Goals (v1)

| Out of scope | Why deferred |
|---|---|
| `windows-x64` platform support | Bun on Windows still has rough edges in `Bun.spawn` and stdio; cargo cross-compile to MSVC adds CI complexity. Tracked for v1.1 |
| Extraction to a standalone `johto/` repo | Pre-launch the cost of a split repo (subtree pushes, drift, dual CI) outweighs the public-surface benefit. Re-evaluate at v2 once adoption justifies it |
| Homebrew tap | Possible follow-up. GH Release binaries + curl installer cover the same audience for v1 |
| Auto-update mechanism | Out of scope. Users update via `npm update -g @johto/cli`, `docker pull`, or re-running the installer |
| Telemetry / opt-in analytics | Not in v1 |

---

## Package Topology

Nine npm packages in v1, plus one Docker image and a set of GH Release tarballs.

```
                           ┌─────────────────────────┐
                           │      @johto/cli         │  ← what users install
                           │  (meta, JS shim only)   │
                           └────────────┬────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │ optionalDependencies    │                         │
              ▼                         ▼                         ▼
   ┌───────────────────┐     ┌───────────────────┐     ┌────────────────────┐
   │ @johto/cli-*      │     │ @johto/mcp-       │     │ @johto/card-data   │
   │   linux-x64       │     │ server-*          │     │ (single, all-arch) │
   │   linux-arm64     │     │   linux-x64       │     │                    │
   │   darwin-x64      │     │   linux-arm64     │     │ Ships prebuilt     │
   │   darwin-arm64    │     │   darwin-x64      │     │ SQLite + scaffold  │
   │                   │     │   darwin-arm64    │     │ pipeline source    │
   │ bun-compiled      │     │ cargo --release   │     │                    │
   │ standalone binary │     │ stripped binary   │     │                    │
   └───────────────────┘     └───────────────────┘     └────────────────────┘
```

| Package | Type | npm `os` | npm `cpu` | Size (est.) | Source |
|---|---|---|---|---|---|
| `@johto/cli` | meta + JS shim | — | — | < 50 KB | `apps/deck-cli/dist/shim/` |
| `@johto/cli-linux-x64` | platform binary | `linux` | `x64` | ~25 MB | `bun build --compile` |
| `@johto/cli-linux-arm64` | platform binary | `linux` | `arm64` | ~25 MB | `bun build --compile` |
| `@johto/cli-darwin-x64` | platform binary | `darwin` | `x64` | ~25 MB | `bun build --compile` |
| `@johto/cli-darwin-arm64` | platform binary | `darwin` | `arm64` | ~25 MB | `bun build --compile` |
| `@johto/mcp-server-linux-x64` | platform binary | `linux` | `x64` | ~6 MB | `cargo build --release --target x86_64-unknown-linux-gnu` |
| `@johto/mcp-server-linux-arm64` | platform binary | `linux` | `arm64` | ~6 MB | `cargo build --release --target aarch64-unknown-linux-gnu` |
| `@johto/mcp-server-darwin-x64` | platform binary | `darwin` | `x64` | ~6 MB | `cargo build --release --target x86_64-apple-darwin` |
| `@johto/mcp-server-darwin-arm64` | platform binary | `darwin` | `arm64` | ~6 MB | `cargo build --release --target aarch64-apple-darwin` |
| `@johto/card-data` | data + pipeline | — | — | ~19 MB | `database/pokemon-data.sqlite3.db` + scaffold pipeline |

### Selection mechanism (npm)

The meta `@johto/cli` package declares all platform packages under
`optionalDependencies`. npm installs only the one whose `os` and `cpu` fields
match the host. Packages whose constraints fail to match are silently skipped
(not errors). The JS shim in `@johto/cli` resolves the matching platform
package at runtime via `require.resolve` and execs into the binary.

This is the same pattern used by esbuild, swc, biome, lightningcss, and rollup.

---

## Distribution Channels — User-Facing Commands

### npm (primary)

```bash
# Global install
npm install -g @johto/cli
johto init                                  # interactive setup wizard
johto run --deck ./decks/my-deck.toml

# Or ephemeral via bunx / npx
bunx @johto/cli run --deck ./decks/my-deck.toml
```

### Docker / GHCR (secondary)

```bash
docker run --rm -it \
  -v "$PWD/decks:/decks" \
  -v "$HOME/.config/johto:/root/.config/johto" \
  -e ANTHROPIC_API_KEY \
  ghcr.io/nicholasgalante1997/johto:latest \
  run --deck /decks/my-deck.toml
```

Multi-arch (`linux/amd64`, `linux/arm64`). Browser mode is supported but
requires `-p 0:0` and the user opens the URL on their own machine — documented
caveat.

### Curl installer (tertiary)

```bash
curl -fsSL https://johto.dev/install.sh | sh
```

Detects platform, downloads the matching GH Release tarball into
`~/.local/share/johto/bin/`, symlinks `johto` into `~/.local/bin/`, and prompts
the user to add `~/.local/bin` to PATH if not already present.

---

## Phase 1: Workspace and Package Topology

### Directory layout

Add a new top-level workspace folder for the published-package wrappers. The
existing `apps/deck-cli` and `apps/mcp-server` remain canonical sources; the
new `dist-packages/` tree is purely an output target for CI to assemble before
publishing.

```
deckvault/
├── apps/
│   ├── deck-cli/                        # unchanged — canonical CLI source
│   └── mcp-server/                      # unchanged — canonical MCP source
├── dist-packages/                       # NEW — published-package layouts
│   ├── cli/                             # @johto/cli (meta + shim)
│   │   ├── package.json
│   │   ├── bin/johto.js                 # platform-resolving JS shim
│   │   ├── lib/resolve.js               # binary + data resolver
│   │   └── README.md
│   ├── cli-platforms/                   # @johto/cli-<os>-<arch>
│   │   └── _template/
│   │       ├── package.json.tmpl
│   │       └── README.md.tmpl
│   ├── mcp-server-platforms/            # @johto/mcp-server-<os>-<arch>
│   │   └── _template/
│   │       ├── package.json.tmpl
│   │       └── README.md.tmpl
│   └── card-data/                       # @johto/card-data
│       ├── package.json
│       ├── data/pokemon-data.sqlite3.db # prebuilt artifact (gitignored)
│       ├── scripts/rebuild.ts           # JSON-to-SQLite pipeline
│       └── README.md
├── .changes/                            # NEW — pending change markdown files
│   └── (empty until first `bun scripts/changes.ts add`)
├── scripts/
│   ├── changes.ts                       # NEW — homegrown change/release coordinator
│   └── stamp-release-versions.ts        # NEW — applies version bumps to package.json files
├── .github/
│   └── workflows/
│       └── release.yml                  # NEW — tag-triggered release
└── turbo.json                           # MODIFY — add `pack` / `publish` tasks
```

### Change coordination — hand-rolled, not `@changesets`

`@changesets/cli` is the popular off-the-shelf option for this kind of
multi-package release coordination, but it ships with opinions (mandatory
config schema, lockfile-aware internal dependency graph traversal, its own
markdown frontmatter format) that buy little for our specific topology of
9 packages with two clear cohorts.

Instead, ship a small Bun script that implements the same mental model — drop
a markdown file describing a pending change; CI consumes them at release time
— without the dependency or its conventions.

#### Cohorts

```typescript
// scripts/changes-config.ts
export const COHORTS = {
  cli: {
    packages: [
      '@johto/cli',
      '@johto/cli-linux-x64',
      '@johto/cli-linux-arm64',
      '@johto/cli-darwin-x64',
      '@johto/cli-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  mcpServer: {
    packages: [
      '@johto/mcp-server-linux-x64',
      '@johto/mcp-server-linux-arm64',
      '@johto/mcp-server-darwin-x64',
      '@johto/mcp-server-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  cardData: {
    packages: ['@johto/card-data'],
    versioning: 'independent',
  },
} as const;
```

#### Pending change file format

`.changes/2026-05-13-cli-init-wizard.md`:

```markdown
---
cohort: cli
bump: minor
---

Add `johto init` interactive setup wizard with API key validation and XDG
config persistence.
```

| Field | Values | Required |
|---|---|---|
| `cohort` | `cli`, `mcpServer`, `cardData` | ✅ |
| `bump` | `major`, `minor`, `patch` | ✅ |

Body becomes a CHANGELOG entry.

#### Script surface

```typescript
// scripts/changes.ts — Bun script, ~200 lines
//
// Subcommands:
//   bun scripts/changes.ts add        # interactive: prompt cohort + bump + message, write a file
//   bun scripts/changes.ts list       # print all pending changes
//   bun scripts/changes.ts release    # consume all pending: bump versions, write CHANGELOG, tag, delete files
//   bun scripts/changes.ts release --cohort cardData   # only release one cohort

import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { COHORTS } from './changes-config';

interface PendingChange {
  readonly file: string;
  readonly cohort: keyof typeof COHORTS;
  readonly bump: 'major' | 'minor' | 'patch';
  readonly body: string;
}

async function loadPending(): Promise<readonly PendingChange[]> {
  const files = (await readdir('.changes')).filter((f) => f.endsWith('.md'));
  return Promise.all(files.map(async (file) => {
    const text = await readFile(join('.changes', file), 'utf8');
    const match = text.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`Malformed: .changes/${file}`);
    const frontmatter = Object.fromEntries(
      match[1]!.split('\n').map((l) => l.split(/:\s*/) as [string, string])
    );
    return {
      file,
      cohort: frontmatter['cohort'] as keyof typeof COHORTS,
      bump: frontmatter['bump'] as 'major' | 'minor' | 'patch',
      body: match[2]!.trim(),
    };
  }));
}

function rollUpBumps(changes: readonly PendingChange[]): Map<string, 'major' | 'minor' | 'patch'> {
  const rank = { patch: 0, minor: 1, major: 2 };
  const out = new Map<string, 'major' | 'minor' | 'patch'>();
  for (const c of changes) {
    const current = out.get(c.cohort);
    if (!current || rank[c.bump] > rank[current]) out.set(c.cohort, c.bump);
  }
  return out;
}

function nextVersion(current: string, bump: 'major' | 'minor' | 'patch'): string {
  const [maj, min, pat] = current.split('.').map(Number) as [number, number, number];
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

async function release(filterCohort?: string): Promise<void> {
  const pending = await loadPending();
  if (pending.length === 0) {
    console.log('No pending changes.');
    return;
  }
  const filtered = filterCohort ? pending.filter((p) => p.cohort === filterCohort) : pending;
  const bumpsByCohort = rollUpBumps(filtered);

  for (const [cohort, bump] of bumpsByCohort) {
    const cohortDef = COHORTS[cohort];
    // Read first package's current version (lockstep cohorts share)
    const firstPkg = cohortDef.packages[0]!;
    const pkgPath = resolvePackageJson(firstPkg);
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    const next = nextVersion(pkg.version, bump);

    for (const name of cohortDef.packages) {
      const p = resolvePackageJson(name);
      const obj = JSON.parse(await readFile(p, 'utf8'));
      obj.version = next;
      await writeFile(p, JSON.stringify(obj, null, 2) + '\n');
    }

    await appendChangelog(cohort, next, filtered.filter((p) => p.cohort === cohort));
    console.log(`✓ Bumped cohort ${cohort} → ${next}`);
  }

  for (const c of filtered) await unlink(join('.changes', c.file));
  console.log(`✓ Cleared ${filtered.length} pending changes from .changes/`);
}

// resolvePackageJson, appendChangelog, add(), list(), and the dispatch on
// Bun.argv[2] are mechanical — full implementation in scripts/changes.ts.
```

Notes:

- `cli` and `mcpServer` cohorts each version in lockstep (all packages in
  the cohort move to the same new version on every release).
- `cardData` versions independently — its cohort has a single package, so
  the same lockstep code path handles it.
- The meta `@johto/cli` `optionalDependencies` are stamped to concrete versions
  by `scripts/stamp-release-versions.ts` at publish time (Phase 6) using the
  versions written by `scripts/changes.ts release`. The two scripts do not
  overlap: `changes.ts` decides versions, `stamp-release-versions.ts` propagates
  them into dependency pins and `workspace:*` rewrites.
- No `git commit` or `git tag` is performed by `changes.ts release` — the
  release workflow (Phase 6) handles tagging after the bump commit is reviewed
  and merged. This keeps the human approval gate intact.

#### Release flow

```
1. Developer makes changes on a feature branch
2. Developer runs `bun scripts/changes.ts add` → writes .changes/yyyy-mm-dd-slug.md
3. Branch reviewed and merged to dev
4. Maintainer runs `bun scripts/changes.ts release` on a release branch
   → bumps versions, appends CHANGELOG.md, removes .changes/*.md
5. Maintainer commits and PRs the release branch to dev → review → merge
6. Maintainer tags: `git tag v0.2.0 && git push origin v0.2.0`
7. GitHub Actions workflow (Phase 6) fires on the tag
```

### Turborepo tasks

`/turbo.json` additions:

```json
{
  "tasks": {
    "pack:cli-shim": {
      "outputs": ["dist-packages/cli/**", "!dist-packages/cli/node_modules/**"]
    },
    "pack:cli-platform": {
      "dependsOn": ["@pokemon/deck-cli#build"],
      "outputs": ["dist-packages/cli-platforms/**"]
    },
    "pack:mcp-platform": {
      "dependsOn": ["pokemon-mcp-server#build"],
      "outputs": ["dist-packages/mcp-server-platforms/**"]
    },
    "pack:card-data": {
      "outputs": ["dist-packages/card-data/data/*.db"]
    }
  }
}
```

---

## Phase 2: Build Pipeline

### 2.1 Bun-compiled CLI per platform

Replace the current `bun build` (ESM output) with `bun build --compile` (single
executable). The compile target accepts a Bun-supported target triple.

`apps/deck-cli/build/compile.ts`:

```typescript
#!/usr/bin/env bun
import { join } from 'node:path';

interface Target {
  readonly bunTarget: string;
  readonly npmOs: 'linux' | 'darwin';
  readonly npmCpu: 'x64' | 'arm64';
  readonly suffix: string;
}

const TARGETS: readonly Target[] = [
  { bunTarget: 'bun-linux-x64',    npmOs: 'linux',  npmCpu: 'x64',   suffix: 'linux-x64'    },
  { bunTarget: 'bun-linux-arm64',  npmOs: 'linux',  npmCpu: 'arm64', suffix: 'linux-arm64'  },
  { bunTarget: 'bun-darwin-x64',   npmOs: 'darwin', npmCpu: 'x64',   suffix: 'darwin-x64'   },
  { bunTarget: 'bun-darwin-arm64', npmOs: 'darwin', npmCpu: 'arm64', suffix: 'darwin-arm64' },
];

const ROOT = import.meta.dir + '/..';
const ENTRYPOINT = join(ROOT, 'src/index.ts');
const OUT_BASE = join(ROOT, '../../dist-packages/cli-platforms');

for (const target of TARGETS) {
  const outDir = join(OUT_BASE, target.suffix);
  await Bun.spawn([
    'bun', 'build', ENTRYPOINT,
    '--compile',
    `--target=${target.bunTarget}`,
    '--minify',
    '--sourcemap',
    `--outfile=${join(outDir, 'bin/johto')}`,
  ], { stdout: 'inherit', stderr: 'inherit' }).exited;

  // Stamp a package.json from the template
  const tmpl = await Bun.file(join(OUT_BASE, '_template/package.json.tmpl')).text();
  const pkg = tmpl
    .replaceAll('${SUFFIX}', target.suffix)
    .replaceAll('${OS}', target.npmOs)
    .replaceAll('${CPU}', target.npmCpu);
  await Bun.write(join(outDir, 'package.json'), pkg);
}
```

`dist-packages/cli-platforms/_template/package.json.tmpl`:

```json
{
  "name": "@johto/cli-${SUFFIX}",
  "version": "0.0.0",
  "description": "Platform-specific binary for @johto/cli (${SUFFIX})",
  "license": "MIT",
  "os": ["${OS}"],
  "cpu": ["${CPU}"],
  "bin": { "johto-bin": "./bin/johto" },
  "files": ["bin/"],
  "repository": "https://github.com/nicholasgalante1997/deckvault"
}
```

Note: `version` is `0.0.0` in the template — CI rewrites it to the current
release version before publish (Phase 6).

### 2.2 Rust binary per platform

Cross-compile the MCP server in CI using `cross` (Docker-based) for Linux
targets and the host runner for darwin targets (macOS GH-hosted runners).

`apps/mcp-server/build/pack-platform.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_TRIPLE="${1:?Usage: pack-platform.sh <triple> <suffix>}"
SUFFIX="${2:?}"

OUT_DIR="$(git rev-parse --show-toplevel)/dist-packages/mcp-server-platforms/${SUFFIX}"
mkdir -p "${OUT_DIR}/bin"

if [[ "${TARGET_TRIPLE}" == *-linux-* ]]; then
  cross build --release --target "${TARGET_TRIPLE}" --manifest-path apps/mcp-server/Cargo.toml
else
  cargo build --release --target "${TARGET_TRIPLE}" --manifest-path apps/mcp-server/Cargo.toml
fi

BIN_PATH="apps/mcp-server/target/${TARGET_TRIPLE}/release/pokemon-mcp-server"
strip "${BIN_PATH}" 2>/dev/null || true
cp "${BIN_PATH}" "${OUT_DIR}/bin/pokemon-mcp-server"
chmod +x "${OUT_DIR}/bin/pokemon-mcp-server"

# Stamp package.json (logic identical to CLI platform stamping)
```

Target triples ↔ suffixes:

| Triple | Suffix | npm os/cpu |
|---|---|---|
| `x86_64-unknown-linux-gnu` | `linux-x64` | linux / x64 |
| `aarch64-unknown-linux-gnu` | `linux-arm64` | linux / arm64 |
| `x86_64-apple-darwin` | `darwin-x64` | darwin / x64 |
| `aarch64-apple-darwin` | `darwin-arm64` | darwin / arm64 |

### 2.3 Meta `@johto/cli` package

`dist-packages/cli/package.json`:

```json
{
  "name": "@johto/cli",
  "version": "0.0.0",
  "description": "Competitive Pokémon TCG deck refinement CLI with Anthropic agent loop and browser mode.",
  "license": "MIT",
  "bin": { "johto": "./bin/johto.js" },
  "files": ["bin/", "lib/", "README.md"],
  "engines": { "node": ">=20" },
  "dependencies": {
    "@johto/card-data": "workspace:*"
  },
  "optionalDependencies": {
    "@johto/cli-linux-x64": "workspace:*",
    "@johto/cli-linux-arm64": "workspace:*",
    "@johto/cli-darwin-x64": "workspace:*",
    "@johto/cli-darwin-arm64": "workspace:*",
    "@johto/mcp-server-linux-x64": "workspace:*",
    "@johto/mcp-server-linux-arm64": "workspace:*",
    "@johto/mcp-server-darwin-x64": "workspace:*",
    "@johto/mcp-server-darwin-arm64": "workspace:*"
  },
  "repository": "https://github.com/nicholasgalante1997/deckvault",
  "homepage": "https://johto.dev"
}
```

Note: `workspace:*` is rewritten to a concrete version in CI before publish.

### 2.4 Platform-resolving JS shim

`dist-packages/cli/bin/johto.js`:

```javascript
#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { resolveBinaries } = require('../lib/resolve');

const { cliBin, mcpBin, dbPath } = resolveBinaries();

const args = process.argv.slice(2);
const env = {
  ...process.env,
  JOHTO_MCP_SERVER_PATH: mcpBin,
  JOHTO_DB_PATH: dbPath,
};

const child = spawn(cliBin, args, { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
```

`dist-packages/cli/lib/resolve.js`:

```javascript
const path = require('node:path');
const fs = require('node:fs');

const PLATFORM_MAP = {
  'linux:x64':    'linux-x64',
  'linux:arm64':  'linux-arm64',
  'darwin:x64':   'darwin-x64',
  'darwin:arm64': 'darwin-arm64',
};

function platformSuffix() {
  const key = `${process.platform}:${process.arch}`;
  const suffix = PLATFORM_MAP[key];
  if (!suffix) {
    throw new Error(
      `Unsupported platform ${key}. Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64. ` +
      `Windows is planned for v1.1.`
    );
  }
  return suffix;
}

function resolvePackage(pkgName) {
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    return path.dirname(pkgJson);
  } catch (err) {
    throw new Error(
      `Missing package ${pkgName}. This usually means npm skipped the platform-specific ` +
      `optional dependency. Try \`npm install --force\` or report at https://github.com/nicholasgalante1997/deckvault/issues. ` +
      `Original error: ${err.message}`
    );
  }
}

function resolveBinaries() {
  const suffix = platformSuffix();
  const cliPkg = resolvePackage(`@johto/cli-${suffix}`);
  const mcpPkg = resolvePackage(`@johto/mcp-server-${suffix}`);
  const dataPkg = resolvePackage('@johto/card-data');

  const cliBin = path.join(cliPkg, 'bin', 'johto');
  const mcpBin = path.join(mcpPkg, 'bin', 'pokemon-mcp-server');
  const dbPath = path.join(dataPkg, 'data', 'pokemon-data.sqlite3.db');

  for (const [p, label] of [[cliBin, 'CLI binary'], [mcpBin, 'MCP server'], [dbPath, 'card database']]) {
    if (!fs.existsSync(p)) {
      throw new Error(`${label} not found at ${p}. Try reinstalling: \`npm install -g @johto/cli\`.`);
    }
  }

  return { cliBin, mcpBin, dbPath };
}

module.exports = { resolveBinaries, platformSuffix };
```

---

## Phase 3: `@johto/card-data` Package

### 3.1 Layout

```
dist-packages/card-data/
├── package.json
├── data/
│   └── pokemon-data.sqlite3.db          # prebuilt — gitignored, populated by CI
├── scripts/
│   ├── rebuild.ts                       # JSON-to-SQLite pipeline (top-level entry)
│   ├── sets.ts                          # set inserts
│   ├── cards.ts                         # card inserts
│   └── schema.sql                       # CREATE TABLE statements
├── tcg-data/                            # git submodule or postinstall clone
│   └── (raw JSON from pokemon-tcg-data fork)
└── README.md
```

### 3.2 package.json

```json
{
  "name": "@johto/card-data",
  "version": "0.0.0",
  "description": "Pokemon TCG card database for @johto/cli — prebuilt SQLite plus the deterministic JSON-to-SQLite rebuild pipeline.",
  "license": "MIT",
  "main": "./scripts/rebuild.ts",
  "bin": { "johto-card-data-rebuild": "./scripts/rebuild.ts" },
  "files": [
    "data/pokemon-data.sqlite3.db",
    "scripts/",
    "README.md"
  ],
  "engines": { "bun": ">=1.3" },
  "repository": "https://github.com/nicholasgalante1997/deckvault"
}
```

Notes:

- The `data/*.db` file is gitignored locally but included in the published
  tarball — CI populates it before `npm publish`.
- `scripts/rebuild.ts` requires Bun to execute (it uses `Bun.file`, `bun:sqlite`).
  This is fine: the rebuild path is only invoked via `johto sync-data --rebuild`,
  which spawns the script through the bun-compiled CLI binary.

### 3.3 Rebuild pipeline contract

`scripts/rebuild.ts`:

```typescript
#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

interface RebuildOptions {
  readonly sourceDir: string;         // path to tcg-data JSON tree
  readonly outputPath: string;        // path to write SQLite DB to
  readonly verbose?: boolean;
}

export async function rebuild(opts: RebuildOptions): Promise<void> {
  const db = new Database(opts.outputPath, { create: true, readwrite: true });
  const schema = await Bun.file(join(import.meta.dir, 'schema.sql')).text();
  db.exec(schema);

  const { insertSets } = await import('./sets');
  const { insertCards } = await import('./cards');

  const setCount = await insertSets(db, opts.sourceDir, opts.verbose ?? false);
  const cardCount = await insertCards(db, opts.sourceDir, opts.verbose ?? false);

  db.close();
  console.log(`✓ Rebuilt ${opts.outputPath}: ${setCount} sets, ${cardCount} cards`);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const sourceDir = args.find((_, i) => args[i - 1] === '--source') ?? './tcg-data';
  const outputPath = args.find((_, i) => args[i - 1] === '--out') ?? './data/pokemon-data.sqlite3.db';
  await rebuild({ sourceDir, outputPath, verbose: args.includes('--verbose') });
}
```

### 3.4 `johto sync-data` subcommand integration

```bash
# Use the prebuilt SQLite from the installed @johto/card-data version (default)
johto sync-data

# Fetch the latest tcg-data JSON and rebuild locally (bun required on PATH)
johto sync-data --rebuild --source ~/src/pokemon-tcg-data
```

The default path (`johto sync-data`) is a no-op for npm installs — the prebuilt
DB is already in place. It is useful for the curl-installer and Docker paths
where the DB lives outside the npm tree.

The `--rebuild` flag execs the `johto-card-data-rebuild` bin from
`@johto/card-data`. This requires Bun on PATH and is documented as an advanced
workflow.

---

## Phase 4: Runtime Path Resolution Refactor

Two production-grade changes are required on the canonical CLI and MCP server
so that the shim-injected env vars are honoured.

### 4.1 CLI: `apps/deck-cli/src/args.ts`

Replace the hardcoded monorepo-relative path resolver with an
env-first / explicit-flag-second / fallback-last chain.

Current (line 95–98):

```typescript
function resolveDefaultMcpPath(): string {
  const root = new URL('../../..', import.meta.url).pathname;
  return `${root}/apps/mcp-server/target/release/pokemon-mcp-server`;
}
```

Replace with:

```typescript
function resolveDefaultMcpPath(): string {
  const fromEnv = process.env['JOHTO_MCP_SERVER_PATH'];
  if (fromEnv) return fromEnv;

  // Monorepo-relative fallback for `bun run dev` from the workspace.
  // When running as a packaged binary, JOHTO_MCP_SERVER_PATH is always set
  // by the JS shim, so this branch is dev-only.
  if (import.meta.url.startsWith('file://')) {
    const root = new URL('../../..', import.meta.url).pathname;
    return `${root}/apps/mcp-server/target/release/pokemon-mcp-server`;
  }

  throw new Error(
    'JOHTO_MCP_SERVER_PATH is not set and no monorepo-relative fallback is available. ' +
    'This is unexpected — run `johto doctor` to diagnose.'
  );
}
```

The CLI also needs to pass `JOHTO_DB_PATH` to the MCP child process. Update
`apps/deck-cli/src/mcp/client.ts` constructor:

```typescript
constructor(serverPath: string, dbPath?: string) {
  const env = dbPath
    ? { ...process.env, DATABASE_PATH: dbPath }
    : process.env;

  this.proc = spawn(serverPath, [], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env,
  });
  // ...
}
```

And `apps/deck-cli/src/index.ts` line 28 becomes:

```typescript
const mcp = new McpClient(args.mcpServerPath, process.env['JOHTO_DB_PATH']);
```

### 4.2 MCP server: `apps/mcp-server/src/main.rs`

Line 29–30 is already env-aware:

```rust
let db_path = std::env::var("DATABASE_PATH")
    .unwrap_or_else(|_| "database/pokemon-data.sqlite3.db".to_string());
```

The relative fallback works for in-repo `cargo run` but breaks when the binary
runs from `~/.npm-cache/.../@johto/mcp-server-linux-x64/bin/pokemon-mcp-server`.

Two changes:

1. The CLI shim always sets `DATABASE_PATH` via the env vars in Phase 4.1, so
   in the packaged-binary case this branch is never hit. No code change
   required on the Rust side — the existing env-var behaviour is correct.

2. Improve the error message when the relative fallback is used and the file
   does not exist:

```rust
let db = Arc::new(
    Database::open(db_path.as_ref())
        .map_err(|e| anyhow::anyhow!(
            "Failed to open card database at {db_path:?}: {e}. \
             Set DATABASE_PATH to the location of pokemon-data.sqlite3.db \
             or install @johto/card-data via the CLI."
        ))?
);
```

---

## Phase 5: Subcommand Layer and `johto init` Wizard

The current CLI is flag-only. v1 introduces a subcommand surface using `cac`'s
subcommand support.

### 5.1 Subcommand surface

| Subcommand | Purpose | Status in v1 |
|---|---|---|
| `johto run` (default) | Current `--deck` REPL behaviour | required |
| `johto init` | Interactive first-run setup wizard | required |
| `johto sync-data` | Refresh / rebuild the card database | required |
| `johto doctor` | Diagnose install (binaries, DB, API key, network) | required |
| `johto auth set anthropic <key>` | Persist API key to config file | required |
| `johto auth show` | Print config file contents (key redacted) | required |
| `johto --version` / `johto --help` | Top-level flags | required |

Backward compatibility: if argv contains `--deck <path>` and no subcommand,
treat as `johto run --deck <path>`.

### 5.2 `apps/deck-cli/src/args.ts` restructure

```typescript
import cac from 'cac';
import { runCommand } from './commands/run';
import { initCommand } from './commands/init';
import { syncDataCommand } from './commands/sync-data';
import { doctorCommand } from './commands/doctor';
import { authCommand } from './commands/auth';

export function buildCli(): ReturnType<typeof cac> {
  const cli = cac('johto');

  cli.command('run', 'Start a deck refinement session')
    .option('-d, --deck <path>', 'Deck file (.toml or .json). Repeatable.')
    .option('--provider <name>', 'anthropic (default) or chrome')
    .option('--dry-run', 'Print system prompt and exit')
    .option('--stats', 'Print probability table before REPL')
    .option('--spotlight <id>', 'Highlight card in stats. Repeatable.')
    .action(runCommand);

  cli.command('init', 'Interactive first-run setup wizard')
    .action(initCommand);

  cli.command('sync-data', 'Refresh the card database')
    .option('--rebuild', 'Rebuild from JSON sources (requires Bun on PATH)')
    .option('--source <dir>', 'Path to tcg-data JSON tree (with --rebuild)')
    .action(syncDataCommand);

  cli.command('doctor', 'Diagnose install — binaries, DB, API key, network')
    .action(doctorCommand);

  cli.command('auth set <provider> <key>', 'Persist API key to config file')
    .action(authCommand.set);
  cli.command('auth show', 'Print current config (key redacted)')
    .action(authCommand.show);

  // Backward compat: flag-only invocation maps to `run`
  cli.command('', 'Default: run').option('-d, --deck <path>', '').action(runCommand);

  cli.help();
  cli.version('0.1.0');
  return cli;
}
```

### 5.3 Config file schema

XDG-compliant location: `$XDG_CONFIG_HOME/johto/config.toml` →
`~/.config/johto/config.toml` on Linux/macOS.

```toml
# ~/.config/johto/config.toml

[anthropic]
api_key = "sk-ant-..."
model   = "claude-sonnet-4-6"

[paths]
decks_dir = "~/johto/decks"
card_data = ""              # empty = use bundled @johto/card-data

[defaults]
provider = "anthropic"      # "anthropic" or "chrome"
```

Precedence chain for API key resolution:

```
1. ANTHROPIC_API_KEY env var          (highest — runtime override)
2. config.toml [anthropic].api_key    (persisted via `johto auth set`)
3. unset                              (fail with clear setup-pointer error)
```

### 5.4 `johto init` wizard flow

```
$ johto init

Welcome to johto. This wizard will set up your config in ~/.config/johto/config.toml.
Press Ctrl+C at any time to abort.

? Anthropic API key (leave blank to skip — required for default REPL mode):
  > sk-ant-...
  ✓ Key validated against api.anthropic.com (1 token test request)

? Default decks directory (where new decks are saved):
  > ~/johto/decks
  ✓ Created ~/johto/decks

? Default provider (anthropic = REPL with Claude, chrome = browser w/ Gemini Nano):
  > anthropic

? Open the strategy guide now (https://johto.dev/strategy-guide)? [y/N]
  > n

✓ Config saved to ~/.config/johto/config.toml
✓ Card database located at ~/.npm/.../@johto/card-data/data/pokemon-data.sqlite3.db

Next steps:
  - johto run --deck <path>         start a session
  - johto run --provider chrome     open the browser deck builder
  - johto doctor                    re-run install diagnostics

Documentation: https://johto.dev
```

Target: zero-config to working session in under 60 seconds (success criterion).

### 5.5 `johto doctor` output contract

```
$ johto doctor

johto v0.1.0 · linux-x64 · node 20.11.0

✓  CLI binary           ~/.npm/.../@johto/cli-linux-x64/bin/johto       (24.7 MB)
✓  MCP server binary    ~/.npm/.../@johto/mcp-server-linux-x64/bin/...  (5.9 MB)
✓  Card database        ~/.npm/.../@johto/card-data/data/...sqlite3.db  (19,818 cards · 580 sets)
✓  Config file          ~/.config/johto/config.toml                     (last modified 2 days ago)
✓  Anthropic API key    sk-ant-***                                      (env or config)
⚠  Network             api.anthropic.com reachable (412ms)              (slow — > 250ms baseline)

All checks passed.
```

Each row prints `✓ / ⚠ / ✗ <label> <path-or-detail> <metadata>`. Non-zero
exit if any `✗`. The output format is documented in `docs/cli-reference.mdx`
as part of Phase 9.

---

## Phase 6: GitHub Actions Release Workflow

Tag-triggered (`v*.*.*`). Matrix-builds all four platforms in parallel, then a
single coordinator job stamps versions, publishes 9 npm packages, builds the
Docker image, and uploads GH Release tarballs.

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write
  packages: write
  id-token: write       # npm provenance

jobs:
  build-rust:
    name: Build Rust (${{ matrix.suffix }})
    strategy:
      fail-fast: false
      matrix:
        include:
          - suffix: linux-x64
            triple: x86_64-unknown-linux-gnu
            runner: ubuntu-latest
            use_cross: true
          - suffix: linux-arm64
            triple: aarch64-unknown-linux-gnu
            runner: ubuntu-latest
            use_cross: true
          - suffix: darwin-x64
            triple: x86_64-apple-darwin
            runner: macos-13
            use_cross: false
          - suffix: darwin-arm64
            triple: aarch64-apple-darwin
            runner: macos-14
            use_cross: false
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
        with: { submodules: recursive }
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: ${{ matrix.triple }} }
      - if: matrix.use_cross
        run: cargo install cross
      - run: bash apps/mcp-server/build/pack-platform.sh ${{ matrix.triple }} ${{ matrix.suffix }}
      - uses: actions/upload-artifact@v4
        with:
          name: mcp-server-${{ matrix.suffix }}
          path: dist-packages/mcp-server-platforms/${{ matrix.suffix }}/

  build-bun:
    name: Build Bun (${{ matrix.suffix }})
    strategy:
      fail-fast: false
      matrix:
        include:
          - suffix: linux-x64
          - suffix: linux-arm64
          - suffix: darwin-x64
          - suffix: darwin-arm64
    runs-on: ubuntu-latest             # Bun cross-compiles from one host
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun apps/deck-cli/build/compile.ts ${{ matrix.suffix }}
      - uses: actions/upload-artifact@v4
        with:
          name: cli-${{ matrix.suffix }}
          path: dist-packages/cli-platforms/${{ matrix.suffix }}/

  build-card-data:
    name: Build @johto/card-data
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { submodules: recursive }
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun dist-packages/card-data/scripts/rebuild.ts \
               --source database/seeds \
               --out dist-packages/card-data/data/pokemon-data.sqlite3.db
      - uses: actions/upload-artifact@v4
        with:
          name: card-data
          path: dist-packages/card-data/

  publish:
    name: Publish npm + GHCR + Release
    needs: [build-rust, build-bun, build-card-data]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - uses: actions/download-artifact@v4
        with: { path: dist-packages-artifacts }

      - name: Stamp versions
        run: bun scripts/stamp-release-versions.ts ${{ github.ref_name }}

      - name: Publish npm packages
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for dir in dist-packages/cli-platforms/* dist-packages/mcp-server-platforms/* dist-packages/cli dist-packages/card-data; do
            npm publish --access public --provenance "$dir"
          done

      - name: Build & push multi-arch Docker
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.johto
          platforms: linux/amd64,linux/arm64
          tags: |
            ghcr.io/${{ github.repository_owner }}/johto:${{ github.ref_name }}
            ghcr.io/${{ github.repository_owner }}/johto:latest
          push: true

      - name: Create GH Release with binary tarballs
        run: |
          for suffix in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do
            tar -czf "johto-${{ github.ref_name }}-${suffix}.tar.gz" \
                -C dist-packages-artifacts/cli-${suffix} bin \
                -C dist-packages-artifacts/mcp-server-${suffix} bin
          done
          gh release create ${{ github.ref_name }} \
            --title "${{ github.ref_name }}" \
            --notes-file CHANGELOG.md \
            johto-${{ github.ref_name }}-*.tar.gz
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Release version stamping

`scripts/stamp-release-versions.ts`:

```typescript
#!/usr/bin/env bun
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2]!.replace(/^v/, '');
const DIST = 'dist-packages';

const targets = [
  ...readdirSync(`${DIST}/cli-platforms`).map((d) => `${DIST}/cli-platforms/${d}`),
  ...readdirSync(`${DIST}/mcp-server-platforms`).map((d) => `${DIST}/mcp-server-platforms/${d}`),
  `${DIST}/cli`,
  `${DIST}/card-data`,
];

for (const dir of targets) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(await Bun.file(pkgPath).text()) as Record<string, unknown>;
  pkg['version'] = version;

  // Rewrite workspace:* refs to concrete version
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
}
console.log(`✓ Stamped ${targets.length} package.json files to ${version}`);
```

---

## Phase 7: Docker Image

Multi-stage build. Final image is `debian:bookworm-slim`.

### Base image choice

The alternative was a distroless variant (`gcr.io/distroless/cc-debian12`),
which is ~50 MB smaller but actively hostile to this tool's use cases:

| Concern | `debian:bookworm-slim` | `gcr.io/distroless/cc-debian12` |
|---|---|---|
| Shell available for `docker exec -it ... bash` | ✅ has bash + coreutils | ❌ no shell at all |
| `johto sync-data --rebuild` works in-container | ✅ can apt-install Bun if needed | ❌ no apt, no Bun, no way to add |
| Debugging browser mode listener with curl/ss | ✅ standard tooling present | ❌ user must rebuild image |
| Image size on top of our 50 MB payload | ~75 MB total | ~24 MB total |
| Security surface | larger but well-maintained by Debian | minimal but immutable |

For a CLI image whose primary deploy target is interactive use (CI scripts that
mount a deck volume, users who exec in to inspect config), the shell-less
distroless variant trades real ergonomics for size that is dwarfed by our
payload (25 MB Bun-compiled CLI + 6 MB MCP binary + 19 MB SQLite DB). If we
ever ship a *server* mode (out of scope here), distroless becomes the right
choice — for a CLI tool, it isn't.

`docker/Dockerfile.johto`:

```dockerfile
# ── Stage 1: Build Rust MCP server ─────────────────────────────────────────
FROM rust:1.83-bookworm AS rust-builder
WORKDIR /build
COPY apps/mcp-server/Cargo.toml apps/mcp-server/Cargo.lock ./
COPY apps/mcp-server/src ./src
RUN cargo build --release && strip target/release/pokemon-mcp-server

# ── Stage 2: Build Bun CLI ────────────────────────────────────────────────
FROM oven/bun:1.3-debian AS bun-builder
WORKDIR /build
COPY apps/deck-cli/package.json apps/deck-cli/bun.lock ./
RUN bun install --frozen-lockfile
COPY apps/deck-cli/src ./src
COPY apps/deck-cli/build ./build
RUN bun build src/index.ts --compile --target=bun-linux-x64 --outfile=/build/johto

# ── Stage 3: Build card-data ──────────────────────────────────────────────
FROM oven/bun:1.3-debian AS data-builder
WORKDIR /build
COPY dist-packages/card-data ./card-data
COPY database/seeds ./seeds
RUN bun card-data/scripts/rebuild.ts --source ./seeds --out /build/pokemon-data.sqlite3.db

# ── Stage 4: Runtime ──────────────────────────────────────────────────────
FROM debian:bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/nicholasgalante1997/deckvault"
LABEL org.opencontainers.image.description="Competitive Pokémon TCG deck refinement CLI"
LABEL org.opencontainers.image.licenses="MIT"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=bun-builder  /build/johto                              /usr/local/bin/johto
COPY --from=rust-builder /build/target/release/pokemon-mcp-server  /usr/local/bin/pokemon-mcp-server
COPY --from=data-builder /build/pokemon-data.sqlite3.db            /var/lib/johto/pokemon-data.sqlite3.db

ENV JOHTO_MCP_SERVER_PATH=/usr/local/bin/pokemon-mcp-server
ENV JOHTO_DB_PATH=/var/lib/johto/pokemon-data.sqlite3.db
ENV XDG_CONFIG_HOME=/root/.config

ENTRYPOINT ["/usr/local/bin/johto"]
CMD ["--help"]
```

`ca-certificates` is the only apt install — required for the Anthropic API
HTTPS handshake from inside the Bun-compiled binary.

Image size target: < 130 MB compressed (Rust binary ~6 MB + Bun-compiled CLI
~25 MB + SQLite DB 19 MB + Debian slim base ~75 MB).

### Browser mode in Docker

Documented caveat: browser mode requires port mapping and the user opens the
URL on the host. Provide an example in `docs/browser-mode.mdx`:

```bash
docker run --rm -it \
  -p 7777:7777 \
  -v "$PWD/decks:/decks" \
  ghcr.io/nicholasgalante1997/johto:latest \
  run --provider chrome --deck /decks/my-deck.toml --browser-port 7777
```

This requires adding a `--browser-port` flag to the `run` subcommand. The
current implementation binds to port `0` (random) which is incompatible with
Docker port mapping. Update `apps/deck-cli/src/browser/server.ts`:

```typescript
export function startBrowserServer(
  deck: EnrichedDeck | null,
  mcp: McpClient,
  port: number = 0,
): BrowserServer {
  // ...
  const server = Bun.serve({ port, async fetch(req) { /* ... */ } });
  // ...
}
```

---

## Phase 8: Curl Install Script

Hosted at `https://johto.dev/install.sh`. POSIX-compliant shell. No Bash-isms.

`scripts/install.sh`:

```bash
#!/bin/sh
set -eu

REPO="nicholasgalante1997/deckvault"
INSTALL_DIR="${JOHTO_INSTALL_DIR:-$HOME/.local/share/johto}"
BIN_DIR="${JOHTO_BIN_DIR:-$HOME/.local/bin}"

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  linux-x86_64)   SUFFIX="linux-x64"   ;;
  linux-aarch64)  SUFFIX="linux-arm64" ;;
  darwin-x86_64)  SUFFIX="darwin-x64"  ;;
  darwin-arm64)   SUFFIX="darwin-arm64";;
  *) echo "Unsupported platform: $OS-$ARCH (supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64)" >&2; exit 1 ;;
esac

# Resolve latest release tag
TAG="${JOHTO_VERSION:-$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -n1 | cut -d'"' -f4)}"
[ -z "$TAG" ] && { echo "Failed to resolve latest release" >&2; exit 1; }

URL="https://github.com/$REPO/releases/download/$TAG/johto-$TAG-$SUFFIX.tar.gz"

mkdir -p "$INSTALL_DIR/bin" "$BIN_DIR"
echo "Downloading $URL ..."
curl -fsSL "$URL" | tar -xz -C "$INSTALL_DIR"

ln -sf "$INSTALL_DIR/bin/johto"              "$BIN_DIR/johto"
ln -sf "$INSTALL_DIR/bin/pokemon-mcp-server" "$BIN_DIR/pokemon-mcp-server"

# Fetch card data (separate tarball, versioned independently)
DATA_TAG="$(curl -fsSL "https://registry.npmjs.org/@johto/card-data/latest" | grep -o '"version":"[^"]*"' | head -n1 | cut -d'"' -f4)"
DATA_URL="https://registry.npmjs.org/@johto/card-data/-/card-data-$DATA_TAG.tgz"
DATA_DIR="$INSTALL_DIR/card-data"
mkdir -p "$DATA_DIR"
curl -fsSL "$DATA_URL" | tar -xz -C "$DATA_DIR" --strip-components=1

echo
echo "✓ johto $TAG installed to $INSTALL_DIR"
echo "✓ Symlinked to $BIN_DIR/johto"
echo
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "⚠  $BIN_DIR is not on your PATH. Add this to your shell profile:"; echo "     export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo
echo "Run 'johto init' to set up your config."
```

Environment overrides supported: `JOHTO_INSTALL_DIR`, `JOHTO_BIN_DIR`,
`JOHTO_VERSION` (pin a specific tag).

Hosting: serve from `johto.dev` via a static redirect to the raw GitHub URL
of `scripts/install.sh` on the latest tag. The redirect is fast to rotate if
the script needs an emergency fix.

---

## Phase 9: Documentation Updates

### 9.1 New top-level files

| File | Purpose |
|---|---|
| `/README.md` (root) | One-pager pitch + install commands for all three channels + link to docs |
| `/LICENSE` | MIT |
| `/CHANGELOG.md` | Auto-appended by `bun scripts/changes.ts release` on each version bump |
| `apps/deck-cli/docs/install.mdx` | Per-channel install instructions with troubleshooting |
| `apps/deck-cli/docs/development.mdx` | Migration guide: how to develop inside the monorepo vs against the published packages |

### 9.2 Updated docs pages

| Page | Change |
|---|---|
| `docs/index.mdx` | Add Install card and Subcommand Reference card to CardGrid |
| `docs/quickstart.mdx` | Lead with `npm install -g @johto/cli && johto init`. Demote monorepo build steps to a "developing locally" section |
| `docs/cli-reference.mdx` | Restructure into Subcommands section + Global Flags section. Add `init`, `sync-data`, `doctor`, `auth` |
| `docs/browser-mode.mdx` | Add Docker example + `--browser-port` flag; add experimental banner |
| `README.md` (apps/deck-cli) | Rewrite to point at the published packages as the canonical install path; keep monorepo build instructions in a "From source" section |

### 9.3 dxdocs navigation

`apps/deck-cli/dxdocs.config.ts`:

```typescript
export default {
  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    { type: 'group', title: 'Getting Started', items: [
      { type: 'page', path: '/install',      title: 'Install' },
      { type: 'page', path: '/quickstart',   title: 'Quickstart' },
      { type: 'page', path: '/deck-format',  title: 'Deck File Format' },
    ]},
    { type: 'group', title: 'Modes', items: [
      { type: 'page', path: '/agent-session', title: 'Agent Session (REPL)' },
      { type: 'page', path: '/browser-mode',  title: 'Browser Mode' },
    ]},
    { type: 'group', title: 'Guides', items: [
      { type: 'page', path: '/strategy-guide', title: 'Strategy Guide' },
      { type: 'page', path: '/probability',    title: 'Probability Analysis' },
    ]},
    { type: 'group', title: 'Reference', items: [
      { type: 'page', path: '/cli-reference', title: 'CLI Reference' },
      { type: 'page', path: '/mcp-tools',     title: 'MCP Tools' },
    ]},
    { type: 'group', title: 'Contributing', items: [
      { type: 'page', path: '/development', title: 'Developing Locally' },
    ]},
  ],
};
```

---

## File Changeset

### New files

| File | Purpose |
|---|---|
| `dist-packages/cli/package.json` | Meta `@johto/cli` package definition |
| `dist-packages/cli/bin/johto.js` | Platform-resolving JS shim |
| `dist-packages/cli/lib/resolve.js` | Binary + data path resolver |
| `dist-packages/cli/README.md` | Public-facing readme |
| `dist-packages/cli-platforms/_template/package.json.tmpl` | Per-platform package.json template |
| `dist-packages/cli-platforms/_template/README.md.tmpl` | Per-platform readme template |
| `dist-packages/mcp-server-platforms/_template/package.json.tmpl` | Per-platform package.json template |
| `dist-packages/mcp-server-platforms/_template/README.md.tmpl` | Per-platform readme template |
| `dist-packages/card-data/package.json` | `@johto/card-data` definition |
| `dist-packages/card-data/scripts/rebuild.ts` | JSON-to-SQLite pipeline entry |
| `dist-packages/card-data/scripts/sets.ts` | Set inserts |
| `dist-packages/card-data/scripts/cards.ts` | Card inserts |
| `dist-packages/card-data/scripts/schema.sql` | DDL |
| `dist-packages/card-data/README.md` | Data package readme |
| `apps/deck-cli/build/compile.ts` | Per-platform `bun build --compile` driver |
| `apps/mcp-server/build/pack-platform.sh` | Per-platform cargo build + packaging |
| `apps/deck-cli/src/commands/run.ts` | `johto run` handler (extracted from current `src/index.ts`) |
| `apps/deck-cli/src/commands/init.ts` | `johto init` wizard |
| `apps/deck-cli/src/commands/sync-data.ts` | `johto sync-data` handler |
| `apps/deck-cli/src/commands/doctor.ts` | `johto doctor` handler |
| `apps/deck-cli/src/commands/auth.ts` | `johto auth set` and `johto auth show` |
| `apps/deck-cli/src/config/loader.ts` | Read/write `~/.config/johto/config.toml` |
| `apps/deck-cli/src/config/types.ts` | Config TOML schema types |
| `.changes/.gitkeep` | Empty pending-changes directory (markdown files dropped here by developers) |
| `scripts/changes.ts` | Homegrown release coordinator — `add` / `list` / `release` subcommands |
| `scripts/changes-config.ts` | Cohort definitions for the change coordinator |
| `.github/workflows/release.yml` | Tag-triggered release pipeline |
| `scripts/stamp-release-versions.ts` | Propagates bumped versions into optionalDependencies pins and rewrites `workspace:*` |
| `scripts/install.sh` | Curl installer for tertiary channel |
| `docker/Dockerfile.johto` | Multi-stage Docker image |
| `LICENSE` (root) | MIT |
| `README.md` (root) | Public-facing repo readme |
| `apps/deck-cli/docs/install.mdx` | Install page |
| `apps/deck-cli/docs/development.mdx` | Developer migration guide |

### Modified files

| File | Change |
|---|---|
| `apps/deck-cli/src/args.ts` | Restructure into `buildCli()` with subcommands; replace flag-only parser |
| `apps/deck-cli/src/index.ts` | Becomes a thin entry that calls `buildCli().parse()`; current logic moves to `commands/run.ts` |
| `apps/deck-cli/src/mcp/client.ts` | Accept optional `dbPath` and inject `DATABASE_PATH` env to spawn |
| `apps/deck-cli/src/browser/server.ts` | Accept `port` parameter (default 0); plumb through `--browser-port` flag |
| `apps/deck-cli/package.json` | Add new dev scripts: `compile:all`, `pack:all`; remove monorepo-relative `build` artifact location |
| `apps/mcp-server/src/main.rs` | Improve error message when `DATABASE_PATH` resolves to a missing file |
| `apps/deck-cli/docs/quickstart.mdx` | Lead with npm install; demote monorepo build |
| `apps/deck-cli/docs/cli-reference.mdx` | Subcommand restructure (Phase 9.2) |
| `apps/deck-cli/docs/browser-mode.mdx` | Add Docker example, `--browser-port` flag, experimental banner |
| `apps/deck-cli/docs/index.mdx` | Add Install + (future) Subcommand cards |
| `apps/deck-cli/dxdocs.config.ts` | Add Install + Contributing groups |
| `apps/deck-cli/README.md` | Pivot to "From npm (recommended)" vs "From source" sections |
| `turbo.json` | Add `pack:*` task definitions |
| `package.json` (root) | Expose `bun scripts/changes.ts` via top-level scripts (`bun run changes:add`, `bun run changes:release`). No new external devDependencies required. |
| `.gitignore` | Add `dist-packages/*/data/*.db`, `dist-packages/cli/node_modules`, build artifacts |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bun build --compile` produces binaries that don't run on older glibc Linux distros | medium | high | Pin minimum glibc target in CI runners (Ubuntu 22.04). Document `glibc >= 2.35` as a system requirement. Investigate `musl` variant if user complaints emerge. |
| Cross-compiled darwin binaries fail Apple notarization | medium | medium | v1 ships unsigned. Add `xattr -d com.apple.quarantine` instructions to install docs. Notarization is a v1.1 goal. |
| npm `optionalDependencies` skip behaviour drifts between npm versions | low | high | Document `npm >= 8` as minimum. `johto doctor` explicitly checks platform package presence and prints `npm install --force` recovery instructions if missing. |
| @johto/card-data tarball exceeds 50 MB npm soft limit | low | low | DB is 19 MB; current tarball estimate ~22 MB. If we grow past 50 MB we shift to postinstall-download. |
| Bun build pipeline regression breaks compile output silently | medium | medium | Phase 6 release workflow runs a smoke test step: install the just-built tarball into a clean container, run `johto run --deck examples/example.toml --dry-run`, fail the publish on non-zero exit. |
| Multi-arch Docker build is slow / flaky on free runners | medium | low | Use `docker/setup-buildx` with QEMU emulation. Cache layers via `gha` cache backend. If build time exceeds 30 minutes, split linux/amd64 and linux/arm64 into parallel jobs. |
| Curl installer security concerns (executing remote shell scripts) | medium | medium | Sign install.sh with sigstore (cosign) in v1.1. For v1, document SHA-256 of pinned tags so users can verify before piping to sh. |

---

## Success Criteria

### Functional

- [ ] `npm install -g @johto/cli` on Linux x64 installs all transitive platform
      packages and produces a working `johto` command in `$PATH`
- [ ] `johto run --deck examples/example.toml --dry-run` succeeds in a clean
      container with no Bun, no Rust, no monorepo checkout
- [ ] `johto init` walks a first-time user from zero-config to a working
      session in under 60 seconds
- [ ] `johto doctor` reports all five required checks (CLI bin, MCP bin, DB,
      config, API key) with correct paths
- [ ] `johto auth set anthropic <key>` writes a valid TOML to
      `~/.config/johto/config.toml` and the next `johto run` invocation
      reads the key from it
- [ ] `johto sync-data --rebuild --source <dir>` produces a SQLite database
      byte-identical to the prebuilt `@johto/card-data/data/*.db` when given
      the same input JSON

### Distribution

- [ ] `docker run --rm -v "$PWD/decks:/decks" -e ANTHROPIC_API_KEY ghcr.io/.../johto:<tag> run --deck /decks/example.toml --dry-run` succeeds
      on both `linux/amd64` and `linux/arm64`
- [ ] `curl -fsSL https://johto.dev/install.sh | sh` produces a working
      `johto` install on all four v1 platforms
- [ ] `bunx @johto/cli@<tag> run --deck ./decks/example.toml --dry-run`
      works without prior install (cold cache)

### Release Pipeline

- [ ] A single `git push origin v0.1.0` triggers the workflow and
      produces: 9 npm packages on the registry, 4 GH Release tarballs,
      1 multi-arch Docker image at `ghcr.io/.../johto:0.1.0` and `:latest`
- [ ] The smoke test step in the release workflow installs the just-built
      tarballs into a clean container and runs `--dry-run` end-to-end; a
      non-zero exit fails the publish
- [ ] `@johto/card-data` can be patch-bumped and published independently
      without rebuilding `@johto/cli` (verified by tagging a `card-data-vX.Y.Z`
      release that only fires the card-data publish job)

### Developer Experience

- [ ] Existing `bun run dev` from inside `apps/deck-cli` continues to work
      unchanged against the canonical monorepo sources — published packages
      are an output, not a dependency
- [ ] `apps/deck-cli/docs/development.mdx` documents the parallel paths
      clearly (monorepo dev vs consuming published packages) and explains
      when to use which
- [ ] All v1 platforms produce binaries that pass a basic-functionality smoke
      test (`--dry-run` + `--stats` on a known deck), recorded as CI artifacts

### Quality Gates

- [ ] `cargo clippy -- -D warnings` clean across all cross-compile targets
- [ ] `bun run check-types` clean for all new TypeScript files in
      `dist-packages/cli/` and `apps/deck-cli/src/commands/`
- [ ] No file > 1000 lines added in this spec (current outlier is
      `apps/deck-cli/src/browser/template.ts` at 1182 lines — not modified here)
- [ ] All `@johto/*` package.json files validate against the npm registry's
      schema (no missing license, no missing repository, no missing description)

---

## Migration Path to v2 (Standalone Repo)

Out of scope for this spec but documented so it isn't forgotten. When v2
extraction becomes worthwhile (post-adoption):

1. `git subtree split --prefix=apps/deck-cli --branch=cli-split`
2. `git subtree split --prefix=apps/mcp-server --branch=mcp-split`
3. Create new public `johto/johto` repo seeded from `cli-split`
4. Move the MCP server source — choice point at that time: re-vendor into
   `johto/johto/packages/mcp-server`, or keep `deckvault/apps/mcp-server`
   canonical and consume from the new repo via a release artifact
5. Update `.github/workflows/release.yml` to live in the new repo, reading
   sources from there
6. `deckvault` consumes the published `@johto/mcp-server-*` packages back
   when needed (web app, deck-builder agent, claude mcp integration)

This migration is a one-time event you can do during a `v2.0.0` major bump.
The package topology and CI pipeline designed in this spec are repo-agnostic
and will move cleanly.
