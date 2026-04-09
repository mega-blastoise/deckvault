import { useState, useRef, useCallback, useEffect } from 'react';
import type { CardDefinition } from '@pokemon/engine';
import type { ResolvedDeck } from '../components/DeckInputPanel/types';
import type { MetaDeck, MatchupProgress, MatchupResult } from '../components/MatchupMatrix/types';
import type { SimulationUserConfig } from '../components/SimulationConfig/types';
import type {
  WorkerInMessage,
  WorkerOutMessage,
  WorkerSimulationConfig,
  SerializedSimulationResult
} from '../../workers/simulation.worker';

export type { MatchupProgress, MatchupResult };

export type MatchupMatrixStatus = 'idle' | 'resolving' | 'running' | 'complete' | 'error';

export interface UseMatchupMatrixReturn {
  readonly run: (
    playerDeck: ResolvedDeck,
    opponents: ReadonlyArray<MetaDeck>,
    config: SimulationUserConfig
  ) => Promise<void>;
  readonly cancel: () => void;
  readonly status: MatchupMatrixStatus;
  readonly progress: ReadonlyArray<MatchupProgress>;
  readonly results: ReadonlyArray<MatchupResult>;
  readonly overallWinRate: number | null;
  readonly error: string | null;
}

const MAX_CONCURRENT_WORKERS = 8;

const TIER_WEIGHTS: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

