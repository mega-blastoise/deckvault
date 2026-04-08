import React, { useState } from 'react';
import { DeckInputPanel } from '../../components/DeckInputPanel';
import { SimulationConfig } from '../../components/SimulationConfig';
import { SimulationProgress } from '../../components/SimulationProgress';
import { MatchupMatrix } from '../../components/MatchupMatrix';
import { ReplayViewer } from '../../components/ReplayViewer';
import { AnalyticsDashboard } from '../../components/AnalyticsDashboard';
import type { ResolvedDeck } from '../../components/DeckInputPanel/types';
import type { SimulationUserConfig } from '../../components/SimulationConfig/types';
import type { MetaDeck } from '../../components/MatchupMatrix/types';
import type { SimulationStatus } from '../../hooks/useSimulation';
import type { SerializedSimulationResult } from '../../../workers/simulation.worker';
import type { CardDefinition } from '@pokemon/engine/browser';
import type { Perspective } from '../../components/AnalyticsDashboard/types';
import type { SimulationPhase } from './SimulatePage';
import '../../components/MatchupMatrix/MatchupMatrix.css';
import '../../components/ReplayViewer/ReplayViewer.css';
import '../../components/ReplayViewer/GameBoard/GameBoard.css';
import '../../components/ReplayViewer/EventLogPanel/EventLogPanel.css';
import '../../components/ReplayViewer/ReplayControls/ReplayControls.css';
import '../../components/AnalyticsDashboard/AnalyticsDashboard.css';

interface SimulatePageViewProps {
  readonly phase: SimulationPhase;
  readonly playerDeck: ResolvedDeck | null;
  readonly opponentDeck: ResolvedDeck | null;
  readonly config: SimulationUserConfig;
  readonly metaDecks: ReadonlyArray<MetaDeck>;
  readonly simulationStatus: SimulationStatus;
  readonly simulationProgress: number;
  readonly simulationGamesCompleted: number;
  readonly simulationResult: SerializedSimulationResult | null;
  readonly simulationDefinitions: Record<string, CardDefinition> | null;
  readonly simulationError: string | null;
  readonly selectedMatchupId: string | null;
  readonly onPlayerDeckResolved: (deck: ResolvedDeck) => void;
  readonly onPlayerDeckCleared: () => void;
  readonly onOpponentDeckResolved: (deck: ResolvedDeck) => void;
  readonly onOpponentDeckCleared: () => void;
  readonly onConfigChange: (config: SimulationUserConfig) => void;
  readonly onPhaseChange: (phase: SimulationPhase) => void;
  readonly onRunSimulation: () => void;
  readonly onCancelSimulation: () => void;
  readonly onSelectMatchup: (opponentId: string) => void;
  readonly onMatrixBack: () => void;
}

