import { describe, it, expect } from 'bun:test';
import { buildTestApp, req, TEST_CARDS, TEST_SETS } from './utils/test-utils';

// ============================================================
// Health
// ============================================================

describe('GET /health', () => {
  const { app } = buildTestApp();

  it('returns 200 with healthy status', async () => {
    const res = await app.handle(req('/health'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('pokemon-rest-api');
    expect(body.version).toBe('v1');
    expect(body.checks.database).toBe('healthy');
  });

  it('includes uptime as a number', async () => {
    const res = await app.handle(req('/health'));
    const body = await res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes an ISO timestamp', async () => {
    const res = await app.handle(req('/health'));
    const body = await res.json();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

describe('GET /ready', () => {
  const { app } = buildTestApp();

  it('returns 200 when database is reachable', async () => {
    const res = await app.handle(req('/ready'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ready).toBe(true);
  });
});

// ============================================================
// Discovery
// ============================================================

describe('GET /api/v1/endpoints', () => {
  const { app } = buildTestApp();

  it('returns HTML by default', async () => {
    const res = await app.handle(req('/api/v1/endpoints'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')!).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('Pokemon TCG REST API');
    expect(html).toContain('/api/v1/cards');
    expect(html).toContain('/api/v1/sets');
  });

  it('returns JSON when Accept: application/json', async () => {
    const res = await app.handle(
      req('/api/v1/endpoints', {
        headers: { accept: 'application/json' }
      })
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.service).toBe('Pokemon TCG REST API');
    expect(body.data.version).toBe('v1');
    expect(Array.isArray(body.data.endpoints)).toBe(true);
    expect(body.data.endpoints.length).toBeGreaterThan(0);
  });

  it('GET /api/v1 is an alias for discovery', async () => {
    const res = await app.handle(
      req('/api/v1', {
        headers: { accept: 'application/json' }
      })
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.service).toBe('Pokemon TCG REST API');
  });
});

// ============================================================
// Cards — list
// ============================================================

describe('GET /api/v1/cards', () => {
  const { app } = buildTestApp();

  it('returns all cards with default pagination', async () => {
    const res = await app.handle(req('/api/v1/cards'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(TEST_CARDS.length);
    expect(body.meta.totalCount).toBe(TEST_CARDS.length);
    expect(body.meta.page).toBe(1);
    expect(body.meta.pageSize).toBe(60); // default
  });

  it('includes HATEOAS links', async () => {
    const res = await app.handle(req('/api/v1/cards'));
    const body = await res.json();
    expect(body.links.self).toContain('page=1');
    expect(body.links.first).toBeDefined();
  });

  it('paginates correctly with page + pageSize', async () => {
    const res = await app.handle(req('/api/v1/cards?page=1&pageSize=2'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(2);
    expect(body.meta.page).toBe(1);
    expect(body.meta.pageSize).toBe(2);
    expect(body.meta.totalCount).toBe(TEST_CARDS.length);
    expect(body.meta.totalPages).toBe(3); // ceil(6/2)
    expect(body.links.next).toBeDefined();
    expect(body.links.prev).toBeUndefined(); // first page
  });

  it('page 2 has prev and next links', async () => {
    const res = await app.handle(req('/api/v1/cards?page=2&pageSize=2'));
    const body = await res.json();
    expect(body.data.length).toBe(2);
    expect(body.links.prev).toBeDefined();
    expect(body.links.next).toBeDefined();
  });

  it('last page has prev but no next', async () => {
    const res = await app.handle(req('/api/v1/cards?page=3&pageSize=2'));
    const body = await res.json();
    expect(body.data.length).toBe(2);
    expect(body.links.prev).toBeDefined();
    expect(body.links.next).toBeUndefined();
  });

  it('beyond-range page returns empty data with correct meta', async () => {
    const res = await app.handle(req('/api/v1/cards?page=99&pageSize=10'));
    const body = await res.json();
    expect(body.data.length).toBe(0);
    expect(body.meta.totalCount).toBe(TEST_CARDS.length);
  });

  it('caps pageSize at 420', async () => {
    const res = await app.handle(req('/api/v1/cards?page=1&pageSize=999'));
    const body = await res.json();
    expect(body.meta.pageSize).toBe(420);
  });

  it('each card has the expected top-level shape', async () => {
    const res = await app.handle(req('/api/v1/cards?pageSize=1'));
    const card = (await res.json()).data[0];

    expect(typeof card.id).toBe('string');
    expect(typeof card.name).toBe('string');
    expect(typeof card.supertype).toBe('string');
    expect(Array.isArray(card.subtypes)).toBe(true);
    expect(Array.isArray(card.types)).toBe(true);
    expect(card.set).toBeDefined();
    expect(typeof card.set.id).toBe('string');
  });
});

// ============================================================
// Cards — get by ID
// ============================================================

describe('GET /api/v1/cards/:id', () => {
  const { app } = buildTestApp();

  it('returns the card with full set information', async () => {
    const res = await app.handle(req('/api/v1/cards/base1-35'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe('base1-35');
    expect(body.data.name).toBe('Pikachu');
    expect(body.data.supertype).toBe('Pokémon');
    expect(body.data.types).toContain('Electric');
    expect(body.data.rarity).toBe('Common');

    // Full set info merged in
    expect(body.data.set.id).toBe('base1');
    expect(body.data.set.name).toBe('Base Set');
    expect(body.data.set.series).toBe('Base');
  });

  it('parses JSON attack data correctly', async () => {
    const res = await app.handle(req('/api/v1/cards/base1-4'));
    const body = await res.json();

    expect(body.data.name).toBe('Charizard');
    expect(Array.isArray(body.data.attacks)).toBe(true);
    expect(body.data.attacks[0].name).toBe('Fire Spin');
    expect(body.data.attacks[0].damage).toBe('80');
  });

  it('parses weakness data correctly', async () => {
    const res = await app.handle(req('/api/v1/cards/base1-35'));
    const body = await res.json();

    expect(Array.isArray(body.data.weaknesses)).toBe(true);
    expect(body.data.weaknesses[0].type).toBe('Fighting');
  });

  it('handles trainer cards with null hp/attacks gracefully', async () => {
    const res = await app.handle(req('/api/v1/cards/gym1-64'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.name).toBe('Misty');
    expect(body.data.supertype).toBe('Trainer');
    expect(body.data.hp).toBe(''); // null hp → empty string
    expect(Array.isArray(body.data.attacks)).toBe(true); // null attacks → []
    expect(body.data.attacks.length).toBe(0);
  });

  it('handles card with null retreat_cost', async () => {
    const res = await app.handle(req('/api/v1/cards/base1-63'));
    const body = await res.json();

    expect(body.data.name).toBe('Bulbasaur');
    expect(Array.isArray(body.data.retreatCost)).toBe(true);
    expect(body.data.retreatCost.length).toBe(0);
  });

  it('returns 404 for an unknown card ID', async () => {
    const res = await app.handle(req('/api/v1/cards/does-not-exist'));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('does-not-exist');
  });
});

// ============================================================
// Cards — search
// ============================================================

describe('GET /api/v1/cards/search', () => {
  const { app } = buildTestApp();

  it('filters by name (partial, case-insensitive)', async () => {
    const res = await app.handle(req('/api/v1/cards/search?name=pikachu'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Pikachu');
  });

  it('name filter matches substrings', async () => {
    // 'a' appears in: Pikachu, Charizard, Bulbasaur, Erika → 4 cards
    const res = await app.handle(req('/api/v1/cards/search?name=a'));
    const body = await res.json();
    expect(body.data.length).toBe(4);
    for (const card of body.data) {
      expect(card.name.toLowerCase()).toContain('a');
    }
  });

  it('filters by type', async () => {
    const res = await app.handle(req('/api/v1/cards/search?type=Fire'));
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Charizard');
  });

  it('filters by rarity', async () => {
    // Common: Pikachu + Bulbasaur
    const res = await app.handle(req('/api/v1/cards/search?rarity=Common'));
    const body = await res.json();
    expect(body.data.length).toBe(2);
  });

  it('filters by set', async () => {
    // gym1 has Misty + Erika
    const res = await app.handle(req('/api/v1/cards/search?set=gym1'));
    const body = await res.json();
    expect(body.data.length).toBe(2);
  });

  it('ANDs multiple filters together', async () => {
    // Electric cards in base1 → only Pikachu
    const res = await app.handle(
      req('/api/v1/cards/search?type=Electric&set=base1')
    );
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Pikachu');
  });

  it('returns 400 when no filter params are provided', async () => {
    const res = await app.handle(req('/api/v1/cards/search'));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns empty data array for no matches', async () => {
    const res = await app.handle(req('/api/v1/cards/search?name=Nonexistent'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(0);
    expect(body.meta.totalCount).toBe(0);
  });

  it('includes pagination meta and links preserving filter params', async () => {
    // 2 Common cards, pageSize=1 → 2 pages
    const res = await app.handle(
      req('/api/v1/cards/search?rarity=Common&page=1&pageSize=1')
    );
    const body = await res.json();

    expect(body.meta.totalCount).toBe(2);
    expect(body.meta.pageSize).toBe(1);
    expect(body.meta.totalPages).toBe(2);
    expect(body.links.next).toBeDefined();
    // Links should carry the rarity filter through
    expect(body.links.self).toContain('rarity=Common');
  });
});

// ============================================================
// Sets — list
// ============================================================

describe('GET /api/v1/sets', () => {
  const { app } = buildTestApp();

  it('returns all sets with default pagination', async () => {
    const res = await app.handle(req('/api/v1/sets'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(TEST_SETS.length);
    expect(body.meta.totalCount).toBe(TEST_SETS.length);
  });

  it('orders sets by release_date DESC', async () => {
    const res = await app.handle(req('/api/v1/sets'));
    const body = await res.json();

    // gym2 (1999/09/22) > gym1 (1999/08/14) > base1 (1999/01/09)
    expect(body.data[0].id).toBe('gym2');
    expect(body.data[1].id).toBe('gym1');
    expect(body.data[2].id).toBe('base1');
  });

  it('paginates correctly', async () => {
    const res = await app.handle(req('/api/v1/sets?page=1&pageSize=2'));
    const body = await res.json();

    expect(body.data.length).toBe(2);
    expect(body.meta.totalPages).toBe(2); // ceil(3/2)
    expect(body.links.next).toBeDefined();
  });

  it('each set has the expected shape', async () => {
    const res = await app.handle(req('/api/v1/sets?pageSize=1'));
    const set = (await res.json()).data[0];

    expect(typeof set.id).toBe('string');
    expect(typeof set.name).toBe('string');
    expect(typeof set.series).toBe('string');
    expect(typeof set.total).toBe('number');
    expect(set.images).toBeDefined();
    expect(typeof set.images.symbol).toBe('string');
    expect(typeof set.images.logo).toBe('string');
  });
});

// ============================================================
// Sets — get by ID
// ============================================================

describe('GET /api/v1/sets/:id', () => {
  const { app } = buildTestApp();

  it('returns the set with parsed JSON fields', async () => {
    const res = await app.handle(req('/api/v1/sets/base1'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe('base1');
    expect(body.data.name).toBe('Base Set');
    expect(body.data.series).toBe('Base');
    expect(body.data.total).toBe(102);
    expect(body.data.printedTotal).toBe(102);
    expect(body.data.releaseDate).toBe('1999/01/09');
    expect(body.data.images.symbol).toBe('https://example.com/base-symbol.png');
  });

  it('returns 404 for an unknown set', async () => {
    const res = await app.handle(req('/api/v1/sets/does-not-exist'));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('does-not-exist');
  });
});

// ============================================================
// Sets — cards within a set
// ============================================================

describe('GET /api/v1/sets/:id/cards', () => {
  const { app } = buildTestApp();

  it('returns all cards in the set', async () => {
    const res = await app.handle(req('/api/v1/sets/base1/cards'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(3); // Charizard, Pikachu, Bulbasaur
    expect(body.meta.totalCount).toBe(3);
  });

  it('orders cards by card number ascending', async () => {
    const res = await app.handle(req('/api/v1/sets/base1/cards'));
    const body = await res.json();

    // number order: 4 (Charizard), 35 (Pikachu), 63 (Bulbasaur)
    expect(body.data[0].name).toBe('Charizard');
    expect(body.data[1].name).toBe('Pikachu');
    expect(body.data[2].name).toBe('Bulbasaur');
  });

  it('paginates correctly', async () => {
    const res = await app.handle(
      req('/api/v1/sets/base1/cards?page=1&pageSize=2')
    );
    const body = await res.json();

    expect(body.data.length).toBe(2);
    expect(body.meta.totalCount).toBe(3);
    expect(body.meta.totalPages).toBe(2);
    expect(body.links.next).toBeDefined();
  });

  it('returns 404 when the set does not exist', async () => {
    const res = await app.handle(req('/api/v1/sets/nonexistent/cards'));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('gym1 has exactly 2 cards', async () => {
    const res = await app.handle(req('/api/v1/sets/gym1/cards'));
    const body = await res.json();
    expect(body.data.length).toBe(2);
  });

  it('gym2 has exactly 1 card', async () => {
    const res = await app.handle(req('/api/v1/sets/gym2/cards'));
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Lt. Surge');
  });
});

// ============================================================
// Sets — by series
// ============================================================

describe('GET /api/v1/sets/series/:series', () => {
  const { app } = buildTestApp();

  it('returns all sets in the given series', async () => {
    const res = await app.handle(req('/api/v1/sets/series/Gym'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(2);
    for (const set of body.data) {
      expect(set.series).toBe('Gym');
    }
  });

  it('returns a single-element array for a series with one set', async () => {
    const res = await app.handle(req('/api/v1/sets/series/Base'));
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Base Set');
  });

  it('returns an empty array for an unknown series', async () => {
    const res = await app.handle(req('/api/v1/sets/series/NoSuchSeries'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(0);
  });

  it('handles URL-encoded series names', async () => {
    // "Base" doesn't need encoding but encode it anyway; framework decodes path params
    const res = await app.handle(req('/api/v1/sets/series/Base'));
    const body = await res.json();
    expect(body.data.length).toBe(1);
  });
});

// ============================================================
// Middleware — request tracing
// ============================================================

describe('Request ID', () => {
  const { app } = buildTestApp();

  it('every response carries an x-request-id header', async () => {
    const res = await app.handle(req('/health'));
    const id = res.headers.get('x-request-id');
    expect(id).toBeTruthy();
    expect(id!.length).toBeGreaterThan(0);
  });

  it('preserves an incoming x-request-id', async () => {
    const res = await app.handle(
      req('/health', {
        headers: { 'x-request-id': 'my-trace-42' }
      })
    );
    expect(res.headers.get('x-request-id')).toBe('my-trace-42');
  });

  it('error responses also carry x-request-id', async () => {
    const res = await app.handle(req('/api/v1/cards/missing'));
    expect(res.status).toBe(404);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

// ============================================================
// Middleware — CORS
// ============================================================

describe('CORS', () => {
  const { app } = buildTestApp();

  it('adds allow-origin header when Origin is present', async () => {
    const res = await app.handle(
      req('/health', {
        headers: { origin: 'http://localhost:3000' }
      })
    );
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3000'
    );
  });

  it('preflight OPTIONS returns 204 with CORS headers', async () => {
    const res = await app.handle(
      new Request('http://test/health', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' }
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBeTruthy();
    expect(res.headers.get('access-control-allow-headers')).toBeTruthy();
  });
});

// ============================================================
// Middleware — security headers
// ============================================================

describe('Security Headers', () => {
  const { app } = buildTestApp();

  it('sets x-content-type-options', async () => {
    const res = await app.handle(req('/health'));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets x-frame-options', async () => {
    const res = await app.handle(req('/health'));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('sets referrer-policy', async () => {
    const res = await app.handle(req('/health'));
    expect(res.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
  });
});

// ============================================================
// Middleware — rate limiting
// ============================================================

describe('Rate Limiting', () => {
  it('allows requests up to the limit', async () => {
    const { app } = buildTestApp({ rateLimitMax: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await app.handle(req('/health'));
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 once the limit is exceeded', async () => {
    const { app } = buildTestApp({ rateLimitMax: 2 });

    // Exhaust the 2-request budget
    await app.handle(req('/health'));
    await app.handle(req('/health'));

    // Third request is rate-limited
    const res = await app.handle(req('/health'));
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('includes standard rate-limit headers on successful responses', async () => {
    const { app } = buildTestApp({ rateLimitMax: 100 });

    const res = await app.handle(req('/health'));
    expect(res.headers.get('x-ratelimit-limit')).toBe('100');
    expect(res.headers.has('x-ratelimit-remaining')).toBe(true);
    expect(res.headers.has('x-ratelimit-reset')).toBe(true);

    // After one request: remaining = 100 - 1 = 99
    expect(res.headers.get('x-ratelimit-remaining')).toBe('99');
  });

  it('429 response includes retry-after header', async () => {
    const { app } = buildTestApp({ rateLimitMax: 1 });

    await app.handle(req('/health')); // exhaust

    const res = await app.handle(req('/health'));
    expect(res.status).toBe(429);
    expect(res.headers.has('retry-after')).toBe(true);
  });
});

// ============================================================
// 404 catch-all
// ============================================================

describe('404 — unmatched routes', () => {
  const { app } = buildTestApp();

  it('returns 404 JSON for unknown paths', async () => {
    const res = await app.handle(req('/totally/unknown'));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.status).toBe(404);
  });

  it('404 message includes method and path', async () => {
    const res = await app.handle(req('/nope'));
    const body = await res.json();
    expect(body.error.message).toContain('GET');
    expect(body.error.message).toContain('/nope');
  });
});
