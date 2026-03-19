import React from 'react';
import { ROUTES } from '@/web/routes';
import './AppFooter.css';

const CURRENT_YEAR = new Date().getFullYear();

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__container">
        <div className="app-footer__brand">
          <a href="/" className="app-footer__logo">DeckVault</a>
          <p className="app-footer__tagline">The competitive Pokemon TCG platform.</p>
        </div>

        <nav className="app-footer__nav" aria-label="Footer navigation">
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Platform</h3>
            <a href={ROUTES.BROWSE} className="app-footer__link">Browse Cards</a>
            <a href={ROUTES.META_DECKS} className="app-footer__link">Meta Decks</a>
            <a href={ROUTES.LOCAL_META} className="app-footer__link">Local Meta</a>
            <a href={ROUTES.DECKS_BROWSE} className="app-footer__link">Community Decks</a>
          </div>
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">Account</h3>
            <a href={ROUTES.SIGN_IN} className="app-footer__link">Sign In</a>
            <a href={ROUTES.DECKS} className="app-footer__link">My Decks</a>
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
