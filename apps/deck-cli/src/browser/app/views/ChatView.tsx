/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';

import { streamChat, type DeckSummary } from '../api';

interface ChatEntry {
  readonly role: 'user' | 'assistant' | 'tool' | 'error';
  readonly text: string;
}

interface Session {
  readonly provider: string;
  readonly model: string;
}

const SUGGESTIONS = [
  'What are this deck’s weakest matchups?',
  'Which cards should I cut to make room for more draw?',
  'Explain the main line of play, turn by turn.',
  'Is anything here rotating out of Standard soon?'
];

export function ChatView({
  decks,
  deck,
  onDeckChange
}: {
  readonly decks: DeckSummary[];
  readonly deck: string | null;
  readonly onDeckChange: (slug: string | null) => void;
}): React.ReactElement {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const history = useRef<unknown[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Follow the stream, but only while the reader is already at the bottom —
  // yanking the viewport back down while someone is reading earlier output is
  // the single most irritating thing a streaming transcript can do.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const send = async (text?: string): Promise<void> => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setEntries((prev) => [...prev, { role: 'user', text: message }]);
    setBusy(true);

    try {
      await streamChat({ message, history: history.current, deck }, (event) => {
        const type = event['type'];
        if (type === 'session') {
          setSession({
            provider: String(event['provider'] ?? ''),
            model: String(event['model'] ?? '')
          });
        } else if (type === 'text-delta') {
          const chunk = String(event['text'] ?? '');
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
            }
            return [...prev, { role: 'assistant', text: chunk }];
          });
        } else if (type === 'tool-call') {
          setEntries((prev) => [...prev, { role: 'tool', text: String(event['name'] ?? '') }]);
        } else if (type === 'error' || type === 'notice') {
          setEntries((prev) => [...prev, { role: 'error', text: String(event['text'] ?? '') }]);
        } else if (type === 'done') {
          history.current = (event['messages'] as unknown[]) ?? history.current;
        }
      });
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        { role: 'error', text: err instanceof Error ? err.message : String(err) }
      ]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  };

  const reset = (): void => {
    history.current = [];
    setEntries([]);
  };

  return (
    <div className="chat-view">
      <header className="chat-hd">
        <div className="chat-hd-main">
          <label className="field-inline">
            <span>Deck context</span>
            <select
              value={deck ?? ''}
              onChange={(e) => onDeckChange(e.target.value || null)}
              disabled={busy}
            >
              <option value="">No deck</option>
              {decks
                .filter((d) => d.versionOf === null)
                .map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          {session ? (
            <span className="pill" title="Provider that answered this session">
              {session.provider} · {session.model}
            </span>
          ) : null}
        </div>
        <button onClick={reset} disabled={entries.length === 0 || busy}>
          New chat
        </button>
      </header>

      <div className="chat-scroll" ref={scroller}>
        <div className="chat-thread">
          {entries.length === 0 ? (
            <div className="chat-welcome">
              <h2>Ask about your deck</h2>
              <p className="muted">
                The agent has the full card database and, when a deck is selected, its
                decklist already loaded.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entries.map((e, i) => (
              <div key={i} className={`turn turn-${e.role}`}>
                {e.role === 'tool' ? (
                  <div className="tool-call">
                    <span className="tool-dot" aria-hidden="true">
                      ⏺
                    </span>
                    {e.text}
                  </div>
                ) : (
                  <>
                    {e.role === 'assistant' ? <div className="turn-who">johto</div> : null}
                    <div className="bubble">{e.text}</div>
                  </>
                )}
              </div>
            ))
          )}
          {busy ? (
            <div className="turn turn-assistant">
              <div className="turn-who">johto</div>
              <div className="msg pending">thinking…</div>
            </div>
          ) : null}
        </div>
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          placeholder={deck ? `Ask about ${deck}…` : 'Ask about your deck…'}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          // Enter sends, Shift+Enter breaks the line — the convention every
          // chat UI shares, and the reason this is a textarea not an input.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
