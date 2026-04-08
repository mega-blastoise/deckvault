import { useState, useRef, useCallback, useEffect } from 'react';
import type { CardDefinition } from '@pokemon/engine';
import type { ResolvedDeck } from '../components/DeckInputPanel/types';
import type { SimulationUserConfig } from '../components/SimulationConfig/types';
import type {
  WorkerInMessage,
  WorkerOutMessage,
  SerializedSimulationResult,
  WorkerSimulationConfig
} from '../../workers/simulation.worker';

export type SimulationStatus = 'idle' | 'resolving' | 'running' | 'complete' | 'error';

export interface UseSimulationOptions {
  readonly onProgress?: (percent: number, gamesCompleted: number) => void;
  readonly onComplete?: (result: SerializedSimulationResult) => void;
  readonly onError?: (error: string) => void;
}

export interface UseSimulationReturn {
  readonly run: (
    deck1: ResolvedDeck,
    deck2: ResolvedDeck,
    config: SimulationUserConfig
  ) => Promise<void>;
  readonly cancel: () => void;
  readonly status: SimulationStatus;
  readonly progress: number;
  readonly gamesCompleted: number;
  readonly result: SerializedSimulationResult | null;
  readonly definitions: Record<string, CardDefinition> | null;
  readonly error: string | null;
}

const CACHE_KEY_PREFIX = 'sim-defs-';

function getCachedDefinitions(
  formatDate: string
): Record<string, CardDefinition> | null {
  try {
    // Evict any cached entries for other dates
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CACHE_KEY_PREFIX) && k !== `${CACHE_KEY_PREFIX}${formatDate}`) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));

    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${formatDate}`);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, CardDefinition>;
  } catch {
    return null;
  }
}

function setCachedDefinitions(
  formatDate: string,
  defs: Record<string, CardDefinition>
): void {
  try {
    sessionStorage.setItem(`${CACHE_KEY_PREFIX}${formatDate}`, JSON.stringify(defs));
  } catch {
    // sessionStorage quota exceeded — skip caching
  }
}

async function resolveDefinitions(
  cardIds: ReadonlyArray<string>,
  formatDate: string
): Promise<Record<string, CardDefinition>> {
  const cached = getCachedDefinitions(formatDate);
  if (cached) {
    const missing = cardIds.filter((id) => !(id in cached));
    if (missing.length === 0) return cached;
  }

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
  setCachedDefinitions(formatDate, data.data);
  return data.data;
}

function terminateWorker(workerRef: React.MutableRefObject<Worker | null>): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}

export function useSimulation(options?: UseSimulationOptions): UseSimulationReturn {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [gamesCompleted, setGamesCompleted] = useState(0);
  const [result, setResult] = useState<SerializedSimulationResult | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, CardDefinition> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return () => {
      terminateWorker(workerRef);
    };
  }, []);

  const cancel = useCallback(() => {
    terminateWorker(workerRef);
    setStatus('idle');
    setProgress(0);
    setGamesCompleted(0);
  }, []);

  const run = useCallback(
    async (deck1: ResolvedDeck, deck2: ResolvedDeck, config: SimulationUserConfig) => {
      terminateWorker(workerRef);
      setStatus('resolving');
      setProgress(0);
      setGamesCompleted(0);
      setResult(null);
      setError(null);

      const allCardIds = [
        ...deck1.cards.map((c) => c.cardId),
        ...deck2.cards.map((c) => c.cardId)
      ];

      let resolvedDefinitions: Record<string, CardDefinition>;
      try {
        resolvedDefinitions = await resolveDefinitions(allCardIds, config.formatDate);
        setDefinitions(resolvedDefinitions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus('error');
        optionsRef.current?.onError?.(msg);
        return;
      }

      const worker = new Worker('/www/workers/simulation.worker.js', {
        type: 'module'
      });
      workerRef.current = worker;

      const workerConfig: WorkerSimulationConfig = {
        deck1: { name: deck1.name, cards: deck1.cards },
        deck2: { name: deck2.name, cards: deck2.cards },
        definitions: resolvedDefinitions,
        games: config.gameCount,
        maxTurnsPerGame: 200,
        seed: Date.now() % 2147483647,
        formatDate: config.formatDate,
        captureReplays: true
      };

      const msg: WorkerInMessage = {
        type: 'RUN_SIMULATION',
        config: workerConfig
      };

      worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
        const data = event.data;

        if (data.type === 'PROGRESS') {
          setProgress(data.percent);
          setGamesCompleted(data.gamesCompleted);
          optionsRef.current?.onProgress?.(data.percent, data.gamesCompleted);
        } else if (data.type === 'COMPLETE') {
          setResult(data.result);
          setStatus('complete');
          setProgress(100);
          setGamesCompleted(data.result.gamesPlayed);
          terminateWorker(workerRef);
          optionsRef.current?.onComplete?.(data.result);
        } else if (data.type === 'ERROR') {
          setError(data.message);
          setStatus('error');
          terminateWorker(workerRef);
          optionsRef.current?.onError?.(data.message);
        }
      });

      worker.addEventListener('error', (event: ErrorEvent) => {
        const msg = event.message ?? 'Worker crashed';
        setError(msg);
        setStatus('error');
        terminateWorker(workerRef);
        optionsRef.current?.onError?.(msg);
      });

      setStatus('running');
      worker.postMessage(msg);
    },
    []
  );

  return { run, cancel, status, progress, gamesCompleted, result, definitions, error };
}
