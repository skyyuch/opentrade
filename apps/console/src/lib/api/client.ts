/**
 * Typed fetch wrapper for the console app.
 *
 * Mirrors apps/web client.ts but scoped to the merchant console use
 * cases: broker listing, broker detail, and review listing. Auth-gated
 * endpoints pass the Privy access token via Bearer header.
 */

import { env } from '../../env';

export type FetchOptions = {
  next?: { revalidate?: number; tags?: string[] };
  signal?: AbortSignal;
  headers?: Record<string, string>;
  accessToken?: string;
};

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
};

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const isApiErrorBody = (value: unknown): value is ApiErrorBody => {
  if (typeof value !== 'object' || value === null) return false;
  const maybe = value as { error?: { code?: unknown; message?: unknown } | null };
  const err = maybe.error;
  if (typeof err !== 'object' || err === null) return false;
  return typeof err.code === 'string' && typeof err.message === 'string';
};

const buildHeaders = (options: FetchOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }
  return headers;
};

const apiPost = async <T>(
  path: string,
  body: unknown,
  options: FetchOptions = {},
): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...buildHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  if (!res.ok) {
    let parsed: unknown = undefined;
    try {
      parsed = await res.json();
    } catch {
      // Non-JSON error body.
    }
    if (isApiErrorBody(parsed)) {
      throw new ApiClientError(
        res.status,
        parsed.error.code,
        parsed.error.message,
        parsed.error.requestId,
      );
    }
    throw new ApiClientError(
      res.status,
      'INTERNAL_ERROR',
      `Upstream POST ${path} returned ${res.status}`,
    );
  }

  return (await res.json()) as T;
};

// ---------------------------------------------------------------------------
// Auth — Privy → OpenTrade JWT exchange
// ---------------------------------------------------------------------------

export type ExchangeTokenResponse = {
  accessToken: string;
  expiresIn: number;
  userId: string;
};

export const exchangeAuthToken = (privyToken: string): Promise<ExchangeTokenResponse> =>
  apiPost<ExchangeTokenResponse>('/v1/auth/exchange', { accessToken: privyToken });

export const apiGet = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(options),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.next !== undefined ? { next: options.next } : {}),
  });

  if (!res.ok) {
    let parsed: unknown = undefined;
    try {
      parsed = await res.json();
    } catch {
      // Non-JSON error body.
    }
    if (isApiErrorBody(parsed)) {
      throw new ApiClientError(
        res.status,
        parsed.error.code,
        parsed.error.message,
        parsed.error.requestId,
      );
    }
    throw new ApiClientError(res.status, 'INTERNAL_ERROR', `Upstream ${path} returned ${res.status}`);
  }

  return (await res.json()) as T;
};

// ---------------------------------------------------------------------------
// Domain-specific typed fetchers
// ---------------------------------------------------------------------------

export type BrokerListItem = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  logoUrl: string | null;
  isClaimed: boolean;
  reviewCount: number;
};

export type BrokersResponse = {
  brokers: BrokerListItem[];
  nextCursor: string | null;
};

export const fetchBrokers = (options?: FetchOptions): Promise<BrokersResponse> =>
  apiGet<BrokersResponse>('/v1/brokers', options);

export type BrokerLicense = {
  regulator: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
};

export type BrokerDetail = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  isClaimed: boolean;
  reviewCount: number;
  licenses: BrokerLicense[];
};

export type BrokerDetailResponse = {
  broker: BrokerDetail;
};

export const fetchBroker = (slug: string, options?: FetchOptions): Promise<BrokerDetailResponse> =>
  apiGet<BrokerDetailResponse>(`/v1/brokers/${slug}`, options);

export type ReviewItem = {
  id: string;
  title: string;
  body: string;
  rating: number;
  status: string;
  createdAt: string;
};

export type BrokerReviewsResponse = {
  reviews: ReviewItem[];
  nextCursor: string | null;
  broker: { id: string; slug: string; displayName: string; logoUrl: string | null };
};

export const fetchBrokerReviews = (
  slug: string,
  options?: FetchOptions,
): Promise<BrokerReviewsResponse> =>
  apiGet<BrokerReviewsResponse>(`/v1/reviews/broker/${slug}`, options);
