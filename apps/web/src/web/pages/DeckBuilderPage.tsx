import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useDecks } from '../contexts/Deck';
import { useSearchCards, toCardFormat } from '../hooks/useSearchCards';
import { useDeckValidation } from '../hooks/useDeckValidation';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { DeckValidation } from '../components/DeckValidation';
import { ROUTES } from '../routes';
import type { DeckFormat, DeckCard } from '../../types/deck';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../components/SearchBar/types';

function DeckBuilderPage() {
  const { deckId } = useParams<{ deckId?: string }>();

  const navigate = useNavigate();

  const { getDeck, createDeck, updateDeck } = useDecks();

  const isEditing = Boolean(deckId);

  // Get existing deck if editing
  const existingDeck = deckId ? getDeck(deckId) : undefined;

  // Deck state
  const [deckName, setDeckName] = useState(existingDeck?.name || '');
  const [deckDescription, setDeckDescription] = useState(
    existingDeck?.description || ''
  );
  const [deckFormat, setDeckFormat] = useState<DeckFormat>(
    existingDeck?.format || 'standard'
  );
  const [deckCards, setDeckCards] = useState<DeckCard[]>(
    existingDeck?.cards || []
  );
  const [isDirty, setIsDirty] = useState(false);

  // Card browser state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterByLegality, setFilterByLegality] = useState(true);

  // Search cards with debouncing - returns top 100 sorted by most recent release
  const {
    cards: searchResults,
    isLoading: loading,
    error,
    isError
  } = useSearchCards(searchQuery, { limit: 100 });

  // Convert search results to Pokemon.Card format and filter by legality
  const cards: Pokemon.Card[] = useMemo(() => {
    if (error || isError) return [];
    if (!searchResults) return [];

    let results = searchResults.map((card) => {
      const formatted = toCardFormat(card);
      // Use unknown cast since we have a partial card structure that's compatible
      // with what the UI components actually use
      return {
        ...formatted,
        images: formatted.images
      } as unknown as Pokemon.Card;
    });

    // Filter by legality if enabled and format is standard/expanded
    if (
      filterByLegality &&
      (deckFormat === 'standard' || deckFormat === 'expanded')
    ) {
      results = results.filter((card) => {
        const legality = (card.legalities as Record<DeckFormat, string>)?.[
          deckFormat
        ];
        return legality === 'Legal';
      });
    }

    return results;
  }, [searchResults, filterByLegality, deckFormat, error, isError]);

  // Cards used for deck validation (include all searched cards)
  const allCards = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.map((card) => {
      const formatted = toCardFormat(card);
      return {
        ...formatted,
        images: formatted.images
      } as unknown as Pokemon.Card;
    });
  }, [searchResults]);

  // Initialize from existing deck
  useEffect(() => {
    if (existingDeck) {
      setDeckName(existingDeck.name);
      setDeckDescription(existingDeck.description || '');
      setDeckFormat(existingDeck.format);
      setDeckCards(existingDeck.cards);
    }
  }, [existingDeck]);

  // Validate deck - use allCards for validation (unfiltered by legality display)
  const validation = useDeckValidation(deckCards, allCards, deckFormat);

  const { totalCards, isValid } = validation;

  // Get card details for deck display - search through all available cards
  const deckCardsWithDetails = useMemo(() => {
    return deckCards
      .map((deckCard) => {
        const cardDetail = allCards.find((c) => c.id === deckCard.card.id);
        return cardDetail
          ? { ...cardDetail, quantity: deckCard.quantity }
          : null;
      })
      .filter(Boolean) as Array<{ quantity: number } & Pokemon.Card>;
  }, [deckCards, allCards]);

  // Handle search - debouncing is handled by useSearchCards
  const handleSearch = useCallback((filters: SearchFilters) => {
    setSearchQuery(filters.query);
  }, []);

  // Add card to deck
  const handleAddCard = useCallback((card: Pokemon.Card) => {
    setDeckCards((prev) => {
      const existing = prev.find((c) => c.card.id === card.id);
      if (existing) {
        // Check 4-of rule (basic energy exempt)
        const isBasicEnergy =
          card.supertype === 'Energy' && card.subtypes?.includes('Basic');
        if (!isBasicEnergy && existing.quantity >= 4) {
          return prev;
        }
        return prev.map((c) =>
          c.card.id === card.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { quantity: 1, card: card as unknown as DeckCard['card'] }];
    });
    setIsDirty(true);
  }, []);

  // Remove card from deck
  const handleRemoveCard = useCallback((cardId: string) => {
    setDeckCards((prev) => {
      const existing = prev.find((c) => c.card.id === cardId);
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.card.id === cardId ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      return prev.filter((c) => c.card.id !== cardId);
    });
    setIsDirty(true);
  }, []);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (
      isDirty &&
      !confirm('You have unsaved changes. Are you sure you want to leave?')
    ) {
      return;
    }
    if (isEditing && deckId) {
      navigate(ROUTES.DECK_DETAIL(deckId));
    } else {
      navigate(ROUTES.DECKS);
    }
  }, [isDirty, isEditing, deckId, navigate]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!deckName.trim()) {
      alert('Please enter a deck name');
      return;
    }

    if (isEditing && deckId) {
      await updateDeck(deckId, {
        name: deckName,
        description: deckDescription || undefined,
        format: deckFormat,
        cards: deckCards
      });
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
  }, [
    deckName,
    deckDescription,
    deckFormat,
    deckCards,
    isEditing,
    deckId,
    createDeck,
    updateDeck,
    navigate
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
            onChange={(e) => {
              setDeckName(e.target.value);
              setIsDirty(true);
            }}
          />
          <select
            className="deck-builder-page__format-select"
            value={deckFormat}
            onChange={(e) => {
              setDeckFormat(e.target.value as DeckFormat);
              setIsDirty(true);
            }}
          >
            <option value="standard">Standard</option>
            <option value="expanded">Expanded</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </div>
        <div className="deck-builder-page__header-center">
          <span
            className={`deck-builder-page__card-count ${isValid ? 'deck-builder-page__card-count--valid' : ''}`}
          >
            {totalCards}/60
          </span>
        </div>
        <div className="page__header-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleSave}
          >
            Save Deck
          </button>
        </div>
      </div>

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
              columns={3}
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
            <DeckValidation validation={validation} compact />
          </div>
          <div className="deck-builder-page__panel-content deck-builder-page__deck-list">
            {deckCards.length === 0 ? (
              <div className="deck-builder-page__empty">
                <p>Click cards to add them to your deck</p>
              </div>
            ) : (
              deckCardsWithDetails.map((card) => (
                <div key={card.id} className="deck-builder-page__deck-card">
                  <img
                    src={card.images?.small}
                    alt={card.name}
                    className="deck-builder-page__deck-card-image"
                  />
                  <div className="deck-builder-page__deck-card-info">
                    <span className="deck-builder-page__deck-card-name">
                      {card.name}
                    </span>
                    <div className="deck-builder-page__deck-card-controls">
                      <button
                        type="button"
                        className="deck-builder-page__qty-btn"
                        onClick={() => handleRemoveCard(card.id)}
                      >
                        -
                      </button>
                      <span className="deck-builder-page__qty">
                        {card.quantity}
                      </span>
                      <button
                        type="button"
                        className="deck-builder-page__qty-btn"
                        onClick={() => handleAddCard(card)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
            {/* Show cards without details */}
            {deckCards
              .filter(
                (dc) => !deckCardsWithDetails.find((d) => d.id === dc.card.id)
              )
              .map((dc) => (
                <div
                  key={dc.card.id}
                  className="deck-builder-page__deck-card deck-builder-page__deck-card--no-image"
                >
                  <div className="deck-builder-page__deck-card-info">
                    <span className="deck-builder-page__deck-card-name">
                      {`${dc.card.name} (ID: ${dc.card.id}) (Set: ${dc.card.set.name})}`}
                    </span>
                    <div className="deck-builder-page__deck-card-controls">
                      <button
                        type="button"
                        className="deck-builder-page__qty-btn"
                        onClick={() => handleRemoveCard(dc.card.id)}
                      >
                        -
                      </button>
                      <span className="deck-builder-page__qty">
                        {dc.quantity}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
          {deckCards.length > 0 &&
            (validation.errors.length > 0 ||
              validation.warnings.length > 0) && (
              <div className="deck-builder-page__panel-footer deck-builder-page__validation">
                <DeckValidation
                  validation={validation}
                  showBreakdown={false}
                  showDetails
                />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default DeckBuilderPage;
