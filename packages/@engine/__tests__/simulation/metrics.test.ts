import { describe, it, expect } from 'bun:test';
import { calculateConsistency, computeDeckStats } from '../../lib/simulation/metrics';
import type { GameResult, DeckStats } from '../../lib/simulation/metrics';
import type { OpeningHandStats } from '../../lib/simulation/opening';

function makeOpeningStats(overrides: Partial<OpeningHandStats> = {}): OpeningHandStats {
  return {
    mulliganRate: 0,
    averageMulligans: 0,
    averageBasicsInOpeningHand: 3,
    hasSupporterTurn1Rate: 0.8,
    hasEnergyTurn1Rate: 0.9,
    hasEvolutionTargetRate: 0.3,
    idealOpeningRate: 0.5,
    ...overrides
  };
}

function makeGameResult(overrides: Partial<GameResult> = {}): GameResult {
  return {
    gameIndex: 0,
    seed: 0,
    winner: 'player1',
    winReason: 'all_prizes_taken',
    totalTurns: 20,
    durationMs: 50,
    player1PrizesTaken: 6,
    player2PrizesTaken: 3,
    player1PokemonKOd: 2,
    player2PokemonKOd: 4,
    ...overrides
  };
}

describe('calculateConsistency', () => {
  it('returns a value in [0, 1]', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeGameResult({ gameIndex: i, winner: i % 2 === 0 ? 'player1' : 'player2' })
    );
    const stats: DeckStats = {
      winsByReason: { all_prizes_taken: 5, no_pokemon_in_play: 0, deck_out: 0, tiebreaker: 0 },
      averagePrizesTaken: 6,
      averagePrizesGiven: 3,
      averagePokemonKOd: 2,
      averagePokemonLost: 4,
      averageTurnsToFirstKO: 5,
      averageTurnsToWin: 20,
      openingHandStats: makeOpeningStats(),
      consistencyScore: 0,
      setupSuccessRate: 1.0
    };

    const score = calculateConsistency(results, stats);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores higher for a perfect setup deck', () => {
    const perfectResults = Array.from({ length: 10 }, (_, i) =>
      makeGameResult({ gameIndex: i, totalTurns: 20, winner: i % 2 === 0 ? 'player1' : 'player2' })
    );
    const perfectStats: DeckStats = {
      winsByReason: { all_prizes_taken: 5, no_pokemon_in_play: 0, deck_out: 0, tiebreaker: 0 },
      averagePrizesTaken: 6,
      averagePrizesGiven: 3,
      averagePokemonKOd: 2,
      averagePokemonLost: 4,
      averageTurnsToFirstKO: 5,
      averageTurnsToWin: 20,
      openingHandStats: makeOpeningStats({ mulliganRate: 0, hasSupporterTurn1Rate: 1.0 }),
      consistencyScore: 0,
      setupSuccessRate: 1.0
    };

    const chaoticResults = Array.from({ length: 10 }, (_, i) =>
      makeGameResult({
        gameIndex: i,
        totalTurns: i * 10 + 5,
        winner: i < 2 ? 'player1' : 'player2'
      })
    );
    const chaoticStats: DeckStats = {
      winsByReason: { all_prizes_taken: 2, no_pokemon_in_play: 0, deck_out: 0, tiebreaker: 0 },
      averagePrizesTaken: 3,
      averagePrizesGiven: 5,
      averagePokemonKOd: 1,
      averagePokemonLost: 5,
      averageTurnsToFirstKO: 10,
      averageTurnsToWin: 30,
      openingHandStats: makeOpeningStats({ mulliganRate: 0.6, hasSupporterTurn1Rate: 0.2 }),
      consistencyScore: 0,
      setupSuccessRate: 0.4
    };

    const perfectScore = calculateConsistency(perfectResults, perfectStats);
    const chaoticScore = calculateConsistency(chaoticResults, chaoticStats);

    expect(perfectScore).toBeGreaterThan(chaoticScore);
  });
});

describe('computeDeckStats', () => {
  it('correctly aggregates wins and losses for player1', () => {
    const results: GameResult[] = [
      makeGameResult({ gameIndex: 0, winner: 'player1', winReason: 'all_prizes_taken', totalTurns: 20, player1PrizesTaken: 6, player2PrizesTaken: 2, player1PokemonKOd: 1, player2PokemonKOd: 3 }),
      makeGameResult({ gameIndex: 1, winner: 'player2', winReason: 'no_pokemon_in_play', totalTurns: 15, player1PrizesTaken: 3, player2PrizesTaken: 4, player1PokemonKOd: 3, player2PokemonKOd: 2 }),
      makeGameResult({ gameIndex: 2, winner: 'player1', winReason: 'deck_out', totalTurns: 30, player1PrizesTaken: 4, player2PrizesTaken: 1, player1PokemonKOd: 0, player2PokemonKOd: 2 })
    ];

    const openingStats = makeOpeningStats();
    const stats = computeDeckStats(results, 'player1', openingStats);

    expect(stats.winsByReason.all_prizes_taken).toBe(1);
    expect(stats.winsByReason.deck_out).toBe(1);
    expect(stats.winsByReason.no_pokemon_in_play).toBe(0);
    expect(stats.averagePrizesTaken).toBeCloseTo((6 + 3 + 4) / 3);
    expect(stats.averagePrizesGiven).toBeCloseTo((2 + 4 + 1) / 3);
    expect(stats.averagePokemonKOd).toBeCloseTo((1 + 3 + 0) / 3);
    expect(stats.averagePokemonLost).toBeCloseTo((3 + 2 + 2) / 3);
    expect(stats.averageTurnsToWin).toBeCloseTo((20 + 30) / 2);
    expect(stats.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(stats.consistencyScore).toBeLessThanOrEqual(1);
    expect(stats.setupSuccessRate).toBe(1.0);
  });

  it('correctly aggregates from player2 perspective', () => {
    const results: GameResult[] = [
      makeGameResult({ gameIndex: 0, winner: 'player2', winReason: 'all_prizes_taken', totalTurns: 18, player1PrizesTaken: 2, player2PrizesTaken: 6, player1PokemonKOd: 3, player2PokemonKOd: 1 }),
      makeGameResult({ gameIndex: 1, winner: 'player1', winReason: 'no_pokemon_in_play', totalTurns: 12, player1PrizesTaken: 5, player2PrizesTaken: 1, player1PokemonKOd: 0, player2PokemonKOd: 4 })
    ];

    const openingStats = makeOpeningStats({ mulliganRate: 0.3 });
    const stats = computeDeckStats(results, 'player2', openingStats);

    expect(stats.winsByReason.all_prizes_taken).toBe(1);
    expect(stats.averagePrizesTaken).toBeCloseTo((6 + 1) / 2);
    expect(stats.averagePrizesGiven).toBeCloseTo((2 + 5) / 2);
    // For player2: KOd = player2PokemonKOd, lost = player1PokemonKOd
    expect(stats.averagePokemonKOd).toBeCloseTo((1 + 4) / 2);
    expect(stats.averagePokemonLost).toBeCloseTo((3 + 0) / 2);
    expect(stats.setupSuccessRate).toBeCloseTo(0.7);
  });
});
