export interface DeckCard {
  id: string;
  quantity: number;
}

export interface DeckDoc {
  name: string;
  format: string;
  regulation_marks: string[];
  cards: DeckCard[];
  meta?: Record<string, string>;
}

export interface DeckSummary {
  slug: string;
  path: string;
  name: string;
  totalCards: number;
  format: string;
  regulationMarks: string[];
  versionOf: string | null;
  version: number | null;
  modifiedAt: string;
  cardIds: string[];
  coverCardId: string | null;
}

export interface Violation {
  rule: string;
  message: string;
  cardId?: string;
}

export interface ValidationReport {
  valid: boolean;
  totalCards: number;
  unknownCardIds: string[];
  violations: Violation[];
}

export interface CardImages {
  small: string;
  large: string;
}

export interface CardDetail {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  types?: string[];
  hp?: number | null;
  regulationMark?: string | null;
  setId?: string;
  number?: string;
  rarity?: string | null;
  /** Remote URLs on images.pokemontcg.io — the only network the page uses. */
  images?: CardImages | null;
}

export interface TurnPoint {
  turn: number;
  pAtLeastOne: number;
}

export interface OpeningHandRow {
  cardId: string;
  name: string;
  copies: number;
  pOpen: number;
  pExactlyOne: number;
  pExactlyTwo: number;
  turnCurve: TurnPoint[];
  spotlight: boolean;
}

export interface ProbabilityReport {
  deckSize: number;
  complete: boolean;
  openingHand: OpeningHandRow[];
}

export interface ImportLine {
  quantity: number;
  name: string;
  setCode: string;
  number: string;
  cardId: string | null;
  resolvedName: string | null;
  regulationMark: string | null;
  problem: string | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
  listDecks: () => req<{ decksDir: string; decks: DeckSummary[] }>('/api/decks'),
  getDeck: (slug: string) => req<DeckDoc>(`/api/decks/${encodeURIComponent(slug)}`),
  saveDeck: (slug: string, doc: DeckDoc) =>
    req<{ slug: string; path: string }>(`/api/decks/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(doc)
    }),
  saveVersion: (slug: string, doc: DeckDoc) =>
    req<{ slug: string; path: string }>(`/api/decks/${encodeURIComponent(slug)}/version`, {
      method: 'POST',
      body: JSON.stringify(doc)
    }),
  renameDeck: (from: string, to: string) =>
    req<{ slug: string }>(`/api/decks/${encodeURIComponent(from)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ to })
    }),
  deleteDeck: (slug: string) =>
    req<{ deleted: boolean }>(`/api/decks/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  validate: (doc: DeckDoc) =>
    req<ValidationReport>('/api/validate', { method: 'POST', body: JSON.stringify(doc) }),
  probability: (doc: DeckDoc) =>
    req<ProbabilityReport>('/api/probability', { method: 'POST', body: JSON.stringify(doc) }),
  search: (query: string, standardOnly: boolean) =>
    req<CardDetail[]>(
      `/api/search?query=${encodeURIComponent(query)}&limit=25&format=json&standard_only=${standardOnly}`
    ),
  card: (id: string) => req<CardDetail>(`/api/card/${encodeURIComponent(id)}`),
  importList: (text: string) =>
    req<{ lines: ImportLine[]; totalCards: number; unresolved: number }>('/api/import', {
      method: 'POST',
      body: JSON.stringify({ text })
    })
};

/**
 * Reads the NDJSON RenderEvent stream. The server emits the same event union
 * that drives the terminal renderers, so the UI is a reducer over those events
 * rather than a bespoke chat protocol.
 */
export async function streamChat(
  body: { message: string; history: unknown[]; deck: string | null },
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are newline-delimited, but a chunk can split one mid-object, so
    // keep the trailing partial line in the buffer until its newline arrives.
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Ignore a malformed line rather than aborting the whole turn.
      }
    }
  }
}
