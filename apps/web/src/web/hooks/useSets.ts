import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult
} from '@tanstack/react-query';

import { getJavascriptEnvironment } from '@/web/layers/data';
import { SetsService } from '@/web/services';

type QueryResult = Awaited<
  ReturnType<InstanceType<typeof SetsService>['getSets']>
>;

const QUERY_KEY_SETS = 'sets' as const;

export function useSets(
  page?: number,
  count?: number,
  options: Partial<UseQueryOptions> = {}
): UseQueryResult<QueryResult, Error> {
  const keys = [QUERY_KEY_SETS, `page=${page}`, `count=${count}`];

  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<QueryResult>(keys);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false
    } as UseQueryResult<QueryResult, Error>;
  }

  return useQuery({
    ...options,
    queryKey: keys,
    queryFn: () => new SetsService().getSets(page, count)
  }) as UseQueryResult<QueryResult, Error>;
}
