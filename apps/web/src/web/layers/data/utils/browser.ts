import { type DehydratedState, QueryClient } from '@tanstack/react-query';

import { getJavascriptEnvironment } from './env';

export function createQueryClient(): QueryClient {
  const isServer = getJavascriptEnvironment() === 'server';
  return new QueryClient({
    defaultOptions: {
      queries: {
        experimental_prefetchInRender: true,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        retry: isServer ? false : 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: true,
        refetchOnMount: false,
        refetchOnReconnect: true
      },
      mutations: {
        retry: 1,
        retryDelay: 1000
      }
    }
  });
}

export function getDehydratedState(): DehydratedState | undefined {
  if (getJavascriptEnvironment() === 'browser') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any)?.__REACT_QUERY_STATE__;
  }
  return undefined;
}
