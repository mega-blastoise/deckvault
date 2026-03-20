import { Job } from '../../scheduler/Job';
import type { JobConfig, JobContext, JobResult } from '../../scheduler/types';
import { sqlite } from '@pokemon/database';
import { getCardsInSet, getSets } from '@pokemon/data';
import type { Database } from 'bun:sqlite';

interface DbSet {
  id: string;
  name: string;
  total: number | null;
  printed_total: number | null;
  release_date: string | null;
}

interface DbCard {
  id: string;
}

interface SourceCard {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  hp?: string | number;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  abilities?: unknown[];
  attacks?: unknown[];
  weaknesses?: unknown[];
  resistances?: unknown[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set: {
    id: string;
  };
  number: string | number;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities?: Record<string, string>;
  images?: {
    small: string;
    large: string;
  };
  tcgplayer?: {
    url: string;
  };
  cardmarket?: {
    url: string;
  };
  regulationMark?: string;
}

/**
 * Syncs missing cards for incomplete sets from the local data source.
 */
export class SyncMissingCardsJob extends Job {
  readonly config: JobConfig = {
    name: 'sync-missing-cards',
    description: 'Sync missing cards for incomplete sets',
    schedule: '0 3 * * *', // Daily at 3:00 AM
    enabled: true,
    timeout: 1_800_000, // 30 minutes
    retryAttempts: 2,
    retryDelayMs: 120_000,
    dependsOn: ['sync-missing-sets'],
    exclusive: true
  };

  // Configuration
  private readonly batchSize = 100;
  private readonly maxSetsPerRun = 10;

  async execute(context: JobContext): Promise<JobResult> {
    const startedAt = new Date();
    const logs: string[] = [];
    const metrics: Record<string, number> = {
      sets_checked: 0,
      sets_incomplete: 0,
      sets_processed: 0,
      cards_missing: 0,
      cards_synced: 0,
      cards_failed: 0
    };

    const logger = this.createScopedLogger(context.logger, logs);

    try {
      logger.info('Starting missing cards sync...');

      // Step 1: Find incomplete sets
      const incompleteSets = this.getIncompleteSets(context.sqliteDb);
      metrics.sets_checked = incompleteSets.length;

      if (incompleteSets.length === 0) {
        logger.info('All sets are complete - no cards to sync');
        return this.createResult(startedAt, metrics, logs);
      }

      logger.info('Found %d incomplete sets', incompleteSets.length);
      metrics.sets_incomplete = incompleteSets.length;

      // Limit sets per run
      const setsToProcess = incompleteSets.slice(0, this.maxSetsPerRun);
      logger.info('Processing %d sets this run', setsToProcess.length);

      // Step 2: Process each incomplete set
      const doInsertCard = sqlite.insertCard(context.sqliteDb);

      for (const set of setsToProcess) {
        if (context.abortSignal.aborted) {
          logger.warn('Job aborted - stopping sync');
          break;
        }

        metrics.sets_processed++;
        logger.info('Processing set: %s (%s)', set.name, set.id);

        // Get existing card IDs in this set
        const existingCards = sqlite.findCardsBySetId(context.sqliteDb)(
          set.id
        ) as DbCard[];
        const existingCardIds = new Set(existingCards.map((c) => c.id));
        logger.info(
          'Set %s has %d existing cards',
          set.id,
          existingCardIds.size
        );

        // Load cards from local data
        const localCards: SourceCard[] = await getCardsInSet(set.id);

        if (localCards.length === 0) {
          logger.warn('No local card data found for set %s', set.id);
          continue;
        }

        // Find missing cards
        const missingCards = localCards.filter(
          (card) => !existingCardIds.has(card.id)
        );
        metrics.cards_missing += missingCards.length;

        if (missingCards.length === 0) {
          logger.info(
            'Set %s is complete (%d cards)',
            set.id,
            existingCardIds.size
          );
          continue;
        }

        logger.info(
          'Found %d missing cards in set %s',
          missingCards.length,
          set.id
        );

        // Insert missing cards in batches
        for (let i = 0; i < missingCards.length; i += this.batchSize) {
          if (context.abortSignal.aborted) {
            break;
          }

          const batch = missingCards.slice(i, i + this.batchSize);

          for (const card of batch) {
            try {
              this.insertCard(doInsertCard, card, set.id);
              metrics.cards_synced++;
            } catch (error) {
              metrics.cards_failed++;
              logger.error(
                'Failed to insert card %s: %s',
                card.id,
                error instanceof Error ? error.message : error
              );
            }
          }

          logger.info(
            'Batch progress: %d/%d cards in set %s',
            Math.min(i + this.batchSize, missingCards.length),
            missingCards.length,
            set.id
          );
        }
      }

      logger.info(
        'Sync complete: %d sets processed, %d cards synced, %d failed',
        metrics.sets_processed,
        metrics.cards_synced,
        metrics.cards_failed
      );

      context.metrics.timing('sync_duration', Date.now() - startedAt.getTime());

      return this.createResult(startedAt, metrics, logs);
    } catch (error) {
      logger.error(
        'Job failed: %s',
        error instanceof Error ? error.message : error
      );
      return this.createResult(
        startedAt,
        metrics,
        logs,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Find sets where the card count is less than the expected total.
   */
  private getIncompleteSets(db: Database): DbSet[] {
    const query = `
      SELECT
        s.id,
        s.name,
        s.total,
        s.printed_total,
        s.release_date,
        COALESCE(c.cnt, 0) as card_count
      FROM pokemon_card_sets s
      LEFT JOIN (
        SELECT set_id, COUNT(*) as cnt
        FROM pokemon_cards
        GROUP BY set_id
      ) c ON s.id = c.set_id
      WHERE COALESCE(c.cnt, 0) < COALESCE(s.total, s.printed_total, 999)
      ORDER BY s.release_date DESC
    `;
    return db.query(query).all() as DbSet[];
  }

  /**
   * Insert a card into the database.
   */
  private insertCard(
    doInsert: ReturnType<typeof sqlite.insertCard>,
    card: SourceCard,
    setId: string
  ): void {
    const hp = card.hp
      ? typeof card.hp === 'string'
        ? parseInt(card.hp, 10) || null
        : card.hp
      : null;

    doInsert(
      card.id,
      card.name,
      card.supertype,
      JSON.stringify(card.subtypes ?? []),
      hp,
      JSON.stringify(card.types ?? []),
      card.evolvesFrom ?? null,
      JSON.stringify(card.evolvesTo ?? []),
      JSON.stringify(card.rules ?? []),
      JSON.stringify(card.abilities ?? []),
      JSON.stringify(card.attacks ?? []),
      JSON.stringify(card.weaknesses ?? []),
      JSON.stringify(card.retreatCost ?? []),
      card.convertedRetreatCost ?? null,
      setId,
      String(card.number),
      card.artist ?? null,
      card.rarity ?? null,
      card.flavorText ?? null,
      JSON.stringify(card.nationalPokedexNumbers ?? []),
      JSON.stringify(card.legalities ?? {}),
      JSON.stringify(card.images ?? {}),
      card.tcgplayer?.url ?? null,
      card.cardmarket?.url ?? null,
      card.regulationMark ?? null
    );
  }

  async onSuccess(result: JobResult): Promise<void> {
    console.log(
      `[SyncMissingCardsJob] Completed: ${result.metrics.cards_synced} cards synced across ${result.metrics.sets_processed} sets`
    );
  }

  async onFailure(error: Error): Promise<void> {
    console.error(`[SyncMissingCardsJob] Failed: ${error.message}`);
  }
}
