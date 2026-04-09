import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { ResolvedDeck } from '../../components/DeckInputPanel/types';
import type { SimulationUserConfig } from '../../components/SimulationConfig/types';
import type { MetaDeck } from '../../components/MatchupMatrix/types';
import { useSimulation } from '../../hooks/useSimulation';
import type { SerializedSimulationResult } from '../../../workers/simulation.worker';
import { SimulatePageView } from './SimulatePageView';
import './SimulatePage.css';

export type SimulationPhase = 'input' | 'running' | 'results' | 'replay' | 'matrix' | 'matrix-drilldown';

const TODAY = new Date().toISOString().split('T')[0]!;

const DEFAULT_CONFIG: SimulationUserConfig = {
  gameCount: 1000,
  keyCardIds: [],
  formatDate: TODAY,
  matchupMode: 'single'
};

export function SimulatePage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<SimulationPhase>('input');
  const [playerDeck, setPlayerDeck] = useState<ResolvedDeck | null>(null);
  const [opponentDeck, setOpponentDeck] = useState<ResolvedDeck | null>(null);
  const [config, setConfig] = useState<SimulationUserConfig>(DEFAULT_CONFIG);
  const [simulationResult, setSimulationResult] = useState<SerializedSimulationResult | null>(null);
  const [metaDecks, setMetaDecks] = useState<ReadonlyArray<MetaDeck>>([]);
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const simulation = useSimulation({
    onComplete: (result) => {
      setSimulationResult(result);
      setPhase('results');
      setSimError(null);
    },
    onError: (err) => {
      setSimError(err);
      setPhase('input');
    }
  });

  // Auto-populate from URL params (?deckId=...&source=saved)
  useEffect(() => {
    const deckId = searchParams.get('deckId');
    const source = searchParams.get('source');
    if (deckId && source === 'saved') {
      fetch(`/api/v1/decks/${deckId}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { data?: { name?: string; cards?: Array<{ card: { id: string }; quantity: number }> } } | null) => {
          if (!json?.data) return;
          const deck = json.data;
          const cards = (deck.cards ?? []).map((dc) => ({ cardId: dc.card.id, count: dc.quantity }));
          setPlayerDeck({
            name: deck.name ?? 'Saved Deck',
            source: 'saved',
            totalCards: cards.reduce((s, c) => s + c.count, 0),
            cards
          });
        })
        .catch(() => null);
    }
  }, [searchParams]);

  // Fetch meta decks for matrix mode
  useEffect(() => {
    if (config.matchupMode !== 'matrix' || metaDecks.length > 0) return;
    fetch('/bff/sim/meta-decks')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data?: MetaDeck[] } | null) => {
        if (json?.data) setMetaDecks(json.data);
      })
      .catch(() => null);
  }, [config.matchupMode, metaDecks.length]);

  function handleRunSimulation() {
    if (!playerDeck) return;
    if (config.matchupMode === 'matrix') {
      setPhase('matrix');
      return;
    }
    if (!opponentDeck) return;
    setPhase('running');
    simulation.run(playerDeck, opponentDeck, config).catch(() => null);
  }

  function handleCancel() {
    simulation.cancel();
    setPhase('input');
  }

  function handleSelectMatchup(opponentId: string) {
    setSelectedMatchupId(opponentId);
    setPhase('matrix-drilldown');
  }

  function handleMatrixBack() {
    setPhase('matrix');
    setSelectedMatchupId(null);
  }

  return (
    <SimulatePageView
      phase={phase}
      playerDeck={playerDeck}
      opponentDeck={opponentDeck}
      config={config}
      metaDecks={metaDecks}
      simulationStatus={simulation.status}
      simulationProgress={simulation.progress}
      simulationGamesCompleted={simulation.gamesCompleted}
      simulationResult={simulationResult}
      simulationDefinitions={simulation.definitions}
      simulationError={simError}
      selectedMatchupId={selectedMatchupId}
      onPlayerDeckResolved={setPlayerDeck}
      onPlayerDeckCleared={() => setPlayerDeck(null)}
      onOpponentDeckResolved={setOpponentDeck}
      onOpponentDeckCleared={() => setOpponentDeck(null)}
      onConfigChange={setConfig}
      onPhaseChange={setPhase}
      onRunSimulation={handleRunSimulation}
      onCancelSimulation={handleCancel}
      onSelectMatchup={handleSelectMatchup}
      onMatrixBack={handleMatrixBack}
    />
  );
}
