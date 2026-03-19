import jwt from 'jsonwebtoken';
import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';
import { extractUser } from '../middleware/auth';

const AUTH_COOKIE = '__session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function generatePKCE(): { verifier: string; challenge: string } {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Buffer.from(array).toString('base64url');
  const hash = new Bun.CryptoHasher('sha256').update(verifier).digest();
  const challenge = Buffer.from(hash).toString('base64url');
  return { verifier, challenge };
}

function buildGoogleAuthURL(config: Services['config'], state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function setSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${COOKIE_MAX_AGE}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=0`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const initiateGoogleAuth: Handler<Services> = async (ctx) => {
  const config = ctx.services.config;
  const { verifier, challenge } = generatePKCE();

  const rawReturnTo = ctx.query.get('returnTo') ?? '/';
  // Only allow same-origin paths — reject anything with a scheme or protocol-relative URLs
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

  const authUrl = buildGoogleAuthURL(config, state, challenge);

  // Store verifier in a signed cookie
  const isSecure = config.google.redirectUri.startsWith('https');
  const verifierCookie = [
    `__pkce_verifier=${verifier}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600'
  ];
  if (isSecure) verifierCookie.push('Secure');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      'Set-Cookie': verifierCookie.join('; ')
    }
  });
};

export const handleGoogleCallback: Handler<Services> = async (ctx) => {
  const config = ctx.services.config;
  const pg = ctx.services.pg;

  const code = ctx.query.get('code');
  const stateParam = ctx.query.get('state');

  if (!code) {
    return ctx.badRequest('Missing authorization code');
  }

  // Parse returnTo from state — enforce same-origin path regardless of state contents
  let returnTo = '/';
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      const candidate = parsed.returnTo ?? '/';
      if (typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')) {
        returnTo = candidate;
      }
    } catch {
      // ignore
    }
  }

  // Extract PKCE verifier from cookie
  const cookieHeader = ctx.request.headers.get('cookie') ?? '';
  const verifierMatch = cookieHeader.match(/__pkce_verifier=([^;]+)/);
  const codeVerifier = verifierMatch?.[1];

  if (!codeVerifier) {
    return ctx.badRequest('Missing PKCE verifier');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    })
  });

  if (!tokenResponse.ok) {
    console.error('[auth] Token exchange failed:', await tokenResponse.text());
    return ctx.error('Authentication failed', 500);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
  };

  // Fetch user profile
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!profileResponse.ok) {
    return ctx.error('Failed to fetch user profile', 500);
  }

  const profile = (await profileResponse.json()) as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };

  // Upsert user
  const user = await pg.upsertUser({
    googleId: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture ?? null
  });

  // Issue JWT
  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  const isSecure = config.google.redirectUri.startsWith('https');

  // Use absolute URL in Location — relative paths cause Bun's fetch (redirect: 'manual')
  // to return an opaque response (status 0) that the BFF proxy cannot forward.
  // returnTo is guaranteed to be a same-origin path at this point.
  const appOrigin = new URL(config.google.redirectUri).origin;
  const absoluteReturnTo = `${appOrigin}${returnTo}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: absoluteReturnTo,
      'Set-Cookie': setSessionCookie(token, isSecure)
    }
  });
};

export const getMe: Handler<Services> = async (ctx) => {
  const user = extractUser(ctx.request, ctx.services.config.jwt.secret);
  if (!user) {
    return ctx.error('Unauthorized', 401);
  }

  const pg = ctx.services.pg;
  const fullUser = await pg.getUserById(user.id);
  if (!fullUser) {
    return ctx.error('Unauthorized', 401);
  }

  return ctx.json({
    data: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      avatarUrl: fullUser.avatar_url
    }
  });
};

export const logout: Handler<Services> = async (ctx) => {
  const config = ctx.services.config;
  const isSecure = config.google.redirectUri.startsWith('https');
  const appOrigin = new URL(config.google.redirectUri).origin;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${appOrigin}/`,
      'Set-Cookie': clearSessionCookie(isSecure)
    }
  });
};
