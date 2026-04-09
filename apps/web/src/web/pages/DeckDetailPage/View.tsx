import React, { use, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Layers, Printer } from 'lucide-react';
import { exportToPtcgl } from '../../lib/ptcgl-codec';
import { Modal } from '../../components/Modal';
import { Badge } from '../../components/Badge';
import { DeckValidation } from '../../components/DeckValidation';
import { DeckPrintView } from '../../components/DeckPrintView';
import { DeckVersionHistory } from '../../components/DeckVersionHistory';
import { ROUTES } from '../../routes';
import { FORMAT_NAMES } from '../../../types/deck';
import { pipeline } from '../../utils/pipeline';
import type { Deck, DeckCard, DeckValidation as DeckValidationType } from '../../../types/deck';
import type { DeckDetailPageViewProps } from './types';

type DeckTab = 'overview' | 'history';

function buildValidation(cards: DeckCard[]): DeckValidationType {
  const breakdown = { pokemon: 0, trainer: 0, energy: 0, basicPokemon: 0 };
  let totalCards = 0;

  for (const dc of cards) {
    totalCards += dc.quantity;
    const st = dc.card.supertype;
    if (st === 'Pok\u00E9mon') {
      breakdown.pokemon += dc.quantity;
      if (dc.card.subtypes?.includes('Basic')) {
        breakdown.basicPokemon += dc.quantity;
      }
    } else if (st === 'Trainer') {
      breakdown.trainer += dc.quantity;
    } else if (st === 'Energy') {
      breakdown.energy += dc.quantity;
    }
  }

  const errors = [];
  if (totalCards !== 60) {
    errors.push({
      code: 'INVALID_DECK_SIZE',
      message: `Deck must contain exactly 60 cards (currently ${totalCards})`
    });
  }
  if (breakdown.basicPokemon === 0 && breakdown.pokemon > 0) {
    errors.push({
      code: 'NO_BASIC_POKEMON',
      message: 'Deck must contain at least 1 Basic Pok\u00E9mon'
    });
  }

  return {
    isValid: errors.length === 0,
    totalCards,
    errors,
    warnings: [],
    breakdown
  };
}

