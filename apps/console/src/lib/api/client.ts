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

export const apiDelete = async <T>(
  path: string,
  body?: unknown,
  options: FetchOptions = {},
): Promise<T> => {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers:
      body !== undefined
        ? { ...buildHeaders(options), 'Content-Type': 'application/json' }
        : buildHeaders(options),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
      `Upstream DELETE ${path} returned ${res.status}`,
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

export const loginWithCredentials = (
  username: string,
  password: string,
): Promise<ExchangeTokenResponse> =>
  apiPost<ExchangeTokenResponse>('/v1/auth/login', { username, password });

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

/**
 * Per ADR-0045 D1: the broker vertical discriminator. `SECURITIES` is the
 * SFC-licensed securities broker (existing behaviour); `BULLION` is a
 * HKGX-member bullion / precious-metals dealer. Mirrors the `BrokerCategory`
 * Prisma enum re-exported from `@opentrade/db` and the apps/web client type.
 */
export type BrokerCategory = 'SECURITIES' | 'BULLION';

export type BrokerListItem = {
  id: string;
  slug: string;
  // Per ADR-0045 D7: the vertical the admin broker table filters/labels by
  // (client-side, consistent with the existing search / claim / license
  // filters). Securities and bullion dealers share the same admin table.
  category: BrokerCategory;
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) for every broker reference.
  displayName: string;
  displayNameZhHans: string | null;
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
  periods: { from: string; to?: string }[];
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
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN).
  displayName: string;
  displayNameZhHans: string | null;
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
  ratingDistribution: { stars: number; count: number; percentage: number }[];
  licenses: BrokerLicense[];
  similarBrokers: {
    id: string;
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
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
  /** Legacy five-star value, retained until ADR-0028 D6 drop. */
  rating: number;
  /**
   * Per ADR-0028 D4 + D7: canonical review axis from M4 onward. Nullable
   * for legacy rows pre-M3.2 backfill; merchant-side surfaces fall back
   * to a legacy rating caption when null.
   */
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  status: string;
  createdAt: string;
};

export type BrokerReviewsResponse = {
  reviews: ReviewItem[];
  nextCursor: string | null;
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN). legalName is also surfaced via the upstream
  // payload but the console reviews page only needs the localised
  // header name so we add what's necessary for the helper.
  broker: {
    id: string;
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
    logoUrl: string | null;
  };
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
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) so the sidebar can render in the operator's locale.
  claimedBroker: {
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
  } | null;
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
  /**
   * Per ADR-0025: every broker the user has been approved for. Surfaced
   * directly on the list so admins can spot multi-broker users without
   * opening detail. Per cursor rule 51 + ADR-0026 each entry carries
   * all three localised display columns (TC + SC + EN) so the table
   * pills render via `localizedBrokerName()` in the operator's locale.
   */
  verifiedBrokers: {
    brokerSlug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
    approvedAt: string;
  }[];
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
  // Per cursor rule 51 + ADR-0026: every broker reference shipped from
  // the admin detail endpoint carries all three name columns (TC + SC +
  // EN); consumers must render via `localizedBrokerName(b, locale)`
  // rather than `b.displayName` (Traditional) or `b.brokerSlug`
  // (routing key).
  reviews: {
    id: string;
    title: string;
    rating: number;
    status: string;
    broker: {
      slug: string;
      displayName: string;
      displayNameZhHans: string | null;
      legalName: string | null;
    };
    createdAt: string;
  }[];
  verifications: {
    id: string;
    brokerSlug: string;
    brokerDisplayName: string;
    brokerDisplayNameZhHans: string | null;
    brokerLegalName: string | null;
    status: string;
    createdAt: string;
  }[];
  claims: {
    id: string;
    broker: {
      slug: string;
      displayName: string;
      displayNameZhHans: string | null;
      legalName: string | null;
    };
    status: string;
    createdAt: string;
  }[];
  verifiedBrokers: {
    brokerSlug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
    approvedAt: string;
  }[];
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
  /** Legacy five-star value, retained until ADR-0028 D6 drop. */
  rating: number;
  /**
   * Per ADR-0028 D4 + D7: canonical review axis from M4 onward. Nullable
   * for legacy rows pre-M3.2 backfill; the console table falls back to a
   * legacy rating caption in that case.
   */
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  status: string;
  txHash: string | null;
  ipfsCid: string | null;
  contentHash: string;
  chainReviewId: number | null;
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) so the admin reviews table renders in the
  // operator's locale.
  broker: {
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
  };
  author: { id: string; displayName: string | null };
  createdAt: string;
};

