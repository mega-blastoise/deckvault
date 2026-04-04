import type { PlayerId } from '../types/game';
import type { WinReason } from '../types/event';
import type { AiConfig } from '../ai/types';
import type { GameConfig } from '../core/game';
import type { OpeningHandStats } from './opening';
import type { GameResult, DeckStats } from './metrics';
import { RandomStrategy, GreedyStrategy } from '../ai/strategy';
import { simulateGame } from '../ai/player';
import { loadStandardCardPool } from '../adapter';
import { analyzeOpeningHands } from './opening';
import { computeDeckStats } from './metrics';

export type { GameResult, DeckStats } from './metrics';
export type { OpeningHandStats } from './opening';

export interface DeckInput {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
}

export interface AIConfig {
  readonly strategy: 'random' | 'greedy';
}

export interface SimulationConfig {
  readonly deck1: DeckInput;
  readonly deck2: DeckInput;
  readonly games: number;
  readonly maxTurnsPerGame: number;
  readonly ai1Config?: AIConfig;
  readonly ai2Config?: AIConfig;
  readonly seed?: number;
  readonly formatDate?: Date;
  readonly dbPath?: string;
}

export interface SimulationResult {
  readonly config: SimulationConfig;
  readonly gamesPlayed: number;
  readonly deck1Wins: number;
  readonly deck2Wins: number;
  readonly draws: number;
  readonly deck1WinRate: number;
  readonly deck2WinRate: number;
  readonly averageTurnCount: number;
  readonly medianTurnCount: number;
  readonly averageGameDurationMs: number;
  readonly deck1Stats: DeckStats;
  readonly deck2Stats: DeckStats;
  readonly gameResults: ReadonlyArray<GameResult>;
}

export interface MatchupMatrixConfig {
  readonly testDeck: DeckInput;
  readonly opponents: ReadonlyArray<DeckInput>;
  readonly gamesPerMatchup: number;
  readonly seed?: number;
}

export interface MatchupMatrixResult {
  readonly testDeck: string;
  readonly matchups: ReadonlyArray<{
    readonly opponent: string;
    readonly winRate: number;
    readonly gamesPlayed: number;
    readonly favorability: 'favorable' | 'even' | 'unfavorable';
  }>;
  readonly overallWinRate: number;
}

export interface SimulationSummary {
  readonly deck1: { name: string; winRate: number; consistency: number };
  readonly deck2: { name: string; winRate: number; consistency: number };
  readonly gamesPlayed: number;
  readonly averageTurns: number;
  readonly deck1OpeningHand: OpeningHandStats;
  readonly deck2OpeningHand: OpeningHandStats;
}

function expandDeck(deck: DeckInput): ReadonlyArray<string> {
  return deck.cards.flatMap(({ cardId, count }) => Array(count).fill(cardId) as string[]);
}

