import React from 'react';
import IsomorphicRouter, { type RouterLayerProps } from './RouterLayer';

export function AppRoutes(props: RouterLayerProps) {
  return <IsomorphicRouter {...props} />;
}

// Route path constants for type-safe navigation
export const ROUTES = {
  HOME: '/',
  BROWSE: '/browse',
  DASHBOARD: '/dashboard',
  SIGN_IN: '/sign-in',
  DECKS: '/decks',
  DECKS_BROWSE: '/decks/browse',
  META_DECKS: '/meta-decks',
  DECK_NEW: '/decks/new',
  DECK_DETAIL: (deckId: string) => `/decks/${deckId}`,
  DECK_EDIT: (deckId: string) => `/decks/${deckId}/edit`,
  DECK_ANALYTICS: (deckId: string) => `/decks/${deckId}/analytics`,
  CARD: (cardId: string) => `/cards/${cardId}`,
  COLLECTION: '/collection',
  COLLECTION_CARD: (cardId: string) => `/collection/${cardId}`,
  LOCAL_META: '/local-meta',
  SETS: '/sets',
  SET_DETAIL: (setId: string) => `/sets/${setId}`,
  ROTATION: '/rotation',
  CP: '/cp',
  SCAFFOLD: '/scaffold'
} as const;
