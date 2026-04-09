import React, { useState, useCallback, useRef } from 'react';
import { CardGrid } from '../../components/CardGrid';
import { SearchBar } from '../../components/SearchBar';
import { DeckValidation } from '../../components/DeckValidation';
import { DeckBuilderList } from '../../components/DeckBuilderList';
import { DeckBuilderVisual } from '../../components/DeckBuilderVisual';
import { exportToPtcgl } from '../../lib/ptcgl-codec';
import { PtcglImportModal } from '../../components/PtcglImportModal';
import { pipeline } from '../../utils/pipeline';
import type { DeckBuilderPageViewProps } from './types';

type BuilderView = 'list' | 'visual';

function DeckBuilderPageViewComponent(props: DeckBuilderPageViewProps) {
  const {
    isEditing,
    deckName,
    deckFormat,
    isDirty,
    isSaving,
    versionLabel,
    searchCards,
    searchLoading,
    filterByLegality,
    searchQuery,
    deckCards,
    legalityMap,
    validation,
    onDeckNameChange,
    onDeckFormatChange,
    onVersionLabelChange,
    onFilterByLegalityChange,
    onSearch,
    onAddCard,
    onAddOne,
    onRemoveOne,
    onReorder,
    onImport,
    onSave,
    onCancel
  } = props;
  const [view, setView] = useState<BuilderView>('list');
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const exportCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExport = useCallback(() => {
    if (deckCards.length === 0) return;
    const text = exportToPtcgl(deckCards);
    navigator.clipboard.writeText(text).then(() => {
      setExportCopied(true);
      if (exportCopiedTimerRef.current) clearTimeout(exportCopiedTimerRef.current);
      exportCopiedTimerRef.current = setTimeout(() => setExportCopied(false), 2000);
    });
  }, [deckCards]);

  const { totalCards, isValid } = validation;

  return (
    <div className="page deck-builder-page">
      <div className="page__header deck-builder-page__header">
        <div className="deck-builder-page__header-left">
          <input
            type="text"
            className="deck-builder-page__name-input"
            placeholder="Deck Name"
            value={deckName}
            onChange={(e) => onDeckNameChange(e.target.value)}
          />
          <select
            className="deck-builder-page__format-select"
            value={deckFormat}
            onChange={(e) => onDeckFormatChange(e.target.value as typeof deckFormat)}
          >
            <option value="standard">Standard</option>
            <option value="expanded">Expanded</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </div>
        <div className="deck-builder-page__header-center">
          <span className={`deck-builder-page__card-count${isValid ? ' deck-builder-page__card-count--valid' : ''}`}>
            {totalCards}/60
          </span>
        </div>
        <div className="page__header-actions">
          {isDirty && (
            <span className="deck-builder-page__dirty-indicator">Unsaved changes ●</span>
          )}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setShowImportModal(true)}
            title="Import from PTCGL"
          >
            ↓ Import
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={handleExport}
            disabled={deckCards.length === 0}
            title="Copy deck as PTCGL text"
          >
            {exportCopied ? '✓ Copied!' : '↑ Export'}
          </button>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Deck'}
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="deck-builder-page__version-bar">
          <label className="deck-builder-page__version-label-label" htmlFor="deck-version-label">
            Version label
          </label>
          <input
            id="deck-version-label"
            type="text"
            className="deck-builder-page__version-label-input"
            placeholder='e.g. "Pre-Regional"'
            value={versionLabel}
            onChange={(e) => onVersionLabelChange(e.target.value)}
          />
        </div>
      )}

      <div className="deck-builder-page__builder">
        {/* Card Browser Panel */}
        <div className="deck-builder-page__panel deck-builder-page__browser">
          <div className="deck-builder-page__panel-header">
            <h2>Card Browser</h2>
            <div className="deck-builder-page__browser-controls">
              {(deckFormat === 'standard' || deckFormat === 'expanded') && (
                <label className="deck-builder-page__legality-toggle">
                  <input
                    type="checkbox"
                    checked={filterByLegality}
                    onChange={(e) => onFilterByLegalityChange(e.target.checked)}
                  />
                  <span>Legal only</span>
                </label>
              )}
            </div>
          </div>
          <div className="deck-builder-page__panel-search">
            <SearchBar onSearch={onSearch} placeholder="Search cards..." />
          </div>
          <div className="deck-builder-page__panel-content">
            <CardGrid
              cards={searchCards}
              onCardSelect={onAddCard}
              loading={searchLoading}
              columns={2}
              emptyMessage={
                searchQuery.trim()
                  ? filterByLegality
                    ? `No ${deckFormat}-legal cards found for "${searchQuery}"`
                    : `No cards found for "${searchQuery}"`
                  : 'Start typing to search for cards'
              }
            />
          </div>
        </div>

        {/* Deck Contents Panel */}
        <div className="deck-builder-page__panel deck-builder-page__deck">
          <div className="deck-builder-page__panel-header">
            <h2>Deck Contents</h2>
            <div className="deck-builder-page__view-toggle">
              <button
                type="button"
                className={`deck-builder-page__view-btn${view === 'list' ? ' deck-builder-page__view-btn--active' : ''}`}
                onClick={() => setView('list')}
                title="List view"
              >
                ≡ List
              </button>
              <button
                type="button"
                className={`deck-builder-page__view-btn${view === 'visual' ? ' deck-builder-page__view-btn--active' : ''}`}
                onClick={() => setView('visual')}
                title="Visual view"
              >
                ⊞ Visual
              </button>
            </div>
            <DeckValidation validation={validation} compact />
          </div>
          <div className="deck-builder-page__panel-content deck-builder-page__deck-list">
            {view === 'list' ? (
              <DeckBuilderList
                cards={deckCards}
                legalityMap={legalityMap}
                onAddOne={onAddOne}
                onRemoveOne={onRemoveOne}
                onReorder={onReorder}
              />
            ) : (
              <DeckBuilderVisual
                cards={deckCards}
                legalityMap={legalityMap}
                onAddOne={onAddOne}
                onRemoveOne={onRemoveOne}
              />
            )}
          </div>
          {deckCards.length > 0 && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="deck-builder-page__panel-footer deck-builder-page__validation">
              <DeckValidation validation={validation} showBreakdown={false} showDetails />
            </div>
          )}
        </div>
      </div>
      <PtcglImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={onImport}
      />
    </div>
  );
}

export const DeckBuilderPageView = pipeline(React.memo)(DeckBuilderPageViewComponent);
