import React from 'react';
import { Link } from 'react-router';
import { Layers } from 'lucide-react';
import { DeckList } from '../../components/DeckList';
import { Modal } from '../../components/Modal';
import { ROUTES } from '../../routes';
import { pipeline } from '../../utils/pipeline';
import type { DeckFormat } from '../../../types/deck';
import type { DecksPageViewProps } from './types';

function DecksPageViewComponent({
  headerRef,
  deckListRef,
  formatFilter,
  deckToDelete,
  deckCount,
  isLoading,
  deckItems,
  onFormatFilterChange,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onDeckClick
}: DecksPageViewProps) {
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

      <div className="decks-page__toolbar">
        <div className="decks-page__format-filter">
          {(['all', 'standard', 'expanded', 'unlimited'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`decks-page__filter-btn ${formatFilter === f ? 'decks-page__filter-btn--active' : ''}`}
              onClick={() => onFormatFilterChange(f as DeckFormat | 'all')}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div ref={deckListRef} className="page__content">
        <DeckList
          decks={deckItems}
          onDeckEdit={onEdit}
          onDeckDelete={onDelete}
          onDeckSelect={(deck) => onDeckClick(deck.id)}
        />
      </div>

      <Modal
        isOpen={!!deckToDelete}
        onClose={onCancelDelete}
        title="Delete Deck"
        size="small"
        footer={
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={onCancelDelete}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={onConfirmDelete}
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

export const DecksPageView = pipeline(React.memo)(DecksPageViewComponent);
