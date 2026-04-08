import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parsePtcglList, type SetAbbreviationMap } from './ptcgl-parser';
import type { ResolvedDeck } from './types';

interface PtcglPasteInputProps {
  readonly onDeckResolved: (deck: ResolvedDeck) => void;
}

const PLACEHOLDER = `Pokémon: 14
4 Charizard ex OBF 125
2 Charmander OBF 26
...

Trainer: 32
4 Ultra Ball SVI 196
...

Energy: 14
10 Fire Energy SVE 2`;

export function PtcglPasteInput({ onDeckResolved }: PtcglPasteInputProps) {
  const [text, setText] = useState('');
  const [setAbbreviations, setSetAbbreviations] = useState<SetAbbreviationMap>({});
  const [abbreviationsLoaded, setAbbreviationsLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseResult = abbreviationsLoaded ? parsePtcglList(text, setAbbreviations) : null;

  useEffect(() => {
    fetch('/bff/sim/set-abbreviations')
      .then((r) => r.json() as Promise<{ data: SetAbbreviationMap }>)
      .then((json) => {
        setSetAbbreviations(json.data);
        setAbbreviationsLoaded(true);
      })
      .catch(() => setAbbreviationsLoaded(true));
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setText(val), 300);
    e.target.value = val;
  }, []);

  const handleUse = useCallback(() => {
    if (!parseResult?.isValid) return;
    const resolved: ResolvedDeck = {
      name: 'Pasted Deck',
      source: 'paste',
      totalCards: parseResult.totalCards,
      cards: parseResult.cards
        .filter((c) => c.resolved)
        .map((c) => ({ cardId: c.cardId, count: c.count }))
    };
    onDeckResolved(resolved);
  }, [parseResult, onDeckResolved]);

  const countClass = parseResult
    ? parseResult.totalCards === 60
      ? 'deck-input-panel__count--valid'
      : 'deck-input-panel__count--invalid'
    : '';

  return (
    <div className="deck-input-panel__paste">
      <textarea
        className="deck-input-panel__textarea"
        placeholder={PLACEHOLDER}
        defaultValue=""
        onChange={handleChange}
        rows={12}
        spellCheck={false}
      />
      {parseResult && text.trim().length > 0 && (
        <div className="deck-input-panel__parse-status">
          <span className={`deck-input-panel__count ${countClass}`}>
            {parseResult.totalCards} / 60 cards
          </span>
          {parseResult.errors.length > 0 && (
            <ul className="deck-input-panel__parse-errors">
              {parseResult.errors.slice(0, 5).map((err) => (
                <li key={err.line} className="deck-input-panel__parse-error">
                  Line {err.line}: {err.message}
                </li>
              ))}
            </ul>
          )}
          <div className="deck-input-panel__card-preview">
            {parseResult.cards.slice(0, 8).map((c, i) => (
              <span
                key={i}
                className={`deck-input-panel__card-pill ${c.resolved ? 'deck-input-panel__card-pill--ok' : 'deck-input-panel__card-pill--err'}`}
              >
                {c.count}x {c.rawLine.split(' ').slice(1, 3).join(' ')}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="button button--primary"
        disabled={!parseResult?.isValid}
        onClick={handleUse}
      >
        Use This Deck
      </button>
    </div>
  );
}
