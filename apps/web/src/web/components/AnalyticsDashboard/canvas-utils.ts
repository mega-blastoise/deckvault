import type { ChartTheme, LineChartOptions, BarChartOptions, BandOptions } from './types';

export function getChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim() || v;
  return {
    fontFamily: get('--font-sans') || 'system-ui, sans-serif',
    fontSize: 12,
    gridColor: get('--surface-hover') || 'rgba(255,255,255,0.08)',
    textColor: get('--text-secondary') || '#9ca3af',
    backgroundColor: get('--bg-sunken') || '#111827'
  };
}

const PADDING = { top: 24, right: 16, bottom: 40, left: 52 };

function chartArea(canvas: HTMLCanvasElement) {
  return {
    x: PADDING.left,
    y: PADDING.top,
    w: canvas.width - PADDING.left - PADDING.right,
    h: canvas.height - PADDING.top - PADDING.bottom
  };
}

function mapX(value: number, xMin: number, xMax: number, areaX: number, areaW: number): number {
  return areaX + ((value - xMin) / (xMax - xMin)) * areaW;
}

function mapY(value: number, yMin: number, yMax: number, areaY: number, areaH: number): number {
  return areaY + areaH - ((value - yMin) / (yMax - yMin)) * areaH;
}

export function drawConfidenceBand(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ x: number; yMean: number; yStdDev: number }>,
  options: BandOptions
): void {
  if (data.length < 2) return;

  const canvas = ctx.canvas;
  const area = chartArea(canvas);
  const { xMin, xMax, yMin, yMax, bandColor } = options;

  ctx.save();
  ctx.beginPath();

  // Upper band
  data.forEach((pt, i) => {
    const px = mapX(pt.x, xMin, xMax, area.x, area.w);
    const py = mapY(
      Math.min(yMax, pt.yMean + pt.yStdDev),
      yMin,
      yMax,
      area.y,
      area.h
    );
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  // Lower band (reverse)
  [...data].reverse().forEach((pt) => {
    const px = mapX(pt.x, xMin, xMax, area.x, area.w);
    const py = mapY(
      Math.max(yMin, pt.yMean - pt.yStdDev),
      yMin,
      yMax,
      area.y,
      area.h
    );
    ctx.lineTo(px, py);
  });

  ctx.closePath();
  ctx.fillStyle = bandColor;
  ctx.fill();
  ctx.restore();
}

export function drawLineChart(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ x: number; y: number }>,
  options: LineChartOptions
): void {
  if (data.length < 2) return;

  const canvas = ctx.canvas;
  const area = chartArea(canvas);
  const { xMin, xMax, yMin, yMax, color, lineWidth = 2, theme } = options;

  // Grid lines
  ctx.save();
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;

  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const yVal = yMin + (i / ySteps) * (yMax - yMin);
    const py = mapY(yVal, yMin, yMax, area.y, area.h);
    ctx.beginPath();
    ctx.moveTo(area.x, py);
    ctx.lineTo(area.x + area.w, py);
    ctx.stroke();
    ctx.fillStyle = theme.textColor;
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(yVal)), area.x - 4, py + 4);
  }

  // X-axis ticks every 5
  ctx.textAlign = 'center';
  for (let x = xMin; x <= xMax; x += 5) {
    const px = mapX(x, xMin, xMax, area.x, area.w);
    ctx.fillStyle = theme.textColor;
    ctx.fillText(String(x), px, area.y + area.h + 16);
  }

  // Zero line if in range
  if (yMin < 0 && yMax > 0) {
    const py = mapY(0, yMin, yMax, area.y, area.h);
    ctx.strokeStyle = theme.textColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(area.x, py);
    ctx.lineTo(area.x + area.w, py);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Main line
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((pt, i) => {
    const px = mapX(pt.x, xMin, xMax, area.x, area.w);
    const py = mapY(pt.y, yMin, yMax, area.y, area.h);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

export function drawStackedBarChart(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<{ label: string; values: ReadonlyArray<number> }>,
  options: BarChartOptions
): void {
  if (data.length === 0) return;

  const canvas = ctx.canvas;
  const area = chartArea(canvas);
  const { colors, theme } = options;

  const maxVal = Math.max(...data.map((d) => d.values.reduce((a, b) => a + b, 0)));
  if (maxVal === 0) return;

  const barWidth = (area.w / data.length) * 0.7;
  const barGap = area.w / data.length;

  // Y-axis grid
  ctx.save();
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const yVal = (i / ySteps) * maxVal;
    const py = mapY(yVal, 0, maxVal, area.y, area.h);
    ctx.beginPath();
    ctx.moveTo(area.x, py);
    ctx.lineTo(area.x + area.w, py);
    ctx.stroke();
    ctx.fillStyle = theme.textColor;
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(yVal)), area.x - 4, py + 4);
  }

  data.forEach((bar, i) => {
    const barX = area.x + i * barGap + (barGap - barWidth) / 2;
    let stackY = area.y + area.h;

    bar.values.forEach((val, vi) => {
      if (val === 0) return;
      const barH = (val / maxVal) * area.h;
      ctx.fillStyle = colors[vi % colors.length] ?? '#6b7280';
      ctx.fillRect(barX, stackY - barH, barWidth, barH);
      stackY -= barH;
    });

    ctx.fillStyle = theme.textColor;
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(bar.label, barX + barWidth / 2, area.y + area.h + 16);
  });

  ctx.restore();
}

export function drawRingChart(
  ctx: CanvasRenderingContext2D,
  value: number,
  label: string,
  theme: ChartTheme
): void {
  const canvas = ctx.canvas;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 8;
  const lineW = 8;
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + value * 2 * Math.PI;

  ctx.save();

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center text
  ctx.fillStyle = theme.textColor;
  ctx.font = `bold 14px ${theme.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(value * 100)}%`, cx, cy - 8);
  ctx.font = `10px ${theme.fontFamily}`;
  ctx.fillText(label, cx, cy + 10);

  ctx.restore();
}
