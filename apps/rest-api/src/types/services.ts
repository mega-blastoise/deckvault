import type { DatabaseService } from '../services/database';
import type { DeckDatabaseService } from '../services/deckDatabase';
import type { PostgresService } from '../services/postgres';
import type { Config } from '../config';

export interface Services {
  config: Config;
  db: DatabaseService;
  deckDb: DeckDatabaseService;
  pg: PostgresService;
  [key: string]: unknown;
}
