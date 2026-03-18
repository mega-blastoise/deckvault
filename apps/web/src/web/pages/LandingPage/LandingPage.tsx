import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/web/contexts/Auth';
import { ROUTES } from '@/web/routes';
import './LandingPage.css';

const FEATURES = [
  {
    id: 'meta',
    title: 'Meta Decks',
    description: "Browse tournament-winning decklists and discover what's dominating the current format.",
  },
  {
    id: 'analytics',
    title: 'Deck Analytics',
    description: 'Probability math for opening hands, prize risk, and energy curves — built right in.',
  },
  {
    id: 'builder',
    title: 'Smart Builder',
    description: 'Build from top lists filtered to your collection, with substitution suggestions.',
  },
] as const;

function LandingHero() {
  return (
    <section className="landing__hero">
      <div className="landing__hero-content">
        <p className="landing__eyebrow">Alpha — Competitive Play</p>
        <h1 className="landing__headline">
          Build better decks.<br />Play smarter.
        </h1>
        <p className="landing__subline">
          The competitive Pokemon TCG platform — meta decks, deck analytics,
          and personalized recommendations in one place.
        </p>
        <a href={ROUTES.SIGN_IN} className="landing__cta-btn">
          Get started free
        </a>
      </div>
      <div className="landing__hero-visual" aria-hidden="true">
        <div className="landing__card-fan">
          <div className="landing__card landing__card--back" />
          <div className="landing__card landing__card--mid" />
          <div className="landing__card landing__card--front">
            <div className="landing__card-shine" />
            <div className="landing__card-label">TCG</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFeatures() {
  return (
    <section className="landing__features">
      <h2 className="landing__section-title">
        Everything a competitive player needs
      </h2>
      <div className="landing__feature-grid">
        {FEATURES.map((f) => (
          <div key={f.id} className="landing__feature-card">
            <div className={`landing__feature-icon landing__feature-icon--${f.id}`} />
            <h3 className="landing__feature-title">{f.title}</h3>
            <p className="landing__feature-desc">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LandingCta() {
  return (
    <section className="landing__cta">
      <h2 className="landing__cta-title">Start building your best deck today</h2>
      <p className="landing__cta-sub">Free during alpha. No credit card required.</p>
      <a href={ROUTES.SIGN_IN} className="landing__cta-btn landing__cta-btn--large">
        Sign in with Google
      </a>
    </section>
  );
}

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(ROUTES.DECKS, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="landing">
      <header className="landing__header">
        <a href="/" className="landing__logo">Pokemon TCG</a>
        <a href={ROUTES.SIGN_IN} className="landing__header-signin">Sign in</a>
      </header>
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingCta />
      </main>
      <footer className="landing__footer">
        <p className="landing__footer-text">Pokemon TCG Platform · Alpha</p>
      </footer>
    </div>
  );
}
