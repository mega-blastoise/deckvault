/** @jsxImportSource react */
import { useEffect, useMemo, useState } from 'react';

import { api, type CardDetail, type DeckDoc, type ProbabilityReport, type TurnPoint } from '../api';
import { GROUP_ORDER, groupOf, type Group } from '../components';

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/**
 * Draw-odds curve across the first four turns. An inline SVG rather than a chart
 * library: four points per row, and the page has to stay self-contained inside
 * the compiled binary.
 *
 * The axis is pinned to 0..1 rather than the row's own min/max — rescaling would
 * make a flat 90% line look like a steep climb. That honesty costs legibility on
 * its own (a 54%→72% rise is three pixels tall), so the area under the curve is
 * filled: the *height* of the shape encodes the probability, which reads at a
 * glance and stays comparable between rows.
 */
function Sparkline({ points }: { points: readonly TurnPoint[] }): React.ReactElement {
  const w = 68;
  const h = 22;
  if (points.length < 2) return <svg className="spark" width={w} height={h} />;

  const x = (i: number): number => (i / (points.length - 1)) * (w - 2) + 1;
  const y = (p: number): number => h - 1 - p * (h - 2);

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pAtLeastOne).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - 1} L${x(0).toFixed(1)},${h - 1} Z`;

  const last = points[points.length - 1]!;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={area} fill="currentColor" fillOpacity="0.18" stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={x(points.length - 1)} cy={y(last.pAtLeastOne)} r="1.8" fill="currentColor" />
    </svg>
  );
}

function Bar({
  label,
  value,
  total,
  tone
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}): React.ReactElement {
  const share = total > 0 ? value / total : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill bar-${tone}`} style={{ width: `${share * 100}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

export function StatsView({
  doc,
  slug,
  cards,
  ensure
}: {
  readonly doc: DeckDoc | null;
  readonly slug: string | null;
  readonly cards: Record<string, CardDetail>;
  readonly ensure: (ids: readonly string[]) => void;
}): React.ReactElement {
  const [report, setReport] = useState<ProbabilityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => doc?.cards.map((c) => c.id) ?? [], [doc]);
  useEffect(() => ensure(ids), [ids, ensure]);

  // Recompute whenever the deck changes — the odds are only meaningful for the
  // list currently on screen, and a stale table is worse than none.
  useEffect(() => {
    if (!doc) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    api
      .probability(doc)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const composition = useMemo(() => {
    const byGroup = new Map<Group, number>();
    for (const entry of doc?.cards ?? []) {
      const key = groupOf(cards[entry.id]?.supertype);
      byGroup.set(key, (byGroup.get(key) ?? 0) + entry.quantity);
    }
    return GROUP_ORDER.flatMap((name) => {
      const count = byGroup.get(name);
      return count ? [{ name, count }] : [];
    });
  }, [doc, cards]);

  // `types` is carried by Pokémon and by basic Energy alike, so this is the
  // deck's overall type spread — not an energy-line count.
  const types = useMemo(() => {
    const byType = new Map<string, number>();
    for (const entry of doc?.cards ?? []) {
      for (const t of cards[entry.id]?.types ?? []) {
        byType.set(t, (byType.get(t) ?? 0) + entry.quantity);
      }
    }
    return [...byType.entries()].sort((a, b) => b[1] - a[1]);
  }, [doc, cards]);

  if (!doc) {
    return (
      <>
        <header className="view-hd">
          <div>
            <h1 className="view-title">Stats</h1>
          </div>
        </header>
        <div className="empty">Open a deck to see its opening-hand odds and composition.</div>
      </>
    );
  }

  const total = doc.cards.reduce((n, c) => n + c.quantity, 0);

  return (
    <>
      <header className="view-hd">
        <div>
          <h1 className="view-title">{doc.name}</h1>
          <p className="view-sub">
            {slug ? `${slug}.toml · ` : ''}
            {total} cards
          </p>
        </div>
      </header>

      <div className="stat-cards">
        <section className="panel-card">
          <h2 className="panel-card-title">Composition</h2>
          {composition.map((c) => (
            <Bar
              key={c.name}
              label={c.name}
              value={c.count}
              total={total}
              tone={c.name === 'Pokémon' ? 'accent' : c.name === 'Trainer' ? 'neutral' : 'warn'}
            />
          ))}
        </section>

        <section className="panel-card">
          <h2 className="panel-card-title">Types</h2>
          {types.length === 0 ? (
            <p className="muted">No typed cards resolved yet.</p>
          ) : (
            types.map(([type, count]) => (
              <Bar key={type} label={type} value={count} total={total} tone="accent" />
            ))
          )}
        </section>
      </div>

      <section className="card-group">
        <header className="card-group-hd">
          <span className="card-group-title">Opening hand</span>
          <span className="card-group-count">
            {busy ? 'calculating…' : report ? `${report.openingHand.length} cards` : ''}
          </span>
        </header>

        {error ? <div className="report bad">{error}</div> : null}

        {report ? (
          <table className="stat-table">
            <thead>
              <tr>
                <th>Card</th>
                <th className="num">Copies</th>
                <th className="num">Opening</th>
                <th className="num">Exactly 1</th>
                <th className="num">Exactly 2</th>
                <th>By turn 4</th>
              </tr>
            </thead>
            <tbody>
              {report.openingHand.map((row) => (
                <tr key={row.cardId}>
                  <td>{row.name}</td>
                  <td className="num">{row.copies}</td>
                  <td className="num strong">{pct(row.pOpen)}</td>
                  <td className="num">{pct(row.pExactlyOne)}</td>
                  <td className="num">{pct(row.pExactlyTwo)}</td>
                  <td className="curve">
                    <Sparkline points={row.turnCurve} />
                    <span className="num">
                      {pct(row.turnCurve[row.turnCurve.length - 1]?.pAtLeastOne ?? 0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : busy ? (
          <div className="empty">Calculating…</div>
        ) : null}
      </section>
    </>
  );
}
