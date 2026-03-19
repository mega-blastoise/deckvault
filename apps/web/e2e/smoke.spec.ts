import { test, expect } from '@playwright/test';

// ── Landing page ──────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('renders hero, features, and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.landing__hero')).toBeVisible();
    await expect(page.locator('.landing__features')).toBeVisible();
    await expect(page.locator('.landing__cta')).toBeVisible();
  });

  test('has no Navbar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.navbar')).not.toBeVisible();
  });

  test('CTA sign-in link navigates to /sign-in', async ({ page }) => {
    await page.goto('/');
    await page.locator('.landing__cta a[href="/sign-in"]').first().click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ── Public routes ─────────────────────────────────────────────────────────────

test.describe('Public routes', () => {
  test('Browse page renders with Navbar', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.locator('.navbar')).toBeVisible();
    await expect(page.locator('h1, [class*="browse"]').first()).toBeVisible();
  });

  test('Meta Decks page renders', async ({ page }) => {
    await page.goto('/meta-decks');
    await expect(page.locator('.navbar')).toBeVisible();
    await expect(page.getByRole('heading', { name: /meta/i })).toBeVisible();
  });

  test('Local Meta page renders with format pills', async ({ page }) => {
    await page.goto('/local-meta');
    await expect(page.locator('.navbar')).toBeVisible();
    await expect(page.locator('.local-meta-page__format-pills')).toBeVisible();
    await expect(page.locator('.local-meta-page__format-pill', { hasText: 'Standard' })).toBeVisible();
    await expect(page.locator('.local-meta-page__format-pill', { hasText: 'Expanded' })).toBeVisible();
  });

  test('Local Meta format filter changes active pill', async ({ page }) => {
    await page.goto('/local-meta');
    const allPill = page.locator('.local-meta-page__format-pill', { hasText: 'All Formats' });
    await allPill.click();
    await expect(allPill).toHaveClass(/format-pill--active/);
    const standardPill = page.locator('.local-meta-page__format-pill', { hasText: 'Standard' });
    await expect(standardPill).not.toHaveClass(/format-pill--active/);
  });

  test('Community decks browse page renders', async ({ page }) => {
    await page.goto('/decks/browse');
    await expect(page.locator('.navbar')).toBeVisible();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

test.describe('Navbar navigation', () => {
  test('logo links to homepage', async ({ page }) => {
    await page.goto('/browse');
    await page.locator('.navbar__logo').click();
    await expect(page).toHaveURL('/');
  });

  test('Browse link is active when on /browse', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.locator('.navbar__link--active', { hasText: 'Browse' })).toBeVisible();
  });

  test('Meta link navigates to /meta-decks', async ({ page }) => {
    await page.goto('/browse');
    await page.locator('a.navbar__link[href="/meta-decks"]').click();
    await expect(page).toHaveURL('/meta-decks');
  });

  test('Local Meta link navigates to /local-meta', async ({ page }) => {
    await page.goto('/browse');
    await page.locator('.navbar__link', { hasText: 'Local Meta' }).click();
    await expect(page).toHaveURL('/local-meta');
  });

  test('Sign In link is visible when not authenticated', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.locator('a[href="/sign-in"]').first()).toBeVisible();
  });
});

// ── Protected routes ─────────────────────────────────────────────────────────

test.describe('Protected routes redirect unauthenticated users', () => {
  test('/decks redirects to /sign-in', async ({ page }) => {
    await page.goto('/decks');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/decks/new redirects to /sign-in', async ({ page }) => {
    await page.goto('/decks/new');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/collection redirects to /sign-in', async ({ page }) => {
    await page.goto('/collection');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/dashboard redirects to /sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ── 404 handling ──────────────────────────────────────────────────────────────

test.describe('404 handling', () => {
  test('unknown route shows 404 page inside AppLayout', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    // NotFoundPage is rendered inside the AppLayout (*) catch-all
    await expect(page.locator('.navbar')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  });

  test('404 page has Go Home link', async ({ page }) => {
    await page.goto('/totally-unknown-path');
    await page.locator('.navbar').waitFor({ timeout: 8000 });
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});

// ── Footer ────────────────────────────────────────────────────────────────────

test.describe('Footer', () => {
  test('renders on app pages', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.locator('.app-footer')).toBeVisible();
  });

  test('disclaimer text is present', async ({ page }) => {
    await page.goto('/meta-decks');
    await expect(page.locator('.app-footer__disclaimer')).toContainText('not affiliated');
  });
});

// ── Theme toggle ──────────────────────────────────────────────────────────────

test.describe('Theme toggle', () => {
  test('toggle button is visible in Navbar', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.locator('.theme-toggle, [aria-label*="theme" i], [aria-label*="Theme" i]').first()).toBeVisible();
  });
});
