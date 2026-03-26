import React from 'react';
import type { RouteObject } from 'react-router';
import { Outlet } from 'react-router';

import { AppLayout } from '../components/AppLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LandingPage } from '../pages/LandingPage';
import { MetaDeckBrowserPage } from '../pages/MetaDeckBrowserPage';
import { LocalMetaPage } from '../pages/LocalMetaPage';
import BrowsePage from '../pages/BrowsePage';
import CollectionPage from '../pages/CollectionPage';
import DashboardPage from '../pages/DashboardPage';
import DecksPage from '../pages/DecksPage';
import DeckBrowsePage from '../pages/DeckBrowsePage';
import DeckBuilderPage from '../pages/DeckBuilderPage';
import DeckDetailPage from '../pages/DeckDetailPage';
import { DeckAnalyticsPage } from '../pages/DeckAnalyticsPage';
import CardPage from '../pages/CardPage';
import SignInPage from '../pages/SignInPage';
import NotFoundPage from '../pages/NotFoundPage';
import { SetBrowserPage } from '../pages/SetBrowserPage';
import { SetDetailPage } from '../pages/SetDetailPage';
import { RotationPage } from '../pages/RotationPage';
import { CpTrackerPage } from '../pages/CpTrackerPage';
import { ScaffolderPage } from '../pages/ScaffolderPage';

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
        path: '/local-meta',
        element: <LocalMetaPage />
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
        path: '/decks/:deckId/analytics',
        element: <DeckAnalyticsPage />
      },
      {
        path: '/cards/:cardId',
        Component: CardPage
      },
      {
        path: '/sets',
        element: <SetBrowserPage />
      },
      {
        path: '/sets/:setId',
        element: <SetDetailPage />
      },
      {
        path: '/rotation',
        element: <RotationPage />
      },
      {
        path: '/cp',
        element: (
          <ProtectedRoute>
            <CpTrackerPage />
          </ProtectedRoute>
        )
      },
      {
        path: '/scaffold',
        element: <ScaffolderPage />
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
      },
      {
        path: '*',
        Component: NotFoundPage
      }
    ]
  }
];
