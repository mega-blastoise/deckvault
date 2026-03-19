import React, { useState, useRef, useEffect } from 'react';
import { Layers, Search, LogIn, TrendingUp, MapPin, Plus } from 'lucide-react';
import { ROUTES } from '@/web/routes';
import { useCollectionQuery } from '@/web/hooks/useCollectionQuery';
import { useDecks } from '@/web/contexts/Deck';
import { useAuth } from '@/web/contexts/Auth';
import { ThemeToggle } from '@/web/components/ThemeToggle';
import { ReportMatchModal } from '@/web/components/ReportMatchModal';
import './Navbar.css';

function getPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}

interface NavLinkGatedProps {
  label: string;
  tooltip: string;
}

function NavLinkGated({ label, tooltip }: NavLinkGatedProps) {
  return (
    <span
      className="navbar__link navbar__link--gated"
      aria-disabled="true"
      data-tooltip={tooltip}
    >
      <span>{label}</span>
    </span>
  );
}

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const { uniqueCards } = useCollectionQuery();
  const { deckCount } = useDecks();
  const { user, signOut } = useAuth();
  const pathname = getPathname();
  const [showDropdown, setShowDropdown] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
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

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <nav className="navbar">
      <div className="navbar__container">
        <a href="/" className="navbar__logo">
          <span className="navbar__logo-text">DeckVault</span>
        </a>

        <div className="navbar__links">
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
            href={ROUTES.META_DECKS}
            className={`navbar__link ${isActive(ROUTES.META_DECKS) ? 'navbar__link--active' : ''}`}
          >
            <TrendingUp size={18} />
            <span>Meta</span>
          </a>
          <a
            href={ROUTES.LOCAL_META}
            className={`navbar__link ${isActive(ROUTES.LOCAL_META) ? 'navbar__link--active' : ''}`}
          >
            <MapPin size={18} />
            <span>Local Meta</span>
          </a>
          <NavLinkGated label="Collection" tooltip="Coming Soon" />
          <NavLinkGated label="Dashboard" tooltip="Coming Soon" />
        </div>

        <div className="navbar__actions">
          {isAuthenticated && (
            <button
              type="button"
              className="navbar__report-btn"
              onClick={() => setReportModalOpen(true)}
              title="Report a Match"
              aria-label="Report a Match"
            >
              <Plus size={16} />
            </button>
          )}
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
      {isAuthenticated && (
        <ReportMatchModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </nav>
  );
}
