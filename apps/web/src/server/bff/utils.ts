/**
 * Checks if an incoming request path is for a BFF route
 * All bff routes are prefixed with /bff/
 */
export function isBffRoute(pathname: string): boolean {
  return pathname.startsWith('/bff/');
}

/**
 * Generate a request ID
 */
export function generateBffRequestId(): string {
  return `bff_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}