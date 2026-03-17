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
  DECKS: '/decks',
  DECK_NEW: '/decks/new',
  DECK_DETAIL: (deckId: string) => `/decks/${deckId}`,
  DECK_EDIT: (deckId: string) => `/decks/${deckId}/edit`,
  CARD: (cardId: string) => `/cards/${cardId}`,
  COLLECTION: '/collection',
  COLLECTION_CARD: (cardId: string) => `/collection/${cardId}`
} as const;
