import { QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

import type { DataLayerProps } from '../types';

type Props = React.PropsWithChildren<Exclude<DataLayerProps['server'], undefined>>;

function ServerDataLayer({ children, client }: Props) {
  const [_client] = useState(client);
  return <QueryClientProvider client={_client}>{children}</QueryClientProvider>;
}

export { ServerDataLayer };
