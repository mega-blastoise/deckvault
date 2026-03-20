/**
 * @fileoverview Framework unit tests
 */

import { describe, it, expect } from 'bun:test';
import {
  createApp,
  createRouter,
  createContainer,
  compilePath,
  matchRoute,
  normalizePath,
  cors
} from './index';
import type { Service, Handler } from './types';

// ============================================================
// Router Tests
// ============================================================

describe('Router', () => {
  describe('normalizePath', () => {
    it('handles empty path', () => {
      expect(normalizePath('')).toBe('/');
    });

    it('handles root path', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('adds leading slash', () => {
      expect(normalizePath('api/v1')).toBe('/api/v1');
    });

    it('removes trailing slash', () => {
      expect(normalizePath('/api/v1/')).toBe('/api/v1');
    });

    it('collapses multiple slashes', () => {
      expect(normalizePath('//api//v1//')).toBe('/api/v1');
    });
  });

  describe('compilePath', () => {
    it('compiles simple path', () => {
      const { pattern, paramNames } = compilePath('/api/v1/cards');
      expect(paramNames).toEqual([]);
      expect(pattern.test('/api/v1/cards')).toBe(true);
      expect(pattern.test('/api/v1/cards/')).toBe(true);
      expect(pattern.test('/api/v1/other')).toBe(false);
    });

    it('compiles path with single param', () => {
      const { pattern, paramNames } = compilePath('/cards/:id');
      expect(paramNames).toEqual(['id']);
      expect(pattern.test('/cards/123')).toBe(true);
      expect(pattern.test('/cards/')).toBe(false);
    });

    it('compiles path with multiple params', () => {
      const { pattern, paramNames } = compilePath(
        '/users/:userId/posts/:postId'
      );
      expect(paramNames).toEqual(['userId', 'postId']);
      expect(pattern.test('/users/1/posts/2')).toBe(true);
    });
  });

  describe('matchRoute', () => {
    it('extracts params from path', () => {
      const compiled = compilePath('/cards/:id');
      const params = matchRoute('/cards/abc123', compiled);
      expect(params).toEqual({ id: 'abc123' });
    });

    it('extracts multiple params', () => {
      const compiled = compilePath('/users/:userId/posts/:postId');
      const params = matchRoute('/users/42/posts/99', compiled);
      expect(params).toEqual({ userId: '42', postId: '99' });
    });

    it('returns null for non-matching path', () => {
      const compiled = compilePath('/cards/:id');
      const params = matchRoute('/users/123', compiled);
      expect(params).toBeNull();
    });

    it('decodes URI components', () => {
      const compiled = compilePath('/search/:query');
      const params = matchRoute('/search/hello%20world', compiled);
      expect(params).toEqual({ query: 'hello world' });
    });
  });

  describe('createRouter', () => {
    it('creates router with base path', () => {
      const router = createRouter('/api/v1');
      expect(router.basePath).toBe('/api/v1');
    });

    it('registers routes with correct paths', () => {
      const handler: Handler = (ctx) => ctx.json({});
      const router = createRouter('/api')
        .get('/cards', handler)
        .post('/cards', handler);

      expect(router.routes).toHaveLength(2);
      expect(router.routes[0]?.path).toBe('/api/cards');
      expect(router.routes[0]?.method).toBe('GET');
      expect(router.routes[1]?.method).toBe('POST');
    });

    it('registers middleware', () => {
      const mw = async (ctx: any, next: any) => next();
      const router = createRouter().use(mw).use(mw);

      expect(router.middleware).toHaveLength(2);
    });
  });
});

// ============================================================
// Container Tests
// ============================================================

describe('Container', () => {
  it('registers and resolves services', () => {
    const container = createContainer().register('value', () => 42);

    expect(container.get('value')).toBe(42);
  });

  it('resolves dependencies', () => {
    const container = createContainer()
      .register('a', () => 1)
      .register('b', (c) => c.get('a') + 1);

    expect(container.get('b')).toBe(2);
  });

  it('caches singleton instances', () => {
    let callCount = 0;
    const container = createContainer().register('counter', () => ++callCount);

    container.get('counter');
    container.get('counter');
    container.get('counter');

    expect(callCount).toBe(1);
  });

  it('creates new instances for transient services', () => {
    let callCount = 0;
    const container = createContainer().register('counter', () => ++callCount, {
      transient: true
    });

    container.get('counter');
    container.get('counter');
    container.get('counter');

    expect(callCount).toBe(3);
  });

  it('throws for unregistered service', () => {
    const container = createContainer();
    // @ts-expect-error - testing unregistered service
    expect(() => container.get('missing')).toThrow();
  });

  it('has() returns correct value', () => {
    const container = createContainer().register('exists', () => 1);

    expect(container.has('exists')).toBe(true);
    expect(container.has('missing')).toBe(false);
  });

  it('calls start() on services', async () => {
    let started = false;

    const service: Service = {
      start: () => {
        started = true;
      }
    };

    const container = createContainer().register('service', () => service);

    await container.start();
    expect(started).toBe(true);
  });

  it('calls stop() in reverse order', async () => {
    const order: string[] = [];

    const container = createContainer()
      .register('first', () => ({
        start: () => {
          order.push('start:first');
        },
        stop: () => {
          order.push('stop:first');
        }
      }))
      .register('second', () => ({
        start: () => {
          order.push('start:second');
        },
        stop: () => {
          order.push('stop:second');
        }
      }));

    await container.start();
    await container.stop();

    expect(order).toEqual([
      'start:first',
      'start:second',
      'stop:second',
      'stop:first'
    ]);
  });

  it('provides services proxy', () => {
    const container = createContainer()
      .register('a', () => 1)
      .register('b', () => 2);

    const services = container.services;
    expect(services.a).toBe(1);
    expect(services.b).toBe(2);
  });
});

// ============================================================
// Application Tests
// ============================================================

describe('Application', () => {
  it('handles basic request', async () => {
    const app = createApp().route('GET', '/hello', (ctx) =>
      ctx.json({ message: 'Hello' })
    );

    const response = await app.handle(new Request('http://test/hello'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ message: 'Hello' });
  });

  it('extracts path params', async () => {
    const app = createApp().route('GET', '/cards/:id', (ctx) =>
      ctx.json({ id: ctx.params.id })
    );

    const response = await app.handle(new Request('http://test/cards/abc123'));
    const body = await response.json();

    expect(body).toEqual({ id: 'abc123' });
  });

  it('extracts query params', async () => {
    const app = createApp().route('GET', '/search', (ctx) =>
      ctx.json({
        name: ctx.query.get('name'),
        page: ctx.query.getNumber('page', 1)
      })
    );

    const response = await app.handle(
      new Request('http://test/search?name=pikachu&page=2')
    );
    const body = await response.json();

    expect(body).toEqual({ name: 'pikachu', page: 2 });
  });

  it('returns 404 for unmatched route', async () => {
    const app = createApp();
    const response = await app.handle(new Request('http://test/missing'));

    expect(response.status).toBe(404);
  });

  it('runs global middleware', async () => {
    const order: string[] = [];

    const app = createApp()
      .use(async (ctx, next) => {
        order.push('before');
        const res = await next();
        order.push('after');
        return res;
      })
      .route('GET', '/', (ctx) => {
        order.push('handler');
        return ctx.text('OK');
      });

    await app.handle(new Request('http://test/'));

    expect(order).toEqual(['before', 'handler', 'after']);
  });

  it('runs router middleware', async () => {
    const order: string[] = [];

    const router = createRouter()
      .use(async (ctx, next) => {
        order.push('router-mw');
        return next();
      })
      .get('/', (ctx) => {
        order.push('handler');
        return ctx.text('OK');
      });

    const app = createApp()
      .use(async (ctx, next) => {
        order.push('global-mw');
        return next();
      })
      .routes(router);

    await app.handle(new Request('http://test/'));

    expect(order).toEqual(['global-mw', 'router-mw', 'handler']);
  });

  it('provides services in context', async () => {
    const container = createContainer().register('greeting', () => 'Hello');

    const app = createApp({ container }).route('GET', '/', (ctx) =>
      ctx.json({ msg: ctx.services.greeting })
    );

    const response = await app.handle(new Request('http://test/'));
    const body = await response.json();

    expect(body).toEqual({ msg: 'Hello' });
  });

  it('handles errors gracefully', async () => {
    const app = createApp().route('GET', '/error', () => {
      throw new Error('Test error');
    });

    const response = await app.handle(new Request('http://test/error'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.message).toBe('Test error');
  });

  it('adds request ID to responses', async () => {
    const app = createApp().route('GET', '/', (ctx) => ctx.text('OK'));

    const response = await app.handle(new Request('http://test/'));

    expect(response.headers.has('x-request-id')).toBe(true);
  });

  it('preserves incoming request ID', async () => {
    const app = createApp().route('GET', '/', (ctx) => ctx.text('OK'));

    const response = await app.handle(
      new Request('http://test/', {
        headers: { 'x-request-id': 'custom-id' }
      })
    );

    expect(response.headers.get('x-request-id')).toBe('custom-id');
  });
});

// ============================================================
// Middleware Tests
// ============================================================

describe('Middleware', () => {
  describe('cors', () => {
    it('handles preflight request', async () => {
      const app = createApp()
        .use(cors())
        .route('GET', '/', (ctx) => ctx.text('OK'));

      const response = await app.handle(
        new Request('http://test/', {
          method: 'OPTIONS',
          headers: { origin: 'http://example.com' }
        })
      );

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-methods')).toBeTruthy();
    });

    it('adds CORS headers to response', async () => {
      const app = createApp()
        .use(cors({ origins: ['http://example.com'] }))
        .route('GET', '/', (ctx) => ctx.text('OK'));

      const response = await app.handle(
        new Request('http://test/', {
          headers: { origin: 'http://example.com' }
        })
      );

      expect(response.headers.get('access-control-allow-origin')).toBe(
        'http://example.com'
      );
    });
  });
});
