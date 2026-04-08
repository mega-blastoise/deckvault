import React, { useRef, useEffect } from 'react';
import type { PrizeRaceData } from '../types';
import { getChartTheme, drawConfidenceBand, drawLineChart } from '../canvas-utils';
import './PrizeRaceTimeline.css';

interface PrizeRaceTimelineProps {
  readonly data: PrizeRaceData;
}

export function PrizeRaceTimeline({ data }: PrizeRaceTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (data.points.length < 2) return;

    const theme = getChartTheme();
    const maxTurn = Math.max(data.maxTurn, 10);

    drawConfidenceBand(ctx, data.points.map((p) => ({
      x: p.turn,
      yMean: p.meanDifferential,
      yStdDev: p.stdDev
    })), {
      theme,
      xMin: 0,
      xMax: maxTurn,
      yMin: -6,
      yMax: 6,
      bandColor: 'rgba(59, 130, 246, 0.15)'
    });

    drawLineChart(ctx, data.points.map((p) => ({ x: p.turn, y: p.meanDifferential })), {
      theme,
      xMin: 0,
      xMax: maxTurn,
      yMin: -6,
      yMax: 6,
      color: '#3b82f6',
      lineWidth: 2
    });
  }, [data]);

  if (data.points.length === 0) {
    return (
      <div className="prize-race prize-race--empty">
        <p className="prize-race__empty">Insufficient replay data</p>
      </div>
    );
  }

  return (
    <div className="prize-race">
      <canvas
        ref={canvasRef}
        className="prize-race__canvas"
        aria-label="Prize race timeline line chart showing prize differential by turn"
        role="img"
      />
      <div className="prize-race__legend">
        <span className="prize-race__legend-line" />
        Mean prize differential
        <span className="prize-race__legend-band" />
        ±1 std dev
      </div>
    </div>
  );
}
