import React from 'react';
import type { PrizeRisk } from '../../lib/deck-math';

interface Props {
  data: PrizeRisk[];
}

const RISK_LABELS: Record<PrizeRisk['riskLevel'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
};

export function PrizeRiskPanel({ data }: Props) {
  const atRisk = data
    .filter((c) => c.riskLevel === 'medium' || c.riskLevel === 'high' || c.riskLevel === 'critical')
    .sort((a, b) => b.probAtLeastOnePrized - a.probAtLeastOnePrized);

  const oneCopyCards = data.filter((c) => c.quantity === 1);
  const oneCopyPrizedPct = oneCopyCards.length > 0
    ? (oneCopyCards[0]!.probAtLeastOnePrized * 100).toFixed(0)
    : null;

  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Prize Risk</h2>
      </div>

      {oneCopyPrizedPct && (
        <div className="analytics-panel__callout">
          Cards with 1 copy have a <strong>{oneCopyPrizedPct}%</strong> chance of being prized.
        </div>
      )}

      {atRisk.length === 0 ? (
        <p className="analytics-panel__empty">No high-risk cards detected.</p>
      ) : (
        <div className="analytics-panel__table-wrapper">
          <table className="analytics-panel__table">
            <thead>
              <tr>
                <th>Card</th>
                <th className="analytics-panel__col-num">Copies</th>
                <th className="analytics-panel__col-num">P(Prized)</th>
                <th className="analytics-panel__col-num">Risk</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map((card) => (
                <tr key={card.cardId} className={`analytics-panel__row--${card.riskLevel}`}>
                  <td className="analytics-panel__card-name">{card.name}</td>
                  <td className="analytics-panel__col-num">{card.quantity}</td>
                  <td className="analytics-panel__col-num analytics-panel__prob">
                    {(card.probAtLeastOnePrized * 100).toFixed(1)}%
                  </td>
                  <td className="analytics-panel__col-num">
                    <span className={`analytics-panel__badge analytics-panel__badge--${card.riskLevel}`}>
                      {RISK_LABELS[card.riskLevel]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
