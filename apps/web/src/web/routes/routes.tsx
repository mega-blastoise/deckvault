import React from 'react';
import type { RouteObject } from 'react-router';
import { Outlet } from 'react-router';

import { AppLayout } from '../components/AppLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LandingPage } from '../pages/LandingPage';
import { MetaDeckBrowserPage } from '../pages/MetaDeckBrowserPage';
import BrowsePage from '../pages/BrowsePage';
import CollectionPage from '../pages/CollectionPage';
import DashboardPage from '../pages/DashboardPage';
import DecksPage from '../pages/DecksPage';
import DeckBrowsePage from '../pages/DeckBrowsePage';
import DeckBuilderPage from '../pages/DeckBuilderPage';
import DeckDetailPage from '../pages/DeckDetailPage';
import CardPage from '../pages/CardPage';
import SignInPage from '../pages/SignInPage';

export const REACT_ROUTER_ROUTES: RouteObject[] = [
  // Standalone routes — no Navbar, no AppLayout
  {
    path: '/',
    element: <LandingPage />
  },
  {
    path: '/sign-in',
    Component: SignInPage
  },

  // App shell — all routes rendered inside AppLayout (with Navbar)
  {
    element: (
      <AppLayout>
        <Outlet />
      </AppLayout>
    ),
    children: [
      {
        path: '/browse',
        Component: BrowsePage
      },
      {
        path: '/meta-decks',
        element: <MetaDeckBrowserPage />
      },
      {
        path: '/dashboard',
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        )
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
    ]
  }
];
