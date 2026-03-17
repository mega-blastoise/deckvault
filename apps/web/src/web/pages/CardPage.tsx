import React, { useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useCard } from '../hooks/useCard';
import { useCollection } from '../contexts/Collection';
import { Badge } from '../components/Badge';
import { useFadeIn } from '../motion/hooks/useFadeIn';
import type { Pokemon } from '@pokemon/clients';

function CardPageTilt({ src, alt }: { src: string; alt: string }) {
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
      const rx = (0.5 - y) * 18;
      const ry = (x - 0.5) * 18;
      el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.04, 1.04, 1.04)`;
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

  return (
    <div
      ref={ref}
      className="card-page__tilt"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <img src={src} alt={alt} className="card-page__tilt-img" />
      <div className="card-page__tilt-shimmer" />
    </div>
  );
}

function AttackRow({ attack }: { attack: Pokemon.Attack }) {
  return (
    <div className="card-page__attack">
      <div className="card-page__attack-header">
        <div className="card-page__attack-cost">
          {attack.cost?.map((energy, i) => (
            <span
              key={i}
              className={`energy-icon energy-icon--${energy.toLowerCase()}`}
            >
              {energy[0]}
            </span>
          ))}
        </div>
        <span className="card-page__attack-name">{attack.name}</span>
        {attack.damage && (
          <span className="card-page__attack-damage">{attack.damage}</span>
        )}
      </div>
      {attack.text && <p className="card-page__attack-text">{attack.text}</p>}
    </div>
  );
}

function CardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { ref: headerRef } = useFadeIn({ y: 16, duration: 0.35 });

  const { data: result, isLoading, isError } = useCard(cardId ?? '');

  // useCard returns APIResponse<Pokemon.Card> where APIResponse.data is the raw JSON body { data: card }
  const apiData = result?.data as { data?: Pokemon.Card } | Pokemon.Card | undefined;
  const card = apiData && 'data' in apiData ? apiData.data : (apiData as Pokemon.Card | undefined);

  const { getQuantity, addCard, removeCard } = useCollection();
  const qty = card ? getQuantity(card.id) : 0;

  if (isLoading) {
    return (
      <div className="page card-page">
        <div className="page__content">
          <div className="card-page__loading">Loading card...</div>
        </div>
      </div>
    );
  }

  if (isError || !card) {
    return (
      <div className="page card-page">
        <div className="page__header">
          <h1>Card Not Found</h1>
        </div>
        <div className="page__content">
          <div className="page__empty-state">
            <h2>Card not found</h2>
            <p>The card you&apos;re looking for doesn&apos;t exist.</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate(-1)}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page card-page">
      {/* Back nav */}
      <div className="card-page__back">
        <button
          type="button"
          className="card-page__back-btn"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </button>
      </div>

      <div ref={headerRef} className="card-page__layout">
        {/* Left: Card image with tilt */}
        <div className="card-page__image-col">
          <CardPageTilt
            src={card.images?.large || card.images?.small || ''}
            alt={card.name}
          />
          {qty > 0 && (
            <div className="card-page__collection-badge">
              In collection: ×{qty}
            </div>
          )}
        </div>

        {/* Right: Card info */}
        <div className="card-page__info-col">
          {/* Name + HP */}
          <div className="card-page__title-row">
            <h1 className="card-page__name">{card.name}</h1>
            {card.hp && <span className="card-page__hp">HP {card.hp}</span>}
          </div>

          {/* Badges */}
          <div className="card-page__badges">
            {(card as Record<string, unknown>).regulationMark && (
              <Badge variant="regulation">
                {String((card as Record<string, unknown>).regulationMark)}
              </Badge>
            )}
            {card.supertype && <Badge variant="primary">{card.supertype}</Badge>}
            {card.subtypes?.map((s: string) => (
              <Badge key={s} variant="secondary">{s}</Badge>
            ))}
            {card.types?.map((t: string) => (
              <Badge key={t} variant="type" pokemonType={t.toLowerCase()}>{t}</Badge>
            ))}
          </div>

          {/* Abilities */}
          {card.abilities && card.abilities.length > 0 && (
            <div className="card-page__section">
              <h3 className="card-page__section-title">Abilities</h3>
              {(card.abilities as Array<{ name: string; type: string; text?: string }>).map((ability, i) => (
                <div key={i} className="card-page__ability">
                  <span className="card-page__ability-name">{ability.name}</span>
                  <span className="card-page__ability-type">{ability.type}</span>
                  {ability.text && (
                    <p className="card-page__ability-text">{ability.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Attacks */}
          {card.attacks && card.attacks.length > 0 && (
            <div className="card-page__section">
              <h3 className="card-page__section-title">Attacks</h3>
              <div className="card-page__attacks">
                {(card.attacks as Pokemon.Attack[]).map((attack: Pokemon.Attack, i: number) => (
                  <AttackRow key={i} attack={attack} />
                ))}
              </div>
            </div>
          )}

          {/* Rules */}
          {card.rules && card.rules.length > 0 && (
            <div className="card-page__section">
              <h3 className="card-page__section-title">Rules</h3>
              <ul className="card-page__rules">
                {(card.rules as string[]).map((rule: string, i: number) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Combat stats */}
          <div className="card-page__combat">
            {card.weaknesses && card.weaknesses.length > 0 && (
              <div className="card-page__combat-group">
                <span className="card-page__combat-label">Weakness</span>
                {(card.weaknesses as Pokemon.Weakness[]).map((w: Pokemon.Weakness, i: number) => (
                  <span key={i} className="card-page__combat-value">
                    {w.type} {w.value}
                  </span>
                ))}
              </div>
            )}
            {card.resistances && card.resistances.length > 0 && (
              <div className="card-page__combat-group">
                <span className="card-page__combat-label">Resistance</span>
                {(card.resistances as Pokemon.Resistance[]).map((r: Pokemon.Resistance, i: number) => (
                  <span key={i} className="card-page__combat-value">
                    {r.type} {r.value}
                  </span>
                ))}
              </div>
            )}
            {card.retreatCost && card.retreatCost.length > 0 && (
              <div className="card-page__combat-group">
                <span className="card-page__combat-label">Retreat Cost</span>
                <span className="card-page__combat-value">
                  {card.retreatCost.length}
                </span>
              </div>
            )}
          </div>

          {/* Set info */}
          <div className="card-page__set">
            <div className="card-page__set-info">
              {card.set?.images?.symbol && (
                <img
                  src={card.set.images.symbol}
                  alt={card.set.name}
                  className="card-page__set-symbol"
                />
              )}
              <div>
                <div className="card-page__set-name">{card.set?.name}</div>
                <div className="card-page__set-number">
                  #{card.number} / {card.set?.printedTotal}
                </div>
              </div>
            </div>
            {card.rarity && (
              <Badge variant="rarity" rarity={card.rarity.toLowerCase()}>
                {card.rarity}
              </Badge>
            )}
          </div>

          {/* Flavor text */}
          {card.flavorText && (
            <p className="card-page__flavor">&ldquo;{card.flavorText}&rdquo;</p>
          )}

          {/* Legality */}
          {card.legalities && (
            <div className="card-page__legality">
              <span className="card-page__legality-label">Legal in:</span>
              {card.legalities.unlimited && (
                <Badge variant={card.legalities.unlimited === 'Legal' ? 'success' : 'error'}>
                  Unlimited
                </Badge>
              )}
              {card.legalities.expanded && (
                <Badge variant={card.legalities.expanded === 'Legal' ? 'success' : 'error'}>
                  Expanded
                </Badge>
              )}
              {(card.legalities as Record<string, string>).standard && (
                <Badge variant={(card.legalities as Record<string, string>).standard === 'Legal' ? 'success' : 'error'}>
                  Standard
                </Badge>
              )}
            </div>
          )}

          {/* Artist */}
          {card.artist && (
            <div className="card-page__artist">
              Illustrated by <strong>{card.artist}</strong>
            </div>
          )}

          {/* Actions */}
          <div className="card-page__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => addCard(card.id)}
            >
              {qty > 0 ? 'Add Another to Collection' : 'Add to Collection'}
            </button>
            {qty > 0 && (
              <button
                type="button"
                className="button button--danger"
                onClick={() => removeCard(card.id)}
              >
                Remove One
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CardPage;
