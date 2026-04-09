import React from 'react';
import { Link } from 'react-router';
import { ROUTES } from '@/web/routes';
import './AppFooter.css';

const CURRENT_YEAR = new Date().getFullYear();

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__container">
        <div className="app-footer__brand">
          <Link to="/" className="app-footer__logo">DeckVault</Link>
          <p className="app-footer__tagline">The competitive Pokemon TCG platform.</p>
        </div>

        <nav className="app-footer__nav" aria-label="Footer navigation">
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Platform</h3>
            <Link to={ROUTES.BROWSE} className="app-footer__link">Browse Cards</Link>
            <Link to={ROUTES.META_DECKS} className="app-footer__link">Meta Decks</Link>
            <Link to={ROUTES.LOCAL_META} className="app-footer__link">Local Meta</Link>
            <Link to={ROUTES.DECKS_BROWSE} className="app-footer__link">Community Decks</Link>
          </div>
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Explore</h3>
            <Link to={ROUTES.SETS} className="app-footer__link">Sets</Link>
            <Link to={ROUTES.LOCAL_META} className="app-footer__link">Local Meta</Link>
            <Link to={ROUTES.ROTATION} className="app-footer__link">Rotation</Link>
            <Link to={ROUTES.CP} className="app-footer__link">CP Tracker</Link>
          </div>
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Account</h3>
            <Link to={ROUTES.SIGN_IN} className="app-footer__link">Sign In</Link>
            <Link to={ROUTES.DECKS} className="app-footer__link">My Decks</Link>
          </div>
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Tools</h3>
            <Link to={ROUTES.SIMULATE} className="app-footer__link">
              Simulator <span className="app-footer__alpha-badge">Alpha</span>
            </Link>
          </div>
        </nav>
      </div>

      <div className="app-footer__bottom">
        <p className="app-footer__copy">
          © {CURRENT_YEAR} DeckVault · <span className="app-footer__domain">deckvault.gg</span> · Alpha
        </p>
        <p className="app-footer__disclaimer">
          DeckVault is not affiliated with or endorsed by Nintendo, The Pokémon Company, or Wizards of the Coast.
        </p>
      </div>
    </footer>
  );
}