export function SimulatePageView({
  phase,
  playerDeck,
  opponentDeck,
  config,
  metaDecks,
  simulationStatus,
  simulationProgress,
  simulationGamesCompleted,
  simulationResult,
  simulationDefinitions,
  simulationError,
  selectedMatchupId,
  onPlayerDeckResolved,
  onPlayerDeckCleared,
  onOpponentDeckResolved,
  onOpponentDeckCleared,
  onConfigChange,
  onPhaseChange,
  onRunSimulation,
  onCancelSimulation,
  onSelectMatchup,
  onMatrixBack
}: SimulatePageViewProps) {
  const canSimulate = playerDeck !== null && (config.matchupMode === 'matrix' || opponentDeck !== null);
  const [perspective, setPerspective] = useState<Perspective>('player1');

  const progressStatus = simulationStatus === 'resolving' ? 'resolving' : 'running';

  return (
    <div className="page sim-page">
      <div className="page__header">
        <h1 className="sim-page__title">Simulate</h1>
        <p className="sim-page__subtitle">
          Run Monte Carlo simulations to evaluate deck performance
        </p>
      </div>

      {phase === 'input' && (
        <div className="sim-page__content">
          <div className="sim-page__main">
            <DeckInputPanel
              label="Your Deck"
              resolvedDeck={playerDeck}
              onDeckResolved={onPlayerDeckResolved}
              onDeckCleared={onPlayerDeckCleared}
            />
            {config.matchupMode === 'single' && (
              <DeckInputPanel
                label="Opponent"
                resolvedDeck={opponentDeck}
                onDeckResolved={onOpponentDeckResolved}
                onDeckCleared={onOpponentDeckCleared}
                showMetaOnly
              />
            )}
          </div>

          <aside className="sim-page__sidebar">
            <SimulationConfig
              config={config}
              onChange={onConfigChange}
              playerDeckCards={playerDeck?.cards ?? []}
            />
            <div className="sim-page__actions">
              {simulationError && (
                <div className="sim-page__error-banner" role="alert">
                  <span className="sim-page__error-icon">⚠</span>
                  <p className="sim-page__error-text">{simulationError}</p>
                </div>
              )}
              <button
                type="button"
                className="sim-page__run-btn"
                disabled={!canSimulate}
                onClick={onRunSimulation}
              >
                {config.matchupMode === 'matrix' ? 'Run Full Meta Sweep' : 'Run Simulation'}
              </button>
              {!playerDeck && (
                <p className="sim-page__hint">Choose a deck on the left to begin</p>
              )}
              {playerDeck && config.matchupMode === 'single' && !opponentDeck && (
                <p className="sim-page__hint">Select an opponent deck below</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {phase === 'running' && (
        <div className="sim-page__running">
          <SimulationProgress
            status={progressStatus}
            progress={simulationProgress}
            gamesCompleted={simulationGamesCompleted}
            totalGames={config.gameCount}
            onCancel={onCancelSimulation}
          />
        </div>
      )}

      {phase === 'results' && (
        <div className="sim-page__results">
          <div className="sim-page__results-actions">
            <button
              type="button"
              className="button--secondary"
              onClick={() => onPhaseChange('input')}
            >
              New Simulation
            </button>
            {simulationResult && simulationResult.capturedReplays.length > 0 && (
              <button
                type="button"
                className="button--primary"
                onClick={() => onPhaseChange('replay')}
              >
                View Replays ({simulationResult.capturedReplays.length})
              </button>
            )}
          </div>
          {simulationResult && simulationDefinitions && playerDeck && (
            <AnalyticsDashboard
              result={simulationResult}
              keyCardIds={config.keyCardIds}
              definitions={simulationDefinitions as Record<string, CardDefinition>}
              perspective={perspective}
              playerDeck={playerDeck}
              onPerspectiveChange={setPerspective}
            />
          )}
        </div>
      )}

      {phase === 'replay' && simulationResult && simulationDefinitions && (
        <div className="sim-page__replay">
          <div className="sim-page__replay-nav">
            <button
              type="button"
              className="sim-page__back-btn"
              onClick={() => onPhaseChange('results')}
            >
              &larr; Results
            </button>
          </div>
          <ReplayViewer
            replays={simulationResult.capturedReplays}
            gameResults={simulationResult.gameResults}
            definitions={simulationDefinitions}
            deck1Name={playerDeck?.name ?? 'Player 1'}
            deck2Name={opponentDeck?.name ?? 'Player 2'}
          />
        </div>
      )}

      {phase === 'matrix' && playerDeck !== null && (
        <div className="sim-page__matrix">
          <div className="sim-page__matrix-nav">
            <button
              type="button"
              className="sim-page__back-btn"
              onClick={() => onPhaseChange('input')}
            >
              &larr; Back
            </button>
          </div>
          <MatchupMatrix
            playerDeck={playerDeck}
            metaDecks={metaDecks}
            config={config}
            onSelectMatchup={onSelectMatchup}
            onCancel={() => onPhaseChange('input')}
          />
        </div>
      )}

      {phase === 'matrix-drilldown' && (
        <div className="sim-page__drilldown">
          <nav className="sim-page__breadcrumb">
            <button
              type="button"
              className="sim-page__back-btn"
              onClick={onMatrixBack}
            >
              &larr; Matrix
            </button>
            {selectedMatchupId && (
              <span className="sim-page__breadcrumb-label">
                &rsaquo; {selectedMatchupId}
              </span>
            )}
          </nav>
          <p className="sim-page__drilldown-placeholder">
            Analytics dashboard for this matchup will be rendered here (SPEC_03).
          </p>
        </div>
      )}
    </div>
  );
}
