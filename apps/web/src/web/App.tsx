import React, { useEffect } from 'react';
import type { DehydratedState, QueryClient } from '@tanstack/react-query';

import Document from './components/Document/Document';
import { AppRoutes } from './routes';
import { AuthProvider } from './contexts/Auth';
import { CollectionProvider } from './contexts/Collection';
import { DeckProvider } from './contexts/Deck';
import { ThemeProvider } from './themes';
import type { RouterLayerProps } from './routes/types';
import { DataLayer } from './layers/data';

export type AppProps = {
  routes: RouterLayerProps;
  cssPath?: string;
  queryClient: QueryClient;
  dehydratedState?: DehydratedState;
};

function AppContent({ routes }: Pick<AppProps, 'routes'>) {
  return <AppRoutes {...routes} />;
}

export function App(props: AppProps) {
  useEffect(() => {
    console.log(
      'DeckVault — React mounted on client'
    );
  }, []);
  return (
    <React.StrictMode>
      <DataLayer
        javascriptRuntime={props.routes.javascriptRuntime ?? 'server'}
        server={{ client: props.queryClient }}
        browser={{ client: props.queryClient, state: props.dehydratedState }}
      >
        <ThemeProvider>
          <AuthProvider>
            <CollectionProvider>
              <DeckProvider>
                <AppContent routes={props.routes} />
              </DeckProvider>
            </CollectionProvider>
          </AuthProvider>
        </ThemeProvider>
      </DataLayer>
    </React.StrictMode>
  );
}

export function withDocument<P extends AppProps>(
  WrappedApp: React.ComponentType<P>
) {
  return function AppWithDocument(props: P) {
    return (
      <Document
        cssPath={props.cssPath}
        description="DeckVault — The competitive Pokemon TCG deck builder"
        title="DeckVault"
      >
        <WrappedApp {...props} />
      </Document>
    );
  };
}
