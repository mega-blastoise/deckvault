import { readdir, readFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

import { parse, stringify } from 'smol-toml';

import { loadConfig } from '../config/loader';

export class DeckStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeckStoreError';
  }
}

export interface DeckFile {
  /** Filename without extension — the id used by the API. */
  readonly slug: string;
  readonly path: string;
  readonly name: string;
  readonly totalCards: number;
  readonly format: string;
  readonly regulationMarks: readonly string[];
  /** Base slug when this is a `name.vN.toml` snapshot, else null. */
  readonly versionOf: string | null;
  readonly version: number | null;
  readonly modifiedAt: string;
  /**
   * Card ids in file order. Carried on the summary so the gallery can pick a
   * cover image without re-reading every deck — the doc is already parsed here.
   */
  readonly cardIds: readonly string[];
  /** Explicit cover from `meta.cover`; the server resolves one when absent. */
  readonly coverCardId: string | null;
}

export interface DeckDocument {
  readonly name: string;
  readonly format: string;
  readonly regulation_marks: readonly string[];
  readonly cards: ReadonlyArray<{ readonly id: string; readonly quantity: number }>;
  readonly meta?: Record<string, string>;
}

const VERSION_RE = /^(.*)\.v(\d+)$/;

export async function resolveDecksDir(): Promise<string> {
  const config = await loadConfig();
  return resolve(config.paths?.decks_dir ?? join(homedir(), 'johto', 'decks'));
}

/**
 * Every path the HTTP API touches goes through here. A slug is a bare filename:
 * anything that escapes the decks directory once resolved — traversal, absolute
 * paths, symlink tricks — is rejected rather than clamped, so a malformed
 * request fails loudly instead of silently writing somewhere unexpected.
 */
export function resolveDeckPath(decksDir: string, slug: string): string {
  if (!slug || slug !== basename(slug)) {
    throw new DeckStoreError(`Invalid deck name: ${slug}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(slug)) {
    throw new DeckStoreError(
      `Invalid deck name: ${slug} (letters, digits, dot, dash and underscore only)`
    );
  }
  // Dots are allowed for version slugs (`name.v2`), so `.` and `..` slip past
  // the character class — reject them and any leading dot explicitly.
  if (slug.startsWith('.') || slug.includes('..')) {
    throw new DeckStoreError(`Invalid deck name: ${slug}`);
  }
  const dir = resolve(decksDir);
  const path = resolve(dir, `${slug}.toml`);
  if (path !== join(dir, `${slug}.toml`) || !path.startsWith(dir + sep)) {
    throw new DeckStoreError(`Refusing to write outside the decks directory: ${slug}`);
  }
  return path;
}

function summarise(slug: string, path: string, doc: DeckDocument, mtime: Date): DeckFile {
  const match = VERSION_RE.exec(slug);
  return {
    slug,
    path,
    name: doc.name,
    totalCards: doc.cards.reduce((n, c) => n + c.quantity, 0),
    format: doc.format,
    regulationMarks: doc.regulation_marks,
    versionOf: match ? match[1]! : null,
    version: match ? Number(match[2]) : null,
    modifiedAt: mtime.toISOString(),
    cardIds: doc.cards.map((c) => c.id),
    coverCardId: doc.meta?.['cover'] ?? null
  };
}

export async function listDecks(decksDir: string): Promise<DeckFile[]> {
  if (!existsSync(decksDir)) return [];
  const entries = await readdir(decksDir, { withFileTypes: true });
  const decks: DeckFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (ext !== '.toml' && ext !== '.json') continue;

    const path = join(decksDir, entry.name);
    try {
      const doc = await readDeckAt(path);
      const stat = Bun.file(path);
      decks.push(summarise(basename(entry.name, ext), path, doc, new Date(stat.lastModified)));
    } catch {
      // A malformed file shouldn't hide every other deck from the list.
      continue;
    }
  }

  return decks.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readDeckAt(path: string): Promise<DeckDocument> {
  const text = await readFile(path, 'utf-8');
  const raw = extname(path) === '.json' ? JSON.parse(text) : parse(text);
  const doc = raw as DeckDocument;
  if (!doc || typeof doc.name !== 'string' || !Array.isArray(doc.cards)) {
    throw new DeckStoreError(`${basename(path)} is not a deck file`);
  }
  return doc;
}

export async function readDeck(decksDir: string, slug: string): Promise<DeckDocument> {
  return readDeckAt(resolveDeckPath(decksDir, slug));
}

export async function writeDeck(
  decksDir: string,
  slug: string,
  doc: DeckDocument
): Promise<string> {
  const path = resolveDeckPath(decksDir, slug);
  await Bun.write(path, stringify(doc as unknown as Record<string, unknown>));
  return path;
}

export async function deleteDeck(decksDir: string, slug: string): Promise<void> {
  await unlink(resolveDeckPath(decksDir, slug));
}

export async function renameDeck(
  decksDir: string,
  from: string,
  to: string
): Promise<string> {
  const target = resolveDeckPath(decksDir, to);
  if (existsSync(target)) throw new DeckStoreError(`${to} already exists`);
  await rename(resolveDeckPath(decksDir, from), target);
  return target;
}

/** Next free `name.vN` for a base slug, so snapshots never overwrite. */
export async function nextVersionSlug(decksDir: string, slug: string): Promise<string> {
  const base = VERSION_RE.exec(slug)?.[1] ?? slug;
  const existing = await listDecks(decksDir);
  const used = existing
    .filter((d) => d.versionOf === base && d.version !== null)
    .map((d) => d.version!);
  const next = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `${base}.v${next}`;
}
