import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { Layers } from 'lucide-react';
import { useDecks } from '../contexts/Deck';
import { DeckList } from '../components/DeckList';
import { Modal } from '../components/Modal';
import { useFadeIn } from '../motion/hooks/useFadeIn';
import { useStagger } from '../motion/hooks/useStagger';
import { ROUTES } from '../routes';
import type { DeckFormat, FORMAT_NAMES } from '../../types/deck';

function DecksPage() {
  const navigate = useNavigate();
  const { decks, deleteDeck, deckCount, isLoading } = useDecks();

  const { ref: headerRef } = useFadeIn({ y: 20, duration: 0.4 });
  const { containerRef: deckListRef } = useStagger({
    stagger: 0.05,
    y: 25,
    fromScale: 0.97,
    autoPlay: true
  });
  const [formatFilter, setFormatFilter] = useState<DeckFormat | 'all'>('all');
  const [deckToDelete, setDeckToDelete] = useState<string | null>(null);

  // Filter decks by format
  const filteredDecks =
    formatFilter === 'all'
      ? decks
      : decks.filter((deck) => deck.format === formatFilter);

  // Convert decks to DeckList format
  const deckItems = filteredDecks.map((deck) => {
    const cardCount = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

    // Derive cover card: prefer coverCardId match, then first Pokémon, then first card
    const coverSource = deck.coverCardId
      ? deck.cards.find((c) => c.card.id === deck.coverCardId)
      : (deck.cards.find((c) => c.card.supertype === 'Pokémon') ?? deck.cards[0]);

    const coverCard = coverSource?.card.images?.small
      ? {
          id: coverSource.card.id,
          name: coverSource.card.name,
          imageUrl: coverSource.card.images.small
        }
      : undefined;

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      cardCount,
      isValid: cardCount === 60,
      lastModified: deck.updatedAt,
      coverCard
    };
  });

  // Handle deck edit
  const handleEdit = useCallback(
    (deck: { id: string }) => {
      navigate(ROUTES.DECK_EDIT(deck.id));
    },
    [navigate]
  );

  // Handle deck delete
  const handleDelete = useCallback((deck: { id: string }) => {
    setDeckToDelete(deck.id);
  }, []);

  // Confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (deckToDelete) {
      await deleteDeck(deckToDelete);
      setDeckToDelete(null);
    }
  }, [deckToDelete, deleteDeck]);

  // Handle deck click
  const handleDeckClick = useCallback(
    (deckId: string) => {
      navigate(ROUTES.DECK_DETAIL(deckId));
    },
    [navigate]
  );

  // Loading / empty state
  if (isLoading) {
    return (
      <div className="page decks-page">
        <div className="page__header">
          <h1>My Decks</h1>
        </div>
        <div className="page__content">
          <div className="page__empty-state">
            <p>Loading decks...</p>
          </div>
        </div>
      </div>
    );
  }

  if (deckCount === 0) {
    return (
      <div className="page decks-page">
        <div className="page__header">
          <h1>My Decks</h1>
          <p>Manage your Pokemon TCG decks.</p>
        </div>

        <div className="page__content">
          <div className="page__empty-state">
            <span className="page__empty-icon">
              <Layers size={64} aria-hidden="true" />
            </span>
            <h2>No decks yet</h2>
            <p>Create your first deck to get started.</p>
            <Link to={ROUTES.DECK_NEW} className="button button--primary">
              Create Deck
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page decks-page">
      <div ref={headerRef} className="page__header">
        <h1>My Decks</h1>
        <p>
          {deckCount} deck{deckCount !== 1 ? 's' : ''}
        </p>
        <div className="page__header-actions">
          <Link to={ROUTES.DECK_NEW} className="button button--primary">
            + Create New Deck
          </Link>
        </div>
      </div>

      {/* Format Filter */}
      <div className="decks-page__toolbar">
        <div className="decks-page__format-filter">
          <button
            type="button"
            className={`decks-page__filter-btn ${formatFilter === 'all' ? 'decks-page__filter-btn--active' : ''}`}
            onClick={() => setFormatFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`decks-page__filter-btn ${formatFilter === 'standard' ? 'decks-page__filter-btn--active' : ''}`}
            onClick={() => setFormatFilter('standard')}
          >
            Standard
          </button>
          <button
            type="button"
            className={`decks-page__filter-btn ${formatFilter === 'expanded' ? 'decks-page__filter-btn--active' : ''}`}
            onClick={() => setFormatFilter('expanded')}
          >
            Expanded
          </button>
          <button
            type="button"
            className={`decks-page__filter-btn ${formatFilter === 'unlimited' ? 'decks-page__filter-btn--active' : ''}`}
            onClick={() => setFormatFilter('unlimited')}
          >
            Unlimited
          </button>
        </div>
      </div>

      {/* Deck List */}
      <div ref={deckListRef} className="page__content">
        <DeckList
          decks={deckItems}
          onDeckEdit={handleEdit}
          onDeckDelete={handleDelete}
          onDeckSelect={(deck) => handleDeckClick(deck.id)}
        />
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deckToDelete}
        onClose={() => setDeckToDelete(null)}
        title="Delete Deck"
        size="small"
        footer={
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setDeckToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleConfirmDelete}
            >
              Delete
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete this deck? This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}

export default DecksPage;
