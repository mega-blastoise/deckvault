import { csrfMiddleware } from '../lib/csrf';
import type { BffRoute, BffHandler, BffContext } from './types';
import {
  getDashboard,
  getBrowse,
  getCardDetail,
  getBffHealth,
  getSimSetAbbreviations,
  getSimMetaDecks,
  postSimCardDefinitions
} from './handlers';

/**
 * Convert route pattern to regex and extract param names
 */
function createRoutePattern(path: string): {
  pattern: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexPattern = path.replace(/:([^/]+)/g, (_, paramName) => {
    paramNames.push(paramName);
    return '([^/]+)';
  });

  return {
    pattern: new RegExp(`^${regexPattern}/?$`),
    paramNames
  };
}

/**
 * Define a BFF route
 */
function route(path: string, handler: BffHandler, method: 'GET' | 'POST' = 'GET'): BffRoute {
  const { pattern, paramNames } = createRoutePattern(path);
  return { pattern, paramNames, handler, method };
}

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
 * Extract params from a matched route
 */
function extractParams(
  matches: RegExpMatchArray,
  paramNames: string[]
): Record<string, string> {
  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = matches[index + 1];
  });
  return params;
}

/**
 * Generate a request ID
 */
function generateRequestId(): string {
  return `bff_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if a path is a BFF route
 */
export function isBffRoute(pathname: string): boolean {
  return pathname.startsWith('/bff/');
}

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
    requestId: request.headers.get('X-Request-ID') || generateRequestId(),
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