function computeWeightedWinRate(results: ReadonlyArray<MatchupResult>): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of results) {
    const weight = TIER_WEIGHTS[r.opponentTier] ?? 1;
    weightedSum += r.winRate * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function toFavorability(winRate: number): 'favorable' | 'even' | 'unfavorable' {
  if (winRate >= 55) return 'favorable';
  if (winRate <= 45) return 'unfavorable';
  return 'even';
}

async function fetchCardDefinitions(
  cardIds: ReadonlyArray<string>,
  formatDate: string
): Promise<Record<string, CardDefinition>> {
  const response = await fetch('/bff/sim/card-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardIds: [...new Set(cardIds)], formatDate })
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Failed to fetch card definitions (${response.status})`);
  }

  const data = (await response.json()) as { data: Record<string, CardDefinition> };
  return data.data;
}

interface ActiveWorker {
  readonly worker: Worker;
  readonly opponentId: string;
}

interface QueuedMatchup {
  readonly opponent: MetaDeck;
  readonly seed: number;
}

export function useMatchupMatrix(): UseMatchupMatrixReturn {
  const [status, setStatus] = useState<MatchupMatrixStatus>('idle');
  const [progress, setProgress] = useState<ReadonlyArray<MatchupProgress>>([]);
  const [results, setResults] = useState<ReadonlyArray<MatchupResult>>([]);
  const [overallWinRate, setOverallWinRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWorkersRef = useRef<ActiveWorker[]>([]);
  const queueRef = useRef<QueuedMatchup[]>([]);
  const cancelledRef = useRef(false);

  // Store mutable run-state refs to avoid stale closures
  const playerDeckRef = useRef<ResolvedDeck | null>(null);
  const definitionsRef = useRef<Record<string, CardDefinition>>({});
  const configRef = useRef<SimulationUserConfig | null>(null);
  const allOpponentsRef = useRef<ReadonlyArray<MetaDeck>>([]);

  useEffect(() => {
    return () => {
      for (const { worker } of activeWorkersRef.current) {
        worker.terminate();
      }
      activeWorkersRef.current = [];
    };
  }, []);

  const terminateAll = useCallback(() => {
    for (const { worker } of activeWorkersRef.current) {
      worker.terminate();
    }
    activeWorkersRef.current = [];
    queueRef.current = [];
  }, []);

  const updateProgress = useCallback(
    (opponentId: string, patch: Partial<MatchupProgress>) => {
      setProgress((prev) =>
        prev.map((p) => (p.opponentId === opponentId ? { ...p, ...patch } : p))
      );
    },
    []
  );

  const spawnWorker = useCallback(
    (queued: QueuedMatchup, onDone: () => void) => {
      if (cancelledRef.current) return;

      const { opponent, seed } = queued;
      const playerDeck = playerDeckRef.current!;
      const definitions = definitionsRef.current;
      const cfg = configRef.current!;

      updateProgress(opponent.id, { status: 'running', progress: 0, gamesCompleted: 0 });

      const worker = new Worker('/www/workers/simulation.worker.js', { type: 'module' });
      activeWorkersRef.current = [...activeWorkersRef.current, { worker, opponentId: opponent.id }];

      const workerConfig: WorkerSimulationConfig = {
        deck1: { name: playerDeck.name, cards: playerDeck.cards },
        deck2: {
          name: opponent.name,
          cards: opponent.cards.map((c) => ({ cardId: c.cardId, count: c.quantity }))
        },
        definitions,
        games: cfg.gameCount,
        maxTurnsPerGame: 200,
        seed,
        formatDate: cfg.formatDate,
        captureReplays: false
      };

      const msg: WorkerInMessage = { type: 'RUN_SIMULATION', config: workerConfig };

      worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
        if (cancelledRef.current) return;
        const data = event.data;

        if (data.type === 'PROGRESS') {
          updateProgress(opponent.id, {
            progress: data.percent,
            gamesCompleted: data.gamesCompleted
          });
        } else if (data.type === 'COMPLETE') {
          const simResult: SerializedSimulationResult = data.result;
          const winRate = simResult.deck1WinRate * 100;

          const matchupResult: MatchupResult = {
            opponentId: opponent.id,
            opponentName: opponent.name,
            opponentTier: opponent.tier,
            winRate,
            gamesPlayed: simResult.gamesPlayed,
            favorability: toFavorability(winRate),
            result: simResult
          };

          updateProgress(opponent.id, { status: 'complete', progress: 100, gamesCompleted: simResult.gamesPlayed });

          setResults((prev) => {
            const next = [...prev, matchupResult];
            setOverallWinRate(computeWeightedWinRate(next));
            return next;
          });

          worker.terminate();
          activeWorkersRef.current = activeWorkersRef.current.filter(
            (aw) => aw.opponentId !== opponent.id
          );
          onDone();
        } else if (data.type === 'ERROR') {
          updateProgress(opponent.id, { status: 'error', progress: 0 });
          worker.terminate();
          activeWorkersRef.current = activeWorkersRef.current.filter(
            (aw) => aw.opponentId !== opponent.id
          );
          onDone();
        }
      });

      worker.addEventListener('error', () => {
        if (cancelledRef.current) return;
        updateProgress(opponent.id, { status: 'error', progress: 0 });
        worker.terminate();
        activeWorkersRef.current = activeWorkersRef.current.filter(
          (aw) => aw.opponentId !== opponent.id
        );
        onDone();
      });

      worker.postMessage(msg);
    },
    [updateProgress]
  );

  const drainQueue = useCallback(() => {
    if (cancelledRef.current) return;

    while (
      activeWorkersRef.current.length < MAX_CONCURRENT_WORKERS &&
      queueRef.current.length > 0
    ) {
      const next = queueRef.current.shift()!;
      spawnWorker(next, () => {
        if (cancelledRef.current) return;

        drainQueue();

        // Check completion
        if (queueRef.current.length === 0 && activeWorkersRef.current.length === 0) {
          setStatus('complete');
        }
      });
    }
  }, [spawnWorker]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    terminateAll();
    setStatus('idle');
    setProgress([]);
    setResults([]);
    setOverallWinRate(null);
    setError(null);
  }, [terminateAll]);

  const run = useCallback(
    async (
      playerDeck: ResolvedDeck,
      opponents: ReadonlyArray<MetaDeck>,
      config: SimulationUserConfig
    ): Promise<void> => {
      cancelledRef.current = false;
      terminateAll();

      setStatus('resolving');
      setProgress(
        opponents.map((op) => ({
          opponentId: op.id,
          opponentName: op.name,
          status: 'pending',
          progress: 0,
          gamesCompleted: 0
        }))
      );
      setResults([]);
      setOverallWinRate(null);
      setError(null);

      // Collect all unique card IDs across all decks
      const allCardIds = [
        ...playerDeck.cards.map((c) => c.cardId),
        ...opponents.flatMap((op) => op.cards.map((c) => c.cardId))
      ];

      let definitions: Record<string, CardDefinition>;
      try {
        definitions = await fetchCardDefinitions(allCardIds, config.formatDate);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus('error');
        return;
      }

      if (cancelledRef.current) return;

      playerDeckRef.current = playerDeck;
      definitionsRef.current = definitions;
      configRef.current = config;
      allOpponentsRef.current = opponents;

      const baseSeed = Date.now() % 2147483647;
      queueRef.current = opponents.map((op, i) => ({
        opponent: op,
        seed: (baseSeed + i * 1000) % 2147483647
      }));

      setStatus('running');
      drainQueue();
    },
    [terminateAll, drainQueue]
  );

  return { run, cancel, status, progress, results, overallWinRate, error };
}
