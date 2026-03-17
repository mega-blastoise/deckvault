import 'dotenv/config';

export interface Config {
  port: number;
  host: string;
  database: {
    path: string;
    readonly: boolean;
  };
  deckDatabase: {
    path: string;
  };
  cors: {
    origins: string[];
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
    format: string;
  };
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return ['http://localhost:3000'];
  return value.split(',').map((s) => s.trim());
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.REST_API_PORT || '3001', 10),
    host: process.env.REST_API_HOST || '0.0.0.0',
    database: {
      path: process.env.DATABASE_PATH || './database/pokemon-data.sqlite3.db',
      readonly: process.env.DATABASE_READONLY !== 'false'
    },
    deckDatabase: {
      path:
        process.env.DECK_DATABASE_PATH || './database/decks.sqlite3.db'
    },
    cors: {
      origins: parseOrigins(process.env.CORS_ORIGINS)
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10)
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json'
    }
  };
}

export const config = loadConfig();
