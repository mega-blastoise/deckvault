import React from 'react';
import { useParams, Link } from 'react-router';
import { useDeckQuery } from '../../hooks/useDeckQuery';
import {
  openingHandProbabilities,
  prizeRisk,
  energyCurveAnalysis,
} from '../../lib/deck-math';
import type { CardSummary } from '../../lib/deck-math';
import { OpeningHandPanel } from '../../components/DeckAnalyticsPanel/OpeningHandPanel';
import { PrizeRiskPanel } from '../../components/DeckAnalyticsPanel/PrizeRiskPanel';
import { EnergyCurvePanel } from '../../components/DeckAnalyticsPanel/EnergyCurvePanel';
import { ConsistencyPanel } from '../../components/DeckAnalyticsPanel/ConsistencyPanel';
import { DeckCompositionChart } from '../../components/DeckAnalyticsPanel/DeckCompositionChart';
import { ProbabilityScatterChart } from '../../components/DeckAnalyticsPanel/ProbabilityScatterChart';
import { HandSimulator } from '../../components/DeckAnalyticsPanel/HandSimulator';
import { RecommendationsPanel } from '../../components/DeckAnalyticsPanel/RecommendationsPanel';
import { analyzeWeaknesses } from '../../lib/deck-suggestions';
import { ROUTES } from '../../routes';
import '../../components/DeckAnalyticsPanel/DeckAnalyticsPanel.css';
import './DeckAnalyticsPage.css';

export function DeckAnalyticsPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { data: deck, isLoading } = useDeckQuery(deckId);

  if (isLoading) {
    return (
      <div className="page deck-analytics-page">
        <div className="page__content">
          <div className="deck-analytics-page__loading">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="page deck-analytics-page">
        <div className="page__header">
          <h1>Deck Not Found</h1>
        </div>
      </div>
    );
  }

  const deckCards = deck.cards.map((dc) => ({
    cardId: dc.card.id,
    name: dc.card.name,
    quantity: dc.quantity,
  }));

  const prizeData = prizeRisk(deckCards);

  const energySummaries: CardSummary[] = deck.cards.map((dc) => ({
    supertype: dc.card.supertype as CardSummary['supertype'],
    subtypes: dc.card.subtypes,
    quantity: dc.quantity,
  }));

  const energyData = energyCurveAnalysis(energySummaries);

  const weaknesses = analyzeWeaknesses(deck.cards, energyData, prizeData);

  const scatterData = openingHandProbabilities(deckCards).map((p, i) => ({
    ...p,
    supertype: deck.cards[i]?.card.supertype ?? 'Trainer',
  }));

  return (
    <div className="page deck-analytics-page">
      <div className="page__header">
        <div className="deck-analytics-page__header-content">
          <Link to={ROUTES.DECK_DETAIL(deckId!)} className="deck-analytics-page__back">
            ← Back to Deck
          </Link>
          <h1 className="deck-analytics-page__title">{deck.name}</h1>
          <p className="deck-analytics-page__subtitle">Analytics</p>
        </div>
      </div>

      <div className="page__content">
        <div className="deck-analytics-page__grid">

          {/* Recommendations (full width, first) */}
          <div className="deck-analytics-page__panel deck-analytics-page__panel--full">
            <RecommendationsPanel weaknesses={weaknesses} />
          </div>

          {/* Row 1: Hand simulator (full width, prominent) */}
          <div className="deck-analytics-page__panel deck-analytics-page__panel--full">
            <HandSimulator cards={deck.cards} />
          </div>

          {/* Row 2: Composition donut + Energy curve + Prize risk */}
          <div className="deck-analytics-page__panel">
            <DeckCompositionChart cards={deck.cards} />
          </div>
          <div className="deck-analytics-page__panel">
            <EnergyCurvePanel data={energyData} />
          </div>
          <div className="deck-analytics-page__panel">
            <PrizeRiskPanel data={prizeData} />
          </div>

          {/* Row 3: Probability scatter (full width) */}
          <div className="deck-analytics-page__panel deck-analytics-page__panel--full">
            <ProbabilityScatterChart data={scatterData} />
          </div>

          {/* Row 4: Opening hand table + Consistency */}
          <div className="deck-analytics-page__panel deck-analytics-page__panel--wide">
            <OpeningHandPanel deckCards={deckCards} />
          </div>
          <div className="deck-analytics-page__panel">
            <ConsistencyPanel cards={deckCards} />
          </div>

        </div>
      </div>
    </div>
  );
}
