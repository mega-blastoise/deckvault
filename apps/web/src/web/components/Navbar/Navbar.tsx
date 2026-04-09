import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Layers, Search, LogIn, TrendingUp, Plus, Shield, Grid3x3 } from 'lucide-react';
import { ROUTES } from '@/web/routes';
import { useCollectionQuery } from '@/web/hooks/useCollectionQuery';
import { useDecks } from '@/web/contexts/Deck';
import { useAuth } from '@/web/contexts/Auth';
import { ThemeToggle } from '@/web/components/ThemeToggle';
import { ReportMatchModal } from '@/web/components/ReportMatchModal';
import './Navbar.css';

function DeckVaultIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="navbar__logo-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bottom card */}
      <rect x="3" y="8" width="16" height="12" rx="2" fill="currentColor" opacity="0.3" />
      {/* Middle card */}
      <rect x="2" y="5" width="16" height="12" rx="2" fill="currentColor" opacity="0.6" />
      {/* Top card */}
      <rect x="1" y="2" width="16" height="12" rx="2" fill="currentColor" />
      {/* Highlight stripe */}
      <rect x="4" y="5" width="7" height="1.5" rx="0.75" fill="white" opacity="0.4" />
    </svg>
  );
}

export function Navbar() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { uniqueCards } = useCollectionQuery();
  const { deckCount } = useDecks();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
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
        <Link to="/" className="navbar__logo">
          <DeckVaultIcon size={22} />
          <span className="navbar__logo-text">DeckVault</span>
        </Link>

        <div className="navbar__links">
          <Link
            to={ROUTES.BROWSE}
            className={`navbar__link ${isActive(ROUTES.BROWSE) ? 'navbar__link--active' : ''}`}
          >
            <Search size={18} />
            <span>Browse</span>
          </Link>
          <Link
            to={ROUTES.SETS}
            className={`navbar__link ${isActive(ROUTES.SETS) ? 'navbar__link--active' : ''}`}
          >
            <Grid3x3 size={18} />
            <span>Sets</span>
          </Link>
          <Link
            to={ROUTES.DECKS}
            className={`navbar__link ${isActive(ROUTES.DECKS) ? 'navbar__link--active' : ''}`}
          >
            <Layers size={18} />
            <span>Decks</span>
            {deckCount > 0 && (
              <span className="navbar__badge">{deckCount}</span>
            )}
          </Link>
          <Link
            to={ROUTES.META_DECKS}
            className={`navbar__link ${isActive(ROUTES.META_DECKS) ? 'navbar__link--active' : ''}`}
          >
            <TrendingUp size={18} />
            <span>Meta</span>
          </Link>
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
                  <Link to={ROUTES.DECKS} className="navbar__dropdown-item">
                    My Decks
                  </Link>
                  {isAdmin && (
                    <Link to={ROUTES.ADMIN} className="navbar__dropdown-item navbar__dropdown-item--admin">
                      <Shield size={14} />
                      Admin
                    </Link>
                  )}
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
            <Link to="/sign-in" className="button button--secondary">
              <LogIn size={16} />
              <span style={{ marginLeft: '0.375rem' }}>Sign in</span>
            </Link>
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
