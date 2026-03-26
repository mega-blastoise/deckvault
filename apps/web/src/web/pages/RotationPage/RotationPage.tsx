import React, { useState } from 'react';
import { ROTATION_HISTORY, CURRENT_ROTATION } from '@/web/lib/rotation-data';
import type { RotationEntry } from '@/web/lib/rotation-data';
import './RotationPage.css';

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function SetList({ sets }: { sets: RotationEntry['legalSets'] }) {
  const byMark = sets.reduce<Record<string, typeof sets>>((acc, s) => {
    (acc[s.mark] ??= []).push(s);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(byMark).map(([mark, markSets]) => (
        <div key={mark} className="rotation__mark-group">
          <span className="rotation__mark-badge">{mark}</span>
          <ul className="rotation__set-list">
            {markSets.map((s) => (
              <li key={s.code} className="rotation__set-item">
                <span className="rotation__set-name">{s.name}</span>
                <span className="rotation__set-code">{s.code}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function RotationPage() {
  const [selected, setSelected] = useState<RotationEntry>(CURRENT_ROTATION);
  const isCurrent = selected === CURRENT_ROTATION;

  return (
    <div className="rotation">
      <header className="rotation__header">
        <div>
          <h1 className="rotation__title">Rotation Calendar</h1>
          <p className="rotation__subtitle">
            Format legality and rotation history for Standard play
          </p>
        </div>
        <select
          className="rotation__season-select"
          value={selected.seasonYear}
          onChange={(e) => {
            const entry = ROTATION_HISTORY.find((r) => r.seasonYear === e.target.value);
            if (entry) setSelected(entry);
          }}
        >
          {ROTATION_HISTORY.map((r) => (
            <option key={r.seasonYear} value={r.seasonYear}>
              {r.seasonYear} Season
            </option>
          ))}
        </select>
      </header>

      <div className="rotation__current-banner">
        <div className="rotation__banner-meta">
          <span className="rotation__season-label">
            {isCurrent ? 'Current Format' : 'Past Format'}
          </span>
          <h2 className="rotation__season-name">Standard {selected.seasonYear}</h2>
          <p className="rotation__rotation-date">
            Rotation: <strong>{formatDate(selected.rotationDate)}</strong>
          </p>
        </div>
        <div className="rotation__marks">
          <div className="rotation__marks-group">
            <span className="rotation__marks-label">Legal Marks</span>
            <div className="rotation__marks-pills">
              {selected.legalMarks.map((m) => (
                <span key={m} className="rotation__mark-pill rotation__mark-pill--legal">{m}</span>
              ))}
            </div>
          </div>
          <div className="rotation__marks-group">
            <span className="rotation__marks-label">Rotated Marks</span>
            <div className="rotation__marks-pills">
              {selected.rotatedMarks.map((m) => (
                <span key={m} className="rotation__mark-pill rotation__mark-pill--rotated">{m}</span>
              ))}
            </div>
          </div>
        </div>
        {selected.notes && (
          <p className="rotation__notes">{selected.notes}</p>
        )}
      </div>

      <div className="rotation__columns">
        <section className="rotation__section rotation__section--legal">
          <h3 className="rotation__section-title">
            <span className="rotation__section-dot rotation__section-dot--legal" />
            Legal Sets
          </h3>
          <SetList sets={selected.legalSets} />
        </section>

        <section className="rotation__section rotation__section--rotated">
          <h3 className="rotation__section-title">
            <span className="rotation__section-dot rotation__section-dot--rotated" />
            Rotated Sets
          </h3>
          <SetList sets={selected.rotatedSets} />
        </section>
      </div>
    </div>
  );
}
