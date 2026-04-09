/**
 * BFF Request Context
 */
export interface BffContext {
  requestId: string;
  startTime: number;
}

/**
 * BFF Handler function signature
 */
export type BffHandler = (
  request: Request,
  params: Record<string, string>,
  searchParams: URLSearchParams,
  context: BffContext
) => Promise<Response>;

/**
 * BFF Route definition
 */
export interface BffRoute {
  pattern: RegExp;
  paramNames: string[];
  handler: BffHandler;
  method?: 'GET' | 'POST';
}

/**
 * Set summary for dashboard and filters
 */
export interface SetSummary {
  id: string;
  name: string;
  series: string;
  total: number;
  releaseDate: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
}

/**
 * Card summary for lists
 */
export interface CardSummary {
  id: string;
  name: string;
  supertype: string;
  types?: string[];
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id: string;
    name: string;
  };
}

/**
 * Dashboard page data
 */
export interface DashboardData {
  recentSets: SetSummary[];
  featuredCards: CardSummary[];
  stats: {
    totalCards: number;
    totalSets: number;
    lastUpdated: string | null;
  };
}

/**
 * Browse page data
 */
export interface BrowseData {
  cards: CardSummary[];
  filters: {
    types: string[];
    rarities: string[];
    sets: SetSummary[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Card detail data
 */
export interface CardDetailData {
  card: any; // Full card object
  set: SetSummary;
  relatedCards: CardSummary[];
}

/**
 * BFF Response with partial failure support
 */
export interface BffResponse<T> {
  data: Partial<T>;
  errors?: Array<{
    source: string;
    code: string;
    message: string;
  }>;
  warnings?: string[];
}
