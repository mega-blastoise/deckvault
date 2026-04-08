import type {
  CardDefinition,
  GameEvent,
  PlayerId,
  WinReason,
  AiConfig
} from '@pokemon/engine/browser';
import {
  simulateGame,
  RandomStrategy,
  GreedyStrategy
} from '@pokemon/engine/browser';

interface DeckInput {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
}

// Per-game result shape (mirrors engine's GameResult from simulation/metrics)
interface GameResult {
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

export interface CapturedReplay {
  readonly gameIndex: number;
  readonly seed: number;
  readonly eventLog: ReadonlyArray<GameEvent>;
  readonly winner: PlayerId | 'draw';
  readonly winReason: WinReason;
  readonly totalTurns: number;
}

export interface SerializedSimulationResult {
  readonly gamesPlayed: number;
  readonly deck1Wins: number;
  readonly deck2Wins: number;
  readonly draws: number;
  readonly deck1WinRate: number;
  readonly deck2WinRate: number;
  readonly averageTurnCount: number;
  readonly medianTurnCount: number;
  readonly averageGameDurationMs: number;
  readonly gameResults: ReadonlyArray<GameResult>;
  readonly capturedReplays: ReadonlyArray<CapturedReplay>;
}

export interface WorkerSimulationConfig {
  readonly deck1: DeckInput;
  readonly deck2: DeckInput;
  readonly definitions: Record<string, CardDefinition>;
  readonly games: number;
  readonly maxTurnsPerGame: number;
  readonly seed: number;
  readonly formatDate: string;
  readonly captureReplays: boolean;
  readonly replayGameIndices?: ReadonlyArray<number>;
}

export interface AIStrategyConfig {
  readonly strategy: 'random' | 'greedy';
}

export interface WorkerInMessage {
  readonly type: 'RUN_SIMULATION';
  readonly config: WorkerSimulationConfig;
  readonly ai1Config?: AIStrategyConfig;
  readonly ai2Config?: AIStrategyConfig;
}

export type WorkerOutMessage =
  | { readonly type: 'PROGRESS'; readonly gamesCompleted: number; readonly totalGames: number; readonly percent: number }
  | { readonly type: 'COMPLETE'; readonly result: SerializedSimulationResult }
  | { readonly type: 'ERROR'; readonly message: string; readonly stack?: string };

type GameOverEvent = { readonly type: 'GAME_OVER'; readonly winner: PlayerId | 'draw'; readonly reason: WinReason };
type PrizeTakenEvent = { readonly type: 'PRIZE_TAKEN'; readonly player: PlayerId; readonly cardInstanceId: string };
type KOEvent = { readonly type: 'POKEMON_KNOCKED_OUT'; readonly player: PlayerId; readonly pokemonInstanceId: string; readonly prizesAwarded: number };

function deserializeDefinitions(
  defs: Record<string, CardDefinition>
): ReadonlyMap<string, CardDefinition> {
  return new Map(Object.entries(defs));
}

function expandDeck(deck: DeckInput): ReadonlyArray<string> {
  return deck.cards.flatMap(({ cardId, count }: { cardId: string; count: number }) =>
    Array<string>(count).fill(cardId)
  );
}

function resolveAiConfig(
  cfg: AIStrategyConfig | undefined,
  playerId: PlayerId
): AiConfig {
  const strategy = cfg?.strategy ?? 'greedy';
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

function buildDefaultReplayIndices(total: number): ReadonlyArray<number> {
  const count = Math.min(50, total);
  return Array.from({ length: count }, (_, i) => i);
}

function runSimulationLoop(msg: WorkerInMessage): SerializedSimulationResult {
  const { config, ai1Config, ai2Config } = msg;
  const definitions = deserializeDefinitions(config.definitions);

  const ai1 = resolveAiConfig(ai1Config, 'player1');
  const ai2 = resolveAiConfig(ai2Config, 'player2');

  const deck1Expanded = expandDeck(config.deck1);
  const deck2Expanded = expandDeck(config.deck2);

  const replaySet = new Set(
    config.captureReplays
      ? (config.replayGameIndices ?? buildDefaultReplayIndices(config.games))
      : []
  );

  const gameResults: GameResult[] = [];
  const capturedReplays: CapturedReplay[] = [];

  const progressInterval = Math.max(1, Math.min(10, Math.floor(config.games / 100)));

  for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
    const gameSeed = config.seed + gameIndex;

    const gameConfig = {
      deck1: deck1Expanded,
      deck2: deck2Expanded,
      seed: gameSeed,
      definitions,
      formatDate: new Date(config.formatDate)
    };

    const start = performance.now();
    const finalState = simulateGame(ai1, ai2, gameConfig);
    const durationMs = performance.now() - start;

    const gameOverEvent = [...finalState.eventLog]
      .reverse()
      .find((e): e is GameOverEvent => e.type === 'GAME_OVER');

    const winner: PlayerId | 'draw' =
      gameOverEvent?.winner ?? (finalState.winner as PlayerId | 'draw' | undefined) ?? 'draw';
    const winReason: WinReason = gameOverEvent?.reason ?? 'tiebreaker';

    const p1Prizes = finalState.eventLog.filter(
      (e): e is PrizeTakenEvent => e.type === 'PRIZE_TAKEN' && (e as PrizeTakenEvent).player === 'player1'
    ).length;
    const p2Prizes = finalState.eventLog.filter(
      (e): e is PrizeTakenEvent => e.type === 'PRIZE_TAKEN' && (e as PrizeTakenEvent).player === 'player2'
    ).length;
    const p1KOd = finalState.eventLog.filter(
      (e): e is KOEvent => e.type === 'POKEMON_KNOCKED_OUT' && (e as KOEvent).player === 'player1'
    ).length;
    const p2KOd = finalState.eventLog.filter(
      (e): e is KOEvent => e.type === 'POKEMON_KNOCKED_OUT' && (e as KOEvent).player === 'player2'
    ).length;

    const result: GameResult = {
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
    };
    gameResults.push(result);

    if (replaySet.has(gameIndex)) {
      capturedReplays.push({
        gameIndex,
        seed: gameSeed,
        eventLog: finalState.eventLog,
        winner,
        winReason,
        totalTurns: finalState.turnNumber
      });
    }

    if ((gameIndex + 1) % progressInterval === 0 || gameIndex === config.games - 1) {
      const gamesCompleted = gameIndex + 1;
      const percent = Math.round((gamesCompleted / config.games) * 100);
      const progressMsg: WorkerOutMessage = {
        type: 'PROGRESS',
        gamesCompleted,
        totalGames: config.games,
        percent
      };
      self.postMessage(progressMsg);
    }
  }

  const deck1Wins = gameResults.filter((r) => r.winner === 'player1').length;
  const deck2Wins = gameResults.filter((r) => r.winner === 'player2').length;
  const draws = gameResults.filter((r) => r.winner === 'draw').length;
  const totalGames = gameResults.length;

  const turnCounts = gameResults.map((r) => r.totalTurns);
  const averageTurnCount =
    totalGames > 0 ? turnCounts.reduce((a, b) => a + b, 0) / totalGames : 0;
  const medianTurnCount = median(turnCounts);
  const averageGameDurationMs =
    totalGames > 0
      ? gameResults.reduce((a, r) => a + r.durationMs, 0) / totalGames
      : 0;

  return {
    gamesPlayed: totalGames,
    deck1Wins,
    deck2Wins,
    draws,
    deck1WinRate: totalGames > 0 ? deck1Wins / totalGames : 0,
    deck2WinRate: totalGames > 0 ? deck2Wins / totalGames : 0,
    averageTurnCount,
    medianTurnCount,
    averageGameDurationMs,
    gameResults,
    capturedReplays
  };
}

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type !== 'RUN_SIMULATION') return;

  try {
    const result = runSimulationLoop(msg);
    const completeMsg: WorkerOutMessage = { type: 'COMPLETE', result };
    self.postMessage(completeMsg);
  } catch (err) {
    const errorMsg: WorkerOutMessage = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    };
    self.postMessage(errorMsg);
  }
});
