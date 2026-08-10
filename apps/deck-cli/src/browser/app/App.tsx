/** @jsxImportSource react */
import { useCallback, useEffect, useState } from 'react';

import {
  api,
  type CardDetail,
  type DeckDoc,
  type DeckSummary,
  type ImportLine,
  type ValidationReport
} from './api';
import { useCardCache } from './components';
import { CardsView } from './views/CardsView';
import { ChatView } from './views/ChatView';
import { DecksView } from './views/DecksView';
import { StatsView } from './views/StatsView';

const EMPTY_DECK: DeckDoc = {
  name: 'New deck',
  format: 'standard',
  regulation_marks: ['H', 'I', 'J'],
  cards: []
};

type Theme = 'dark' | 'light';
type View = 'decks' | 'cards' | 'stats' | 'chat';

const NAV: ReadonlyArray<{ id: View; label: string; glyph: string }> = [
  { id: 'decks', label: 'Decks', glyph: '▣' },
  { id: 'cards', label: 'Cards', glyph: '◫' },
  { id: 'stats', label: 'Stats', glyph: '◇' },
  { id: 'chat', label: 'Chat', glyph: '◈' }
];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'deck'
  );
}

export function App(): React.ReactElement {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [decksDir, setDecksDir] = useState('');
  const [view, setView] = useState<View>('decks');
  const [slug, setSlug] = useState<string | null>(null);
  const [doc, setDoc] = useState<DeckDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { cards, ensure, put } = useCardCache();

  // The head script resolved and applied the theme before first paint; read it
  // back rather than deriving it again, so the two can't disagree.
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'dark'
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('johto-theme', next);
      } catch {
        // Blocked storage — the toggle still works for this session.
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const { decksDir: dir, decks: list } = await api.listDecks();
    setDecksDir(dir);
    setDecks(list);
  }, []);

  const open = useCallback(async (next: string) => {
    const loaded = await api.getDeck(next);
    setSlug(next);
    setDoc(loaded);
    setDirty(false);
    setReport(null);
  }, []);

  useEffect(() => {
    void refresh().then(() => {
      const initial = (window as unknown as { __JOHTO__?: { initialSlug?: string | null } })
        .__JOHTO__?.initialSlug;
      if (initial) void open(initial);
    });
  }, [refresh, open]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  const mutate = (next: DeckDoc): void => {
    setDoc(next);
    setDirty(true);
    setReport(null);
  };

  const addCard = (id: string): void => {
    if (!doc) return;
    const existing = doc.cards.find((c) => c.id === id);
    mutate({
      ...doc,
      cards: existing
        ? doc.cards.map((c) => (c.id === id ? { ...c, quantity: c.quantity + 1 } : c))
        : [...doc.cards, { id, quantity: 1 }]
    });
    setNotice(`Added ${cards[id]?.name ?? id}`);
  };

  const save = async (asVersion: boolean): Promise<void> => {
    if (!doc) return;
    const target = slug ?? slugify(doc.name);
    const result = asVersion
      ? await api.saveVersion(target, doc)
      : await api.saveDeck(target, doc);
    setSlug(result.slug);
    setDirty(false);
    setNotice(`Saved ${result.slug}.toml`);
    await refresh();
  };

  const validate = async (): Promise<void> => {
    if (!doc) return;
    setReport(await api.validate(doc));
  };

  const remove = async (): Promise<void> => {
    if (!slug || !confirm(`Delete ${slug}.toml?`)) return;
    await api.deleteDeck(slug);
    setSlug(null);
    setDoc(null);
    await refresh();
    setNotice('Deck deleted');
  };

  const importDeck = (lines: ImportLine[], name: string): void => {
    setSlug(null);
    setDoc({
      ...EMPTY_DECK,
      name,
      cards: lines
        .filter((l) => l.cardId)
        .map((l) => ({ id: l.cardId!, quantity: l.quantity }))
    });
    setDirty(true);
    setView('decks');
  };

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <div className="rail-mark" aria-hidden="true">
          ◆
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'rail-item active' : 'rail-item'}
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
          >
            <span className="rail-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span className="rail-label">{item.label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <button
          className="rail-item"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <span className="rail-glyph" aria-hidden="true">
            {theme === 'dark' ? '◐' : '◑'}
          </span>
          <span className="rail-label">Theme</span>
        </button>
      </nav>

      <main className={view === 'chat' ? 'stage stage-flush' : 'stage'}>
        {view === 'decks' ? (
          <DecksView
            decks={decks}
            slug={slug}
            doc={doc}
            dirty={dirty}
            report={report}
            cards={cards}
            ensure={ensure}
            onOpen={(next) => void open(next)}
            onClose={() => {
              setSlug(null);
              setDoc(null);
              setReport(null);
            }}
            onNew={() => {
              setSlug(null);
              setDoc({ ...EMPTY_DECK });
              setDirty(true);
              setReport(null);
            }}
            onMutate={mutate}
            onSave={(asVersion) => void save(asVersion)}
            onValidate={() => void validate()}
            onDelete={() => void remove()}
            onImported={importDeck}
          />
        ) : null}

        {view === 'cards' ? (
          <CardsView
            hasDeck={doc !== null}
            onAdd={addCard}
            onCache={(found: readonly CardDetail[]) => put(found)}
          />
        ) : null}

        {view === 'stats' ? (
          <StatsView doc={doc} slug={slug} cards={cards} ensure={ensure} />
        ) : null}

        {view === 'chat' ? (
          <ChatView
            decks={decks}
            deck={slug}
            onDeckChange={(next) => {
              if (next) void open(next);
              else {
                setSlug(null);
                setDoc(null);
              }
            }}
          />
        ) : null}
      </main>

      {decksDir ? (
        <div className="statusbar" title={decksDir}>
          {decksDir}
        </div>
      ) : null}

      {notice ? (
        <div className="toast" onClick={() => setNotice(null)}>
          {notice}
        </div>
      ) : null}
    </div>
  );
}
