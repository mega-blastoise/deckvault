export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function setCsrfCookie(response: Response, token: string): Response {
  const cloned = new Response(response.body, response);
  cloned.headers.append(
    'Set-Cookie',
    `csrf_token=${token}; SameSite=Strict; Path=/`
  );
  return cloned;
}

export function validateCsrf(request: Request): boolean {
  const headerToken = request.headers.get('x-csrf-token') ?? '';
  const cookieHeader = request.headers.get('cookie') ?? '';

  if (headerToken.length < 64) return false;

  const cookieToken = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('csrf_token='))
    ?.slice('csrf_token='.length) ?? '';

  return cookieToken.length >= 64 && headerToken === cookieToken;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfMiddleware(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  if (!validateCsrf(request)) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'Invalid or missing CSRF token'
        }
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null;
}
