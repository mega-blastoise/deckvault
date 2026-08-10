#!/usr/bin/env bun
/**
 * Local release wrapper.
 *
 * Cuts a release the way CI expects it: derives the next version, writes the
 * CHANGELOG, commits, and creates an annotated tag. It deliberately stops there
 * — pushing the tag is the one irreversible act in this pipeline (it triggers a
 * real npm publish, and version numbers are burned permanently), so it stays a
 * deliberate human step. Everything this script does is undone with
 * `git reset --hard HEAD~1 && git tag -d <tag>`.
 *
 * Dry-run is the default. See RELEASING.md.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { COHORTS } from './changes-config';
import {
  appendChangelog,
  loadPending,
  nextVersion,
  rollUpBumps,
  CHANGES_DIR,
  type BumpLevel,
  type ChangeEntry,
  type CohortName
} from './changes';

const ROOT = resolvePath(import.meta.dir, '..');

/**
 * A release stream: a tag prefix plus the cohorts whose entries drive it.
 * `internal` rides along in the johto stream's changelog but never influences
 * the version — it publishes nothing.
 */
interface Stream {
  readonly id: string;
  readonly tagPrefix: string;
  /** Cohorts whose bumps determine the version. */
  readonly versionCohorts: readonly CohortName[];
  /** Cohorts included in the changelog and cleared on release. */
  readonly changelogCohorts: readonly CohortName[];
}

const STREAMS: Record<string, Stream> = {
  johto: {
    id: 'johto',
    tagPrefix: 'johto/v',
    versionCohorts: ['cli', 'mcpServer'],
    changelogCohorts: ['cli', 'mcpServer', 'internal']
  },
  'card-data': {
    id: 'card-data',
    tagPrefix: 'johto/card-data-v',
    versionCohorts: ['cardData'],
    changelogCohorts: ['cardData']
  }
};