function resolveAiConfig(ai: AIConfig | undefined, playerId: PlayerId): AiConfig {
  const strategy = ai?.strategy ?? 'greedy';
  return {
    playerId,
    strategy: strategy === 'random' ? new RandomStrategy() : new GreedyStrategy()
  };
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

const DEFAULT_DB_PATH = 'database/pokemon-data.sqlite3.db';

export function runSimulation(config: SimulationConfig): SimulationResult {
  const formatDate = config.formatDate ?? new Date();
  const dbPath = config.dbPath ?? DEFAULT_DB_PATH;
  const definitions = loadStandardCardPool(dbPath, formatDate);

  const ai1Config = resolveAiConfig(config.ai1Config, 'player1');
  const ai2Config = resolveAiConfig(config.ai2Config, 'player2');

  const deck1Expanded = expandDeck(config.deck1);
  const deck2Expanded = expandDeck(config.deck2);

  const gameResults: GameResult[] = [];

  for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
    const gameSeed = (config.seed ?? 0) + gameIndex;

    const gameConfig: GameConfig = {
      deck1: deck1Expanded,
      deck2: deck2Expanded,
      seed: gameSeed,
      definitions,
      formatDate: config.formatDate
    };

    const start = performance.now();
    const finalState = simulateGame(ai1Config, ai2Config, gameConfig);
    const durationMs = performance.now() - start;

    const gameOverEvent = finalState.eventLog.findLast(e => e.type === 'GAME_OVER');
    const winner: PlayerId | 'draw' = (gameOverEvent as { winner?: PlayerId | 'draw' } | undefined)?.winner ?? finalState.winner ?? 'draw';
    const winReason: WinReason = (gameOverEvent as { reason?: WinReason } | undefined)?.reason ?? 'tiebreaker';

    const p1Prizes = finalState.eventLog.filter(
      e => e.type === 'PRIZE_TAKEN' && e.player === 'player1'
    ).length;
    const p2Prizes = finalState.eventLog.filter(
      e => e.type === 'PRIZE_TAKEN' && e.player === 'player2'
    ).length;

    const p1KOd = finalState.eventLog.filter(
      e => e.type === 'POKEMON_KNOCKED_OUT' && e.player === 'player1'
    ).length;
    const p2KOd = finalState.eventLog.filter(
      e => e.type === 'POKEMON_KNOCKED_OUT' && e.player === 'player2'
    ).length;

    gameResults.push({
      gameIndex,
      seed: gameSeed,
      winner,
      winReason,
      totalTurns: finalState.turnNumber,
      durationMs,
      player1PrizesTaken: p1Prizes,
      player2PrizesTaken: p2Prizes,
      player1PokemonKOd: p1KOd,
      player2PokemonKOd: p2KOd
    });
  }

  const deck1Wins = gameResults.filter(r => r.winner === 'player1').length;
  const deck2Wins = gameResults.filter(r => r.winner === 'player2').length;
  const draws = gameResults.filter(r => r.winner === 'draw').length;
  const totalGames = gameResults.length;

  const turnCounts = gameResults.map(r => r.totalTurns);
  const averageTurnCount = turnCounts.reduce((a, b) => a + b, 0) / totalGames;
  const medianTurnCount = median(turnCounts);
  const averageGameDurationMs = gameResults.reduce((a, r) => a + r.durationMs, 0) / totalGames;

  const deck1OpeningHands = analyzeOpeningHands(config.deck1, definitions, totalGames, (config.seed ?? 0) + 1000000);
  const deck2OpeningHands = analyzeOpeningHands(config.deck2, definitions, totalGames, (config.seed ?? 0) + 2000000);

  const deck1Stats = computeDeckStats(gameResults, 'player1', deck1OpeningHands);
  const deck2Stats = computeDeckStats(gameResults, 'player2', deck2OpeningHands);

  return {
    config,
    gamesPlayed: totalGames,
    deck1Wins,
    deck2Wins,
    draws,
    deck1WinRate: deck1Wins / totalGames,
    deck2WinRate: deck2Wins / totalGames,
    averageTurnCount,
    medianTurnCount,
    averageGameDurationMs,
    deck1Stats,
    deck2Stats,
    gameResults
  };
}

export function runMatchupMatrix(config: MatchupMatrixConfig): MatchupMatrixResult {
  const matchups = config.opponents.map((opponent, i) => {
    const result = runSimulation({
      deck1: config.testDeck,
      deck2: opponent,
      games: config.gamesPerMatchup,
      maxTurnsPerGame: 200,
      seed: (config.seed ?? 0) + i * 10000
    });
    const winRate = result.deck1WinRate;
    return {
      opponent: opponent.name,
      winRate,
      gamesPlayed: result.gamesPlayed,
      favorability:
        winRate > 0.55 ? 'favorable' as const
        : winRate < 0.45 ? 'unfavorable' as const
        : 'even' as const
    };
  });

  const overallWinRate = matchups.length > 0
    ? matchups.reduce((sum, m) => sum + m.winRate, 0) / matchups.length
    : 0;

  return {
    testDeck: config.testDeck.name,
    matchups,
    overallWinRate
  };
}

export function serializeResult(result: SimulationResult): string {
  return JSON.stringify(result);
}

export function serializeResultSummary(result: SimulationResult): SimulationSummary {
  return {
    deck1: {
      name: result.config.deck1.name,
      winRate: result.deck1WinRate,
      consistency: result.deck1Stats.consistencyScore
    },
    deck2: {
      name: result.config.deck2.name,
      winRate: result.deck2WinRate,
      consistency: result.deck2Stats.consistencyScore
    },
    gamesPlayed: result.gamesPlayed,
    averageTurns: result.averageTurnCount,
    deck1OpeningHand: result.deck1Stats.openingHandStats,
    deck2OpeningHand: result.deck2Stats.openingHandStats
  };
}