export type AdminReviewsResponse = {
  reviews: AdminReviewItem[];
  nextCursor: string | null;
};

export const fetchAdminReviews = (
  params?: {
    search?: string;
    status?: string;
    sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    brokerSlug?: string;
    cursor?: string;
  },
  options?: FetchOptions,
): Promise<AdminReviewsResponse> => {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.sentiment) query.set('sentiment', params.sentiment);
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
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) so the admin claims table renders in the
  // operator's locale.
  broker: {
    id: string;
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
  };
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

export type VerifiedBrokerEntry = {
  brokerSlug: string;
  // Per cursor rule 51 + ADR-0026: each verified-broker pill renders
  // in the operator's locale via `localizedBrokerName(b, locale)`
  // across all three name columns (TC + SC + EN).
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string | null;
  approvedAt: string;
};

export type VerificationItem = {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string | null;
    walletAddress: string | null;
    sbtTier: string;
    /**
     * Per ADR-0025: every broker the user has been approved for. The
     * verifications under review may or may not be in this list (a
     * PENDING/REJECTED record never lands here; only APPROVED does).
     * Phase 1 source of truth is the user_verified_brokers table.
     */
    verifiedBrokers: VerifiedBrokerEntry[];
  };
  brokerSlug: string;
  // Per cursor rule 51 + ADR-0026: top-level case row carries all three
  // name columns (TC + SC + EN) for the table column + case-modal
  // "Target broker" panel.
  brokerDisplayName: string;
  brokerDisplayNameZhHans: string | null;
  brokerLegalName: string | null;
  commitment: string;
  evidenceIpfsCid: string;
  evidenceMimeType: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export type AdminVerificationsResponse = { verifications: VerificationItem[] };

export const fetchAdminVerifications = (status = 'PENDING', options?: FetchOptions): Promise<AdminVerificationsResponse> =>
  apiGet<AdminVerificationsResponse>(`/v1/auth/admin/verifications?status=${status}`, options);

