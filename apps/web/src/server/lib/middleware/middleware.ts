import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

const generalLimiter = new RateLimiterMemory({
  points: 120,
  duration: 60
});

const simLimiter = new RateLimiterMemory({
  points: 15,
  duration: 60
});

function getIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function middleware(_request: Request) {
}

export async function checkRateLimit(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const isSim = url.pathname.startsWith('/bff/sim/');
  const limiter = isSim ? simLimiter : generalLimiter;
  const ip = getIp(request);

  try {
    await limiter.consume(ip);
    return null;
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(err.msBeforeNext / 1000);
      return new Response(
        JSON.stringify({
          error: {
            code: 'RATE_LIMITED',
            message: `Too many requests. Retry after ${retryAfter}s.`,
            retryAfter
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter)
          }
        }
      );
    }
    throw err;
  }
}
