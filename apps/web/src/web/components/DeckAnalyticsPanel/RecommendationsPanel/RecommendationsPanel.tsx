import React from 'react';
import { Link } from 'react-router';
import type { WeaknessReport } from '../../../lib/deck-suggestions';
import { useCardSuggestions } from '../../../hooks/useCardSuggestions';
import { ROUTES } from '../../../routes';
import './RecommendationsPanel.css';

interface RecommendationsPanelProps {
  weaknesses: WeaknessReport[];
}

const BADGE_LABEL: Record<WeaknessReport['severity'], string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  minor: 'Minor'
};

const SKELETON_COUNT = 4;
const skeletonKeys = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

function WeaknessBlock({ weakness }: { weakness: WeaknessReport }) {
  const { cards, isLoading } = useCardSuggestions(weakness.tags);

  return (
    <div className="recommendations-panel__weakness">
      <div className="recommendations-panel__weakness-header">
        <span
          className={`recommendations-panel__badge recommendations-panel__badge--${weakness.severity}`}
        >
          {BADGE_LABEL[weakness.severity]}
        </span>
        <p className="recommendations-panel__weakness-title">{weakness.title}</p>
      </div>

      <p className="recommendations-panel__description">{weakness.description}</p>

      {weakness.affectedCards.length > 0 && (
        <div className="recommendations-panel__affected">
          {weakness.affectedCards.map((ac) => (
            <span key={ac.cardId} className="recommendations-panel__affected-item">
              {ac.name} &times;{ac.quantity}
            </span>
          ))}
        </div>
      )}

      <p className="recommendations-panel__section-label">Suggested cards</p>

      <div className="recommendations-panel__cards-rail">
        {isLoading
          ? skeletonKeys.map((k) => (
              <div key={k} className="recommendations-panel__skeleton" />
            ))
          : cards.map((card) => (
              <Link
                key={card.id}
                to={ROUTES.CARD(card.id)}
                className="recommendations-panel__suggestion-card"
              >
                {card.images !== null ? (
                  <img src={card.images.small} alt={card.name} />
                ) : (
                  <div className="recommendations-panel__card-fallback" />
                )}
                {card.regulationMark !== null && (
                  <span className="recommendations-panel__reg-mark">
                    {card.regulationMark}
                  </span>
                )}
                <p className="recommendations-panel__card-name">{card.name}</p>
              </Link>
            ))}
      </div>
    </div>
  );
}

function RecommendationsPanelInner({ weaknesses }: RecommendationsPanelProps) {
  if (weaknesses.length === 0) {
    return (
      <div className="recommendations-panel">
        <p className="recommendations-panel__empty">
          ✓ No issues detected — deck structure looks healthy
        </p>
      </div>
    );
  }

  return (
    <div className="recommendations-panel">
      {weaknesses.map((w) => (
        <WeaknessBlock key={w.id} weakness={w} />
      ))}
    </div>
  );
}

export const RecommendationsPanel = React.memo(RecommendationsPanelInner);
