import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Layers, Search, LogIn, TrendingUp, MapPin, Plus, Grid3x3, CalendarDays, Trophy, Shield } from 'lucide-react';
import { ROUTES } from '@/web/routes';
import { useCollectionQuery } from '@/web/hooks/useCollectionQuery';
import { useDecks } from '@/web/contexts/Deck';
import { useAuth } from '@/web/contexts/Auth';
import { ThemeToggle } from '@/web/components/ThemeToggle';
import { ReportMatchModal } from '@/web/components/ReportMatchModal';
import './Navbar.css';

function PokeballIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="navbar__logo-icon"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="47" fill="#f5f5f5"/>
      <path d="M3,50 A47,47 0 0,1 97,50 Z" fill="#cc2222"/>
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="6"/>
      <rect x="3" y="44" width="94" height="12" fill="currentColor"/>
      <circle cx="50" cy="50" r="13" fill="currentColor"/>
      <circle cx="50" cy="50" r="9" fill="#f5f5f5"/>
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
          <PokeballIcon size={22} />
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
          <Link
            to={ROUTES.LOCAL_META}
            className={`navbar__link ${isActive(ROUTES.LOCAL_META) ? 'navbar__link--active' : ''}`}
          >
            <MapPin size={18} />
            <span>Local Meta</span>
          </Link>
          <Link
            to={ROUTES.ROTATION}
            className={`navbar__link ${isActive(ROUTES.ROTATION) ? 'navbar__link--active' : ''}`}
          >
            <CalendarDays size={18} />
            <span>Rotation</span>
          </Link>
          {isAuthenticated && (
            <Link
              to={ROUTES.CP}
              className={`navbar__link ${isActive(ROUTES.CP) ? 'navbar__link--active' : ''}`}
            >
              <Trophy size={18} />
              <span>CP</span>
            </Link>
          )}
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
