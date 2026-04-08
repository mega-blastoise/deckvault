import React, { useRef, useEffect } from 'react';
import type { TurnLengthBucket } from '../types';
import { getChartTheme, drawStackedBarChart } from '../canvas-utils';
import './TurnLengthDistribution.css';

interface TurnLengthDistributionProps {
  readonly buckets: ReadonlyArray<TurnLengthBucket>;
  readonly medianTurns: number;
}

export function TurnLengthDistribution({ buckets, medianTurns }: TurnLengthDistributionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || buckets.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const theme = getChartTheme();
    drawStackedBarChart(
      ctx,
      buckets.map((b) => ({
        label: b.label,
        values: [b.player1Wins, b.player2Wins, b.draws]
      })),
      {
        theme,
        colors: ['#22c55e', '#ef4444', '#6b7280'],
        xLabel: 'Turns',
        yLabel: 'Games'
      }
    );
  }, [buckets]);

  if (buckets.length === 0) {
    return (
      <div className="turn-distribution turn-distribution--empty">
        <p className="turn-distribution__empty">No game data available</p>
      </div>
    );
  }

  const modeLabel = buckets.reduce((a, b) => (b.total > a.total ? b : a)).label;

  return (
    <div className="turn-distribution">
      <canvas
        ref={canvasRef}
        className="turn-distribution__canvas"
        aria-label="Turn length distribution stacked bar chart"
        role="img"
      />
      <div className="turn-distribution__meta">
        <span>Median: {medianTurns} turns</span>
        <span>Mode: {modeLabel} turns</span>
      </div>
      <div className="turn-distribution__legend">
        <span className="turn-distribution__legend-item">
          <span className="turn-distribution__legend-swatch turn-distribution__legend-swatch--p1" />
          Your wins
        </span>
        <span className="turn-distribution__legend-item">
          <span className="turn-distribution__legend-swatch turn-distribution__legend-swatch--p2" />
          Opp wins
        </span>
        <span className="turn-distribution__legend-item">
          <span className="turn-distribution__legend-swatch turn-distribution__legend-swatch--draw" />
          Draws
        </span>
      </div>
    </div>
  );
}
