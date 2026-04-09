import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import type React from 'react';

export type JavascriptRuntime = 'server' | 'browser';

export interface ServerDataProps {
  client: QueryClient;
}

export interface BrowserDataProps {
  client: QueryClient;
  state: DehydratedState | undefined;
}

export interface DataLayerProps {
  javascriptRuntime: JavascriptRuntime;
  server?: ServerDataProps;
  browser?: BrowserDataProps;
  children: React.ReactNode;
}
