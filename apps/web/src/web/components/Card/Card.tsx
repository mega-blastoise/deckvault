import React from 'react';
import type { CardProps } from './types';
import { Badge } from '../Badge';
import { useTheme } from '../../themes';
import { useCardHover } from '../../motion/hooks/useCardHover';
import { getCardFormatBadge, FORMAT_BADGE_LABELS, FORMAT_BADGE_TITLES } from '../../lib/card-legality-display';
import './Card.css';

const RARITY_GLOW_COLORS: Record<string, string> = {
  'Rare Holo': 'rgba(123, 97, 255, 0.4)',
  'Rare Holo EX': 'rgba(123, 97, 255, 0.5)',
  'Rare Ultra': 'rgba(244, 114, 182, 0.4)',
  'Rare Secret': 'rgba(251, 191, 36, 0.4)',
  'Rare Holo GX': 'rgba(123, 97, 255, 0.5)',
  'Rare Holo V': 'rgba(123, 97, 255, 0.5)',
  'Rare Holo VMAX': 'rgba(244, 114, 182, 0.5)',
  'Rare Rainbow': 'rgba(244, 114, 182, 0.5)'
};

export function Card({
  card,
  variant = 'grid',
  onSelect,
  selected = false,
  className = ''
}: CardProps) {
  const { theme } = useTheme();
  const enableHover = theme === 'nebula' && variant === 'grid';

  const glowColor = card.rarity
    ? (RARITY_GLOW_COLORS[card.rarity] ?? 'rgba(32, 129, 226, 0.4)')
    : 'rgba(32, 129, 226, 0.4)';

  const { cardRef, glowRef } = useCardHover({
    glowColor,
    glow: enableHover,
    tilt: enableHover,
    scale: enableHover ? 1.02 : 1
  });

  const classNames = [
    'pokemon-card',
    `pokemon-card--${variant}`,
    selected && 'pokemon-card--selected',
    onSelect && 'pokemon-card--clickable',
    className
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (onSelect) {
      onSelect(card);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect(card);
    }
  };

  if (variant === 'list') {
    return (
      <div
        className={classNames}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={onSelect ? 0 : undefined}
        role={onSelect ? 'button' : undefined}
      >
        <div className="pokemon-card__list-image">
          <img src={card.images.small} alt={card.name} loading="lazy" />
        </div>
        <div className="pokemon-card__list-content">
          <div className="pokemon-card__header">
            <h3 className="pokemon-card__name">{card.name}</h3>
            {card.hp && <span className="pokemon-card__hp">{card.hp} HP</span>}
          </div>
          <div className="pokemon-card__types">
            {card.types?.map((type) => (
              <Badge
                key={type}
                variant="type"
                pokemonType={type as any}
                size="small"
              >
                {type}
              </Badge>
            ))}
          </div>
          <div className="pokemon-card__meta">
            <span className="pokemon-card__set">{card.set.name}</span>
            <span className="pokemon-card__number">#{card.number}</span>
            {card.rarity && (
              <Badge variant="rarity" rarity={card.rarity as any} size="small">
                {card.rarity}
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  const cardLegalities = card.legalities as
    | { standard?: string; expanded?: string; unlimited?: string }
    | undefined;
  const legalityBadge = cardLegalities ? getCardFormatBadge({ legalities: cardLegalities }) : null;

  return (
    <div
      ref={enableHover ? cardRef : undefined}
      className={classNames}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
    >
      {enableHover && <div ref={glowRef} className="pokemon-card__glow" />}
      <div className="pokemon-card__image">
        <img src={card.images.small} alt={card.name} loading="lazy" />
        {legalityBadge && (
          <span
            className={`pokemon-card__legality-badge pokemon-card__legality-badge--${legalityBadge}`}
            title={FORMAT_BADGE_TITLES[legalityBadge]}
          >
            {FORMAT_BADGE_LABELS[legalityBadge]}
          </span>
        )}
      </div>
      <div className="pokemon-card__content">
        <div className="pokemon-card__header">
          <h3 className="pokemon-card__name">{card.name}</h3>
          {card.hp && <span className="pokemon-card__hp">{card.hp} HP</span>}
        </div>
        {card.types && card.types.length > 0 && (
          <div className="pokemon-card__types">
            {card.types.map((type) => (
              <Badge
                key={type}
                variant="type"
                pokemonType={type as any}
                size="small"
              >
                {type}
              </Badge>
            ))}
          </div>
        )}
        {variant === 'detail' && (
          <>
            {card.subtypes && card.subtypes.length > 0 && (
              <div className="pokemon-card__subtypes">
                {card.subtypes.join(' • ')}
              </div>
            )}
            {card.attacks && card.attacks.length > 0 && (
              <div className="pokemon-card__attacks">
                <h4>Attacks</h4>
                {card.attacks.map((attack, idx) => (
                  <div key={idx} className="pokemon-card__attack">
                    <div className="pokemon-card__attack-header">
                      <span className="pokemon-card__attack-name">
                        {attack.name}
                      </span>
                      <span className="pokemon-card__attack-damage">
                        {attack.damage}
                      </span>
                    </div>
                    {attack.text && (
                      <p className="pokemon-card__attack-text">{attack.text}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="pokemon-card__footer">
          <span className="pokemon-card__set">{card.set.name}</span>
          {card.rarity && (
            <Badge variant="rarity" rarity={card.rarity as any} size="small">
              {card.rarity}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
