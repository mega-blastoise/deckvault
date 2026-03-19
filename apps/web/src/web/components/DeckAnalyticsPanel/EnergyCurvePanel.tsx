import React from 'react';
import type { EnergyCurveResult } from '../../lib/deck-math';

interface Props {
  data: EnergyCurveResult;
}

const RECOMMENDATION_LABELS: Record<EnergyCurveResult['recommendation'], string> = {
  'too-few': 'Too Few',
  'lean': 'Lean',
  'standard': 'Standard',
  'heavy': 'Heavy',
  'too-many': 'Too Many'
};

export function EnergyCurvePanel({ data }: Props) {
  const max = Math.max(...data.turnCurve, 1);

  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Energy Curve</h2>
        <span className={`analytics-panel__badge analytics-panel__badge--energy-${data.recommendation}`}>
          {RECOMMENDATION_LABELS[data.recommendation]}
        </span>
      </div>

      <div className="analytics-panel__energy-stats">
        <div className="analytics-panel__energy-stat">
          <span className="analytics-panel__energy-stat-value">{data.totalEnergy}</span>
          <span className="analytics-panel__energy-stat-label">Total</span>
        </div>
        <div className="analytics-panel__energy-stat">
          <span className="analytics-panel__energy-stat-value">{data.basicEnergy}</span>
          <span className="analytics-panel__energy-stat-label">Basic</span>
        </div>
        <div className="analytics-panel__energy-stat">
          <span className="analytics-panel__energy-stat-value">{data.specialEnergy}</span>
          <span className="analytics-panel__energy-stat-label">Special</span>
        </div>
        <div className="analytics-panel__energy-stat">
          <span className="analytics-panel__energy-stat-value">{(data.energyRatio * 100).toFixed(0)}%</span>
          <span className="analytics-panel__energy-stat-label">Ratio</span>
        </div>
      </div>

      <div className="analytics-panel__chart">
        {data.turnCurve.map((value, i) => (
          <div key={i} className="analytics-panel__chart-col">
            <span className="analytics-panel__chart-value">{value.toFixed(1)}</span>
            <div className="analytics-panel__chart-bar-track">
              <div
                className="analytics-panel__chart-bar-fill"
                style={{ height: `${(value / max) * 100}%` }}
              />
            </div>
            <span className="analytics-panel__chart-label">T{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="analytics-panel__chart-caption">Expected energy available per turn</p>
    </section>
  );
}
