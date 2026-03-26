import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDecks } from '../contexts/Deck';
import { useSearchCards, toCardFormat } from '../hooks/useSearchCards';
import { useDeckValidation } from '../hooks/useDeckValidation';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { DeckValidation } from '../components/DeckValidation';
import { DeckBuilderList } from '../components/DeckBuilderList';
import { DeckBuilderVisual } from '../components/DeckBuilderVisual';
import { getCardLegalityIssue } from '../lib/deck-legality';
import { exportToPtcgl } from '../lib/ptcgl-codec';
import { PtcglImportModal } from '../components/PtcglImportModal';
import { DecksService } from '../services/DecksService';
import { DECKS_QUERY_KEY } from '../hooks/useDecksQuery';
import { deckQueryKey } from '../hooks/useDeckQuery';
import { ROUTES } from '../routes';
import type { DeckFormat, DeckCard } from '../../types/deck';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../components/SearchBar/types';

type BuilderView = 'list' | 'visual';

interface CloneMetaDeck {
  name: string;
  format: string;
  cards: { card: { id: string; name: string; supertype: string; subtypes?: string[]; number?: string; regulationMark?: string; images?: { small?: string; large?: string }; set: { id: string; name: string } }; quantity: number }[];
}

function DeckBuilderPage() {
  const { deckId } = useParams<{ deckId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { cloneFromMetaDeck } = (location.state ?? {}) as { cloneFromMetaDeck?: CloneMetaDeck };

  const { getDeck, createDeck } = useDecks();

  const isEditing = Boolean(deckId);
  const existingDeck = deckId ? getDeck(deckId) : undefined;

  const [deckName, setDeckName] = useState(
    cloneFromMetaDeck ? `${cloneFromMetaDeck.name} (Copy)` : existingDeck?.name || ''
  );
  const [deckDescription, setDeckDescription] = useState(existingDeck?.description || '');
  const [deckFormat, setDeckFormat] = useState<DeckFormat>(
    (cloneFromMetaDeck?.format as DeckFormat) ?? existingDeck?.format ?? 'standard'
  );
  const [deckCards, setDeckCards] = useState<DeckCard[]>(
    cloneFromMetaDeck
      ? (cloneFromMetaDeck.cards as unknown as DeckCard[])
      : existingDeck?.cards || []
  );
  const [isDirty, setIsDirty] = useState(Boolean(cloneFromMetaDeck));
  const [versionLabel, setVersionLabel] = useState('');
  const [view, setView] = useState<BuilderView>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterByLegality, setFilterByLegality] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const exportCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    cards: searchResults,
    isLoading: loading,
    error,
    isError
  } = useSearchCards(searchQuery, { limit: 100 });

  const cards: Pokemon.Card[] = useMemo(() => {
    if (error || isError) return [];
    if (!searchResults) return [];

    let results = searchResults.map((card) => {
      const formatted = toCardFormat(card);
      return { ...formatted, images: formatted.images } as unknown as Pokemon.Card;
    });

    if (filterByLegality && (deckFormat === 'standard' || deckFormat === 'expanded')) {
      results = results.filter((card) => {
        const legality = (card.legalities as Record<DeckFormat, string>)?.[deckFormat];
        return legality === 'Legal';
      });
    }

    return results;
  }, [searchResults, filterByLegality, deckFormat, error, isError]);

  const allCards = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.map((card) => {
      const formatted = toCardFormat(card);
      return { ...formatted, images: formatted.images } as unknown as Pokemon.Card;
    });
  }, [searchResults]);

  useEffect(() => {
    if (existingDeck) {
      setDeckName(existingDeck.name);
      setDeckDescription(existingDeck.description || '');
      setDeckFormat(existingDeck.format);
      setDeckCards(existingDeck.cards);
    }
  }, [existingDeck]);

  const validation = useDeckValidation(deckCards, allCards, deckFormat);
  const { totalCards, isValid } = validation;

  const legalityIssues = useMemo(
    () =>
      deckCards
        .map((dc) => getCardLegalityIssue(dc.card, deckFormat, deckCards))
        .filter((issue): issue is NonNullable<typeof issue> => issue !== null),
    [deckCards, deckFormat]
  );

  const legalityMap = useMemo(
    () => new Map(legalityIssues.map((i) => [i.cardId, i])),
    [legalityIssues]
  );

  const handleSearch = useCallback((filters: SearchFilters) => {
    setSearchQuery(filters.query);
  }, []);

  const handleAddCard = useCallback((card: Pokemon.Card) => {
    setDeckCards((prev) => {
      const existing = prev.find((c) => c.card.id === card.id);
      if (existing) {
        const isBasicEnergy = card.supertype === 'Energy' && card.subtypes?.includes('Basic');
        if (!isBasicEnergy && existing.quantity >= 4) return prev;
        return prev.map((c) =>
          c.card.id === card.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { quantity: 1, card: card as unknown as DeckCard['card'] }];
    });
    setIsDirty(true);
  }, []);

  const handleAddOne = useCallback((cardId: string) => {
    setDeckCards((prev) => {
      const dc = prev.find((c) => c.card.id === cardId);
      if (!dc) return prev;
      const isBasicEnergy = dc.card.supertype === 'Energy' && !dc.card.subtypes?.includes('Special');
      if (!isBasicEnergy && dc.quantity >= 4) return prev;
      return prev.map((c) => c.card.id === cardId ? { ...c, quantity: c.quantity + 1 } : c);
    });
    setIsDirty(true);
  }, []);

  const handleRemoveOne = useCallback((cardId: string) => {
    setDeckCards((prev) => {
      const existing = prev.find((c) => c.card.id === cardId);
      if (existing && existing.quantity > 1) {
        return prev.map((c) => c.card.id === cardId ? { ...c, quantity: c.quantity - 1 } : c);
      }
      return prev.filter((c) => c.card.id !== cardId);
    });
    setIsDirty(true);
  }, []);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setDeckCards((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    if (deckCards.length === 0) return;
    const text = exportToPtcgl(deckCards);
    navigator.clipboard.writeText(text).then(() => {
      setExportCopied(true);
      if (exportCopiedTimerRef.current) clearTimeout(exportCopiedTimerRef.current);
      exportCopiedTimerRef.current = setTimeout(() => setExportCopied(false), 2000);
    });
  }, [deckCards]);

  const handleImport = useCallback((cards: DeckCard[]) => {
    setDeckCards(cards);
    setIsDirty(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (isDirty && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
    if (isEditing && deckId) {
      navigate(ROUTES.DECK_DETAIL(deckId));
    } else {
      navigate(ROUTES.DECKS);
    }
  }, [isDirty, isEditing, deckId, navigate]);

  const handleSave = useCallback(async () => {
    if (!deckName.trim()) {
      alert('Please enter a deck name');
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing && deckId) {
        const svc = new DecksService();
        await svc.updateDeck(deckId, {
          name: deckName,
          description: deckDescription || undefined,
          format: deckFormat,
          cards: deckCards,
          versionLabel: versionLabel || undefined
        });
        queryClient.invalidateQueries({ queryKey: DECKS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: deckQueryKey(deckId) });
        setIsDirty(false);
        setVersionLabel('');
        navigate(ROUTES.DECK_DETAIL(deckId));
      } else {
        const newDeck = await createDeck({
          name: deckName,
          description: deckDescription || undefined,
          format: deckFormat,
          cards: deckCards
        });
        navigate(ROUTES.DECK_DETAIL(newDeck.id));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    deckName, deckDescription, deckFormat, deckCards, versionLabel,
    isEditing, deckId, createDeck, navigate, queryClient
  ]);

  return (
    <div className="page deck-builder-page">
      <div className="page__header deck-builder-page__header">
        <div className="deck-builder-page__header-left">
          <input
            type="text"
            className="deck-builder-page__name-input"
            placeholder="Deck Name"
            value={deckName}
            onChange={(e) => { setDeckName(e.target.value); setIsDirty(true); }}
          />
          <select
            className="deck-builder-page__format-select"
            value={deckFormat}
            onChange={(e) => { setDeckFormat(e.target.value as DeckFormat); setIsDirty(true); }}
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
          <button type="button" className="button button--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleSave}
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
            onChange={(e) => setVersionLabel(e.target.value)}
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
                    onChange={(e) => setFilterByLegality(e.target.checked)}
                  />
                  <span>Legal only</span>
                </label>
              )}
            </div>
          </div>
          <div className="deck-builder-page__panel-search">
            <SearchBar onSearch={handleSearch} placeholder="Search cards..." />
          </div>
          <div className="deck-builder-page__panel-content">
            <CardGrid
              cards={cards}
              onCardSelect={handleAddCard}
              loading={loading}
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
                onAddOne={handleAddOne}
                onRemoveOne={handleRemoveOne}
                onReorder={handleReorder}
              />
            ) : (
              <DeckBuilderVisual
                cards={deckCards}
                legalityMap={legalityMap}
                onAddOne={handleAddOne}
                onRemoveOne={handleRemoveOne}
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
        onImport={handleImport}
      />
    </div>
  );
}

export default DeckBuilderPage;
