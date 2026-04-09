import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

import type { DataLayerProps } from '../types';

type Props = React.PropsWithChildren<Exclude<DataLayerProps['browser'], undefined>>;

function BrowserDataLayer({ children, client, state }: Props) {
  const [_client] = useState(client);
  const [_state] = useState(state);
  return (
    <QueryClientProvider client={_client}>
      <HydrationBoundary state={_state}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}

export { BrowserDataLayer };
