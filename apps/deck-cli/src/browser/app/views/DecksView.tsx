/** @jsxImportSource react */
import { useEffect, useMemo, useState } from 'react';

import {
  api,
  type CardDetail,
  type DeckDoc,
  type DeckSummary,
  type ImportLine,
  type ValidationReport
} from '../api';
import { CardImage, CardTile, GROUP_ORDER, groupOf, type Group } from '../components';

interface DecksViewProps {
  readonly decks: DeckSummary[];
  readonly slug: string | null;
  readonly doc: DeckDoc | null;
  readonly dirty: boolean;
  readonly report: ValidationReport | null;
  readonly cards: Record<string, CardDetail>;
  readonly ensure: (ids: readonly string[]) => void;
  readonly onOpen: (slug: string) => void;
  readonly onClose: () => void;
  readonly onNew: () => void;
  readonly onMutate: (doc: DeckDoc) => void;
  readonly onSave: (asVersion: boolean) => void;
  readonly onValidate: () => void;
  readonly onDelete: () => void;
  readonly onImported: (lines: ImportLine[], name: string) => void;
}

export function DecksView(props: DecksViewProps): React.ReactElement {
  return props.doc ? <DeckDetail {...props} /> : <DeckGallery {...props} />;
}

/* ------------------------------------------------------------------ gallery */