function TiltCard({ card, quantity, onClick }: { card: DeckCard['card']; quantity: number; onClick?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - y) * 24;
      const ry = (x - 0.5) * 24;
      el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.06, 1.06, 1.06)`;
      el.style.setProperty('--shimmer-x', `${x * 100}%`);
      el.style.setProperty('--shimmer-y', `${y * 100}%`);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    el.style.removeProperty('--shimmer-x');
    el.style.removeProperty('--shimmer-y');
  }, []);

  const src = card.images?.small;

  return (
    <div className="deck-detail-page__card-item">
      <div
        ref={ref}
        className="tcg-tilt-card"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {src ? (
          <img src={src} alt={card.name} className="tcg-tilt-card__img" loading="lazy" />
        ) : (
          <div className="tcg-tilt-card__placeholder">
            <Layers size={32} aria-hidden="true" />
          </div>
        )}
        <div className="tcg-tilt-card__shimmer" />
        {quantity > 1 && (
          <span className="tcg-tilt-card__qty">{'\u00D7'}{quantity}</span>
        )}
      </div>
      <div className="deck-detail-page__card-info">
        <span className="deck-detail-page__card-name">{card.name}</span>
        <span className="deck-detail-page__card-set">{card.set.name}</span>
      </div>
    </div>
  );
}

function DeckDetailPageViewComponent({
  deckQuery,
  deckId,
  currentUserId,
  onDelete,
  onNavigateToCard
}: DeckDetailPageViewProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [activeTab, setActiveTab] = useState<DeckTab>('overview');
  const [exportCopied, setExportCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [priceCopied, setPriceCopied] = useState(false);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    if (linkTimerRef.current) clearTimeout(linkTimerRef.current);
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
  }, []);

  const deck = use(deckQuery.promise) as Deck | null | undefined;

  const deckCards = deck?.cards ?? [];

  const validation = useMemo(() => buildValidation(deckCards), [deckCards]);

  const groupedCards = useMemo(() => {
    const groups: Record<string, DeckCard[]> = {
      'Pok\u00E9mon': [],
      Trainer: [],
      Energy: []
    };
    for (const dc of deckCards) {
      const st = dc.card.supertype;
      if (!groups[st]) groups[st] = [];
      groups[st].push(dc);
    }
    return groups;
  }, [deckCards]);

  const handleExport = useCallback(() => {
    if (!deck?.cards.length) return;
    navigator.clipboard.writeText(exportToPtcgl(deck.cards)).then(() => {
      setExportCopied(true);
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
      exportTimerRef.current = setTimeout(() => setExportCopied(false), 2000);
    });
  }, [deck?.cards]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      if (linkTimerRef.current) clearTimeout(linkTimerRef.current);
      linkTimerRef.current = setTimeout(() => setLinkCopied(false), 2000);
    });
  }, []);

  const handlePriceCheck = useCallback(() => {
    if (!deck?.cards.length) return;
    navigator.clipboard.writeText(exportToPtcgl(deck.cards)).then(() => {
      setPriceCopied(true);
      if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
      priceTimerRef.current = setTimeout(() => setPriceCopied(false), 3000);
      window.open('https://www.tcgplayer.com/massentry', '_blank', 'noopener,noreferrer');
    });
  }, [deck?.cards]);

  const handleDeleteConfirm = useCallback(async () => {
    await onDelete();
    setShowDeleteModal(false);
  }, [onDelete]);

  if (deck === undefined) {
    return (
      <div className="page deck-detail-page">
        <div className="page__content">
          <div className="deck-detail-page__loading">Loading deck...</div>
        </div>
      </div>
    );
  }

  if (deck === null) {
    return (
      <div className="page deck-detail-page">
        <div className="page__header">
          <h1>Deck Not Found</h1>
        </div>
        <div className="page__content">
          <div className="page__empty-state">
            <span className="page__empty-icon">
              <Layers size={64} aria-hidden="true" />
            </span>
            <h2>Deck not found</h2>
            <p>The deck you&apos;re looking for doesn&apos;t exist.</p>
            <Link to={ROUTES.DECKS_BROWSE} className="button button--primary">
              Browse Decks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(currentUserId && (deck as { userId?: string }).userId === currentUserId);
  const { totalCards, isValid } = validation;

  return (
    <div className="page deck-detail-page">
      <div className="page__header">
        <div className="deck-detail-page__header-content">
          <h1>{deck.name}</h1>
          <div className="deck-detail-page__meta">
            <Badge variant="primary">{FORMAT_NAMES[deck.format]}</Badge>
            <span className="deck-detail-page__card-count">
              {totalCards}/60 cards
            </span>
            <Badge variant={isValid ? 'success' : 'warning'}>
              {isValid ? 'Valid' : 'Incomplete'}
            </Badge>
          </div>
          {deck.description && (
            <p className="deck-detail-page__description">{deck.description}</p>
          )}
        </div>
        <div className="page__header-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCopyLink}
            title="Copy shareable link"
          >
            {linkCopied ? '✓ Link Copied!' : '🔗 Share'}
          </button>
          {deck.cards.length > 0 && (
            <button
              type="button"
              className="button button--secondary"
              onClick={handlePriceCheck}
              title="Copy deck list and open TCGPlayer mass entry"
            >
              {priceCopied ? '✓ List copied — paste on TCGPlayer!' : '💰 Price Check'}
            </button>
          )}
          {deck.cards.length > 0 && (
            <button
              type="button"
              className="button button--secondary"
              onClick={handleExport}
              title="Copy deck as PTCGL text"
            >
              {exportCopied ? '✓ Copied!' : '↑ Export PTCGL'}
            </button>
          )}
          {deck.cards.length > 0 && (
            <Link
              to={ROUTES.DECK_ANALYTICS(deckId)}
              className="button button--secondary"
            >
              View Analytics
            </Link>
          )}
          {false && deck?.cards?.length && deck?.cards?.length! > 0 && (
            <Link
              to={`${ROUTES.SIMULATE}?deckId=${deckId}&source=saved`}
              className="button button--primary"
            >
              Test This Deck
            </Link>
          )}
          {validation.isValid && isOwner && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setShowPrintView(true)}
            >
              <Printer size={16} aria-hidden="true" />
              Print Deck List
            </button>
          )}
          {isOwner && (
            <>
              <Link
                to={ROUTES.DECK_EDIT(deckId)}
                className="button button--secondary"
              >
                Edit Deck
              </Link>
              <button
                type="button"
                className="button button--danger"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="deck-detail-page__tabs">
        <button
          type="button"
          className={`deck-detail-page__tab${activeTab === 'overview' ? ' deck-detail-page__tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`deck-detail-page__tab${activeTab === 'history' ? ' deck-detail-page__tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History 🕐
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="page__content">
          <DeckVersionHistory deckId={deckId} />
        </div>
      )}

      {/* Overview tab content (stats, validation, cards) */}
      {activeTab === 'overview' && (
      <>

      {/* Deck Stats */}
      <div className="deck-detail-page__stats">
        <div className="deck-detail-page__stat">
          <span className="deck-detail-page__stat-value">
            {validation.breakdown.pokemon}
          </span>
          <span className="deck-detail-page__stat-label">Pokemon</span>
        </div>
        <div className="deck-detail-page__stat">
          <span className="deck-detail-page__stat-value">
            {validation.breakdown.trainer}
          </span>
          <span className="deck-detail-page__stat-label">Trainers</span>
        </div>
        <div className="deck-detail-page__stat">
          <span className="deck-detail-page__stat-value">
            {validation.breakdown.energy}
          </span>
          <span className="deck-detail-page__stat-label">Energy</span>
        </div>
        <div className="deck-detail-page__stat deck-detail-page__stat--highlight">
          <span className="deck-detail-page__stat-value">
            {validation.breakdown.basicPokemon}
          </span>
          <span className="deck-detail-page__stat-label">Basic</span>
        </div>
      </div>

      {/* Validation Status */}
      {deck.cards.length > 0 && (
        <div className="deck-detail-page__validation">
          <DeckValidation
            validation={validation}
            showBreakdown={false}
            showDetails
          />
        </div>
      )}

      {/* Card Groups */}
      <div className="page__content">
        {Object.entries(groupedCards).map(([supertype, cards]) => {
          if (!cards.length) return null;
          const groupTotal = cards.reduce((sum, c) => sum + c.quantity, 0);

          return (
            <div key={supertype} className="deck-detail-page__group">
              <h2 className="deck-detail-page__group-title">
                {supertype} ({groupTotal})
              </h2>
              <div className="deck-detail-page__card-list">
                {cards.map((dc) => (
                  <TiltCard
                    key={dc.card.id}
                    card={dc.card}
                    quantity={dc.quantity}
                    onClick={() => onNavigateToCard(dc.card.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {deck.cards.length === 0 && (
          <div className="page__empty-state">
            <span className="page__empty-icon">
              <Layers size={64} aria-hidden="true" />
            </span>
            <h2>Empty Deck</h2>
            <p>This deck has no cards yet.</p>
            {isOwner && (
              <Link
                to={ROUTES.DECK_EDIT(deckId)}
                className="button button--primary"
              >
                Add Cards
              </Link>
            )}
          </div>
        )}
      </div>

      </> /* end overview tab */
      )}

      {/* Print View Overlay */}
      {showPrintView && (
        <DeckPrintView
          deck={deck}
          onClose={() => setShowPrintView(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Deck"
        size="small"
        footer={
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleDeleteConfirm}
            >
              Delete
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete &ldquo;{deck.name}&rdquo;? This action
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export const DeckDetailPageView = pipeline(React.memo)(DeckDetailPageViewComponent);
