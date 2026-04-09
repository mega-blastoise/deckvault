import type { OpeningHandStats } from './opening';
import type { WinReason } from '../types/event';
import type { PlayerId } from '../types/game';

export interface GameResult {
  readonly gameIndex: number;
  readonly seed: number;
  readonly winner: PlayerId | 'draw';
  readonly winReason: WinReason;
  readonly totalTurns: number;
  readonly durationMs: number;
  readonly player1PrizesTaken: number;
  readonly player2PrizesTaken: number;
  readonly player1PokemonKOd: number;
  readonly player2PokemonKOd: number;
}

export interface DeckStats {
  readonly winsByReason: Record<WinReason, number>;
  readonly averagePrizesTaken: number;
  readonly averagePrizesGiven: number;
  readonly averagePokemonKOd: number;
  readonly averagePokemonLost: number;
  readonly averageTurnsToFirstKO: number;
  readonly averageTurnsToWin: number;
  readonly openingHandStats: OpeningHandStats;
  readonly consistencyScore: number;
  readonly setupSuccessRate: number;
}

function coefficientOfVariation(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function calculateConsistency(
  results: ReadonlyArray<GameResult>,
  stats: DeckStats
): number {
  const setupScore = stats.openingHandStats.mulliganRate === 0
    ? 1.0
    : Math.max(0, 1 - stats.openingHandStats.mulliganRate * 2);

  const supporterScore = stats.openingHandStats.hasSupporterTurn1Rate;

  const firstKOTurns = results
    .filter(r => r.player1PokemonKOd > 0 || r.player2PokemonKOd > 0)
    .map(r => r.totalTurns);
  const prizeVarianceScore = firstKOTurns.length > 1
    ? Math.max(0, 1 - coefficientOfVariation(firstKOTurns))
    : 0.5;

  const wins = results.filter(r => r.winner === 'player1').length;
  const winRate = wins / results.length;
  const stabilityScore = 1 - Math.abs(winRate - 0.5) * 2;

  return (setupScore + supporterScore + prizeVarianceScore + stabilityScore) / 4;
}

export function computeDeckStats(
  results: ReadonlyArray<GameResult>,
  playerId: 'player1' | 'player2',
  openingHandStats: OpeningHandStats
): DeckStats {
  const winsByReason: Record<WinReason, number> = {
    all_prizes_taken: 0,
    no_pokemon_in_play: 0,
    deck_out: 0,
    tiebreaker: 0
  };

  let totalPrizesTaken = 0;
  let totalPrizesGiven = 0;
  let totalKOd = 0;
  let totalLost = 0;
  let totalTurnsToFirstKO = 0;
  let firstKOCount = 0;
  let totalTurnsToWin = 0;
  let winCount = 0;

  for (const r of results) {
    if (r.winner === playerId) {
      winsByReason[r.winReason]++;
      totalTurnsToWin += r.totalTurns;
      winCount++;
    }
    const prizesTaken = playerId === 'player1' ? r.player1PrizesTaken : r.player2PrizesTaken;
    const prizesGiven = playerId === 'player1' ? r.player2PrizesTaken : r.player1PrizesTaken;
    const kOd = playerId === 'player1' ? r.player1PokemonKOd : r.player2PokemonKOd;
    const lost = playerId === 'player1' ? r.player2PokemonKOd : r.player1PokemonKOd;

    totalPrizesTaken += prizesTaken;
    totalPrizesGiven += prizesGiven;
    totalKOd += kOd;
    totalLost += lost;

    if (kOd > 0 || lost > 0) {
      totalTurnsToFirstKO += r.totalTurns;
      firstKOCount++;
    }
  }

  const n = results.length;
  const mulliganRate = openingHandStats.mulliganRate;

  const prelimStats: DeckStats = {
    winsByReason,
    averagePrizesTaken: totalPrizesTaken / n,
    averagePrizesGiven: totalPrizesGiven / n,
    averagePokemonKOd: totalKOd / n,
    averagePokemonLost: totalLost / n,
    averageTurnsToFirstKO: firstKOCount > 0 ? totalTurnsToFirstKO / firstKOCount : 0,
    averageTurnsToWin: winCount > 0 ? totalTurnsToWin / winCount : 0,
    openingHandStats,
    consistencyScore: 0,
    setupSuccessRate: 1 - mulliganRate
  };

  const consistencyScore = calculateConsistency(results, prelimStats);
  return { ...prelimStats, consistencyScore };
}