interface Options {
  readonly stream: Stream;
  readonly execute: boolean;
  readonly offline: boolean;
  readonly branch: string;
  readonly remote: string;
  readonly version: string | null;
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`
};

function sh(cmd: string[], allowFail = false): string {
  const proc = Bun.spawnSync(cmd, { cwd: ROOT });
  const out = new TextDecoder().decode(proc.stdout).trim();
  if (proc.exitCode !== 0 && !allowFail) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(`${cmd.join(' ')} failed: ${err || out}`);
  }
  return out;
}

function parseArgs(): Options {
  const argv = Bun.argv.slice(2);
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };

  const streamId = value('stream') ?? value('cohort') ?? 'johto';
  const stream = STREAMS[streamId];
  if (!stream) {
    console.error(`Unknown stream "${streamId}". Expected one of: ${Object.keys(STREAMS).join(', ')}`);
    process.exit(1);
  }

  return {
    stream,
    execute: flag('execute'),
    offline: flag('offline'),
    branch: value('branch') ?? 'main',
    remote: value('remote') ?? 'mega-blastoise',
    version: value('version')
  };
}

/* ----------------------------------------------------------------- version */

function taggedVersions(prefix: string): string[] {
  const tags = sh(['git', 'tag', '-l', `${prefix}*`]).split('\n').filter(Boolean);
  return tags
    .map((t) => t.slice(prefix.length))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort(compareSemver);
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/* -------------------------------------------------------------- preflight */

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

function checkWorkflowPublishArgs(): Check {
  // Regression guard for the 2026-05-17 failure: `npm publish <two/segment>`
  // is parsed by npm as a GitHub shortcut, not a folder, and the publish dies
  // on `git ls-remote`. Publishing must always happen from inside the package
  // directory (working-directory: or `cd ... && npm publish`).
  const dir = join(ROOT, '.github', 'workflows');
  if (!existsSync(dir)) return { name: 'workflows use safe npm publish', ok: true, detail: 'no workflows dir' };

  const offenders: string[] = [];
  for (const file of ['release.yml', 'release-card-data.yml']) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    for (const [i, line] of readFileSync(path, 'utf-8').split('\n').entries()) {
      const m = /npm publish\s+(.*)$/.exec(line);
      if (!m) continue;
      // Only path-shaped positionals matter. Bare words are flag values
      // (`--access public`), and it is specifically `dist-packages/card-data`
      // — two slash-separated segments — that npm mistakes for a repo shortcut.
      const args = m[1]!.split(/\s+/);
      const paths = args.filter(
        (a, idx) => a && !a.startsWith('-') && !args[idx - 1]?.startsWith('--') && (a.includes('/') || a.startsWith('.'))
      );
      if (paths.length > 0) offenders.push(`${file}:${i + 1} → ${paths[0]}`);
    }
  }
  return {
    name: 'workflows use safe npm publish',
    ok: offenders.length === 0,
    detail: offenders.length === 0 ? 'no positional path args' : offenders.join('; ')
  };
}

function distPackageJsons(): string[] {
  const out = sh(['find', 'dist-packages', '-name', 'package.json', '-not', '-path', '*/node_modules/*']);
  return out.split('\n').filter(Boolean);
}

function checkVersionsPinned(): Check {
  const bad: string[] = [];
  for (const file of distPackageJsons()) {
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, file), 'utf-8'));
      if (pkg.version !== '0.0.0') bad.push(`${file}=${pkg.version}`);
    } catch {
      // Unreadable manifests are caught by the repository-field check.
    }
  }
  return {
    name: 'source versions pinned to 0.0.0',
    ok: bad.length === 0,
    detail: bad.length === 0 ? 'all 0.0.0' : bad.join(', ')
  };
}

function checkRepositoryFields(remoteUrl: string): Check {
  // npm provenance requires the repository field to match the publishing repo,
  // case-sensitively. A mismatch fails the publish after the tag is already
  // pushed, which is the expensive place to find out.
  const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl);
  const expected = match ? match[1]!.toLowerCase() : null;
  const bad: string[] = [];

  for (const file of [...distPackageJsons(), 'dist-packages/cli-platforms/_template/package.json.tmpl',
    'dist-packages/mcp-server-platforms/_template/package.json.tmpl']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    const repo = /"repository"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    if (!repo) continue;
    if (expected && !repo.toLowerCase().includes(expected)) bad.push(`${file} → ${repo}`);
  }

  return {
    name: 'repository fields match publish remote',
    ok: bad.length === 0,
    detail: bad.length === 0 ? (expected ?? 'unparsed remote') : bad.join('; ')
  };
}

/* ------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const opts = parseArgs();
  const { stream } = opts;

  console.log(C.bold(`\njohto release — ${stream.id} stream`));
  console.log(C.dim(opts.execute ? 'mode: EXECUTE (local commit + tag)' : 'mode: dry run (no changes)'));

  // ---- gather state ------------------------------------------------------
  const branch = sh(['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
  // Only tracked modifications block. Untracked files are reported but allowed:
  // this repo permanently carries some (working notes, local guides), and a
  // check that is always red is a check that gets ignored.
  const porcelain = sh(['git', 'status', '--porcelain']).split('\n').filter(Boolean);
  const modified = porcelain.filter((l) => !l.startsWith('??'));
  const untracked = porcelain.filter((l) => l.startsWith('??'));
  const remotes = sh(['git', 'remote']).split('\n').filter(Boolean);
  const remoteUrl = remotes.includes(opts.remote)
    ? sh(['git', 'remote', 'get-url', opts.remote])
    : '';

  const entries = loadPending();
  const relevant = entries.filter((e) => stream.changelogCohorts.includes(e.cohort));
  const versionDriving = entries.filter((e) => stream.versionCohorts.includes(e.cohort));
  const bumps = rollUpBumps(versionDriving);
  const bump: BumpLevel | null =
    [...bumps.values()].sort((a, b) => ['patch', 'minor', 'major'].indexOf(b) - ['patch', 'minor', 'major'].indexOf(a))[0] ?? null;

  const existing = taggedVersions(stream.tagPrefix);
  const current = existing[existing.length - 1] ?? '0.0.0';
  const version = opts.version ?? (bump ? nextVersion(current, bump) : null);
  const tag = version ? `${stream.tagPrefix}${version}` : null;

  // ---- preflight ---------------------------------------------------------
  const checks: Check[] = [
    {
      name: 'no uncommitted tracked changes',
      ok: modified.length === 0,
      detail:
        modified.length === 0
          ? `clean${untracked.length > 0 ? ` (${untracked.length} untracked, ignored)` : ''}`
          : `${modified.length} modified: ${modified.slice(0, 3).map((l) => l.slice(3)).join(', ')}`
    },
    { name: `on release branch (${opts.branch})`, ok: branch === opts.branch, detail: `HEAD is ${branch}` },
    {
      name: `publish remote "${opts.remote}" exists`,
      ok: remoteUrl !== '',
      detail: remoteUrl || `not configured — remotes: ${remotes.join(', ') || 'none'}`
    },
    {
      name: 'pending changes present',
      ok: relevant.length > 0,
      detail: relevant.length > 0 ? `${relevant.length} entry(ies)` : 'nothing in .changes/ for this stream'
    },
    {
      name: 'version resolvable',
      ok: version !== null,
      detail: version ? `${current} → ${version}${opts.version ? ' (explicit)' : ` (${bump})`}` : 'no version-driving cohort entries and no --version'
    },
    {
      name: 'version increases',
      ok: version === null || compareSemver(version, current) > 0,
      detail: version ? `${version} vs latest tag ${current}` : 'n/a'
    },
    {
      name: 'tag does not exist locally',
      ok: tag === null || !sh(['git', 'tag', '-l', tag]),
      detail: tag ?? 'n/a'
    },
    checkVersionsPinned(),
    checkRepositoryFields(remoteUrl),
    checkWorkflowPublishArgs()
  ];

  if (!opts.offline && remoteUrl) {
    const lsRemote = sh(['git', 'ls-remote', '--tags', opts.remote, `refs/tags/${stream.tagPrefix}*`], true);
    const reachable = lsRemote !== '' || sh(['git', 'ls-remote', '--exit-code', opts.remote, 'HEAD'], true) !== '';
    checks.push({
      name: 'tag absent on remote',
      ok: reachable ? !lsRemote.includes(`refs/tags/${tag}`) : false,
      detail: reachable ? (tag ?? 'n/a') : `could not reach ${opts.remote} — fix auth or pass --offline`
    });
  }

  console.log(C.bold('\npreflight'));
  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    const mark = c.ok ? C.green('  ok  ') : C.red(' FAIL ');
    console.log(`${mark} ${c.name.padEnd(38)} ${C.dim(c.detail)}`);
  }

  // ---- plan --------------------------------------------------------------
  console.log(C.bold('\nplan'));
  if (relevant.length > 0) {
    for (const cohort of stream.changelogCohorts) {
      const forCohort = relevant.filter((e) => e.cohort === cohort);
      if (forCohort.length === 0) continue;
      const publishes = COHORTS[cohort].packages.length;
      console.log(`  ${cohort} ${C.dim(publishes === 0 ? '(changelog only)' : `(${publishes} package(s))`)}`);
      for (const e of forCohort) console.log(`    - [${e.bump}] ${e.message}`);
    }
  }
  console.log(`  tag        ${tag ?? C.dim('unresolved')}`);
  console.log(`  commit     ${C.dim('release(' + stream.id + '): v' + (version ?? '?'))}`);
  console.log(`  then push  ${C.dim(`git push ${opts.remote} ${tag ?? '<tag>'}`)}`);

  if (failed > 0) {
    console.log(C.red(`\n${failed} preflight check(s) failed — nothing was changed.`));
    process.exit(1);
  }

  if (!opts.execute) {
    console.log(C.yellow('\nDry run. Re-run with --execute to write the CHANGELOG, commit, and tag.'));
    return;
  }

  // ---- execute (local only) ---------------------------------------------
  for (const cohort of stream.changelogCohorts) {
    const forCohort = relevant.filter((e: ChangeEntry) => e.cohort === cohort);
    if (forCohort.length === 0) continue;
    // Cohorts that publish nothing are dated rather than versioned.
    appendChangelog(cohort, COHORTS[cohort].packages.length === 0 ? null : version!, forCohort);
    for (const e of forCohort) unlinkSync(join(CHANGES_DIR, e.file));
  }

  sh(['git', 'add', 'CHANGELOG.md', '.changes']);
  sh(['git', 'commit', '-m', `release(${stream.id}): v${version}`]);
  sh(['git', 'tag', '-a', tag!, '-m', `${stream.id} v${version}`]);

  console.log(C.green(`\nCommitted and tagged ${tag}.`));
  console.log('\nNothing has been pushed. When you are ready:\n');
  console.log(C.bold(`  git push ${opts.remote} ${opts.branch}`));
  console.log(C.bold(`  git push ${opts.remote} ${tag}`));
  console.log(C.dim('\nTo undo before pushing:'));
  console.log(C.dim(`  git tag -d ${tag} && git reset --hard HEAD~1`));
}

await main();
