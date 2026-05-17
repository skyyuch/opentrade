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

export const apiGet = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
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

/**
 * Fetches the API health report. Server Components SHOULD pass
 * `{ next: { revalidate: 0 } }` so the status page never serves stale
 * data; ISR makes no sense for a liveness probe.
 */
export const fetchHealth = (options?: FetchOptions): Promise<HealthReportDto> =>
  apiGet<HealthReportDto>('/v1/health', options);
