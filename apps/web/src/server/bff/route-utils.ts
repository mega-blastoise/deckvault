import type { BffHandler, BffRoute } from './types';

interface ExtractedRoutePattern {
  pattern: RegExp;
  paramNames: string[];
}

/**
 * Convert route pattern to regex and extract param names
 */
export function createRoutePattern(path: string): ExtractedRoutePattern {
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
export function route(
  path: string,
  handler: BffHandler,
  method: 'GET' | 'POST' = 'GET'
): BffRoute {
  const { pattern, paramNames } = createRoutePattern(path);
  return { pattern, paramNames, handler, method };
}

/**
 * Extract params from a matched route
 */
export function extractParams(
  matches: RegExpMatchArray,
  paramNames: string[]
): Record<string, string> {
  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = matches[index + 1];
  });
  return params;
}