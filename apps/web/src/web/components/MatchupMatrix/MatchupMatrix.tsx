import React, { useState, useCallback } from 'react';
import { ArchetypeSelector } from './ArchetypeSelector';
import { MatchupMatrixView } from './MatchupMatrixView';
import { useMatchupMatrix } from '../../hooks/useMatchupMatrix';
import type { MetaDeck } from './types';
import type { ResolvedDeck } from '../DeckInputPanel/types';
import type { SimulationUserConfig } from '../SimulationConfig/types';

interface MatchupMatrixProps {
  readonly playerDeck: ResolvedDeck;
  readonly metaDecks: ReadonlyArray<MetaDeck>;
  readonly config: SimulationUserConfig;
  readonly onSelectMatchup: (opponentId: string) => void;
  readonly onCancel: () => void;
}

export function MatchupMatrix({
  playerDeck,
  metaDecks,
  config,
  onSelectMatchup,
  onCancel
}: MatchupMatrixProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(metaDecks.map((d) => d.id))
  );

  const { run, cancel, status, progress, results, overallWinRate } = useMatchupMatrix();

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(metaDecks.map((d) => d.id)));
  }, [metaDecks]);

  const handleDeselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleRun = useCallback(() => {
    const opponents = metaDecks.filter((d) => selected.has(d.id));
    if (opponents.length === 0) return;
    run(playerDeck, opponents, config).catch(() => null);
  }, [playerDeck, metaDecks, selected, config, run]);

  const handleCancel = useCallback(() => {
    cancel();
    onCancel();
  }, [cancel, onCancel]);

  const isRunning = status === 'running' || status === 'resolving';
  const canRun = selected.size > 0 && !isRunning;

  return (
    <div className="matchup-matrix-container">
      {status === 'idle' && (
        <ArchetypeSelector
          archetypes={metaDecks}
          selected={selected}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      )}

      <div className="matchup-matrix-container__actions">
        {status === 'idle' && (
          <button
            type="button"
            className="button button--primary"
            disabled={!canRun}
            onClick={handleRun}
          >
            Run Full Meta Sweep ({selected.size} matchups)
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
        )}
        {(status === 'complete' || status === 'error') && (
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCancel}
          >
            New Simulation
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <MatchupMatrixView
          playerDeckName={playerDeck.name}
          progress={progress}
          results={results}
          overallWinRate={overallWinRate}
          onCellClick={onSelectMatchup}
          status={status}
        />
      )}
    </div>
  );
}
