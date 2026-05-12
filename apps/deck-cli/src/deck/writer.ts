import { basename, dirname, extname, resolve } from 'node:path';

import { stringify } from 'smol-toml';

export interface DeckVersionWrite {
  readonly originalPath: string;
  readonly name: string;
  readonly format: string;
  readonly regulationMarks: readonly string[];
  readonly cards: ReadonlyArray<{ readonly id: string; readonly quantity: number }>;
  readonly meta: Record<string, string>;
}

export function resolveVersionPath(originalPath: string, version: number): string {
  const dir = dirname(resolve(originalPath));
  const base = basename(originalPath, extname(originalPath));
  return `${dir}/${base}.v${version}.toml`;
}

export async function writeDeckVersion(
  opts: DeckVersionWrite,
  version: number
): Promise<string> {
  const outPath = resolveVersionPath(opts.originalPath, version);
  const data = {
    name: opts.name,
    format: opts.format,
    regulation_marks: opts.regulationMarks,
    cards: opts.cards.map((c) => ({ id: c.id, quantity: c.quantity })),
    meta: opts.meta,
  };
  await Bun.write(outPath, stringify(data));
  return outPath;
}
