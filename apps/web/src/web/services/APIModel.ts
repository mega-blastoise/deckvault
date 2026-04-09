/**
 * Abstract API Client Model
 *
 * Flexible, extensible base class for creating HTTP client services.
 * Provides standard HTTP methods (GET, POST, PUT, PATCH, DELETE) with
 * TypeScript generics for type-safe API interactions.
 *
 * @example
 * ```ts
 * class PokemonAPIClient extends APIModel {
 *   constructor() {
 *     super({ baseURL: 'https://api.pokemon.com/v1' });
 *   }
 *
 *   async getCard(id: string) {
 *     return this.get<Card>(`/cards/${id}`);
 *   }
 *
 *   async createDeck(data: CreateDeckDTO) {
 *     return this.post<Deck>('/decks', data);
 *   }
 * }
 * ```
 */

export interface APIConfig {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
  timeout?: number;
}

export interface APIResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export abstract class APIModel {
  protected baseURL: string;
  protected defaultHeaders: Record<string, string>;
  protected defaultTimeout: number;

  constructor(config: APIConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    this.defaultTimeout = config.timeout ?? 30000; // 30 seconds default
  }

  /**
   * Builds the full URL with query parameters
   */
  protected buildURL(
    path: string,
    params?: Record<string, string | number | boolean>
  ): string {
    const url = `${this.baseURL}${path.startsWith('/') ? path : `/${path}`}`;

    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Merges headers with defaults
   */
  protected buildHeaders(customHeaders?: Record<string, string>): HeadersInit {
    return {
      ...this.defaultHeaders,
      ...customHeaders
    };
  }

  /**
   * Handles fetch request with timeout support
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }
      throw error;
    }
  }

  /**
   * Processes the response and handles errors
   */
  protected async handleResponse<T>(
    response: Response
  ): Promise<APIResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJSON = contentType?.includes('application/json');

    let data: T;

    if (isJSON) {
      data = await response.json();
    } else {
      data = (await response.text()) as T;
    }

    if (!response.ok) {
      throw new APIError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        data
      );
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Core request method - can be overridden for request/response interceptors
   */
  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    const url = this.buildURL(path, config?.params);
    const headers = this.buildHeaders(config?.headers);
    const timeout = config?.timeout ?? this.defaultTimeout;

    const options: RequestInit = {
      method,
      headers,
      signal: config?.signal
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await this.fetchWithTimeout(url, options, timeout);
      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * HTTP GET request
   */
  public async get<T>(
    path: string,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>('GET', path, undefined, config);
  }

  /**
   * HTTP POST request
   */
  public async post<T>(
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>('POST', path, body, config);
  }

  /**
   * HTTP PUT request
   */
  public async put<T>(
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>('PUT', path, body, config);
  }

  /**
   * HTTP PATCH request
   */
  public async patch<T>(
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>('PATCH', path, body, config);
  }

  /**
   * HTTP DELETE request
   */
  public async delete<T>(
    path: string,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>('DELETE', path, undefined, config);
  }

  /**
   * Updates the base URL (useful for multi-environment support)
   */
  public setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/$/, '');
  }

  /**
   * Updates default headers (useful for authentication tokens)
   */
  public setHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  /**
   * Removes a default header
   */
  public removeHeader(key: string): void {
    delete this.defaultHeaders[key];
  }
}

export function getBaseAPIURL() {
  const v1APIEndpointPrefix = '/api/v1';

  if (typeof process !== 'undefined' && process?.env?.API_URL) {
    return process.env.API_URL;
  }

  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL ?? `http://localhost:3000${v1APIEndpointPrefix}`;
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    return (
      (origin.endsWith('/') ? origin.slice(0, -1) : origin) +
      v1APIEndpointPrefix
    );
  }

  return v1APIEndpointPrefix;
}
