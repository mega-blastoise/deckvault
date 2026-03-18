import React, { useState, useRef, useEffect } from 'react';
import { Layers, Library, Box, Search, LogIn } from 'lucide-react';
import { ROUTES } from '@/web/routes';
import { useCollectionQuery } from '@/web/hooks/useCollectionQuery';
import { useDecks } from '@/web/contexts/Deck';
import { useAuth } from '@/web/contexts/Auth';
import { ThemeToggle } from '@/web/components/ThemeToggle';
import './Navbar.css';

function getPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const { uniqueCards } = useCollectionQuery();
  const { deckCount } = useDecks();
  const { user, signOut } = useAuth();
  const pathname = getPathname();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => {
    if (path === ROUTES.DASHBOARD) {
      return pathname === '/' || pathname.startsWith('/dashboard');
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="navbar">
      <div className="navbar__container">
        <a href="/" className="navbar__logo">
          <span className="navbar__logo-text">Pokemon TCG</span>
        </a>

        <div className="navbar__links">
          <a
            href={ROUTES.DASHBOARD}
            className={`navbar__link ${isActive(ROUTES.DASHBOARD) ? 'navbar__link--active' : ''}`}
          >
            <Box size={18} />
            <span>Home</span>
          </a>
          <a
            href={ROUTES.BROWSE}
            className={`navbar__link ${isActive(ROUTES.BROWSE) ? 'navbar__link--active' : ''}`}
          >
            <Search size={18} />
            <span>Browse</span>
          </a>
          <a
            href={ROUTES.DECKS}
            className={`navbar__link ${isActive(ROUTES.DECKS) ? 'navbar__link--active' : ''}`}
          >
            <Layers size={18} />
            <span>Decks</span>
            {deckCount > 0 && (
              <span className="navbar__badge">{deckCount}</span>
            )}
          </a>
          <a
            href={ROUTES.COLLECTION}
            className={`navbar__link ${isActive(ROUTES.COLLECTION) ? 'navbar__link--active' : ''}`}
          >
            <Library size={18} />
            <span>Collection</span>
            {isAuthenticated && uniqueCards > 0 && (
              <span className="navbar__badge">{uniqueCards}</span>
            )}
          </a>
        </div>

        <div className="navbar__actions">
          <ThemeToggle />
          {isAuthenticated && user ? (
            <div className="navbar__user-menu" ref={dropdownRef}>
              <button
                type="button"
                className="navbar__user-btn"
                onClick={() => setShowDropdown((prev) => !prev)}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="navbar__user-avatar"
                  />
                ) : null}
                <span className="navbar__user-name">{user.name}</span>
              </button>
              {showDropdown && (
                <div className="navbar__user-dropdown">
                  <a href={ROUTES.DECKS} className="navbar__dropdown-item">
                    My Decks
                  </a>
                  <a href={ROUTES.COLLECTION} className="navbar__dropdown-item">
                    My Collection
                  </a>
                  <div className="navbar__dropdown-divider" />
                  <button
                    type="button"
                    className="navbar__dropdown-item"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a href="/sign-in" className="button button--secondary">
              <LogIn size={16} />
              <span style={{ marginLeft: '0.375rem' }}>Sign in</span>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
