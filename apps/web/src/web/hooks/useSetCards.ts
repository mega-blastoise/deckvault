import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult
} from '@tanstack/react-query';

import { SetsService } from '@/web/services';

type QueryResult = Awaited<
  ReturnType<InstanceType<typeof SetsService>['getCardsInSet']>
>;

const QUERY_KEY_SET_CARDS = 'setCards' as const;

export function useSetCards(
  setId: string,
  options: Partial<UseQueryOptions> = {}
): UseQueryResult<QueryResult, Error> {
  const keys = [QUERY_KEY_SET_CARDS, setId];
  return useQuery({
    ...options,
    queryKey: keys,
    queryFn: () => new SetsService().getCardsInSet(setId),
    enabled: !!setId && options.enabled !== false
  }) as UseQueryResult<QueryResult, Error>;
}
