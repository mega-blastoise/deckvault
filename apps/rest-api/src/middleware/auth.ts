import jwt from 'jsonwebtoken';
import type { Middleware, Context } from '@pokemon/framework';
import type { Services } from '../types';

export interface AuthUser {
  id: string;
  email: string;
}

const AUTH_COOKIE = '__session';

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  }
  return cookies;
}

export function extractUser(request: Request, jwtSecret: string): AuthUser | null {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies[AUTH_COOKIE];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string; email: string };
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export const authRequired: Middleware<Services> = (ctx, next) => {
  const jwtSecret = ctx.services.config.jwt.secret;
  const user = extractUser(ctx.request, jwtSecret);
  if (!user) {
    return ctx.error('Unauthorized', 401);
  }

  // Attach user to the context via a header convention (read by handlers)
  // We store it on the request object via a custom approach
  (ctx as { user?: AuthUser }).user = user;
  return next();
};

export const authOptional: Middleware<Services> = (ctx, next) => {
  const jwtSecret = ctx.services.config.jwt.secret;
  const user = extractUser(ctx.request, jwtSecret);
  if (user) {
    (ctx as { user?: AuthUser }).user = user;
  }
  return next();
};

export function getUser(ctx: Context<Services>): AuthUser | null {
  return (ctx as { user?: AuthUser }).user ?? null;
}

export function requireUser(ctx: Context<Services>): AuthUser {
  const user = getUser(ctx);
  if (!user) throw new Error('User not found on context');
  return user;
}
