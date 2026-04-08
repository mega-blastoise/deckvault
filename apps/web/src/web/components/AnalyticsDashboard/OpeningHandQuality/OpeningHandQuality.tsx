import React, { useRef, useEffect } from 'react';
import type { OpeningHandData } from '../types';
import { getChartTheme, drawRingChart } from '../canvas-utils';
import './OpeningHandQuality.css';

interface OpeningHandQualityProps {
  readonly data: OpeningHandData;
}

interface RingStat {
  readonly value: number;
  readonly label: string;
}

function RingStatCanvas({ value, label }: RingStat) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 80 * dpr;
    canvas.height = 80 * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 80, 80);

    const theme = getChartTheme();
    drawRingChart(ctx, value, label, theme);
  }, [value, label]);

  return (
    <canvas
      ref={canvasRef}
      className="opening-hand__ring"
      style={{ width: 80, height: 80 }}
      aria-label={`${label}: ${Math.round(value * 100)}%`}
      role="img"
    />
  );
}

export function OpeningHandQuality({ data }: OpeningHandQualityProps) {
  if (data.mulliganRate === 0 && data.handArchetypes.length === 0) {
    return (
      <div className="opening-hand opening-hand--empty">
        <p className="opening-hand__empty">Insufficient replay data</p>
      </div>
    );
  }

  return (
    <div className="opening-hand">
      <div className="opening-hand__stats">
        <RingStatCanvas value={data.mulliganRate} label="Mulligan" />
        <RingStatCanvas value={data.hasSupporterRate} label="T1 Supporter" />
        <RingStatCanvas value={data.hasEnergyRate} label="T1 Energy" />
        <RingStatCanvas value={data.idealOpeningRate} label="Ideal Hand" />
      </div>
      <div className="opening-hand__avg">
        Avg basics in hand: <strong>{data.averageBasicsInHand.toFixed(1)}</strong>
      </div>
      {data.handArchetypes.length > 0 && (
        <div className="opening-hand__archetypes">
          <h4 className="opening-hand__archetypes-title">Top opening hand patterns</h4>
          {data.handArchetypes.map((arch) => (
            <div key={arch.label} className="opening-hand__archetype">
              <span className="opening-hand__archetype-label">{arch.label}</span>
              <div className="opening-hand__archetype-bar-wrap">
                <div
                  className="opening-hand__archetype-bar"
                  style={{ width: `${arch.frequency * 100}%` }}
                />
              </div>
              <span className="opening-hand__archetype-pct">
                {(arch.frequency * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
