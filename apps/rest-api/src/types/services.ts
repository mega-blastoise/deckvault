import type { DatabaseService } from '../services/database';
import type { DeckDatabaseService } from '../services/deckDatabase';
import type { Config } from '../config';

/**
 * Service map registered in the application container.
 * Used to type ctx.services in all handlers.
 */
export interface Services {
  config: Config;
  db: DatabaseService;
  deckDb: DeckDatabaseService;
  [key: string]: unknown;
}