function DeckGallery({
  decks,
  cards,
  ensure,
  onOpen,
  onNew,
  onImported
}: DecksViewProps): React.ReactElement {
  const [importing, setImporting] = useState(false);

  // Covers are resolved server-side; all this needs is their card details.
  const coverIds = useMemo(
    () => decks.map((d) => d.coverCardId).filter((id): id is string => Boolean(id)),
    [decks]
  );
  useEffect(() => ensure(coverIds), [coverIds, ensure]);

  const roots = decks.filter((d) => d.versionOf === null);

  return (
    <>
      <header className="view-hd">
        <div>
          <h1 className="view-title">Decks</h1>
          <p className="view-sub">
            {roots.length} deck{roots.length === 1 ? '' : 's'} ·{' '}
            {decks.length - roots.length} saved version
            {decks.length - roots.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="view-actions">
          <button onClick={() => setImporting(true)}>Import decklist</button>
          <button className="primary" onClick={onNew}>
            New deck
          </button>
        </div>
      </header>

      {roots.length === 0 ? (
        <div className="empty">No decks yet — create one, or import a decklist.</div>
      ) : (
        <div className="gallery">
          {roots.map((deck) => {
            const versions = decks.filter((v) => v.versionOf === deck.slug);
            return (
              <article className="deck-card" key={deck.slug}>
                <button
                  className="deck-card-hit"
                  onClick={() => onOpen(deck.slug)}
                  aria-label={`Open ${deck.name}`}
                >
                  <div className="deck-card-art">
                    <CardImage
                      card={deck.coverCardId ? cards[deck.coverCardId] : undefined}
                      id={deck.coverCardId ?? deck.slug}
                    />
                  </div>
                  <div className="deck-card-body">
                    <span className="deck-card-name">{deck.name}</span>
                    <span
                      className={
                        deck.totalCards === 60 ? 'count ok' : 'count warn'
                      }
                    >
                      {deck.totalCards}/60
                    </span>
                  </div>
                </button>
                {versions.length > 0 ? (
                  <div className="deck-card-versions">
                    {versions.map((v) => (
                      <button key={v.slug} className="chip" onClick={() => onOpen(v.slug)}>
                        v{v.version}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={(lines, name) => {
            setImporting(false);
            onImported(lines, name);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- detail */

function DeckDetail({
  slug,
  doc,
  dirty,
  report,
  cards,
  ensure,
  onClose,
  onMutate,
  onSave,
  onValidate,
  onDelete
}: DecksViewProps): React.ReactElement {
  const deck = doc!;

  const ids = useMemo(() => deck.cards.map((c) => c.id), [deck]);
  useEffect(() => ensure(ids), [ids, ensure]);

  const total = deck.cards.reduce((n, c) => n + c.quantity, 0);

  const setQuantity = (id: string, quantity: number): void => {
    onMutate({
      ...deck,
      cards:
        quantity <= 0
          ? deck.cards.filter((c) => c.id !== id)
          : deck.cards.map((c) => (c.id === id ? { ...c, quantity } : c))
    });
  };

  const groups = useMemo(() => {
    const byGroup = new Map<Group, { cards: DeckDoc['cards']; count: number }>();
    for (const entry of deck.cards) {
      const key = groupOf(cards[entry.id]?.supertype);
      const bucket = byGroup.get(key) ?? { cards: [], count: 0 };
      bucket.cards.push(entry);
      bucket.count += entry.quantity;
      byGroup.set(key, bucket);
    }
    return GROUP_ORDER.flatMap((name) => {
      const bucket = byGroup.get(name);
      return bucket ? [{ name, ...bucket }] : [];
    });
  }, [deck, cards]);

  return (
    <>
      <header className="view-hd">
        <div className="view-hd-main">
          <button className="back" onClick={onClose} aria-label="Back to all decks">
            ← Decks
          </button>
          <input
            className="deck-name"
            value={deck.name}
            aria-label="Deck name"
            onChange={(e) => onMutate({ ...deck, name: e.target.value })}
          />
        </div>
        <div className="view-actions">
          <span className={total === 60 ? 'count ok' : 'count warn'}>{total}/60</span>
          <button onClick={onValidate}>Validate</button>
          <button className="primary" onClick={() => onSave(false)} disabled={!dirty && slug !== null}>
            Save
          </button>
          <button onClick={() => onSave(true)} disabled={!slug}>
            Save as version
          </button>
          {slug ? (
            <button className="danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </header>

      {report ? (
        <div className={report.valid ? 'report ok' : 'report bad'}>
          {report.valid ? (
            <strong>Legal — {report.totalCards} cards, no violations</strong>
          ) : (
            <>
              <strong>{report.violations.length} violation(s)</strong>
              <ul>
                {report.violations.map((v, i) => (
                  <li key={i}>
                    <code>{v.rule}</code> {v.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {groups.map((group) => (
        <section className="card-group" key={group.name}>
          <header className="card-group-hd">
            <span className="card-group-title">{group.name}</span>
            <span className="card-group-count">{group.count}</span>
          </header>
          <div className="grid">
            {group.cards.map((c) => (
              <CardTile
                key={c.id}
                id={c.id}
                quantity={c.quantity}
                card={cards[c.id]}
                onChange={(q) => setQuantity(c.id, q)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- import */

function ImportDialog({
  onClose,
  onImported
}: {
  onClose: () => void;
  onImported: (lines: ImportLine[], name: string) => void;
}): React.ReactElement {
  const [text, setText] = useState('');
  const [name, setName] = useState('Imported deck');
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [busy, setBusy] = useState(false);

  const resolve = async (): Promise<void> => {
    setBusy(true);
    try {
      setLines((await api.importList(text)).lines);
    } finally {
      setBusy(false);
    }
  };

  const unresolved = lines?.filter((l) => !l.cardId) ?? [];
  const rotated = lines?.filter((l) => l.regulationMark && !'HIJ'.includes(l.regulationMark)) ?? [];

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import decklist"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-hd">
          <strong>Import decklist</strong>
          <button className="link" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="dialog-body">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Deck name" />
          <textarea
            rows={12}
            placeholder={"Paste a decklist…\n\n4 Ethan's Cyndaquil DRI 32\n2 Boss's Orders PAL 172"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="primary" onClick={() => void resolve()} disabled={busy || !text.trim()}>
            {busy ? 'Resolving…' : 'Resolve cards'}
          </button>

          {lines ? (
            <>
              <p className="muted">
                {lines.length} lines · {lines.reduce((n, l) => n + l.quantity, 0)} cards ·{' '}
                {unresolved.length} unresolved
              </p>
              {rotated.length > 0 ? (
                <p className="warn-text">
                  {rotated.length} card(s) outside H/I/J — rotated out of Standard
                </p>
              ) : null}
              <ul className="results">
                {lines.map((l, i) => (
                  <li key={i} className={l.cardId ? '' : 'bad'}>
                    <span className="card-name">
                      {l.quantity}× {l.resolvedName ?? l.name}
                    </span>
                    <span className="card-meta">{l.cardId ?? l.problem}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {lines ? (
          <footer className="dialog-ft">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={() => onImported(lines, name)}>
              Build deck from {lines.length - unresolved.length} resolved lines
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
