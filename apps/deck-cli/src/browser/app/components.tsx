/** @jsxImportSource react */
import { useCallback, useRef, useState } from 'react';

import { api, type CardDetail } from './api';

export const STANDARD_MARKS = 'HIJ';

/** Decklists are read and counted by supertype, so every surface groups by it. */
export const GROUP_ORDER = ['Pokémon', 'Trainer', 'Energy', 'Other'] as const;
export type Group = (typeof GROUP_ORDER)[number];

export function groupOf(supertype: string | undefined): Group {
  if (!supertype) return 'Other';
  if (/^pok/i.test(supertype)) return 'Pokémon';
  if (/^trainer/i.test(supertype)) return 'Trainer';
  if (/^energy/i.test(supertype)) return 'Energy';
  return 'Other';
}

/**
 * Regulation mark chip. Rotation is a legality signal, so it is carried on the
 * mark itself everywhere one is shown rather than styled per surface.
 */
export function CardMark({
  mark
}: {
  mark: string | null | undefined;
}): React.ReactElement | null {
  if (!mark) return null;
  const legal = STANDARD_MARKS.includes(mark);
  return (
    <span
      className={legal ? 'card-mark' : 'card-mark rotated'}
      title={
        legal ? `Regulation mark ${mark}` : `Regulation mark ${mark} — rotated out of Standard`
      }
    >
      {mark}
    </span>
  );
}

/**
 * Card details are fetched once per id and shared across every view — the deck
 * grid, the gallery covers, search results and the stats table all read the same
 * cache, so switching views never refetches.
 */
export function useCardCache(): {
  cards: Record<string, CardDetail>;
  ensure: (ids: readonly string[]) => void;
  put: (cards: readonly CardDetail[]) => void;
} {
  const [cards, setCards] = useState<Record<string, CardDetail>>({});
  // Tracks ids already requested so a re-render mid-flight doesn't refetch them.
  const inflight = useRef(new Set<string>());

  const put = useCallback((next: readonly CardDetail[]) => {
    if (next.length === 0) return;
    setCards((prev) => {
      const merged = { ...prev };
      for (const card of next) merged[card.id] = card;
      return merged;
    });
  }, []);

  const ensure = useCallback(
    (ids: readonly string[]) => {
      const missing = ids.filter((id) => !inflight.current.has(id));
      if (missing.length === 0) return;
      for (const id of missing) inflight.current.add(id);

      void Promise.all(
        missing.map(async (id) => {
          try {
            return await api.card(id);
          } catch {
            return null;
          }
        })
      ).then((results) => put(results.filter((c): c is CardDetail => c !== null)));
    },
    [put]
  );

  return { cards, ensure, put };
}

/**
 * Card image with a text fallback. Images are remote (images.pokemontcg.io), so
 * a tile has to stay readable when the network is unavailable — which is the
 * normal case for the rest of this tool.
 */
export function CardImage({
  card,
  id
}: {
  card: CardDetail | undefined;
  id: string;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const src = card?.images?.small;

  if (!src || failed) {
    return (
      <div className="card-img card-img-fallback">
        <span className="card-img-name">{card?.name ?? id}</span>
        <span className="card-img-id">{id}</span>
      </div>
    );
  }

  return (
    <img
      className="card-img"
      src={src}
      alt={card?.name ?? id}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/** A card in the deck grid: image, quantity badge, and hover-revealed controls. */
export function CardTile({
  id,
  quantity,
  card,
  onChange
}: {
  id: string;
  quantity: number;
  card: CardDetail | undefined;
  onChange: (quantity: number) => void;
}): React.ReactElement {
  return (
    <figure className="tile">
      <div className="tile-art">
        <CardImage card={card} id={id} />
        <span className="tile-qty">{quantity}×</span>
        <div className="tile-controls">
          <button aria-label={`Remove one ${card?.name ?? id}`} onClick={() => onChange(quantity - 1)}>
            −
          </button>
          <button
            aria-label={`Add one ${card?.name ?? id}`}
            onClick={() => onChange(quantity + 1)}
            disabled={quantity >= 60}
          >
            +
          </button>
        </div>
      </div>
      <figcaption className="tile-cap">
        <span className="tile-name">{card?.name ?? id}</span>
        <span className="tile-meta">
          <CardMark mark={card?.regulationMark} />
          <span className="card-meta">{id}</span>
        </span>
      </figcaption>
    </figure>
  );
}
