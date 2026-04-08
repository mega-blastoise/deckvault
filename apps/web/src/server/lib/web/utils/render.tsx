import React from 'react';
import { renderToReadableStream, renderToString } from 'react-dom/server.bun';
import { createStaticHandler, createStaticRouter } from 'react-router';

import { generateCsrfToken, setCsrfCookie } from '../../csrf';

import { getBrowserCssSheet, getBrowserJavascriptBundle } from './fs';

import { App, type AppProps, withDocument } from '@/web/App';
import ServerErrorPage from '@/web/pages/ServerErrorPage';
import { REACT_ROUTER_ROUTES } from '@/web/routes/routes';

export async function renderReactApplication(request: Request) {
  const bundle = await getBrowserJavascriptBundle();
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

  let { query, dataRoutes } = createStaticHandler(REACT_ROUTER_ROUTES);
  let context = await query(request);

  if (context instanceof Response) {
    return context;
  }

  const router = createStaticRouter(dataRoutes, context);

  const SSRApp = withDocument<AppProps>(App);

  const stream = await renderToReadableStream(
    <SSRApp
      routes={{ javascriptRuntime: 'server', server: { context, router } }}
    />,
    {
      bootstrapScriptContent: `
        window.FEATURE_SIMULATE = ${process.env.FEATURE_SIMULATE === 'true' ? 'true' : 'false'};
        window.__INITIAL_STATE__ = ${JSON.stringify({})};
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '${await getBrowserCssSheet()}';
        document.head.appendChild(css);
      `,
      bootstrapModules: [bundle]
    }
  );

  const baseResponse = new Response(stream, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });

  const cookieHeader = request.headers.get('cookie') ?? '';
  const hasCsrfCookie = cookieHeader.split(';').some(c => c.trim().startsWith('csrf_token='));

  if (hasCsrfCookie) return baseResponse;

  return setCsrfCookie(baseResponse, generateCsrfToken());
}
