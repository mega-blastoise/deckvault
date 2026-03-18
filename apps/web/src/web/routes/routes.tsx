import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';

import BrowsePage from '../pages/BrowsePage';
import CollectionPage from '../pages/CollectionPage';
import DashboardPage from '../pages/DashboardPage';
import DecksPage from '../pages/DecksPage';
import DeckBrowsePage from '../pages/DeckBrowsePage';
import DeckBuilderPage from '../pages/DeckBuilderPage';
import DeckDetailPage from '../pages/DeckDetailPage';
import CardPage from '../pages/CardPage';
import SignInPage from '../pages/SignInPage';
import { ProtectedRoute } from '../components/ProtectedRoute';

export const REACT_ROUTER_ROUTES: RouteObject[] = [
  {
    path: '/',
    index: true,
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: '/browse',
    Component: BrowsePage
  },
  {
    path: '/dashboard',
    Component: DashboardPage
  },
  {
    path: '/sign-in',
    Component: SignInPage
  },
  {
    path: '/decks/browse',
    Component: DeckBrowsePage
  },
  {
    path: '/decks',
    element: (
      <ProtectedRoute>
        <DecksPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/decks/new',
    element: (
      <ProtectedRoute>
        <DeckBuilderPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/decks/:deckId/edit',
    element: (
      <ProtectedRoute>
        <DeckBuilderPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/decks/:deckId',
    Component: DeckDetailPage
  },
  {
    path: '/cards/:cardId',
    Component: CardPage
  },
  {
    path: '/collection/:cardId',
    element: (
      <ProtectedRoute>
        <CollectionPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/collection',
    element: (
      <ProtectedRoute>
        <CollectionPage />
      </ProtectedRoute>
    )
  }
];
