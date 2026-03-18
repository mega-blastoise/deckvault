# SPEC_01: Landing Page + Navigation Gating

## Context

The app currently redirects `/` to `/dashboard`, which shows a stats grid — a poor first impression
for new visitors. Collection and Dashboard pages need to be gated as pre-release while we focus the
alpha on competitive deck play. A polished landing page acts as the top-of-funnel signup driver.

---

## Prerequisites

None — this is the root spec.

---

## Requirements

### 1. Route Restructure

`/` must render `LandingPage` directly. The `/dashboard` route stays registered but is only accessible
to authenticated users. The existing redirect from `/` to `/dashboard` is removed.

```typescript
// apps/web/src/web/routes/routes.tsx
// BEFORE:
{ path: '/', element: <Navigate to="/dashboard" replace /> }

// AFTER:
{ path: '/', element: <LandingPage /> },
{ path: '/dashboard', element: <ProtectedRoute><DashboardPage /></ProtectedRoute> }
```

### 2. Navigation Gating

Navbar links for **Collection** and **Dashboard** must be visually disabled with a "Coming Soon"
tooltip. They must not navigate. The links remain in the DOM for layout consistency.

```typescript
// apps/web/src/web/components/Navbar/Navbar.tsx
// Add a NavLinkGated component:

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
      {label}
    </span>
  );
}

// Usage in nav:
// Replace Collection link: <NavLinkGated label="Collection" tooltip="Coming Soon" />
// Replace Dashboard link: <NavLinkGated label="Dashboard" tooltip="Coming Soon" />
```

The `.navbar__link--gated` CSS class uses:
- `opacity: 0.45`
- `cursor: not-allowed`
- `pointer-events: none` (prevents click)
- Tooltip via `::after` pseudo-element on `[data-tooltip]`

### 3. Landing Page — Structure

The page is a single-column layout with three sections:

```
┌──────────────────────────────────────────────────────┐
│  HERO                                                 │
│  ┌────────────────────────────────────────────────┐  │
│  │  Headline + subline + Primary CTA              │  │
│  │  Pokemon card asset (animated WebP/GIF)        │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  FEATURE SHOWCASE                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Deck    │  │Analytics │  │  Meta    │           │
│  │  Builder │  │  Engine  │  │  Decks   │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                       │
│  CTA FOOTER                                          │
│  ┌────────────────────────────────────────────────┐  │
│  │  "Start building your best deck today"        │  │
│  │  [Sign in with Google]                        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

```typescript
// apps/web/src/web/pages/LandingPage/LandingPage.tsx
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

export function LandingPage() {
  return (
    <div className="landing">
      <LandingHero />
      <LandingFeatures />
      <LandingCta />
    </div>
  );
}
```

### 4. Hero Section

```typescript
// apps/web/src/web/pages/LandingPage/LandingPage.tsx (continued)

function LandingHero() {
  return (
    <section className="landing__hero">
      <div className="landing__hero-content">
        <h1 className="landing__headline">
          Build better decks.<br />Play smarter.
        </h1>
        <p className="landing__subline">
          The competitive Pokemon TCG platform with meta decks, deck analytics,
          and personalized recommendations — all in one place.
        </p>
        <Link to={ROUTES.SIGN_IN} className="landing__cta-button">
          Get started free
        </Link>
      </div>
      <div className="landing__hero-visual">
        {/* Pokemon card asset — WebP with GIF fallback */}
        <picture>
          <source srcSet="/assets/hero-cards.webp" type="image/webp" />
          <img
            src="/assets/hero-cards.gif"
            alt="Pokemon TCG cards"
            className="landing__hero-image"
            width="480"
            height="380"
          />
        </picture>
      </div>
    </section>
  );
}
```

### 5. Feature Showcase Section

Three feature cards. Each has an icon (SVG inline), a title, and a one-line description. These
implicitly show the value of signing up.

```typescript
const FEATURES = [
  {
    icon: 'deck',
    title: 'Smart Deck Builder',
    description: 'Build from meta-winning lists filtered to your collection.',
  },
  {
    icon: 'analytics',
    title: 'Deck Analytics',
    description: 'Probability math for opening hands, prize risk, and energy curves.',
  },
  {
    icon: 'meta',
    title: 'Live Meta Decks',
    description: 'Tournament-winning lists with evolution tracking over time.',
  },
] as const;

