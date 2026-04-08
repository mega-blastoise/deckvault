import React from 'react';
import type { DeckInputMode, DeckInputPanelProps } from './types';
import { SavedDeckPicker } from './SavedDeckPicker';
import { PtcglPasteInput } from './PtcglPasteInput';
import { MetaDeckPicker } from './MetaDeckPicker';

interface DeckInputPanelViewProps extends DeckInputPanelProps {
  readonly activeMode: DeckInputMode;
  readonly onModeChange: (mode: DeckInputMode) => void;
}

const TABS: Array<{ mode: DeckInputMode; label: string }> = [
  { mode: 'saved', label: 'My Decks' },
  { mode: 'paste', label: 'Paste List' },
  { mode: 'meta', label: 'Meta Decks' }
];

const SOURCE_LABEL: Record<string, string> = {
  saved: 'Saved deck',
  paste: 'Pasted list',
  meta: 'Meta archetype'
};

export function DeckInputPanelView({
  label,
  activeMode,
  onModeChange,
  onDeckResolved,
  onDeckCleared,
  resolvedDeck,
  showMetaOnly
}: DeckInputPanelViewProps) {
  const visibleTabs = showMetaOnly ? TABS.filter((t) => t.mode === 'meta') : TABS;

  return (
    <div className="deck-input-panel">
      <div className="deck-input-panel__header">
        <h3 className="deck-input-panel__label">{label}</h3>
      </div>

      {resolvedDeck ? (
        <div className="deck-input-panel__resolved-state">
          <div className="deck-input-panel__resolved-check">
            ✓ {SOURCE_LABEL[resolvedDeck.source] ?? 'Deck'} selected
          </div>
          <p className="deck-input-panel__resolved-deck-name">{resolvedDeck.name}</p>
          <p className="deck-input-panel__resolved-deck-meta">{resolvedDeck.totalCards} cards</p>
          <button
            type="button"
            className="deck-input-panel__change-btn"
            onClick={onDeckCleared}
          >
            Change deck
          </button>
        </div>
      ) : (
        <>
          {!showMetaOnly && (
            <div className="deck-input-panel__tabs" role="tablist">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.mode}
                  type="button"
                  role="tab"
                  aria-selected={activeMode === tab.mode}
                  className={`deck-input-panel__tab${activeMode === tab.mode ? ' deck-input-panel__tab--active' : ''}`}
                  onClick={() => onModeChange(tab.mode)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="deck-input-panel__content" role="tabpanel">
            {activeMode === 'saved' && !showMetaOnly && (
              <SavedDeckPicker onDeckResolved={onDeckResolved} />
            )}
            {activeMode === 'paste' && !showMetaOnly && (
              <PtcglPasteInput onDeckResolved={onDeckResolved} />
            )}
            {activeMode === 'meta' && (
              <MetaDeckPicker onDeckResolved={onDeckResolved} compact={showMetaOnly} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
