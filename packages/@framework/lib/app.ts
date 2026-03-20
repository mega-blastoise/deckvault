/**
 * @fileoverview Application factory and HTTP server.
 * Creates the main application instance that handles routing and middleware.
 */

import type {
  Handler,
  Middleware,
  ServiceMap,
  CompiledRoute,
  HttpMethod
} from './types';
import type { Container } from './container';
import type { Router } from './router';
import { createContext } from './context';
import { compilePath, matchRoute } from './router';

/**
 * Application configuration options
 */
export interface AppOptions<S extends ServiceMap = ServiceMap> {
  /**
   * Service container for dependency injection.
   * If provided, services will be available in handler contexts.
   */
  container?: Container<S>;
}

/**
 * Application instance.
 * Manages routes, middleware, and the HTTP server.
 *
 * @typeParam S - Service map type for typed service access
 */
export interface App<S extends ServiceMap = ServiceMap> {
  /**
   * The underlying instance of the Bun.Server
   * Will be null until app.listen() is called
   */
  _s: ReturnType<typeof Bun.serve> | null;

  /**
   * Add global middleware.
   * Middleware runs in registration order for all routes.
   *
   * @param middleware - Middleware function
   * @returns App for chaining
   */
  use(middleware: Middleware<S>): App<S>;

  /**
   * Add routes from a router.
   * Router's middleware applies only to its routes.
   *
   * @param router - Router with route definitions
   * @returns App for chaining
   */
  routes(router: Router<S>): App<S>;

  /**
   * Add a single route directly.
   *
   * @param method - HTTP method
   * @param path - Route path
   * @param handler - Request handler
   * @returns App for chaining
   */
  route(method: HttpMethod, path: string, handler: Handler<S>): App<S>;

  /**
   * Handle a request programmatically.
   * Useful for testing without starting a server.
   *
   * @param request - Fetch API Request
   * @returns Response promise
   *
   * @example
   * ```typescript
   * const response = await app.handle(new Request('http://test/api/v1/cards'));
   * expect(response.status).toBe(200);
   * ```
   */
  handle(request: Request): Promise<Response>;

  /**
   * Start the HTTP server.
   * Also starts container services and registers shutdown handlers.
   *
   * @param port - Port number to listen on
   * @param callback - Called when server is ready (optional)
   *
   * @example
   * ```typescript
   * await app.listen(3001, () => {
   *   console.log('Server running on port 3001');
   * });
   * ```
   */
  listen(port: number, callback?: () => void): Promise<void>;

  /**
   * Gracefully shutdown the application.
   * Stops all container services.
   */
  shutdown(): Promise<void>;
}

/**
 * Internal compiled route with middleware
 */
interface InternalRoute<S extends ServiceMap> extends CompiledRoute<S> {
  middleware: Middleware<S>[];
}

/**
 * Create a new application instance.
 *
 * @typeParam S - Service map type for typed service access
 * @param options - Application options
 * @returns Application instance
 *
 * @example
 * ```typescript
 * const app = createApp({ container })
 *   .use(logging)
 *   .use(cors())
 *   .routes(cardsRouter)
 *   .routes(setsRouter);
 *
 * await app.listen(3001, () => {
 *   console.log('Server started');
 * });
 * ```
 */
export function createApp<S extends ServiceMap = ServiceMap>(
  options: AppOptions<S> = {}
): App<S> {
  const { container } = options;

  /** Global middleware (applies to all routes) */
  const globalMiddleware: Middleware<S>[] = [];

  /** Compiled routes with their specific middleware */
  const compiledRoutes: InternalRoute<S>[] = [];

  /** Service map for context injection */
  const services = (container?.services ?? {}) as S;

  /** Flag to track if server is running */
  let isRunning = false;

  let s: App['_s'] = null;

  /**
   * Find matching route for a request
   */
  function findRoute(
    method: string,
    path: string
  ): { route: InternalRoute<S>; params: Record<string, string> } | null {
    for (const route of compiledRoutes) {
      if (route.method !== method) {
        continue;
      }

      const params = matchRoute(path, route);
      if (params !== null) {
        return { route, params };
      }
    }

    return null;
  }

  /**
   * Handle an incoming HTTP request
   */
  async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Always create context first - middleware needs it
    const ctx = createContext(request, {}, services);

    try {
      // Run global middleware, then route matching
      let index = 0;

      const next = async (): Promise<Response> => {
        // Still processing global middleware
        if (index < globalMiddleware.length) {
          const mw = globalMiddleware[index++]!;
          return mw(ctx, next);
        }

        // Global middleware done, now do route matching
        const match = findRoute(method, path);

        if (!match) {
          return ctx.notFound(`Cannot ${method} ${path}`);
        }

        const { route, params } = match;

        // Update context params (frozen object, need to update ctx)
        Object.assign(ctx, { params: Object.freeze(params) });

        // Run route-specific middleware, then handler
        let routeIndex = 0;

        const routeNext = async (): Promise<Response> => {
          if (routeIndex < route.middleware.length) {
            const mw = route.middleware[routeIndex++]!;
            return mw(ctx, routeNext);
          }
          return route.handler(ctx);
        };

        return routeNext();
      };

      return await next();
    } catch (err) {
      // Log error with request ID for debugging
      console.error(`[${ctx.requestId}] Unhandled error:`, err);

      // Return generic error response
      const message =
        err instanceof Error ? err.message : 'Internal Server Error';
      return ctx.error(message, 500);
    }
  }

  const app: App<S> = {
    _s: s,

    use(middleware) {
      globalMiddleware.push(middleware);
      return app;
    },

    routes(router) {
      for (const route of router.routes) {
        const compiled = compilePath(route.path);

        compiledRoutes.push({
          method: route.method,
          path: route.path,
          handler: route.handler,
          pattern: compiled.pattern,
          paramNames: compiled.paramNames,
          middleware: [...router.middleware]
        });
      }
      return app;
    },

    route(method, path, handler) {
      const compiled = compilePath(path);

      compiledRoutes.push({
        method,
        path,
        handler,
        pattern: compiled.pattern,
        paramNames: compiled.paramNames,
        middleware: []
      });

      return app;
    },

    async handle(request) {
      return handleRequest(request);
    },

    async listen(port, callback) {
      // Start container services first
      if (container) {
        await container.start();
      }

      // Start HTTP server
      this._s = s = Bun.serve({
        port,
        fetch: handleRequest
      });

      isRunning = true;

      // Register graceful shutdown handlers
      const shutdown = async () => {
        if (!isRunning) return;
        isRunning = false;

        console.log('\nShutting down...');
        await app.shutdown();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Call ready callback
      callback?.();
    },

    async shutdown() {
      if (container) {
        await container.stop();
      }
    }
  };

  return app;
}
