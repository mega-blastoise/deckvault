import React, { useRef, useEffect } from 'react';
import type { KeyCardCurve } from '../types';
import { getChartTheme } from '../canvas-utils';
import './KeyCardCurves.css';

const LINE_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899'
];

const PADDING = { top: 24, right: 16, bottom: 40, left: 52 };

interface KeyCardCurvesProps {
  readonly curves: ReadonlyArray<KeyCardCurve>;
}

export function KeyCardCurves({ curves }: KeyCardCurvesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || curves.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const theme = getChartTheme();
    const area = {
      x: PADDING.left,
      y: PADDING.top,
      w: rect.width - PADDING.left - PADDING.right,
      h: rect.height - PADDING.top - PADDING.bottom
    };

    const xMin = 1;
    const xMax = 10;
    const yMin = 0;
    const yMax = 1;

    const mapX = (v: number) => area.x + ((v - xMin) / (xMax - xMin)) * area.w;
    const mapY = (v: number) => area.y + area.h - (v - yMin) / (yMax - yMin) * area.h;

    // Grid lines at 25%, 50%, 75%, 100%
    ctx.save();
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach((pct) => {
      const py = mapY(pct);
      ctx.beginPath();
      ctx.moveTo(area.x, py);
      ctx.lineTo(area.x + area.w, py);
      ctx.stroke();
      ctx.fillStyle = theme.textColor;
      ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct * 100}%`, area.x - 4, py + 4);
    });

    // X-axis ticks
    ctx.textAlign = 'center';
    for (let t = xMin; t <= xMax; t++) {
      const px = mapX(t);
      ctx.fillStyle = theme.textColor;
      ctx.fillText(`T${t}`, px, area.y + area.h + 16);
    }

    // Lines
    curves.forEach((curve, ci) => {
      const color = LINE_COLORS[ci % LINE_COLORS.length] ?? '#6b7280';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      curve.curve.forEach((pt, i) => {
        const px = mapX(pt.turn);
        const py = mapY(pt.probability);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    ctx.restore();
  }, [curves]);

  if (curves.length === 0) {
    return (
      <div className="key-card-curves key-card-curves--empty">
        <p className="key-card-curves__placeholder">
          Mark cards as key cards in the configuration panel to see consistency curves.
        </p>
      </div>
    );
  }

  return (
    <div className="key-card-curves">
      <canvas
        ref={canvasRef}
        className="key-card-curves__canvas"
        aria-label="Key card consistency curves showing cumulative draw probability by turn"
        role="img"
      />
      <div className="key-card-curves__legend">
        {curves.map((curve, i) => (
          <div key={curve.cardId} className="key-card-curves__legend-item">
            <span
              className="key-card-curves__legend-dot"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span className="key-card-curves__legend-name">{curve.cardName}</span>
            {curve.copiesInDeck > 0 && (
              <span className="key-card-curves__legend-copies">
                x{curve.copiesInDeck}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
