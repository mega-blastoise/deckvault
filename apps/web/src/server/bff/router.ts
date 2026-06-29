import { csrfMiddleware } from '../lib/csrf';
import type { BffRoute, BffContext } from './types';
import {
  getDashboard,
  getBrowse,
  getCardDetail,
  getBffHealth,
  getSimSetAbbreviations,
  getSimMetaDecks,
  postSimCardDefinitions
} from './handlers';
import { route, extractParams } from "./route-utils";
import { generateBffRequestId, isBffRoute } from "./utils";

/**
 * BFF route definitions
 */
const routes: BffRoute[] = [
  route('/bff/health', getBffHealth),
  route('/bff/dashboard', getDashboard),
  route('/bff/browse', getBrowse),
  route('/bff/card/:id', getCardDetail),
  route('/bff/sim/set-abbreviations', getSimSetAbbreviations),
  route('/bff/sim/meta-decks', getSimMetaDecks),
  route('/bff/sim/card-definitions', postSimCardDefinitions, 'POST')
];

/**
 * Route a BFF request to the appropriate handler
 */
export async function routeBffRequest(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const csrfResponse = csrfMiddleware(request);
  if (csrfResponse) return csrfResponse;

  if (pathname.startsWith('/bff/sim/') && process.env.FEATURE_SIMULATE !== 'true') {
    return new Response(
      JSON.stringify({ error: { code: 'FEATURE_DISABLED', message: 'Simulation features are not yet available.' } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create context
  const context: BffContext = {
    requestId: request.headers.get('X-Request-ID') || generateBffRequestId(),
    startTime: Date.now()
  };

  // Find matching route
  for (const route of routes) {
    const matches = pathname.match(route.pattern);
    if (matches) {
      const routeMethod = route.method ?? 'GET';
      if (request.method !== routeMethod) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: `Method ${request.method} not allowed. Expected ${routeMethod}`
            }
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              Allow: routeMethod,
              'X-Request-ID': context.requestId
            }
          }
        );
      }
      const params = extractParams(matches, route.paramNames);
      try {
        return await route.handler(request, params, url.searchParams, context);
      } catch (error) {
        console.error(`[${context.requestId}] BFF Error:`, error);
        return new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An internal error occurred',
              requestId: context.requestId
            }
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': context.requestId
            }
          }
        );
      }
    }
  }

  // No matching route
  return null;
}

/**
 * Backwards compatability with legacy export patterns
 */
export {
  isBffRoute
}