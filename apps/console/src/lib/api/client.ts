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

export const apiPostFormData = async <T>(
  path: string,
  formData: FormData,
  options: FetchOptions = {},
): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;
  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

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
      `Upstream PATCH ${path} returned ${res.status}`,
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
  licenseTypes: string[];
};

export type BrokersResponse = {
  brokers: BrokerListItem[];
  nextCursor: string | null;
};

export const fetchBrokers = (options?: FetchOptions): Promise<BrokersResponse> =>
  apiGet<BrokersResponse>('/v1/brokers?limit=50', options);

export const fetchAllBrokers = async (options?: FetchOptions): Promise<BrokerListItem[]> => {
  const all: BrokerListItem[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const params: string = cursor ? `?limit=50&cursor=${cursor}` : '?limit=50';
    const res: BrokersResponse = await apiGet<BrokersResponse>(`/v1/brokers${params}`, options);
    all.push(...res.brokers);
    cursor = res.nextCursor;
    hasMore = cursor !== null;
  }
  return all;
};

export type BrokerLicense = {
  regulator: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
  issuedAt: string;
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
  sfcDetailJson: Record<string, unknown> | null;
  isClaimed: boolean;
  activeYears: number | null;
  reviewCount: number;
  positiveRate: number | null;
  ratingDistribution: { stars: number; count: number; percentage: number }[];
  licenses: BrokerLicense[];
  similarBrokers: {
    id: string;
    slug: string;
    displayName: string;
    logoUrl: string | null;
    licenseTypes: string[];
    reviewCount: number;
  }[];
};

export type BrokerDetailResponse = {
  broker: BrokerDetail;
};

export const fetchBroker = (slug: string, options?: FetchOptions): Promise<BrokerDetailResponse> =>
  apiGet<BrokerDetailResponse>(`/v1/brokers/${slug}`, options);

export const updateBrokerLogo = (
  slug: string,
  logoUrl: string,
  options?: FetchOptions,
): Promise<{ broker: { id: string; slug: string; displayName: string; logoUrl: string | null } }> =>
  apiPatch<{
    broker: { id: string; slug: string; displayName: string; logoUrl: string | null };
  }>(`/v1/brokers/admin/${slug}/logo`, { logoUrl }, options);

export const uploadBrokerLogo = (
  slug: string,
  file: File,
  options?: FetchOptions,
): Promise<{ logoUrl: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiPostFormData<{ logoUrl: string }>(
    `/v1/brokers/admin/${slug}/logo/upload`,
    formData,
    options ?? {},
  );
};

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

// ---------------------------------------------------------------------------
// Auth — current user profile
// ---------------------------------------------------------------------------

export type CurrentUserResponse = {
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
    walletAddress: string | null;
    walletAddressFull: string | null;
    preferredLocale: string | null;
    role: 'USER' | 'REVIEWER' | 'JURY' | 'ADMIN';
    sbtTier: 'L1' | 'L2' | 'L3' | 'L4';
    createdAt: string;
  };
  claimedBroker: { slug: string; displayName: string } | null;
};

export const fetchCurrentUser = (options?: FetchOptions): Promise<CurrentUserResponse> =>
  apiGet<CurrentUserResponse>('/v1/auth/me', options);

// ---------------------------------------------------------------------------
// Admin — Platform stats
// ---------------------------------------------------------------------------

export type AdminStatsResponse = {
  stats: {
    totalUsers: number;
    usersGrowth: number;
    totalReviews: number;
    reviewsGrowth: number;
    pendingApprovals: number;
    pendingClaims: number;
    pendingVerifications: number;
    claimedBrokers: number;
    totalBrokers: number;
  };
};

export const fetchAdminStats = (options?: FetchOptions): Promise<AdminStatsResponse> =>
  apiGet<AdminStatsResponse>('/v1/admin/stats', options);

// ---------------------------------------------------------------------------
// Admin — Users
// ---------------------------------------------------------------------------

export type AdminUserItem = {
  id: string;
  displayName: string | null;
  email: string | null;
  walletAddress: string | null;
  role: string;
  sbtTier: string;
  createdAt: string;
};

export type AdminUsersResponse = {
  users: AdminUserItem[];
  nextCursor: string | null;
};

export const fetchAdminUsers = (
  params?: { search?: string; role?: string; sbtTier?: string; cursor?: string },
  options?: FetchOptions,
): Promise<AdminUsersResponse> => {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  if (params?.sbtTier) query.set('sbtTier', params.sbtTier);
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  return apiGet<AdminUsersResponse>(`/v1/admin/users${qs ? `?${qs}` : ''}`, options);
};

export type AdminUserDetailResponse = {
  user: AdminUserItem & {
    walletAddress: string | null;
    sbtTokenId: number | null;
    sbtMintTxHash: string | null;
  };
  reviews: { id: string; title: string; rating: number; status: string; broker: { slug: string; displayName: string }; createdAt: string }[];
  verifications: { id: string; brokerSlug: string; status: string; createdAt: string }[];
  claims: { id: string; broker: { slug: string; displayName: string }; status: string; createdAt: string }[];
};

