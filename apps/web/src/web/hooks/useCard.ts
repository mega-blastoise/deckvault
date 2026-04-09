import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query';

import { getJavascriptEnvironment } from '@/web/layers/data';
import { CardsService } from '@/web/services';

type QueryResult = Awaited<
  ReturnType<InstanceType<typeof CardsService>['getCard']>
>;

export type CardQueryResult = UseQueryResult<QueryResult | undefined, Error> & {
  promise: Promise<QueryResult | undefined>;
};

const QUERY_KEY_CARD = 'card' as const;

export function useCard(id: string): CardQueryResult {
  const keys = [QUERY_KEY_CARD, id];
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<QueryResult>(keys);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false,
      status: 'success',
      fetchStatus: 'idle',
      error: null
    } as unknown as CardQueryResult;
  }

  return useQuery({
    queryKey: keys,
    queryFn: () => new CardsService().getCard(id)
  }) as CardQueryResult;
}
