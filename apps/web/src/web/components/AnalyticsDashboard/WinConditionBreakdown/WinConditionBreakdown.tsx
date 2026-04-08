import React, { useRef, useEffect } from 'react';
import type { WinConditionData } from '../types';
import './WinConditionBreakdown.css';

interface WinConditionBreakdownProps {
  readonly data: WinConditionData;
}

export function WinConditionBreakdown({ data }: WinConditionBreakdownProps) {
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

    if (data.total === 0 || data.segments.length === 0) return;

    const barHeight = 40;
    const barY = (rect.height - barHeight) / 2;
    let x = 0;

    data.segments.forEach((seg) => {
      const segW = seg.percent * rect.width;
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, barY, segW, barHeight);
      x += segW;
    });
  }, [data]);

  if (data.total === 0) {
    return (
      <div className="win-breakdown win-breakdown--empty">
        <p className="win-breakdown__empty">No data available</p>
      </div>
    );
  }

  return (
    <div className="win-breakdown">
      <canvas
        ref={canvasRef}
        className="win-breakdown__bar"
        aria-label="Win condition stacked bar chart"
        role="img"
      />
      <div className="win-breakdown__legend">
        {data.segments.map((seg) => (
          <div key={seg.label} className="win-breakdown__legend-item">
            <span
              className="win-breakdown__legend-swatch"
              style={{ backgroundColor: seg.color }}
            />
            <span className="win-breakdown__legend-label">{seg.label}</span>
            <span className="win-breakdown__legend-pct">
              {(seg.percent * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
