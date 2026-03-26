import type { Handler } from '@pokemon/framework';
import type { Services } from '../types';

const startTime = Date.now();

/**
 * GET /health
 * Service health check — reports overall status and per-dependency checks
 */
export const healthCheck: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const dbHealthy = db.ping();

  const response = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'pokemon-rest-api',
    version: 'v1',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbHealthy ? 'healthy' : 'unhealthy'
    }
  };

  return ctx.json(response, dbHealthy ? 200 : 503);
};

/**
 * GET /ready
 * Readiness probe — returns 200 only when all dependencies are available
 */
export const readyCheck: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const dbHealthy = db.ping();

  if (dbHealthy) {
    return ctx.json({ ready: true });
  }

  return ctx.json({ ready: false, reason: 'database unavailable' }, 503);
};

// ============================================================
// Discovery endpoint
// ============================================================

interface EndpointInfo {
  path: string;
  method: string;
  description: string;
  parameters?: {
    name: string;
    type: 'path' | 'query';
    required: boolean;
    description: string;
  }[];
}

const ENDPOINT_REGISTRY: EndpointInfo[] = [
  {
    path: '/api/v1/endpoints',
    method: 'GET',
    description:
      'API discovery endpoint - lists all available endpoints with health status'
  },
  {
    path: '/api/v1/cards',
    method: 'GET',
    description: 'List all Pokemon cards with pagination support',
    parameters: [
      {
        name: 'page',
        type: 'query',
        required: false,
        description: 'Page number (default: 1)'
      },
      {
        name: 'pageSize',
        type: 'query',
        required: false,
        description: 'Items per page (default: 60, max: 420)'
      }
    ]
  },
  {
    path: '/api/v1/cards/:id',
    method: 'GET',
    description: 'Get a specific Pokemon card by ID with full set information',
    parameters: [
      {
        name: 'id',
        type: 'path',
        required: true,
        description: 'The unique card identifier'
      }
    ]
  },
  {
    path: '/api/v1/cards/search',
    method: 'GET',
    description: 'Search cards by name, type, rarity, or set',
    parameters: [
      {
        name: 'name',
        type: 'query',
        required: false,
        description: 'Card name (partial match)'
      },
      {
        name: 'type',
        type: 'query',
        required: false,
        description: 'Card type (e.g., Fire, Water)'
      },
      {
        name: 'rarity',
        type: 'query',
        required: false,
        description: 'Card rarity'
      },
      { name: 'set', type: 'query', required: false, description: 'Set ID' }
    ]
  },
  {
    path: '/api/v1/sets',
    method: 'GET',
    description: 'List all Pokemon TCG sets with pagination support',
    parameters: [
      {
        name: 'page',
        type: 'query',
        required: false,
        description: 'Page number (default: 1)'
      },
      {
        name: 'pageSize',
        type: 'query',
        required: false,
        description: 'Items per page (default: 60, max: 420)'
      }
    ]
  },
  {
    path: '/api/v1/sets/:id',
    method: 'GET',
    description: 'Get a specific Pokemon TCG set by ID',
    parameters: [
      {
        name: 'id',
        type: 'path',
        required: true,
        description: 'The unique set identifier'
      }
    ]
  },
  {
    path: '/api/v1/sets/:id/cards',
    method: 'GET',
    description: 'List all cards in a specific set with pagination support',
    parameters: [
      {
        name: 'id',
        type: 'path',
        required: true,
        description: 'The set identifier'
      },
      {
        name: 'page',
        type: 'query',
        required: false,
        description: 'Page number (default: 1)'
      },
      {
        name: 'pageSize',
        type: 'query',
        required: false,
        description: 'Items per page (default: 60, max: 420)'
      }
    ]
  },
  {
    path: '/api/v1/sets/series/:series',
    method: 'GET',
    description: 'Get all sets in a specific series',
    parameters: [
      {
        name: 'series',
        type: 'path',
        required: true,
        description: 'The series name (URL encoded)'
      }
    ]
  }
];

type HealthStatus = 'healthy' | 'unhealthy';

function renderHtml(
  status: HealthStatus,
  endpoints: (EndpointInfo & { health: HealthStatus })[]
): string {
  const statusColor: Record<HealthStatus, string> = {
    healthy: '#22c55e',
    unhealthy: '#ef4444'
  };

  const endpointRows = endpoints
    .map((ep) => {
      const paramsHtml = ep.parameters
        ? `<ul class="params">${ep.parameters
            .map(
              (p) =>
                `<li><code>${p.name}</code> (${p.type}${p.required ? ', required' : ''}) - ${p.description}</li>`
            )
            .join('')}</ul>`
        : '';

      return `
      <tr>
        <td><code>${ep.method}</code></td>
        <td><code>${ep.path}</code></td>
        <td>${ep.description}${paramsHtml}</td>
        <td><span class="status" style="background: ${statusColor[ep.health]}">${ep.health}</span></td>
      </tr>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pokemon TCG REST API - API Discovery</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 1.875rem; margin-bottom: 0.5rem; color: #f8fafc; }
    .version { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .overall-status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #1e293b;
      border-radius: 0.5rem;
      margin-bottom: 2rem;
    }
    .status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #0f172a;
    }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 0.5rem; overflow: hidden; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #334155; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #334155; }
    code { background: #0f172a; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; color: #38bdf8; }
    .params { margin-top: 0.5rem; padding-left: 1.25rem; font-size: 0.875rem; color: #94a3b8; }
    .params li { margin-bottom: 0.25rem; }
    .params code { font-size: 0.75rem; }
    .tip { margin-top: 2rem; padding: 1rem; background: #1e293b; border-radius: 0.5rem; border-left: 4px solid #3b82f6; font-size: 0.875rem; color: #94a3b8; }
    .tip code { color: #a5b4fc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Pokemon TCG REST API</h1>
    <p class="version">Version: v1</p>
    <div class="overall-status">
      <span>Service Status:</span>
      <span class="status" style="background: ${statusColor[status]}">${status}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Endpoint</th>
          <th>Description</th>
          <th>Health</th>
        </tr>
      </thead>
      <tbody>
        ${endpointRows}
      </tbody>
    </table>
    <div class="tip">
      <strong>Tip:</strong> Request this endpoint with <code>Accept: application/json</code> header to get JSON response.
    </div>
  </div>
</body>
</html>`;
}

/**
 * GET /api/v1/endpoints  (also GET /api/v1)
 * API discovery — renders HTML by default, JSON when Accept: application/json
 */
export const getApiDiscovery: Handler<Services> = async (ctx) => {
  const db = ctx.services.db;
  const dbHealthy = db.ping();
  const dbHealth: HealthStatus = dbHealthy ? 'healthy' : 'unhealthy';
  const overallHealth: HealthStatus = dbHealthy ? 'healthy' : 'unhealthy';

  const endpoints = ENDPOINT_REGISTRY.map((ep) => ({
    ...ep,
    health:
      ep.path === '/api/v1/endpoints' ? ('healthy' as HealthStatus) : dbHealth
  }));

  const accept = ctx.headers.get('accept') || '';
  if (accept.includes('application/json')) {
    return ctx.json({
      data: {
        service: 'Pokemon TCG REST API',
        version: 'v1',
        status: overallHealth,
        endpoints
      }
    });
  }

  // Default: HTML
  return new Response(renderHtml(overallHealth, endpoints), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-request-id': ctx.requestId
    }
  });
};
