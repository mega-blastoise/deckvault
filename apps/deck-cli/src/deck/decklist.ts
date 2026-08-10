import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';

export interface ParsedLine {
  readonly quantity: number;
  readonly name: string;
  /** PTCGO set abbreviation as written, e.g. "DRI". */
  readonly setCode: string;
  readonly number: string;
}

export interface ResolvedLine extends ParsedLine {
  readonly cardId: string | null;
  readonly resolvedName: string | null;
  readonly regulationMark: string | null;
  readonly problem: string | null;
}

export interface ImportResult {
  readonly lines: readonly ResolvedLine[];
  readonly totalCards: number;
  readonly unresolved: number;
}

// "4 Ethan's Cyndaquil DRI 32" — quantity, name, set code, collector number.
// Section headers ("Pokémon: 10") and blank lines are skipped; those counts are
// line counts, not card counts, so they are not a useful cross-check.
const LINE_RE = /^\s*(\d+)\s+(.+?)\s+([A-Za-z][A-Za-z0-9]{1,5})\s+([A-Za-z]?\d+[A-Za-z]?)\s*$/;
const SECTION_RE = /^\s*(pok[eé]mon|trainer|energy|total\s+cards)\b.*:/i;

export function parseDecklist(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || SECTION_RE.test(line) || line.startsWith('#') || line.startsWith('//')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    lines.push({
      quantity: Number(m[1]),
      name: m[2]!.trim(),
      setCode: m[3]!.toUpperCase(),
      number: m[4]!
    });
  }
  return lines;
}

function textOf(result: McpToolResult): string | null {
  return result.content.find((c) => c.type === 'text')?.text ?? null;
}

/** PTCGO abbreviation → set id, e.g. DRI → sv10. Built once per import. */
async function loadSetMap(mcp: McpClient): Promise<Map<string, string>> {
  const result = (await mcp.callTool('list_sets', { format: 'json' })) as McpToolResult;
  const text = textOf(result);
  const map = new Map<string, string>();
  if (!text) return map;

  try {
    const parsed = JSON.parse(text) as unknown;
    const sets = Array.isArray(parsed)
      ? parsed
      : ((parsed as { sets?: unknown[] }).sets ?? []);
    for (const entry of sets as Array<Record<string, unknown>>) {
      const code = entry['ptcgoCode'] ?? entry['ptcgo_code'];
      const id = entry['id'];
      if (typeof code === 'string' && code && typeof id === 'string') {
        map.set(code.toUpperCase(), id);
      }
    }
  } catch {
    // Fall through with an empty map; every line then reports an unknown set.
  }
  return map;
}

/** Decklists write basic energy as "Basic {R} Energy" or "Basic Fire Energy". */
const ENERGY_SYMBOLS: Record<string, string> = {
  R: 'Fire',
  W: 'Water',
  G: 'Grass',
  L: 'Lightning',
  P: 'Psychic',
  F: 'Fighting',
  D: 'Darkness',
  M: 'Metal',
  Y: 'Fairy',
  C: 'Colorless'
};

export function basicEnergyName(raw: string): string | null {
  const symbol = /\{([A-Z])\}/.exec(raw);
  const type = symbol ? ENERGY_SYMBOLS[symbol[1]!] : /basic\s+([A-Za-z]+)\s+energy/i.exec(raw)?.[1];
  if (!type) return null;
  const canonical = Object.values(ENERGY_SYMBOLS).find(
    (t) => t.toLowerCase() === type.toLowerCase()
  );
  return canonical ? `Basic ${canonical} Energy` : null;
}

async function resolveBasicEnergy(
  raw: string,
  mcp: McpClient
): Promise<{ id: string; name: string } | null> {
  const wanted = basicEnergyName(raw);
  if (!wanted) return null;
  try {
    const result = (await mcp.callTool('search_cards', {
      query: wanted,
      supertype: 'Energy',
      format: 'json',
      limit: 25
    })) as McpToolResult;
    const body = textOf(result);
    if (!body) return null;
    const cards = JSON.parse(body) as Array<{ id: string; name: string }>;
    const match = cards.find((c) => c.name === wanted) ?? null;
    return match ? { id: match.id, name: match.name } : null;
  } catch {
    return null;
  }
}

/**
 * Resolves pasted decklist lines to real card ids. Set abbreviations are mapped
 * through the sets table, then `{set}-{number}` is verified against the card
 * database — a decklist that names a card the database doesn't have is reported
 * per line rather than failing the whole import.
 */
export async function resolveDecklist(
  text: string,
  mcp: McpClient
): Promise<ImportResult> {
  const parsed = parseDecklist(text);
  const setMap = await loadSetMap(mcp);
  const resolved: ResolvedLine[] = [];

  for (const line of parsed) {
    const setId = setMap.get(line.setCode);
    if (!setId) {
      // Basic energy is the common case here: decklists cite whichever energy
      // set was current, and new ones appear constantly. They are functionally
      // identical cards, so resolve them by type name instead of by set.
      const energy = await resolveBasicEnergy(line.name, mcp);
      resolved.push({
        ...line,
        cardId: energy?.id ?? null,
        resolvedName: energy?.name ?? null,
        regulationMark: null,
        problem: energy ? null : `Unknown set code "${line.setCode}"`
      });
      continue;
    }

    const cardId = `${setId}-${line.number}`;
    try {
      const result = (await mcp.callTool('get_card_by_id', { id: cardId })) as McpToolResult;
      const body = textOf(result);
      if (result.isError || !body) {
        resolved.push({
          ...line,
          cardId: null,
          resolvedName: null,
          regulationMark: null,
          problem: `No card at ${cardId}`
        });
        continue;
      }

      let resolvedName: string | null = null;
      let regulationMark: string | null = null;
      try {
        const card = JSON.parse(body) as { name?: string; regulationMark?: string };
        resolvedName = card.name ?? null;
        regulationMark = card.regulationMark ?? null;
      } catch {
        // Tool returned markdown rather than JSON — the id still verified.
      }

      resolved.push({
        ...line,
        cardId,
        resolvedName,
        regulationMark,
        problem: null
      });
    } catch (err) {
      resolved.push({
        ...line,
        cardId: null,
        resolvedName: null,
        regulationMark: null,
        problem: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    lines: resolved,
    totalCards: resolved.reduce((n, l) => n + l.quantity, 0),
    unresolved: resolved.filter((l) => l.cardId === null).length
  };
}
