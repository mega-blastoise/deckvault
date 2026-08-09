import { checkRateLimit } from './lib/middleware/middleware';
import { HttpRateLimitError } from './lib/errors';
import { router } from './router';

export const serve = async () =>
  Bun.serve({
    port: 3000,
    async fetch(req) {
      try {
        await checkRateLimit(req);
        return await router(req);
      } catch (error: unknown) {
        if (error instanceof HttpRateLimitError) {
          return error.response;
        }

        /**
         * Determine what we want to send as a response in the event of a dynamic unknown error
         */
        return new Response('', { status: 500 });
      }
    }
  });
