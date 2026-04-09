import React from 'react';
import { renderToReadableStream, renderToString } from 'react-dom/server.bun';
import { createStaticHandler, createStaticRouter } from 'react-router';
import { dehydrate } from '@tanstack/react-query';

import { generateCsrfToken, setCsrfCookie } from '../../csrf';

import { getBrowserCssSheet, getBrowserJavascriptBundle } from './fs';

import { App, type AppProps, withDocument } from '@/web/App';
import ServerErrorPage from '@/web/pages/ServerErrorPage';
import { REACT_ROUTER_ROUTES } from '@/web/routes/routes';
import { createQueryClient } from '@/web/layers/data';
import { prefetchForRoute } from '../../prefetch';

const { query, dataRoutes } = createStaticHandler(REACT_ROUTER_ROUTES);

export async function renderReactApplication(request: Request) {
  const [bundle, cssPath] = await Promise.all([
    getBrowserJavascriptBundle(),
    getBrowserCssSheet()
  ]);

  if (!bundle) {
    return new Response(
      renderToString(
        <ServerErrorPage error={new Error('Missing Web Assets')} />
      ),
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }

  let context = await query(request);

  if (context instanceof Response) {
    return context;
  }

  const router = createStaticRouter(dataRoutes, context);

  const serverQueryClient = createQueryClient();
  await prefetchForRoute(serverQueryClient, new URL(request.url).pathname, request);

  const SSRApp = withDocument<AppProps>(App);

  const stream = await renderToReadableStream(
    <SSRApp
      cssPath={cssPath ?? undefined}
      routes={{ javascriptRuntime: 'server', server: { context, router } }}
      queryClient={serverQueryClient}
    />,
    {
      bootstrapScriptContent: `
        window.FEATURE_SIMULATE = ${process.env.FEATURE_SIMULATE === 'true' ? 'true' : 'false'};
        window.__REACT_QUERY_STATE__ = ${JSON.stringify(dehydrate(serverQueryClient))};
      `,
      bootstrapModules: [bundle]
    }
  );

  const baseResponse = new Response(stream, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no'
    }
  });

  const cookieHeader = request.headers.get('cookie') ?? '';
  const hasCsrfCookie = cookieHeader.split(';').some(c => c.trim().startsWith('csrf_token='));

  if (hasCsrfCookie) return baseResponse;

  return setCsrfCookie(baseResponse, generateCsrfToken());
}
