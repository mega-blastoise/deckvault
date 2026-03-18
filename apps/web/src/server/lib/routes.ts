export const WEB_INDEX_ROUTES = ['/', '/index.html'];

// All frontend routes that should render the React app
export const WEB_ROUTES = [
  ...WEB_INDEX_ROUTES,
  '/dashboard',
  '/sign-in',
  '/collection',
  '/collection/:cardId',
  '/browse',
  '/browse/:cardId',
  '/cards/:cardId',
  '/decks',
  '/decks/browse',
  '/decks/new',
  '/decks/:deckId',
  '/decks/:deckId/edit'
];

// Patterns to match web routes
const WEB_ROUTE_PATTERNS = [
  /^\/$/, // Root → dashboard redirect
  /^\/index\.html$/, // Dashboard alt
  /^\/dashboard$/, // Dashboard
  /^\/sign-in$/, // Sign in
  /^\/collection(\/.*)?$/, // Collection and card detail
  /^\/browse(\/.*)?$/, // Browse and card detail
  /^\/cards\/[^/]+$/, // Card detail
  /^\/decks$/, // Deck list
  /^\/decks\/browse$/, // Public deck browser
  /^\/decks\/new$/, // New deck
  /^\/decks\/[^/]+$/, // Deck detail
  /^\/decks\/[^/]+\/edit$/ // Edit deck
];

export const API_ROUTES = [
  '/api/v1/cards',
  '/api/v1/cards/:id',
  '/api/v1/sets',
  '/api/v1/sets/:id',
  '/api/v1/sets/:id/cards'
];

/**
 * Check if a pathname is an API route
 */
export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/v1/');
}

/**
 * Check if a pathname is a web route (should render React app)
 */
export function isWebRoute(pathname: string): boolean {
  return WEB_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}
