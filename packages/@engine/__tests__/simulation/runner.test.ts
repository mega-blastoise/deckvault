import { describe, it, expect } from 'bun:test';
import { runSimulation, serializeResult, serializeResultSummary } from '../../lib/simulation/runner';
import type { DeckInput } from '../../lib/simulation/runner';
import { loadStandardCardPool } from '../../lib/adapter';

const DB_PATH = '../../database/pokemon-data.sqlite3.db';
const definitions = loadStandardCardPool(DB_PATH, new Date('2025-01-01'));

function makeMinimalDeck(name: string): DeckInput {
  const basicPokemon = [...definitions.values()].find(
    d => d.cardType === 'Pokemon' && d.stage === 'Basic'
  )!;
  const fireEnergy = [...definitions.values()].find(
    d => d.cardType === 'Energy' && d.subtype === 'Basic'
  )!;
  return {
    name,
    cards: [
      { cardId: basicPokemon.id, count: 4 },
      { cardId: fireEnergy.id, count: 56 }
    ]
  };
}

describe('runSimulation', () => {
  const deck1 = makeMinimalDeck('Deck A');
  const deck2 = makeMinimalDeck('Deck B');

  it('completes N games and reports correct gamesPlayed', () => {
    const result = runSimulation({
      deck1,
      deck2,
      games: 10,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    expect(result.gamesPlayed).toBe(10);
    expect(result.gameResults.length).toBe(10);
  });

  it('deck1Wins + deck2Wins + draws === gamesPlayed', () => {
    const result = runSimulation({
      deck1,
      deck2,
      games: 10,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    expect(result.deck1Wins + result.deck2Wins + result.draws).toBe(result.gamesPlayed);
  });

  it('win rates sum to approximately 1.0 (excluding draws)', () => {
    const result = runSimulation({
      deck1,
      deck2,
      games: 10,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    const drawRate = result.draws / result.gamesPlayed;
    expect(result.deck1WinRate + result.deck2WinRate + drawRate).toBeCloseTo(1.0);
  });

  it('produces deterministic results with the same seed', () => {
    const config = {
      deck1,
      deck2,
      games: 5,
      maxTurnsPerGame: 200,
      seed: 123,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    };

    const result1 = runSimulation(config);
    const result2 = runSimulation(config);

    for (let i = 0; i < result1.gameResults.length; i++) {
      expect(result1.gameResults[i]!.winner).toBe(result2.gameResults[i]!.winner);
      expect(result1.gameResults[i]!.totalTurns).toBe(result2.gameResults[i]!.totalTurns);
      expect(result1.gameResults[i]!.winReason).toBe(result2.gameResults[i]!.winReason);
    }
  });

  it('produces different outcomes with different seeds', () => {
    const config1 = {
      deck1,
      deck2,
      games: 10,
      maxTurnsPerGame: 200,
      seed: 1,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    };
    const config2 = {
      deck1,
      deck2,
      games: 10,
      maxTurnsPerGame: 200,
      seed: 99999,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    };

    const result1 = runSimulation(config1);
    const result2 = runSimulation(config2);

    // At least one game should differ in winner or turn count
    const anyDifference = result1.gameResults.some((r, i) =>
      r.winner !== result2.gameResults[i]!.winner || r.totalTurns !== result2.gameResults[i]!.totalTurns
    );
    expect(anyDifference).toBe(true);
  });

  it('GameResult fields are present and non-negative', () => {
    const result = runSimulation({
      deck1,
      deck2,
      games: 5,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    for (const gr of result.gameResults) {
      expect(gr.gameIndex).toBeGreaterThanOrEqual(0);
      expect(gr.seed).toBeGreaterThanOrEqual(0);
      expect(gr.totalTurns).toBeGreaterThanOrEqual(0);
      expect(gr.durationMs).toBeGreaterThanOrEqual(0);
      expect(gr.player1PrizesTaken).toBeGreaterThanOrEqual(0);
      expect(gr.player2PrizesTaken).toBeGreaterThanOrEqual(0);
      expect(gr.player1PokemonKOd).toBeGreaterThanOrEqual(0);
      expect(gr.player2PokemonKOd).toBeGreaterThanOrEqual(0);
      expect(['player1', 'player2', 'draw']).toContain(gr.winner);
    }
  });

  it('averageTurnCount is positive', () => {
    const result = runSimulation({
      deck1,
      deck2,
      games: 5,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    expect(result.averageTurnCount).toBeGreaterThan(0);
  });
});

describe('serializeResult', () => {
  it('produces valid JSON', () => {
    const deck1 = makeMinimalDeck('Deck A');
    const deck2 = makeMinimalDeck('Deck B');
    const result = runSimulation({
      deck1,
      deck2,
      games: 3,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    const json = serializeResult(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('serializeResultSummary', () => {
  it('produces a summary with correct structure', () => {
    const deck1 = makeMinimalDeck('Deck A');
    const deck2 = makeMinimalDeck('Deck B');
    const result = runSimulation({
      deck1,
      deck2,
      games: 3,
      maxTurnsPerGame: 200,
      seed: 42,
      dbPath: DB_PATH,
      formatDate: new Date('2025-01-01')
    });

    const summary = serializeResultSummary(result);
    expect(summary.deck1.name).toBe('Deck A');
    expect(summary.deck2.name).toBe('Deck B');
    expect(summary.gamesPlayed).toBe(3);
    expect(summary.averageTurns).toBeGreaterThan(0);
    expect(summary.deck1OpeningHand).toBeDefined();
    expect(summary.deck2OpeningHand).toBeDefined();
  });
});
