import React, { useEffect } from 'react';

import Document from './components/Document/Document';
import { AppLayout } from './components/AppLayout';
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
  return (
    <AppLayout>
      <AppRoutes {...props.routes} />
    </AppLayout>
  );
}

export function App(props: AppProps) {
  useEffect(() => {
    console.log(
      'Welcome to the Pokemon TCG Collection & Deck Manager!-React mounted on client'
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
      <Document description="Pokemon TCG Deck Manager" title="Pokemon TCG">
        <App {...props} />
      </Document>
    );
  };
}