export const fetchAdminUserDetail = (id: string, options?: FetchOptions): Promise<AdminUserDetailResponse> =>
  apiGet<AdminUserDetailResponse>(`/v1/admin/users/${id}`, options);

export const updateUserRole = (
  id: string,
  role: string,
  options?: FetchOptions,
): Promise<{ user: { id: string; role: string } }> =>
  apiPatch<{ user: { id: string; role: string } }>(`/v1/admin/users/${id}/role`, { role }, options);

export type CreateUserPayload = {
  displayName: string;
  email?: string | undefined;
  walletAddress?: string | undefined;
  role: string;
};

export type CreateUserResponse = {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    walletAddress: string | null;
    role: string;
    createdAt: string;
  };
};

export const createAdminUser = (
  payload: CreateUserPayload,
  options?: FetchOptions,
): Promise<CreateUserResponse> =>
  apiPost<CreateUserResponse>('/v1/admin/users', payload, options);

// ---------------------------------------------------------------------------
// Admin — Reviews
// ---------------------------------------------------------------------------

export type AdminReviewItem = {
  id: string;
  title: string;
  body: string;
  rating: number;
  status: string;
  txHash: string | null;
  ipfsCid: string | null;
  contentHash: string;
  chainReviewId: number | null;
  broker: { slug: string; displayName: string };
  author: { id: string; displayName: string | null };
  createdAt: string;
};

export type AdminReviewsResponse = {
  reviews: AdminReviewItem[];
  nextCursor: string | null;
};

export const fetchAdminReviews = (
  params?: { search?: string; status?: string; brokerSlug?: string; cursor?: string },
  options?: FetchOptions,
): Promise<AdminReviewsResponse> => {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.brokerSlug) query.set('brokerSlug', params.brokerSlug);
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  return apiGet<AdminReviewsResponse>(`/v1/admin/reviews${qs ? `?${qs}` : ''}`, options);
};

// ---------------------------------------------------------------------------
// Admin — Activity feed
// ---------------------------------------------------------------------------

export type ActivityItem = {
  type: string;
  description: string;
  timestamp: string;
};

export type AdminActivityResponse = {
  activities: ActivityItem[];
};

export const fetchAdminActivity = (options?: FetchOptions): Promise<AdminActivityResponse> =>
  apiGet<AdminActivityResponse>('/v1/admin/activity', options);

// ---------------------------------------------------------------------------
// Admin — Claims & Verifications (existing endpoints, typed fetchers)
// ---------------------------------------------------------------------------

export type ClaimItem = {
  id: string;
  brokerId: string;
  broker: { id: string; slug: string; displayName: string };
  userId: string;
  ceRefNumber: string;
  companyLetterIpfsCid: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export type AdminClaimsResponse = { claims: ClaimItem[] };

export const fetchAdminClaims = (status = 'PENDING', options?: FetchOptions): Promise<AdminClaimsResponse> =>
  apiGet<AdminClaimsResponse>(`/v1/brokers/admin/claims?status=${status}`, options);

export const approveClaim = (id: string, adminNote?: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/brokers/admin/claims/${id}/approve`, { adminNote }, options);

export const rejectClaim = (id: string, adminNote?: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/brokers/admin/claims/${id}/reject`, { adminNote }, options);

export type VerificationItem = {
  id: string;
  userId: string;
  user: { id: string; displayName: string | null; walletAddress: string | null; sbtTier: string };
  brokerSlug: string;
  commitment: string;
  evidenceIpfsCid: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export type AdminVerificationsResponse = { verifications: VerificationItem[] };

export const fetchAdminVerifications = (status = 'PENDING', options?: FetchOptions): Promise<AdminVerificationsResponse> =>
  apiGet<AdminVerificationsResponse>(`/v1/auth/admin/verifications?status=${status}`, options);

export const approveVerification = (id: string, adminNote?: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/auth/admin/verifications/${id}/approve`, { adminNote }, options);

export const rejectVerification = (id: string, adminNote?: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/auth/admin/verifications/${id}/reject`, { adminNote }, options);

// ---------------------------------------------------------------------------
// Broker owner — stats
// ---------------------------------------------------------------------------

export type BrokerOwnerStatsResponse = {
  stats: {
    totalReviews: number;
    monthReviews: number;
    avgRating: number | null;
    positiveRate: number | null;
  };
};

export const fetchBrokerOwnerStats = (slug: string, options?: FetchOptions): Promise<BrokerOwnerStatsResponse> =>
  apiGet<BrokerOwnerStatsResponse>(`/v1/brokers/${slug}/owner-stats`, options);

// ---------------------------------------------------------------------------
// Broker owner — update profile
// ---------------------------------------------------------------------------

export const updateBrokerProfile = (
  slug: string,
  data: { description?: string; logoUrl?: string },
  options?: FetchOptions,
): Promise<{ broker: BrokerDetail }> =>
  apiPatch<{ broker: BrokerDetail }>(`/v1/brokers/${slug}`, data, options);