function LandingFeatures() {
  return (
    <section className="landing__features">
      <h2 className="landing__section-title">Everything a competitive player needs</h2>
      <div className="landing__feature-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing__feature-card">
            <div className="landing__feature-icon" data-icon={f.icon} />
            <h3 className="landing__feature-title">{f.title}</h3>
            <p className="landing__feature-desc">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

### 6. CSS Requirements

`LandingPage.css` must use:
- CSS custom properties from the existing Nebula theme (`--bg-sunken`, `--text-primary`, `--text-secondary`, `--surface-hover`, etc.)
- The hero is a two-column grid on ≥768px, single column on mobile (content first, visual second in DOM order)
- `.landing__hero-image` uses `animation: landing-float 4s ease-in-out infinite` (subtle float)
- `.landing__feature-card` hover: `translateY(-4px)` with `cubic-bezier(0.4, 0, 0.2, 1)`
- `.landing__cta-button` is the same visual style as the existing primary button (reuse `.button--primary` rules or reference them via custom properties)

### 7. AppLayout Exclusion

`LandingPage` must NOT render inside `AppLayout` (which includes Navbar + container padding). It gets
its own full-width layout. Route the landing page outside the `AppLayout` wrapper in `routes.tsx`.

```typescript
// routes.tsx — two groups:
// Group 1: AppLayout wrapper (all existing routes)
// Group 2: Standalone (LandingPage, SignInPage)
{
  path: '/',
  element: <LandingPage />   // no AppLayout wrapper
},
{
  path: '/sign-in',
  element: <SignInPage />    // already standalone — leave as-is
},
{
  path: '/',
  element: <AppLayout><Outlet /></AppLayout>,
  children: [
    { path: 'browse', element: <BrowsePage /> },
    { path: 'dashboard', element: <ProtectedRoute><DashboardPage /></ProtectedRoute> },
    // ... all other existing routes
  ]
}
```

---

## File Structure

```
apps/web/src/web/pages/LandingPage/
├── index.ts                   # export { LandingPage } from './LandingPage'
├── LandingPage.tsx
└── LandingPage.css

apps/web/src/web/components/Navbar/
├── Navbar.tsx                 # MODIFIED — add NavLinkGated, disable Collection + Dashboard
└── Navbar.css                 # MODIFIED — add .navbar__link--gated, tooltip styles

apps/web/src/web/routes/
└── routes.tsx                 # MODIFIED — restructure as described above

apps/web/public/assets/
├── hero-cards.webp            # Pokemon card asset (WebP, ≤200KB)
└── hero-cards.gif             # Fallback (only if WebP unavailable)
```

---

## Acceptance Criteria

- [ ] Navigating to `/` renders `LandingPage` with hero, feature showcase, and CTA footer
- [ ] `LandingPage` does NOT include the `<Navbar>` component
- [ ] "Get started free" CTA links to `/sign-in`
- [ ] `/dashboard` route is accessible only to authenticated users (redirects unauthenticated to `/sign-in`)
- [ ] Collection navbar link is visually muted (`opacity < 0.5`) and not clickable
- [ ] Dashboard navbar link is visually muted and not clickable
- [ ] Both gated links display a "Coming Soon" tooltip on hover
- [ ] `/decks`, `/browse`, `/decks/:id` all continue to work correctly
- [ ] No TypeScript errors introduced (`bun run check-types` clean)
- [ ] Hero image loads as WebP in Chrome, GIF fallback in unsupported browsers
- [ ] Landing page is responsive: single column on mobile (< 768px)

---

## Dependencies

None.

---

## Verification

```bash
# Type check
cd apps/web && bun run check-types

# Visual check — start dev server and open /
bun run dev

# Verify route is not a redirect
curl -s http://localhost:3000/ | grep -q 'landing' && echo "PASS" || echo "FAIL"
```
