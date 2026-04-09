import { getBaseAPIURL } from './APIModel';

export interface BrowseDeck {
  id: string;
  name: string;
  description?: string;
  format: string;
  coverCardId?: string;
  cardCount: number;
  updatedAt: string;
  owner: {
    name: string;
    avatarUrl: string | null;
  };
}

export interface BrowseResponse {
  data: BrowseDeck[];
  pagination: { page: number; limit: number; total: number };
}

export async function fetchBrowseDecks(params: {
  page: number;
  limit: number;
  format?: string;
  q?: string;
}): Promise<BrowseResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page));
  searchParams.set('limit', String(params.limit));
  if (params.format) searchParams.set('format', params.format);
  if (params.q) searchParams.set('q', params.q);

  const res = await fetch(`${getBaseAPIURL()}/decks/browse?${searchParams}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to fetch decks');
  return res.json();
}
