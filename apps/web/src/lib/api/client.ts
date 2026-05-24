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
// Auth — Privy → OpenTrade JWT exchange
// ---------------------------------------------------------------------------

export type ExchangeTokenResponse = {
  accessToken: string;
  expiresIn: number;
  userId: string;
};

export const exchangeAuthToken = (privyToken: string): Promise<ExchangeTokenResponse> =>
  apiPost<ExchangeTokenResponse>('/v1/auth/exchange', { accessToken: privyToken });

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
  positiveRate: number | null;
  licenseTypes: string[];
};

export type BrokersResponse = {
  brokers: BrokerListItem[];
  nextCursor: string | null;
};

export const fetchBrokers = (
  options?: FetchOptions & { search?: string; limit?: number },
): Promise<BrokersResponse> => {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  const qs = params.toString();
  return apiGet<BrokersResponse>(`/v1/brokers${qs ? `?${qs}` : ''}`, options);
};

export type BrokerLicense = {
  regulator: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
  issuedAt: string;
};

export type RatingDistributionItem = {
  stars: number;
  count: number;
  percentage: number;
};

export type SimilarBroker = {
  id: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  licenseTypes: string[];
  reviewCount: number;
};

export type SfcAddress = {
  addressEn: string;
  addressZh?: string;
  isPrimary: boolean;
};

export type SfcPerson = {
  nameEn: string;
  nameZh?: string;
  ceRef?: string;
  raTypes: number[];
};

export type SfcComplaintsOfficer = {
  tel?: string;
  fax?: string;
  email?: string;
  address?: string;
  entityName?: string;
  entityNameChi?: string;
  ceRef?: string;
};

export type SfcCondition = {
  text: string;
  textZh?: string;
  effectiveDate?: string;
};

export type SfcDisciplinaryAction = {
  description: string;
  descriptionZh?: string;
  date?: string;
  url?: string;
};

export type SfcFormerName = {
  nameEn?: string;
  nameZh?: string;
  effectiveUntil?: string;
};

export type SfcLicenceRecord = {
  lcType: string;
  actType: number;
  actDesc: string;
  actDescZh: string;
  periods: Array<{ from: string; to?: string }>;
};

export type SfcDetailJson = {
  addresses?: SfcAddress[];
  principals?: SfcPerson[];
  representatives?: SfcPerson[];
  complaintsOfficer?: SfcComplaintsOfficer;
  conditionsSfo?: SfcCondition[];
  conditionsAmlo?: SfcCondition[];
  disciplinaryActions?: SfcDisciplinaryAction[];
  formerNames?: SfcFormerName[];
  licenseRecordsSfo?: SfcLicenceRecord[];
  licenseRecordsAmlo?: SfcLicenceRecord[];
};

export type BrokerDetail = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  ceNumber: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  addressEn: string | null;
  addressZh: string | null;
  sfcDetailJson: SfcDetailJson | null;
  isClaimed: boolean;
  activeYears: number | null;
  reviewCount: number;
  positiveRate: number | null;
  ratingDistribution: RatingDistributionItem[];
  licenses: BrokerLicense[];
  similarBrokers: SimilarBroker[];
};

export type BrokerDetailResponse = {
  broker: BrokerDetail;
};

export const fetchBroker = (slug: string, options?: FetchOptions): Promise<BrokerDetailResponse> =>
  apiGet<BrokerDetailResponse>(`/v1/brokers/${slug}`, options);

export type ReviewAuthor = {
  displayName: string | null;
  sbtTier: string;
};

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
  author?: ReviewAuthor;
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

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export type UserProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  walletAddress: string | null;
  walletAddressFull: string | null;
  preferredLocale: string | null;
  role: string;
  sbtTier: string;
  createdAt: string;
};

export type UserProfileResponse = { user: UserProfile };

export const fetchMyProfile = (options: FetchOptions): Promise<UserProfileResponse> =>
  apiGet<UserProfileResponse>('/v1/auth/me', options);

export const apiPatch = async <T>(
  path: string,
  body: unknown,
  options: FetchOptions = {},
): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;

  const res = await fetch(url, {
    method: 'PATCH',
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
      `Upstream PATCH ${path} returned ${res.status}`,
    );
  }

  return (await res.json()) as T;
};

export type UpdateProfileInput = {
  displayName?: string;
  preferredLocale?: string;
};

export const updateMyProfile = (
  input: UpdateProfileInput,
  options: FetchOptions,
): Promise<UserProfileResponse> =>
  apiPatch<UserProfileResponse>('/v1/auth/me', input, options);

// ---------------------------------------------------------------------------
// L2 SBT verification — evidence file upload (file → IPFS via API server)
// ---------------------------------------------------------------------------

export type VerifyEvidenceUploadResponse = {
  cid: string;
  size: number;
  mimeType: string;
};

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type VerificationStatusItem = {
  id: string;
  brokerSlug: string;
  commitment: string;
  status: VerificationStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type VerificationStatusResponse = {
  verifications: VerificationStatusItem[];
};

export const fetchVerificationStatus = (
  options: FetchOptions,
): Promise<VerificationStatusResponse> =>
  apiGet<VerificationStatusResponse>('/v1/auth/verification-status', options);

export const uploadVerifyEvidence = async (
  file: File,
  options: FetchOptions,
): Promise<VerifyEvidenceUploadResponse> => {
  const url = `${env.NEXT_PUBLIC_API_URL}/v1/auth/verify-broker/upload`;
  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
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
        ...(parsed.error.details ? { details: parsed.error.details } : {}),
      });
    }
    throw new ApiClientError(
      res.status,
      'INTERNAL_ERROR',
      `Upstream POST /v1/auth/verify-broker/upload returned ${res.status}`,
    );
  }

  return (await res.json()) as VerifyEvidenceUploadResponse;
};
