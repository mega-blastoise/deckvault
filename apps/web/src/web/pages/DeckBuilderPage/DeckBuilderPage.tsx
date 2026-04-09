import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDecks } from '../../contexts/Deck';
import { useSearchCards, toCardFormat } from '../../hooks/useSearchCards';
import { useDeckValidation } from '../../hooks/useDeckValidation';
import { getCardLegalityIssue } from '../../lib/deck-legality';
import { DecksService } from '../../services/DecksService';
import { DECKS_QUERY_KEY } from '../../hooks/useDecksQuery';
import { deckQueryKey } from '../../hooks/useDeckQuery';
import { ROUTES } from '../../routes';
import { pipeline } from '../../utils/pipeline';
import { DeckBuilderPageView } from './View';
import type { DeckFormat, DeckCard } from '../../../types/deck';
import type { Pokemon } from '@pokemon/clients';
import type { SearchFilters } from '../../components/SearchBar/types';

interface CloneMetaDeck {
  name: string;
  format: string;
  cards: { card: { id: string; name: string; supertype: string; subtypes?: string[]; number?: string; regulationMark?: string; images?: { small?: string; large?: string }; set: { id: string; name: string } }; quantity: number }[];
}

function DeckBuilderPageComponent() {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterByLegality, setFilterByLegality] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleImport = useCallback((importedCards: DeckCard[]) => {
    setDeckCards(importedCards);
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
    <DeckBuilderPageView
      isEditing={isEditing}
      deckId={deckId}
      deckName={deckName}
      deckDescription={deckDescription}
      deckFormat={deckFormat}
      isDirty={isDirty}
      isSaving={isSaving}
      versionLabel={versionLabel}
      searchCards={cards}
      searchLoading={loading}
      filterByLegality={filterByLegality}
      searchQuery={searchQuery}
      deckCards={deckCards}
      legalityMap={legalityMap}
      validation={validation}
      onDeckNameChange={(name: string) => { setDeckName(name); setIsDirty(true); }}
      onDeckDescriptionChange={(desc: string) => { setDeckDescription(desc); setIsDirty(true); }}
      onDeckFormatChange={(format: DeckFormat) => { setDeckFormat(format); setIsDirty(true); }}
      onVersionLabelChange={setVersionLabel}
      onFilterByLegalityChange={setFilterByLegality}
      onSearch={handleSearch}
      onAddCard={handleAddCard}
      onAddOne={handleAddOne}
      onRemoveOne={handleRemoveOne}
      onReorder={handleReorder}
      onImport={handleImport}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}

export const DeckBuilderPage = pipeline(React.memo)(DeckBuilderPageComponent);
