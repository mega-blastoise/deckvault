/** @jsxImportSource react */
import { useState } from 'react';

import { api, type CardDetail } from '../api';
import { CardImage, CardMark } from '../components';

export function CardsView({
  hasDeck,
  onAdd,
  onCache
}: {
  readonly hasDeck: boolean;
  readonly onAdd: (id: string) => void;
  readonly onCache: (cards: readonly CardDetail[]) => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [standardOnly, setStandardOnly] = useState(true);
  const [results, setResults] = useState<CardDetail[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (only = standardOnly): Promise<void> => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const found = await api.search(query.trim(), only);
      setResults(found);
      // Seed the shared cache so adding a card renders its art immediately
      // rather than refetching the detail it already has.
      onCache(found);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="view-hd">
        <div>
          <h1 className="view-title">Cards</h1>
          <p className="view-sub">
            {hasDeck ? 'Click a card to add it to the open deck.' : 'Open a deck to add cards.'}
          </p>
        </div>
      </header>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          placeholder="Search cards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={standardOnly}
            onChange={(e) => {
              setStandardOnly(e.target.checked);
              void run(e.target.checked);
            }}
          />
          Standard legal only
        </label>
        <button className="primary" type="submit" disabled={busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results === null ? (
        <div className="empty">Search the 20,444-card database.</div>
      ) : results.length === 0 ? (
        <div className="empty">No cards matched “{query}”.</div>
      ) : (
        <div className="grid">
          {results.map((card) => (
            <figure className="tile" key={card.id}>
              <div className="tile-art">
                <CardImage card={card} id={card.id} />
                {hasDeck ? (
                  <div className="tile-controls tile-controls-single">
                    <button aria-label={`Add ${card.name}`} onClick={() => onAdd(card.id)}>
                      + Add
                    </button>
                  </div>
                ) : null}
              </div>
              <figcaption className="tile-cap">
                <span className="tile-name">{card.name}</span>
                <span className="tile-meta">
                  <CardMark mark={card.regulationMark} />
                  <span className="card-meta">{card.id}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
