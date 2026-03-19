import React, { useEffect } from 'react';

import Document from './components/Document/Document';
import { AppRoutes } from './routes';
import { AuthProvider } from './contexts/Auth';
import { CollectionProvider } from './contexts/Collection';
import { DeckProvider } from './contexts/Deck';
import { ThemeProvider } from './themes';
import type { RouterLayerProps } from './routes/types';
import { QueryProvider } from './providers';

export type AppProps = {
  routes: RouterLayerProps;
};

function AppContent(props: AppProps) {
  return <AppRoutes {...props.routes} />;
}

export function App(props: AppProps) {
  useEffect(() => {
    console.log(
      'DeckVault — React mounted on client'
    );
  }, []);
  return (
    <React.StrictMode>
      <QueryProvider>
        <ThemeProvider>
          <AuthProvider>
            <CollectionProvider>
              <DeckProvider>
                <AppContent routes={props.routes} />
              </DeckProvider>
            </CollectionProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryProvider>
    </React.StrictMode>
  );
}

export function withDocument<P extends {} = React.JSX.IntrinsicAttributes>(
  App: React.ComponentType<P>
) {
  return function AppWithDocument(props: P) {
    return (
      <Document description="DeckVault — The competitive Pokemon TCG deck builder" title="DeckVault">
        <App {...props} />
      </Document>
    );
  };
}
