/**
 * Minimal typed fetch wrapper for `@opentrade/api`'s `/v1/*` endpoints.
 *
 * Phase 0 surface area is intentionally tiny: only `apiGet<T>` and a
 * dedicated `fetchHealth()` because that is the only endpoint the web app
 * consumes today. As Phase 1 lands real domains we'll grow this into a
 * proper namespaced client (`api.reviews.list(...)`, etc.) — not a full
 * codegen step yet, just a typed wrapper.
 *
 * Server vs Client usage:
 *   - Server Components: pass `next: { revalidate: 0 }` for fresh data,
 *     or a positive value for ISR (e.g. broker pages cache 60s in Phase 1).
 *   - Client Components: combine with TanStack Query (per rule 21) so
 *     refetches, caching, and request deduplication are handled there.
 *
 * The thrown `ApiClientError` carries the upstream `error.code` from the
 * Hono envelope (rule 30) so callers can branch on machine codes for
 * i18n lookup rather than parsing `error.message`.
 */

import { env } from '../../env';

import type { HealthReportDto } from '@opentrade/shared';

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
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { requestId?: string; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = options.requestId;
    this.details = options.details;
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
      // Non-JSON error body — stays undefined.
    }
    if (isApiErrorBody(parsed)) {
      throw new ApiClientError(res.status, parsed.error.code, parsed.error.message, {
        ...(parsed.error.requestId !== undefined ? { requestId: parsed.error.requestId } : {}),
        ...(parsed.error.details !== undefined ? { details: parsed.error.details } : {}),
      });
    }
    throw new ApiClientError(
      res.status,
      'INTERNAL_ERROR',
      `Upstream ${path} returned ${res.status}`,
    );
  }

  return (await res.json()) as T;
};

export const apiPost = async <T>(
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
      throw new ApiClientError(res.status, parsed.error.code, parsed.error.message, {
        ...(parsed.error.requestId !== undefined ? { requestId: parsed.error.requestId } : {}),
        ...(parsed.error.details !== undefined ? { details: parsed.error.details } : {}),
      });
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
// Domain-specific typed fetchers
// ---------------------------------------------------------------------------

export const fetchHealth = (options?: FetchOptions): Promise<HealthReportDto> =>
  apiGet<HealthReportDto>('/v1/health', options);

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

export const fetchBrokers = (options?: FetchOptions & { search?: string }): Promise<BrokersResponse> => {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  const qs = params.toString();
  return apiGet<BrokersResponse>(`/v1/brokers${qs ? `?${qs}` : ''}`, options);
};

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
  brokerId: string;
  contentHash: string;
  ipfsCid: string | null;
  chainReviewId: number | null;
  txHash: string | null;
  title: string;
  body: string;
  rating: number;
  status: string;
  createdAt: string;
};

export type BrokerReviewsResponse = {
  reviews: ReviewItem[];
  nextCursor: string | null;
  broker: {
    id: string;
    slug: string;
    displayName: string;
    logoUrl: string | null;
  };
};

export const fetchBrokerReviews = (
  slug: string,
  options?: FetchOptions,
): Promise<BrokerReviewsResponse> =>
  apiGet<BrokerReviewsResponse>(`/v1/reviews/broker/${slug}`, options);

export type SubmitReviewInput = {
  brokerId: string;
  title: string;
  body: string;
  rating: number;
};

export type SubmitReviewResponse = {
  review: {
    id: string;
    brokerId: string;
    contentHash: string;
    ipfsCid: string | null;
    title: string;
    rating: number;
    status: string;
    createdAt: string;
  };
};

export const submitReview = (
  input: SubmitReviewInput,
  options: FetchOptions,
): Promise<SubmitReviewResponse> => apiPost<SubmitReviewResponse>('/v1/reviews', input, options);
