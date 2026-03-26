import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useScaffold } from '../../hooks/useScaffold';
import { useAuth } from '@/web/contexts/Auth';
import { DecksService } from '../../services/DecksService';
import { ROUTES } from '../../routes';
import { TIER_META } from '../../../types/scaffold';
import type { ScaffoldDeck, ScaffoldCard, ScaffoldTier } from '../../../types/scaffold';
import './ScaffolderPage.css';

const FORMAT_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'expanded', label: 'Expanded' },
  { value: 'unlimited', label: 'Unlimited' }
] as const;

const decksService = new DecksService();

function frequencyBar(frequency: number) {
  const pct = Math.round(frequency * 100);
  return (
    <div className="scaffolder__freq-bar" title={`${pct}% of cluster decks`}>
      <div className="scaffolder__freq-fill" style={{ width: `${pct}%` }} />
      <span className="scaffolder__freq-label">{pct}%</span>
    </div>
  );
}

interface TierSectionProps {
  tier: ScaffoldTier;
  cards: ScaffoldCard[];
}

function TierSection({ tier, cards }: TierSectionProps) {
  const [open, setOpen] = useState(true);
  const meta = TIER_META[tier];

  if (cards.length === 0) return null;

  const totalQty = cards.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className={`scaffolder__tier scaffolder__tier--${tier}`}>
      <button
        type="button"
        className="scaffolder__tier-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="scaffolder__tier-title">
          <span className={`scaffolder__tier-badge scaffolder__tier-badge--${tier}`}>
            {meta.label}
          </span>
          <span className="scaffolder__tier-desc">{meta.description}</span>
        </div>
        <div className="scaffolder__tier-meta">
          <span className="scaffolder__tier-count">{totalQty} cards</span>
          <span className="scaffolder__tier-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="scaffolder__tier-cards">
          {cards.map((sc) => (
            <div key={sc.card.id} className="scaffolder__card-row">
              {sc.card.images?.small && (
                <img
                  src={sc.card.images.small}
                  alt={sc.card.name}
                  className="scaffolder__card-img"
                  loading="lazy"
                />
              )}
              <div className="scaffolder__card-info">
                <span className="scaffolder__card-name">{sc.card.name}</span>
                <span className="scaffolder__card-set">{sc.card.set.name}</span>
              </div>
              <div className="scaffolder__card-right">
                <span className="scaffolder__card-qty">×{sc.quantity}</span>
                {frequencyBar(sc.frequency)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ScaffoldResultProps {
  deck: ScaffoldDeck;
  onClone: () => void;
  isCloning: boolean;
}

function ScaffoldResult({ deck, onClone, isCloning }: ScaffoldResultProps) {
  const navigate = useNavigate();
  const tiers: ScaffoldTier[] = ['core', 'engine', 'consistency', 'tech'];

  const useCaseUrl = `/browse?mode=use-case`;

  return (
    <div className="scaffolder__result">
      <div className="scaffolder__result-header">
        <div>
          <h2 className="scaffolder__result-title">{deck.archetype}</h2>
          <p className="scaffolder__result-meta">
            Built from {deck.clusterSize} meta deck{deck.clusterSize !== 1 ? 's' : ''} ·{' '}
            {deck.totalCards} cards locked · {deck.flexSlots} flex slot{deck.flexSlots !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          className="scaffolder__clone-btn"
          onClick={onClone}
          disabled={isCloning}
        >
          {isCloning ? 'Creating…' : 'Clone to Deck Builder'}
        </button>
      </div>

      {tiers.map((tier) => (
        <TierSection key={tier} tier={tier} cards={deck[tier]} />
      ))}

      {deck.flexSlots > 0 && (
        <div className="scaffolder__flex">
          <span className="scaffolder__flex-count">
            {deck.flexSlots} flex slot{deck.flexSlots !== 1 ? 's' : ''} remaining
          </span>
          <button
            type="button"
            className="scaffolder__flex-link"
            onClick={() => navigate(useCaseUrl)}
          >
            Search use cases to fill →
          </button>
        </div>
      )}
    </div>
  );
}

export function ScaffolderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [archetype, setArchetype] = useState(searchParams.get('archetype') ?? '');
  const [format, setFormat] = useState(searchParams.get('format') ?? 'standard');
  const [variant, setVariant] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');

  const { mutate, data, isPending, error, reset } = useScaffold();

  const deck: ScaffoldDeck | null = data
    ? (data.data as unknown as { data: ScaffoldDeck }).data
    : null;

  useEffect(() => {
    const a = searchParams.get('archetype');
    const f = searchParams.get('format');
    if (a) setArchetype(a);
    if (f) setFormat(f);
  }, [searchParams]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!archetype.trim()) return;
      reset();
      mutate({
        archetype: archetype.trim(),
        format,
        variant: variant.trim() || undefined
      });
    },
    [archetype, format, variant, mutate, reset]
  );

  const handleClone = useCallback(async () => {
    if (!deck) return;
    if (!isAuthenticated) {
      navigate(ROUTES.SIGN_IN);
      return;
    }

    setIsCloning(true);
    setCloneError('');

    try {
      const allCards = [...deck.core, ...deck.engine, ...deck.consistency, ...deck.tech];
      const cards = allCards.map((sc) => ({
        card: {
          id: sc.card.id,
          name: sc.card.name,
          supertype: sc.card.supertype,
          number: String(sc.card.number),
          set: sc.card.set
        },
        quantity: sc.quantity
      }));

      const result = await decksService.createDeck({
        name: `${deck.archetype} Scaffold`,
        description: `Scaffolded from ${deck.clusterSize} meta decks`,
        format: deck.format as 'standard' | 'expanded' | 'unlimited',
        cards: cards as never
      });

      const newDeck = (result.data as unknown as { data: { id: string } }).data;
      navigate(ROUTES.DECK_EDIT(newDeck.id));
    } catch {
      setCloneError('Failed to create deck. Please try again.');
    } finally {
      setIsCloning(false);
    }
  }, [deck, isAuthenticated, navigate]);

  return (
    <div className="page scaffolder-page">
      <div className="page__header">
        <h1>Scaffold a Deck</h1>
        <p>Generate a meta-aware 60-card foundation in seconds.</p>
      </div>

      <form className="scaffolder__form" onSubmit={handleSubmit}>
        <div className="scaffolder__form-row">
          <div className="scaffolder__field">
            <label className="scaffolder__label" htmlFor="scaffolder-archetype">
              Archetype
            </label>
            <input
              id="scaffolder-archetype"
              type="text"
              className="scaffolder__input"
              placeholder="e.g. Dragapult, Charizard, Lugia…"
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              required
            />
          </div>

          <div className="scaffolder__field scaffolder__field--sm">
            <label className="scaffolder__label" htmlFor="scaffolder-format">
              Format
            </label>
            <select
              id="scaffolder-format"
              className="scaffolder__select"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="scaffolder__field scaffolder__field--sm">
            <label className="scaffolder__label" htmlFor="scaffolder-variant">
              Variant <span className="scaffolder__optional">(optional)</span>
            </label>
            <input
              id="scaffolder-variant"
              type="text"
              className="scaffolder__input"
              placeholder="e.g. turbo, control…"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="scaffolder__submit"
            disabled={isPending || !archetype.trim()}
          >
            {isPending ? 'Generating…' : 'Generate Scaffold →'}
          </button>
        </div>
      </form>

      {error && (
        <div className="scaffolder__error">
          {(error as Error).message ?? 'Archetype not found. Try a different name.'}
        </div>
      )}

      {cloneError && <div className="scaffolder__error">{cloneError}</div>}

      {deck && (
        <ScaffoldResult deck={deck} onClone={handleClone} isCloning={isCloning} />
      )}
    </div>
  );
}
