export interface PaginationMeta {
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
  totalPages: number;
}

export interface PaginationLinks {
  self: string;
  first?: string;
  prev?: string;
  next?: string;
  last?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
  page: number;
}

export const DEFAULT_PAGE_SIZE = 60;
export const MAX_PAGE_SIZE = 420;

/**
 * Parse pagination parameters from URL search params
 * Supports both page-based (?page=1&pageSize=50) and offset-based (?limit=50&offset=0)
 */
export function parsePaginationParams(
  searchParams: URLSearchParams
): PaginationParams {
  // Try page-based first
  const pageStr = searchParams.get('page');
  const pageSizeStr = searchParams.get('pageSize');

  if (pageStr !== null) {
    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(pageSizeStr || '', 10) || DEFAULT_PAGE_SIZE)
    );

    return {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      page
    };
  }

  // Fall back to offset-based
  const limitStr = searchParams.get('limit');
  const offsetStr = searchParams.get('offset');

  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(limitStr || '', 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = Math.max(0, parseInt(offsetStr || '', 10) || 0);
  const page = Math.floor(offset / limit) + 1;

  return { limit, offset, page };
}

/**
 * Create pagination metadata for API response
 */
export function createPaginationMeta(
  params: PaginationParams,
  count: number,
  totalCount: number
): PaginationMeta {
  const totalPages = Math.ceil(totalCount / params.limit);

  return {
    page: params.page,
    pageSize: params.limit,
    count,
    totalCount,
    totalPages
  };
}

/**
 * Create HATEOAS pagination links
 */
export function createPaginationLinks(
  baseUrl: string,
  params: PaginationParams,
  totalCount: number
): PaginationLinks {
  const totalPages = Math.ceil(totalCount / params.limit);
  const links: PaginationLinks = {
    self: `${baseUrl}?page=${params.page}&pageSize=${params.limit}`
  };

  if (totalPages > 0) {
    links.first = `${baseUrl}?page=1&pageSize=${params.limit}`;
    links.last = `${baseUrl}?page=${totalPages}&pageSize=${params.limit}`;

    if (params.page > 1) {
      links.prev = `${baseUrl}?page=${params.page - 1}&pageSize=${params.limit}`;
    }

    if (params.page < totalPages) {
      links.next = `${baseUrl}?page=${params.page + 1}&pageSize=${params.limit}`;
    }
  }

  return links;
}
