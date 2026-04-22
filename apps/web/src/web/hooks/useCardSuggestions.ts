import { useQuery } from '@tanstack/react-query';
import type { SuggestionTag } from '../lib/deck-suggestions';

interface SuggestionCard {
  id: string;
  name: string;
  images: { small: string; large: string } | null;
  regulationMark: string | null;
  set: { id: string; name: string };
}

interface CardSuggestionsResponse {
  data: SuggestionCard[];
}

const STANDARD_MARKS = new Set(['H', 'I', 'J']);

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env['API_URL'] ?? 'http://localhost:3001';
}

async function fetchCardSuggestions(tags: SuggestionTag[]): Promise<SuggestionCard[]> {
  const res = await fetch(
    `${getBaseUrl()}/api/v1/cards/use-case?tags=${tags.join(',')}&limit=12`
  );
  if (!res.ok) return [];
  const json = (await res.json()) as CardSuggestionsResponse;
  return (json.data ?? []).filter(
    (c) => c.regulationMark !== null && STANDARD_MARKS.has(c.regulationMark)
  );
}

export function useCardSuggestions(tags: SuggestionTag[]) {
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['card-suggestions', tags],
    queryFn: () => fetchCardSuggestions(tags),
    staleTime: 10 * 60 * 1000,
    enabled: tags.length > 0
  });

  return { cards, isLoading };
}
