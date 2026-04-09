import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getJavascriptEnvironment } from '@/web/layers/data';
import {
  fetchFrequency,
  type FrequencyResponse
} from '@/web/services/LocalMetaService';

export type { FrequencyResponse };
export type { ArchetypeFrequency } from '@/web/services/LocalMetaService';

export const LOCAL_META_QUERY_KEY_DEFAULT = ['local-meta-frequency', 'standard'] as const;

interface LocalMetaParams {
  format: string;
}

export function useLocalMetaQuery(
  params: LocalMetaParams
): UseQueryResult<FrequencyResponse, Error> {
  const queryKey = ['local-meta-frequency', params.format];
  const queryClient = useQueryClient();

  if (getJavascriptEnvironment() === 'server') {
    const data = queryClient.getQueryData<FrequencyResponse>(queryKey);
    return {
      data,
      promise: Promise.resolve(data),
      isLoading: false,
      isError: false,
      isPending: false
    } as UseQueryResult<FrequencyResponse, Error>;
  }

  return useQuery({
    queryKey,
    queryFn: () => fetchFrequency(params.format),
    staleTime: 60_000
  });
}
