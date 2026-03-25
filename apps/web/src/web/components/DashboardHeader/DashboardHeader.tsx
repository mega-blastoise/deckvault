import React from 'react';
import { Link } from 'react-router';
import { ROUTES } from '../../routes';
import { ThemeSwitcher } from '../ThemeSwitcher';
import type { DashboardHeaderProps, Breadcrumb } from './types';
import './DashboardHeader.css';

export function DashboardHeader({
  title,
  showSearch = false,
  onSearch,
  actions,
  breadcrumbs,
  onMenuClick,
  pathname
}: DashboardHeaderProps) {
  // Auto-generate breadcrumbs from current path if not provided
  const defaultBreadcrumbs = generateBreadcrumbs(pathname);
  const displayBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  return (
    <header className="dashboard-header">
      <div className="dashboard-header__left">
        {onMenuClick && (
          <button
            type="button"
            className="dashboard-header__menu-btn"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        {displayBreadcrumbs.length > 0 && (
          <nav
            className="dashboard-header__breadcrumbs"
            aria-label="Breadcrumb"
          >
            <ol>
              <li>
                <Link to={ROUTES.DASHBOARD}>Home</Link>
              </li>
              {displayBreadcrumbs.map((crumb, index) => (
                <li key={crumb.href || index}>
                  <span className="dashboard-header__breadcrumb-separator">
                    /
                  </span>
                  {crumb.href ? (
                    <Link to={crumb.href}>{crumb.label}</Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>

      <div className="dashboard-header__center">
        {title && <h1 className="dashboard-header__title">{title}</h1>}
      </div>

      <div className="dashboard-header__right">
        <ThemeSwitcher variant="compact" />
        {actions}
      </div>
    </header>
  );
}

function generateBreadcrumbs(pathname?: string): Breadcrumb[] {
  // Skip generating breadcrumbs for root
  if (!pathname || pathname === '/') {
    return [];
  }

  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: Breadcrumb[] = [];

  // Map of routes to human-readable labels
  const routeLabels: Record<string, string> = {
    collection: 'My Collection',
    browse: 'Browse Cards',
    decks: 'My Decks',
    new: 'New Deck',
    edit: 'Edit'
  };

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Get label - use map or capitalize the segment
    let label =
      routeLabels[segment] ||
      segment.charAt(0).toUpperCase() + segment.slice(1);

    // For IDs (like deck ID or card ID), show a shorter version
    if (segment.includes('-') && !routeLabels[segment]) {
      label = segment.length > 12 ? `${segment.slice(0, 8)}...` : segment;
    }

    // Last segment should not have a href (current page)
    const isLast = i === segments.length - 1;

    breadcrumbs.push({
      label,
      href: isLast ? undefined : currentPath
    });
  }

  return breadcrumbs;
}
