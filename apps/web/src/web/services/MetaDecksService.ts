import type { MetaDeckSummary } from '@/web/components/MetaDeckCard';
import { getBaseAPIURL } from './APIModel';

export interface MetaDecksResponse {
  decks: MetaDeckSummary[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchMetaDecks(params: {
  format: string;
  archetype: string;
  collectionOnly: boolean;
}): Promise<MetaDecksResponse> {
  const sp = new URLSearchParams();
  if (params.format !== 'all') sp.set('format', params.format);
  if (params.archetype) sp.set('archetype', params.archetype);
  if (params.collectionOnly) sp.set('collectionOnly', 'true');
  sp.set('limit', '100');

  const res = await fetch(`${getBaseAPIURL()}/meta-decks?${sp}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to fetch meta decks');
  return res.json();
}
