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
  postgres: {
    url: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  jwt: {
    secret: string;
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

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.REST_API_PORT || '3001', 10),
    host: process.env.REST_API_HOST || '0.0.0.0',
    database: {
      path: process.env.DATABASE_PATH || './database/pokemon-data.sqlite3.db',
      readonly: process.env.DATABASE_READONLY === 'true'
    },
    deckDatabase: {
      path:
        process.env.DECK_DATABASE_PATH || './database/decks.sqlite3.db'
    },
    postgres: {
      url: process.env.POSTGRES_URL || ''
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/callback'
    },
    jwt: {
      secret: requireEnv('JWT_SECRET')
    },
    cors: {
      origins: parseOrigins(process.env.CORS_ORIGINS)
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json'
    }
  };
}

export const config = loadConfig();
