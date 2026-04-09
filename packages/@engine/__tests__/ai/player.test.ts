import { describe, expect, it, beforeAll } from 'bun:test';
import { loadStandardCardPool } from '../../lib/adapter';
import type { CardDefinition } from '../../lib/types/card';
import type { AiConfig } from '../../lib/ai/types';
import { RandomStrategy, GreedyStrategy } from '../../lib/ai/strategy';
import { simulateGame, runSetupPhase } from '../../lib/ai/player';
import { createGame } from '../../lib/core/game';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';

let pool: ReadonlyMap<string, CardDefinition>;

beforeAll(() => {
  pool = loadStandardCardPool(DB_PATH, new Date('2026-01-01'));
});

function buildSimpleDeck(cardPool: ReadonlyMap<string, CardDefinition>): string[] {
  const basics: string[] = [];

  for (const [id, def] of cardPool) {
    if (def.cardType === 'Pokemon' && def.stage === 'Basic' && basics.length < 15) {
      basics.push(id);
    }
  }

  let basicEnergyId = '';
  for (const [id, def] of cardPool) {
    if (def.cardType === 'Energy' && def.subtype === 'Basic') {
      basicEnergyId = id;
      break;
    }
  }

  const deck: string[] = [];
  for (const id of basics) {
    for (let i = 0; i < 4 && deck.length < 40; i++) {
      deck.push(id);
    }
  }
  while (deck.length < 60) {
    deck.push(basicEnergyId);
  }
  return deck;
}

describe('player', () => {
  it('simulateGame between two RandomStrategy AIs completes', () => {
    const deck1 = buildSimpleDeck(pool);
    const deck2 = buildSimpleDeck(pool);

    const config1: AiConfig = {
      strategy: new RandomStrategy(),
      playerId: 'player1'
    };
    const config2: AiConfig = {
      strategy: new RandomStrategy(),
      playerId: 'player2'
    };

    const finalState = simulateGame(config1, config2, {
      deck1,
      deck2,
      seed: 42,
      definitions: pool,
      formatDate: new Date('2026-01-01')
    });

    // Game should have progressed past setup
    expect(finalState.turnNumber).toBeGreaterThan(0);
  }, 30000);

  it('simulateGame between Greedy vs Random completes', () => {
    const deck1 = buildSimpleDeck(pool);
    const deck2 = buildSimpleDeck(pool);

    const config1: AiConfig = {
      strategy: new GreedyStrategy(),
      playerId: 'player1'
    };
    const config2: AiConfig = {
      strategy: new RandomStrategy(),
      playerId: 'player2'
    };

    const finalState = simulateGame(config1, config2, {
      deck1,
      deck2,
      seed: 99,
      definitions: pool,
      formatDate: new Date('2026-01-01')
    });

    expect(finalState.turnNumber).toBeGreaterThan(0);
  }, 30000);

  it('runSetupPhase exits setup phase', () => {
    const deck1 = buildSimpleDeck(pool);
    const deck2 = buildSimpleDeck(pool);

    const result = createGame({
      deck1,
      deck2,
      seed: 123,
      definitions: pool,
      formatDate: new Date('2026-01-01')
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config1: AiConfig = {
      strategy: new RandomStrategy(),
      playerId: 'player1'
    };
    const config2: AiConfig = {
      strategy: new RandomStrategy(),
      playerId: 'player2'
    };

    const afterSetup = runSetupPhase(result.value, config1, config2);
    expect(afterSetup.phase).not.toBe('setup');
  }, 30000);
});
