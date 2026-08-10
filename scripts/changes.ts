#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { COHORTS } from './changes-config';

export type BumpLevel = 'patch' | 'minor' | 'major';
export type CohortName = keyof typeof COHORTS;

export interface ChangeEntry {
  cohort: CohortName;
  bump: BumpLevel;
  message: string;
  file: string;
}

export const CHANGES_DIR = resolve(import.meta.dir, '..', '.changes');
export const BUMP_ORDER: BumpLevel[] = ['patch', 'minor', 'major'];

function parseFrontmatter(content: string): { cohort: CohortName; bump: BumpLevel; message: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const cohort = frontmatter['cohort'] as CohortName;
  const bump = frontmatter['bump'] as BumpLevel;
  const message = match[2]!.trim();

  if (!cohort || !bump || !message) return null;
  if (!(cohort in COHORTS)) return null;
  if (!BUMP_ORDER.includes(bump)) return null;

  return { cohort, bump, message };
}

export function loadPending(): ChangeEntry[] {
  if (!existsSync(CHANGES_DIR)) return [];

  const files = readdirSync(CHANGES_DIR).filter(f => f.endsWith('.md'));
  const entries: ChangeEntry[] = [];

  for (const file of files) {
    const content = readFileSync(join(CHANGES_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (parsed) {
      entries.push({ ...parsed, file });
    }
  }

  return entries;
}

export function rollUpBumps(entries: ChangeEntry[]): Map<CohortName, BumpLevel> {
  const result = new Map<CohortName, BumpLevel>();

  for (const entry of entries) {
    const current = result.get(entry.cohort);
    if (!current || BUMP_ORDER.indexOf(entry.bump) > BUMP_ORDER.indexOf(current)) {
      result.set(entry.cohort, entry.bump);
    }
  }

  return result;
}

export function nextVersion(current: string, bump: BumpLevel): string {
  const parts = current.replace(/^v/, '').split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  switch (bump) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

/** `version` is null for cohorts that publish nothing; the entry is dated instead. */
export function appendChangelog(cohort: CohortName, version: string | null, changes: ChangeEntry[]): void {
  const changelogPath = resolve(import.meta.dir, '..', 'CHANGELOG.md');
  const date = new Date().toISOString().split('T')[0];
  const header = version === null ? `## ${cohort} (${date})` : `## ${cohort} v${version} (${date})`;
  const body = changes.map(c => `- ${c.message}`).join('\n');
  const section = `\n${header}\n\n${body}\n`;

  if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, 'utf-8');
    writeFileSync(changelogPath, existing + section);
  } else {
    writeFileSync(changelogPath, `# Changelog\n${section}`);
  }
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function add(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const cohortNames = Object.keys(COHORTS) as CohortName[];
    console.log('Cohorts:');
    cohortNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
    const cohortIdx = parseInt(await prompt(rl, 'Select cohort (number): '), 10) - 1;
    const cohort = cohortNames[cohortIdx];
    if (!cohort) {
      console.error('Invalid cohort selection.');
      return;
    }

    console.log('Bump levels:');
    BUMP_ORDER.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    const bumpIdx = parseInt(await prompt(rl, 'Select bump level (number): '), 10) - 1;
    const bump = BUMP_ORDER[bumpIdx];
    if (!bump) {
      console.error('Invalid bump selection.');
      return;
    }

    const message = await prompt(rl, 'Change description: ');
    if (!message.trim()) {
      console.error('Message cannot be empty.');
      return;
    }

    if (!existsSync(CHANGES_DIR)) {
      mkdirSync(CHANGES_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const slug = message.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `${timestamp}-${slug}.md`;
    const content = `---\ncohort: ${cohort}\nbump: ${bump}\n---\n${message.trim()}\n`;

    writeFileSync(join(CHANGES_DIR, filename), content);
    console.log(`Created .changes/${filename}`);
  } finally {
    rl.close();
  }
}

function list(): void {
  const entries = loadPending();
  if (entries.length === 0) {
    console.log('No pending changes');
    return;
  }

  const grouped = new Map<CohortName, ChangeEntry[]>();
  for (const entry of entries) {
    const arr = grouped.get(entry.cohort) ?? [];
    arr.push(entry);
    grouped.set(entry.cohort, arr);
  }

  for (const [cohort, changes] of grouped) {
    const bumps = rollUpBumps(changes);
    const bump = bumps.get(cohort)!;
    console.log(`\n${cohort} (${bump}):`);
    for (const change of changes) {
      console.log(`  - [${change.bump}] ${change.message}`);
    }
  }
}

// Guarded so `release.ts` can import the primitives above without the CLI
// firing on import.
if (import.meta.main) {
  const command = Bun.argv[2];

  switch (command) {
    case 'add':
      await add();
      break;
    case 'list':
      list();
      break;
    case 'release':
      console.error(
        'Releasing moved to `bun scripts/release.ts` — it derives the version from\n' +
          'git tags, runs preflight checks, and creates the tag. See RELEASING.md.'
      );
      process.exit(1);
      break;
    default:
      console.log('Usage: bun scripts/changes.ts <add|list>');
      process.exit(1);
  }
}
