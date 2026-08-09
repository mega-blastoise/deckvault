import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import HttpRateLimitError from '@/server/lib/errors/rate-limit';

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

/**
 * Performs a brute force check to prevent denial of service attacks
 * For more info @see https://www.npmjs.com/package/rate-limiter-flexible
 */
export async function checkRateLimit(request: Request): Promise<void> {
  const url = new URL(request.url);
  const isSim = url.pathname.startsWith('/bff/sim/');
  const limiter = isSim ? simLimiter : generalLimiter;
  const ip = getIp(request);

  try {
    await limiter.consume(ip);
    return;
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(err.msBeforeNext / 1000);
      const message = `(HttpRateLimitError): ip (${ip}) has issued too many requests. Please try again after ${retryAfter}s`;
      const response = new Response(
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
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limiter.points),
            'X-RateLimit-Remaining': String(err.remainingPoints),
            'X-RateLimit-Reset': String(
              Math.ceil((Date.now() + err.msBeforeNext) / 1000)
            )
          }
        }
      );

      throw new HttpRateLimitError({
        message,
        response
      });
    }
    /**
     * In all other cases, proxy the original error
     */
    throw err;
  }
}
