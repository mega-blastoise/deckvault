import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { CardProbability } from '../../lib/deck-math';

interface ScatterPoint extends CardProbability {
  supertype: string;
}

interface Props {
  data: ScatterPoint[];
}

const MARGIN = { top: 16, right: 24, bottom: 40, left: 48 };
const W = 560;
const H = 280;
const INNER_W = W - MARGIN.left - MARGIN.right;
const INNER_H = H - MARGIN.top - MARGIN.bottom;

const TYPE_COLORS: Record<string, string> = {
  'Pokémon': '#818cf8',
  'Trainer': '#34d399',
  'Energy': '#fb923c',
};

export function ProbabilityScatterChart({ data }: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    card: ScatterPoint;
  } | null>(null);

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0.5, 4.5]).range([0, INNER_W]),
    []
  );

  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, 1]).range([INNER_H, 0]),
    []
  );

  const xTicks = [1, 2, 3, 4];
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  const jittered = useMemo(() => {
    // Spread overlapping points slightly on x
    const byQty = new Map<number, ScatterPoint[]>();
    for (const d of data) {
      const list = byQty.get(d.quantity) ?? [];
      list.push(d);
      byQty.set(d.quantity, list);
    }
    return data.map((d) => {
      const group = byQty.get(d.quantity)!;
      const idx = group.indexOf(d);
      const spread = group.length > 1 ? (idx / (group.length - 1) - 0.5) * 0.35 : 0;
      return { ...d, jx: d.quantity + spread };
    });
  }, [data]);

  return (
    <section className="analytics-panel analytics-panel--scatter">
      <div className="analytics-panel__header">
        <h2 className="analytics-panel__title">Opening Hand Probability by Copies</h2>
      </div>
      <div className="scatter-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="scatter-chart__svg"
          onMouseLeave={() => setTooltip(null)}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Grid lines */}
            {yTicks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={INNER_W}
                y1={yScale(t)}
                y2={yScale(t)}
                className="scatter-chart__grid-line"
              />
            ))}

            {/* X axis */}
            <line x1={0} x2={INNER_W} y1={INNER_H} y2={INNER_H} className="scatter-chart__axis" />
            {xTicks.map((t) => (
              <g key={t} transform={`translate(${xScale(t)},${INNER_H})`}>
                <line y2={4} className="scatter-chart__tick" />
                <text y={14} textAnchor="middle" className="scatter-chart__axis-label">
                  {t}
                </text>
              </g>
            ))}
            <text
              x={INNER_W / 2}
              y={INNER_H + 34}
              textAnchor="middle"
              className="scatter-chart__axis-title"
            >
              Copies in deck
            </text>

            {/* Y axis */}
            <line x1={0} x2={0} y1={0} y2={INNER_H} className="scatter-chart__axis" />
            {yTicks.map((t) => (
              <g key={t} transform={`translate(0,${yScale(t)})`}>
                <line x2={-4} className="scatter-chart__tick" />
                <text x={-8} textAnchor="end" dominantBaseline="middle" className="scatter-chart__axis-label">
                  {(t * 100).toFixed(0)}%
                </text>
              </g>
            ))}

            {/* Points */}
            {jittered.map((d) => {
              const cx = xScale(d.jx);
              const cy = yScale(d.probAtLeastOne);
              const color = TYPE_COLORS[d.supertype] ?? '#6c63ff';
              return (
                <circle
                  key={d.cardId}
                  cx={cx}
                  cy={cy}
                  r={5.5}
                  fill={color}
                  fillOpacity={0.75}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={1}
                  className="scatter-chart__point"
                  onMouseEnter={(e) => {
                    const svgRect = (e.currentTarget.ownerSVGElement as SVGSVGElement)
                      .getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - svgRect.left,
                      y: e.clientY - svgRect.top,
                      card: d,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="scatter-chart__tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          >
            <div className="scatter-chart__tooltip-name">{tooltip.card.name}</div>
            <div className="scatter-chart__tooltip-row">
              <span>Copies</span>
              <span>{tooltip.card.quantity}</span>
            </div>
            <div className="scatter-chart__tooltip-row">
              <span>P(≥1)</span>
              <span>{(tooltip.card.probAtLeastOne * 100).toFixed(1)}%</span>
            </div>
            <div className="scatter-chart__tooltip-row">
              <span>P(≥2)</span>
              <span>
                {tooltip.card.quantity >= 2
                  ? `${(tooltip.card.probAtLeastTwo * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="scatter-chart__legend">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <span key={type} className="scatter-chart__legend-item">
              <span className="scatter-chart__legend-dot" style={{ background: color }} />
              {type}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
