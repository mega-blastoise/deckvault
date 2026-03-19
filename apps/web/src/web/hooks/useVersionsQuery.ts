import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = '/api/v1';

export interface VersionSummary {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  cardCount: number;
}

export interface VersionDetail {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  cards: {
    card: {
      id: string;
      name: string;
      supertype: string;
      subtypes?: string[];
      images?: { small?: string; large?: string };
      set: { id: string; name: string };
    };
    quantity: number;
  }[];
}

export interface DeckDiff {
  versionA: Omit<VersionSummary, 'cardCount'>;
  versionB: Omit<VersionSummary, 'cardCount'>;
  added: { card: VersionDetail['cards'][number]['card']; quantity: number; deltaQuantity: number }[];
  removed: { card: VersionDetail['cards'][number]['card']; quantity: number; deltaQuantity: number }[];
  unchanged: { card: VersionDetail['cards'][number]['card']; quantity: number }[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function useVersionsQuery(deckId: string) {
  return useInfiniteQuery({
    queryKey: ['deck-versions', deckId],
    queryFn: ({ pageParam }) =>
      fetchJson<{ data: { versions: VersionSummary[]; total: number; page: number; limit: number } }>(
        `${API}/decks/${deckId}/versions?page=${pageParam}&limit=20`
      ).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const fetched = lastPage.page * lastPage.limit;
      return fetched < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: Boolean(deckId)
  });
}

export function useVersionDetailQuery(deckId: string, versionId: string | null) {
  return useQuery({
    queryKey: ['deck-version-detail', deckId, versionId],
    queryFn: () =>
      fetchJson<{ data: VersionDetail }>(`${API}/decks/${deckId}/versions/${versionId}`).then(
        (r) => r.data
      ),
    enabled: Boolean(deckId) && Boolean(versionId)
  });
}

export function useDiffQuery(deckId: string, a: string | null, b: string | null) {
  return useQuery({
    queryKey: ['deck-version-diff', deckId, a, b],
    queryFn: () =>
      fetchJson<{ data: DeckDiff }>(
        `${API}/decks/${deckId}/versions/diff?a=${a}&b=${b}`
      ).then((r) => r.data),
    enabled: Boolean(deckId) && Boolean(a) && Boolean(b)
  });
}

export function useLabelMutation(deckId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, label }: { versionId: string; label: string }) =>
      fetchJson(`${API}/decks/${deckId}/versions/${versionId}/label`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deck-versions', deckId] });
    }
  });
}
