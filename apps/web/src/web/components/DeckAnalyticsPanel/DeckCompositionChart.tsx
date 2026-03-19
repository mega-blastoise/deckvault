import React, { useMemo } from 'react';
import * as d3 from 'd3';
import type { DeckCard } from '../../../types/deck';

interface Props {
  cards: DeckCard[];
}

const COLORS: Record<string, string> = {
  'Pokémon': '#818cf8',
  'Trainer': '#34d399',
  'Energy': '#fb923c',
};

const LABELS: Record<string, string> = {
  'Pokémon': 'Pokémon',
  'Trainer': 'Trainer',
  'Energy': 'Energy',
};

const W = 220;
const H = 220;
const OUTER_R = 90;
const INNER_R = 54;
const cx = W / 2;
const cy = H / 2;

export function DeckCompositionChart({ cards }: Props) {
  const totals = useMemo(() => {
    const counts: Record<string, number> = { 'Pokémon': 0, 'Trainer': 0, 'Energy': 0 };
    for (const dc of cards) {
      const st = dc.card.supertype;
      if (st in counts) counts[st] += dc.quantity;
    }
    return counts;
  }, [cards]);

  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  const pieData = useMemo(() => {
    const pie = d3.pie<[string, number]>()
      .sort(null)
      .value(([, v]) => v);
    return pie(Object.entries(totals) as [string, number][]);
  }, [totals]);

  const arcGen = d3.arc<d3.PieArcDatum<[string, number]>>()
    .innerRadius(INNER_R)
    .outerRadius(OUTER_R)
    .padAngle(0.03)
    .cornerRadius(3);

  const arcHover = d3.arc<d3.PieArcDatum<[string, number]>>()
    .innerRadius(INNER_R)
    .outerRadius(OUTER_R + 6)
    .padAngle(0.03)
    .cornerRadius(3);

  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Deck Composition</h2>
      </div>

      <div className="donut-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="donut-chart__svg">
          <g transform={`translate(${cx},${cy})`}>
            {pieData.map((slice) => {
              const [label] = slice.data;
              const color = COLORS[label] ?? '#6c63ff';
              const path = arcGen(slice) ?? '';
              const hoverPath = arcHover(slice) ?? '';
              return (
                <g key={label} className="donut-chart__slice">
                  <path
                    d={path}
                    fill={color}
                    opacity={0.85}
                    className="donut-chart__arc"
                    data-hover-d={hoverPath}
                  />
                </g>
              );
            })}
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              className="donut-chart__center-value"
              y="-8"
            >
              {total}
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              className="donut-chart__center-label"
              y="12"
            >
              cards
            </text>
          </g>
        </svg>

        <div className="donut-chart__legend">
          {Object.entries(totals).map(([label, count]) => (
            <div key={label} className="donut-chart__legend-item">
              <span
                className="donut-chart__legend-swatch"
                style={{ background: COLORS[label] ?? '#6c63ff' }}
              />
              <span className="donut-chart__legend-label">{LABELS[label] ?? label}</span>
              <span className="donut-chart__legend-count">{count}</span>
              <span className="donut-chart__legend-pct">
                {total > 0 ? `${((count / total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
