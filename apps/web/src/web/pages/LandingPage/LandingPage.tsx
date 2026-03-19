import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/web/contexts/Auth';
import { ROUTES } from '@/web/routes';
import './LandingPage.css';

const HERO_CARDS = {
  back: {
    url: 'https://images.scrydex.com/pokemon/me2pt5-160/large',
    alt: 'Dragapult ex — Ascended Heroes'
  },
  mid: {
    url: 'https://images.scrydex.com/pokemon/me2pt5-284/large',
    alt: 'Mega Gengar ex — Ascended Heroes'
  },
  front: {
    url: 'https://images.pokemontcg.io/sv8pt5/146_hires.png',
    alt: 'Flareon ex — Prismatic Evolutions'
  }
} as const;

const POKEAPI_DREAM =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world';

const FEATURES = [
  {
    id: 'meta',
    title: 'Meta Decks',
    description: "Browse tournament-winning decklists and discover what's dominating the current format.",
    iconUrl: `${POKEAPI_DREAM}/6.svg`,
    iconAlt: 'Charizard'
  },
  {
    id: 'analytics',
    title: 'Deck Analytics',
    description: 'Probability math for opening hands, prize risk, and energy curves — built right in.',
    iconUrl: `${POKEAPI_DREAM}/150.svg`,
    iconAlt: 'Mewtwo'
  },
  {
    id: 'builder',
    title: 'Smart Builder',
    description: 'Build from top lists filtered to your collection, with substitution suggestions.',
    iconUrl: `${POKEAPI_DREAM}/385.svg`,
    iconAlt: 'Jirachi'
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
          The competitive DeckVault platform — meta decks, deck analytics,
          and personalized recommendations in one place.
        </p>
        <a href={ROUTES.SIGN_IN} className="landing__cta-btn">
          Get started free
        </a>
      </div>
      <div className="landing__hero-visual" aria-hidden="true">
        <div className="landing__card-fan">
          <div className="landing__card landing__card--back">
            <img src={HERO_CARDS.back.url} alt={HERO_CARDS.back.alt} className="landing__card-img" />
          </div>
          <div className="landing__card landing__card--mid">
            <img src={HERO_CARDS.mid.url} alt={HERO_CARDS.mid.alt} className="landing__card-img" />
          </div>
          <div className="landing__card landing__card--front">
            <img src={HERO_CARDS.front.url} alt={HERO_CARDS.front.alt} className="landing__card-img" />
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
            <img
              src={f.iconUrl}
              alt={f.iconAlt}
              className="landing__feature-icon"
              width={64}
              height={64}
            />
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
        <a href="/" className="landing__logo">DeckVault</a>
        <a href={ROUTES.SIGN_IN} className="landing__header-signin">Sign in</a>
      </header>
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingCta />
      </main>
      <footer className="landing__footer">
        <p className="landing__footer-text">DeckVault · deckvault.gg · Alpha</p>
      </footer>
    </div>
  );
}