export const approveVerification = (id: string, adminNote?: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/auth/admin/verifications/${id}/approve`, { adminNote }, options);

export const rejectVerification = (id: string, adminNote: string, options?: FetchOptions) =>
  apiPost<{ status: string }>(`/v1/auth/admin/verifications/${id}/reject`, { adminNote }, options);

// ---------------------------------------------------------------------------
// Admin — complaint moderation per ADR-0029
//
// `status` filter is the derived OPEN / VERIFIED / REJECTED tri-state
// (per ADR-0029 D4, computed from `verifiedAt` + `adminNote`); the API
// translates it into a `where` clause server-side. Verify and reject
// are PATCH operations matching the ADR-0029 D4 URL spec.
// ---------------------------------------------------------------------------

export type AdminComplaintStatus = 'OPEN' | 'VERIFIED' | 'REJECTED';

export type AdminComplaintItem = {
  id: string;
  title: string;
  body: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  status: AdminComplaintStatus;
  evidenceIpfsCid: string;
  ipfsCid: string | null;
  contentHash: string;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  adminNote: string | null;
  broker: {
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
  } | null;
  author: { id: string; displayName: string | null } | null;
  createdAt: string;
};

export type AdminComplaintsResponse = {
  complaints: AdminComplaintItem[];
  nextCursor: string | null;
};

export const fetchAdminComplaints = (
  status?: AdminComplaintStatus,
  options?: FetchOptions,
): Promise<AdminComplaintsResponse> => {
  const search = status ? `?status=${status}` : '';
  return apiGet<AdminComplaintsResponse>(`/v1/admin/complaints${search}`, options);
};

export const verifyComplaint = (id: string, options?: FetchOptions) =>
  apiPatch<{ complaint: { id: string; verifiedAt: string | null } }>(
    `/v1/admin/complaints/${id}/verify`,
    {},
    options,
  );

export const rejectComplaint = (id: string, adminNote: string, options?: FetchOptions) =>
  apiPatch<{ complaint: { id: string; adminNote: string | null } }>(
    `/v1/admin/complaints/${id}/reject`,
    { adminNote },
    options,
  );

// ---------------------------------------------------------------------------
// Admin — KOL management per ADR-0036
// ---------------------------------------------------------------------------

export type KolStatus = 'UNCLAIMED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/** Per ADR-0053: the two independent, nullable KOL category dimensions. */
export type KolType = 'FINANCIAL_KOL' | 'INDICATOR_VENDOR';
export type KolFocus = 'EQUITY' | 'CRYPTO' | 'FOREX';

export type KolSocialLinks = {
  youtube?: string;
  instagram?: string;
  twitter?: string;
};

export type KolCredential = {
  type: string;
  verified: boolean;
  verifiedAt?: string;
};

export type AdminKolItem = {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: KolStatus;
  /**
   * Per ADR-0053: nullable category dimensions. `null` means "未分類 / not yet
   * assigned" — an admin sets or overrides them via `setKolCategory`.
   */
  type: KolType | null;
  focus: KolFocus | null;
  socialLinks: KolSocialLinks | null;
  credentials: KolCredential[] | null;
  iamSmartVerified: boolean;
  userId: string | null;
  kolSbtTokenId: number | null;
  /**
   * Rejection reason supplied by the admin moderator who rejected the
   * application (per ADR-0036 D1.1). Populated only for REJECTED rows;
   * APPROVED / PENDING / UNCLAIMED / SUSPENDED rows leave the previous
   * value untouched (idempotent re-write semantics on `updateStatus`).
   */
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminKolDetailResponse = {
  kol: AdminKolItem;
  signalCount: number;
  followerCount: number;
};

export type AdminKolsResponse = {
  kols: AdminKolItem[];
  total: number;
};

export const fetchAdminKols = (
  params?: { status?: KolStatus; limit?: number; offset?: number },
  options?: FetchOptions,
): Promise<AdminKolsResponse> => {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiGet<AdminKolsResponse>(`/v1/admin/kols${qs ? `?${qs}` : ''}`, options);
};

export const fetchAdminKolDetail = (
  id: string,
  options?: FetchOptions,
): Promise<AdminKolDetailResponse> =>
  apiGet<AdminKolDetailResponse>(`/v1/admin/kols/${id}`, options);

export const approveKol = (
  id: string,
  options?: FetchOptions,
): Promise<{ kol: AdminKolItem }> =>
  apiPatch<{ kol: AdminKolItem }>(`/v1/admin/kols/${id}/approve`, {}, options);

export const rejectKol = (
  id: string,
  adminNote: string,
  options?: FetchOptions,
): Promise<{ kol: AdminKolItem }> =>
  apiPatch<{ kol: AdminKolItem }>(`/v1/admin/kols/${id}/reject`, { adminNote }, options);

export const suspendKol = (
  id: string,
  options?: FetchOptions,
): Promise<{ kol: AdminKolItem }> =>
  apiPatch<{ kol: AdminKolItem }>(`/v1/admin/kols/${id}/suspend`, {}, options);

/**
 * Per ADR-0053 §3: set or clear a KOL's category dimensions. Send only the
 * keys to change — a `null` value clears that dimension back to "未分類", an
 * omitted key is left untouched server-side.
 */
export const setKolCategory = (
  id: string,
  category: { type?: KolType | null; focus?: KolFocus | null },
  options?: FetchOptions,
): Promise<{ kol: AdminKolItem }> =>
  apiPatch<{ kol: AdminKolItem }>(`/v1/admin/kols/${id}/category`, category, options);

// ---------------------------------------------------------------------------
// Admin — Signals read-only list per ADR-0036
// ---------------------------------------------------------------------------

export type SignalOutcome = 'ACTIVE' | 'HIT_TARGET' | 'HIT_DIRECTION' | 'STOPPED' | 'EXPIRED' | 'UNRESOLVED';
export type SignalDirection = 'BUY' | 'SELL' | 'HOLD';
export type AssetClass = 'EQUITY_HK' | 'EQUITY_US' | 'FUTURES' | 'SPOT' | 'FOREX' | 'CRYPTO';

export type AdminSignalItem = {
  id: string;
  kolId: string;
  assetClass: AssetClass;
  symbol: string;
  direction: SignalDirection;
  entryPrice: string;
  targetPrice: string;
  stoplossPrice: string | null;
  horizon: number;
  note: string | null;
  outcome: SignalOutcome;
  settledAt: string | null;
  settlePrice: string | null;
  periodHigh: string | null;
  periodLow: string | null;
  contentHash: string;
  createdAt: string;
};

export type AdminSignalsResponse = {
  signals: AdminSignalItem[];
  total: number;
};

export const fetchAdminSignals = (
  params?: { kolId?: string; symbol?: string; outcome?: SignalOutcome; limit?: number; offset?: number },
  options?: FetchOptions,
): Promise<AdminSignalsResponse> => {
  const query = new URLSearchParams();
  if (params?.kolId) query.set('kolId', params.kolId);
  if (params?.symbol) query.set('symbol', params.symbol);
  if (params?.outcome) query.set('outcome', params.outcome);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiGet<AdminSignalsResponse>(`/v1/signals${qs ? `?${qs}` : ''}`, options);
};

// ---------------------------------------------------------------------------
// Broker owner — stats
// ---------------------------------------------------------------------------

export type BrokerOwnerStatsResponse = {
  stats: {
    totalReviews: number;
    monthReviews: number;
    avgRating: number | null;
    positiveRate: number | null;
    totalComplaints: number;
    openComplaints: number;
    respondedComplaints: number;
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

// ---------------------------------------------------------------------------
// Broker owner — complaint inbox per ADR-0037
// ---------------------------------------------------------------------------

export type BrokerResponseItem = {
  id: string;
  body: string;
  contentHash: string;
  ipfsCid: string | null;
  sourceLocale: string | null;
  createdAt: string;
};

export type OwnerComplaintItem = {
  id: string;
  title: string;
  body: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  sourceLocale: string | null;
  evidenceIpfsCid: string | null;
  verifiedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  brokerResponse: BrokerResponseItem | null;
};

export type OwnerComplaintsResponse = {
  complaints: OwnerComplaintItem[];
  nextCursor: string | null;
};

export const fetchOwnerComplaints = (
  slug: string,
  params?: { responded?: 'true' | 'false'; cursor?: string },
  options?: FetchOptions,
): Promise<OwnerComplaintsResponse> => {
  const query = new URLSearchParams();
  if (params?.responded) query.set('responded', params.responded);
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  return apiGet<OwnerComplaintsResponse>(
    `/v1/brokers/${slug}/owner-complaints${qs ? `?${qs}` : ''}`,
    options,
  );
};

export type SubmitBrokerResponsePayload = {
  body: string;
  sourceLocale?: string;
};

export type SubmitBrokerResponseResponse = {
  response: {
    id: string;
    complaintId: string;
    body: string;
    contentHash: string;
    ipfsCid: string | null;
    sourceLocale: string | null;
    createdAt: string;
  };
};

export const submitBrokerResponse = (
  complaintId: string,
  payload: SubmitBrokerResponsePayload,
  options?: FetchOptions,
): Promise<SubmitBrokerResponseResponse> =>
  apiPost<SubmitBrokerResponseResponse>(
    `/v1/complaints/${complaintId}/broker-response`,
    payload,
    options,
  );

// ---------------------------------------------------------------------------
// Admin — moderation term management per ADR-0034 (Phase B)
//
// The blocklist is content-neutral (rule 52): only the four categories are
// enforced, and negative-opinion words are never blocked. Every mutation is
// audited server-side; this client surfaces the read-only audit trail.
// ---------------------------------------------------------------------------

export type ModerationCategory = 'PROFANITY' | 'ATTACK' | 'CONTACT' | 'ILLEGAL' | 'PII';

export type ModerationTermAuditAction = 'CREATE' | 'UPDATE' | 'ENABLE' | 'DISABLE' | 'DELETE';

export type AdminModerationTerm = {
  id: string;
  category: ModerationCategory;
  term: string;
  isRegex: boolean;
  enabled: boolean;
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminModerationTermsResponse = { terms: AdminModerationTerm[] };

export type AdminModerationTermAudit = {
  id: string;
  termId: string;
  action: ModerationTermAuditAction;
  beforeJson: unknown;
  afterJson: unknown;
  actorUserId: string | null;
  reason: string | null;
  createdAt: string;
};

export type AdminModerationAuditsResponse = { audits: AdminModerationTermAudit[] };

export type CreateModerationTermPayload = {
  category: ModerationCategory;
  term: string;
  isRegex?: boolean;
  note?: string | null;
  reason?: string;
};

export type UpdateModerationTermPayload = {
  category?: ModerationCategory;
  term?: string;
  isRegex?: boolean;
  note?: string | null;
  reason?: string;
};

export const fetchModerationTerms = (
  category?: ModerationCategory,
  options?: FetchOptions,
): Promise<AdminModerationTermsResponse> => {
  const search = category ? `?category=${category}` : '';
  return apiGet<AdminModerationTermsResponse>(`/v1/admin/moderation/terms${search}`, options);
};

export const createModerationTerm = (
  payload: CreateModerationTermPayload,
  options?: FetchOptions,
): Promise<{ term: AdminModerationTerm }> =>
  apiPost<{ term: AdminModerationTerm }>('/v1/admin/moderation/terms', payload, options);

export const updateModerationTerm = (
  id: string,
  payload: UpdateModerationTermPayload,
  options?: FetchOptions,
): Promise<{ term: AdminModerationTerm }> =>
  apiPatch<{ term: AdminModerationTerm }>(`/v1/admin/moderation/terms/${id}`, payload, options);

export const setModerationTermEnabled = (
  id: string,
  enabled: boolean,
  reason?: string,
  options?: FetchOptions,
): Promise<{ term: AdminModerationTerm }> =>
  apiPatch<{ term: AdminModerationTerm }>(
    `/v1/admin/moderation/terms/${id}/enabled`,
    reason !== undefined ? { enabled, reason } : { enabled },
    options,
  );

export const deleteModerationTerm = (
  id: string,
  reason?: string,
  options?: FetchOptions,
): Promise<{ term: AdminModerationTerm }> =>
  apiDelete<{ term: AdminModerationTerm }>(
    `/v1/admin/moderation/terms/${id}`,
    reason !== undefined ? { reason } : undefined,
    options,
  );

export const fetchModerationTermAudits = (
  id: string,
  options?: FetchOptions,
): Promise<AdminModerationAuditsResponse> =>
  apiGet<AdminModerationAuditsResponse>(`/v1/admin/moderation/terms/${id}/audits`, options);
