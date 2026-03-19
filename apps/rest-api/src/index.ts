import {
  createApp,
  createContainer,
  createRouter,
  cors,
  securityHeaders,
  type Middleware
} from '@pokemon/framework';

import { loadConfig } from './config';
import { DatabaseService } from './services/database';
import { DeckDatabaseService } from './services/deckDatabase';
import { PostgresService } from './services/postgres';
import type { Services } from './types';
import {
  getCards,
  getCardById,
  getCardsBatch,
  searchCards
} from './handlers/cards';
import {
  getSets,
  getSetById,
  getSetCards,
  getSetsBySeries
} from './handlers/sets';
import { healthCheck, readyCheck, getApiDiscovery } from './handlers/health';
import {
  listDecks,
  getDeck,
  createDeck,
  updateDeck,
  deleteDeck,
  browseDecks
} from './handlers/decks';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  getMe,
  logout
} from './handlers/auth';
import {
  getCollection,
  upsertCollectionCard,
  removeCollectionCard
} from './handlers/collection';
import { listMetaDecks, getMetaDeck } from './handlers/meta-decks';
import {
  listVersions,
  getVersion,
  diffVersions,
  updateVersionLabel
} from './handlers/deck-versions';
import { authRequired, authOptional } from './middleware/auth';

const config = loadConfig();

// ============================================================
// 1. Container — service registration and lifecycle
// ============================================================

const container = createContainer()
  .register('config', () => config)
  .register('db', (c) => new DatabaseService(c.get('config').database))
  .register(
    'deckDb',
    (c) => new DeckDatabaseService(c.get('config').deckDatabase.path)
  )
  .register(
    'pg',
    (c) => new PostgresService(c.get('config').postgres.url)
  );

// ============================================================
// 2. Routers — route definitions grouped by domain
// ============================================================

// Health & discovery
const health = createRouter<Services>('/health').get('/', healthCheck);
const ready = createRouter<Services>('/ready').get('/', readyCheck);
const discovery = createRouter<Services>('/api/v1')
  .get('/endpoints', getApiDiscovery)
  .get('/', getApiDiscovery);

// Auth — public endpoints
const auth = createRouter<Services>('/auth')
  .get('/google', initiateGoogleAuth)
  .get('/callback', handleGoogleCallback)
  .get('/me', getMe)
  .get('/logout', logout)
  .post('/logout', logout);

// Cards — search must be registered before :id so it matches first
const cards = createRouter<Services>('/api/v1/cards')
  .get('/search', searchCards)
  .get('/batch', getCardsBatch)
  .get('/:id', getCardById)
  .get('/', getCards);

// Sets — series and :id/cards must come before bare :id
const sets = createRouter<Services>('/api/v1/sets')
  .get('/series/:series', getSetsBySeries)
  .get('/:id/cards', getSetCards)
  .get('/:id', getSetById)
  .get('/', getSets);

// Decks — browse is public, user-specific list and mutations require auth
const decksBrowse = createRouter<Services>('/api/v1/decks')
  .get('/browse', browseDecks);

const decksDetail = createRouter<Services>('/api/v1/decks')
  .use(authOptional)
  .get('/:id', getDeck);

const decksProtected = createRouter<Services>('/api/v1/decks')
  .use(authRequired)
  .get('/', listDecks)
  .post('/', createDeck)
  .put('/:id', updateDeck)
  .delete('/:id', deleteDeck);

// Collection — all auth-required
const collection = createRouter<Services>('/api/v1/collection')
  .use(authRequired)
  .get('/', getCollection)
  .put('/:cardId', upsertCollectionCard)
  .delete('/:cardId', removeCollectionCard);

// Deck versions — auth-required; diff and static 'diff' segment before :versionId
const deckVersions = createRouter<Services>('/api/v1/decks')
  .use(authRequired)
  .get('/:id/versions/diff', diffVersions)
  .get('/:id/versions/:versionId', getVersion)
  .get('/:id/versions', listVersions)
  .put('/:id/versions/:versionId/label', updateVersionLabel);

// Meta decks — public browse, collection-aware enrichment when auth present
const metaDecksList = createRouter<Services>('/api/v1/meta-decks')
  .use(authOptional)
  .get('/', listMetaDecks);

const metaDecksDetail = createRouter<Services>('/api/v1/meta-decks')
  .get('/:id', getMetaDeck);

// ============================================================
// 3. Application assembly
// ============================================================

const log_middleware: Middleware<Services> = (ctx, next) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      method: ctx.method,
      path: ctx.path,
      requestId: ctx.requestId
    })
  );

  return next();
};

const app = createApp({ container })
  .use(log_middleware)
  .use(securityHeaders)
  .use(
    cors({
      origins: config.cors.origins,
      credentials: true
    })
  )
  .routes(health)
  .routes(ready)
  .routes(discovery)
  .routes(auth)
  .routes(cards)
  .routes(sets)
  .routes(decksBrowse)
  .routes(decksDetail)
  .routes(decksProtected)
  .routes(deckVersions)
  .routes(collection)
  .routes(metaDecksList)
  .routes(metaDecksDetail);

// ============================================================
// 4. Start
// ============================================================

await app.listen(config.port, () => {
  console.log(
    `Pokemon TCG REST API listening on http://${config.host}:${config.port}`
  );
  console.log(`Health:     http://${config.host}:${config.port}/health`);
  console.log(
    `Discovery:  http://${config.host}:${config.port}/api/v1/endpoints`
  );
});
