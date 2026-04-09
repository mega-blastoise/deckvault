import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App } from '../App';
import { REACT_ROUTER_ROUTES } from '../routes/routes';
import { createQueryClient, getDehydratedState } from '../layers/data';

const queryClient = createQueryClient();
const dehydratedState = getDehydratedState();

hydrateRoot(
  document,
  <main>
    <App
      routes={{
        javascriptRuntime: 'browser',
        browser: { router: createBrowserRouter(REACT_ROUTER_ROUTES) }
      }}
      queryClient={queryClient}
      dehydratedState={dehydratedState}
    />
  </main>
);
