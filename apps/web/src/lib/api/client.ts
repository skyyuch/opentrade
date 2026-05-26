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

/**
 * Absolute URL for the API's IPFS-content charset proxy.
 *
 * The web app surfaces this on the ReviewCard as a "view original
 * (IPFS)" link. The endpoint serves the same bytes as the public
 * Pinata gateway, but with an explicit `Content-Type:
 * application/json; charset=utf-8` so browsers render CJK content
 * correctly instead of falling back to Latin-1. See
 * `apps/api/src/domains/reviews/application/GetReviewIpfsContentUseCase.ts`.
 */
export const reviewIpfsContentUrl = (reviewId: string): string =>
  `${env.NEXT_PUBLIC_API_URL}/v1/reviews/${reviewId}/ipfs-content`;

// ---------------------------------------------------------------------------
// Domain-specific typed fetchers
// ---------------------------------------------------------------------------

export const fetchHealth = (options?: FetchOptions): Promise<HealthReportDto> =>
  apiGet<HealthReportDto>('/v1/health', options);

export type BrokerListItem = {
  id: string;
  slug: string;
  // Per cursor rule 51 + ADR-0026: every broker reference ships all
  // three name columns (TC + SC + EN) so the consumer can pick by
  // locale via `localizedBrokerName()` from @opentrade/shared.
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string;
  logoUrl: string | null;
  isClaimed: boolean;
  reviewCount: number;
  positiveRate: number | null;
  /**
   * Per ADR-0025: number of distinct users who have been approved for
   * this broker. Independent of reviewCount — an unclaimed broker can
   * still have many verified reviewers behind its reviews.
   */
  verifiedUserCount: number;
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
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) so the consumer can pick by locale via
  // `localizedBrokerName()`.
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string | null;
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
  /**
   * Per ADR-0025: number of distinct users who have been verified for
   * this broker. Surfaced on the broker detail page as a credibility
   * signal complementary to the review-rating distribution.
   */
  verifiedUserCount: number;
  /**
   * Per ADR-0029 D1 + M7.6a: count of complaints against this broker
   * that an admin has marked verified (rule 00 «reject != delete» —
   * rejected complaints are intentionally excluded from this headline
   * number). Used by the M7.6b third tab to gate the red pill: `> 0`
   * renders red, `= 0` renders grey.
   */
  verifiedComplaintCount: number;
  /**
   * Per ADR-0028 D6: legacy five-bar distribution. Still shipped by the API
   * for pre-M5 consumers but the broker detail page no longer renders it
   * (M5.4 swapped the widget for SentimentDistribution).
   */
  ratingDistribution: RatingDistributionItem[];
  /**
   * Per ADR-0028 D7 + M4.4: counts of POSITIVE / NEUTRAL / NEGATIVE
   * sentiments across this broker's reviews. Null sentiments (legacy
   * pre-backfill rows) are excluded from the totals so they do not
   * pollute the distribution — readers see only definitive verdicts.
   */
  sentimentAggregate: {
    positive: number;
    neutral: number;
    negative: number;
  };
  licenses: BrokerLicense[];
  similarBrokers: SimilarBroker[];
};

export type BrokerDetailResponse = {
  broker: BrokerDetail;
};

export const fetchBroker = (slug: string, options?: FetchOptions): Promise<BrokerDetailResponse> =>
  apiGet<BrokerDetailResponse>(`/v1/brokers/${slug}`, options);

export type AuthorVerifiedBroker = {
  brokerSlug: string;
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN) so ReviewCard can render the badge in the reader's
  // locale via `localizedBrokerName()`. Slug alone forced English-
  // locale users to see Chinese-style slugs; the previous two-column
  // shape leaked Traditional Chinese into `zh-Hans` mode.
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string | null;
};

export type ReviewAuthor = {
  displayName: string | null;
  sbtTier: string;
  /**
   * Brokers the author has been verified for. Per ADR-0025 these are
   * surfaced as credibility badges on the review card; the API exposes
   * only the slug + display columns (no commitments / approvedAt) so
   * the public response stays cheap and minimal.
   */
  verifiedBrokers: AuthorVerifiedBroker[];
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
  /** Legacy five-star value, retained until ADR-0028 D6 drop. */
  rating: number;
  /**
   * Per ADR-0028 D4 + D7: the canonical review axis from M4 onward.
   * Nullable for legacy rows that pre-date M3.2 backfill or for rows
   * the backfill could not classify; the ReviewCard falls back to the
   * legacy rating caption ("依五星評分回推為 X 星") for those.
   */
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  status: string;
  /**
   * Per ADR-0027 D2 + D6: the locale the author was browsing in at
   * submit time. Rendered as a small badge on the ReviewCard so readers
   * know which language the original is in. Nullable for legacy rows
   * pre-dating ADR-0027; the D8 backfill script will fill those values
   * (Han ratio + OpenCC round-trip detection).
   */
  sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' | null;
  createdAt: string;
  author?: ReviewAuthor;
};

export type BrokerReviewsResponse = {
  reviews: ReviewItem[];
  nextCursor: string | null;
  // Per cursor rule 51 + ADR-0026: the header broker ships all three
  // name columns (TC + SC + EN) so SubmitReviewCta and any embedded
  // summary block stay locale-aware.
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

export type SubmitReviewInput = {
  brokerId: string;
  title: string;
  body: string;
  /**
   * Per ADR-0028 D4: sentiment is the canonical review axis from M4 onward;
   * the API requires it and the web form (post-M5.2) always sends it. The
   * use case synthesises a legacy `rating` value via D2 reverse mapping so
   * the deprecated `Review.rating` column keeps satisfying its NOT NULL
   * constraint through the D6 drop window.
   */
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  /**
   * Per ADR-0028 D4: legacy five-star value, now optional. The web form
   * (post-M5.2) does not send it; only kept in the type surface so an
   * external client / future admin tool can still submit it for migration
   * scenarios.
   */
  rating?: number;
  /**
   * Per ADR-0027 D2: the author's current next-intl locale. The frontend
   * always knows this (the user clicked through `[locale]` route to get
   * to the broker page) so we send it explicitly instead of relying on
   * the server's `Accept-Language` fallback.
   */
  sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en';
};

export type SubmitReviewResponse = {
  review: {
    id: string;
    brokerId: string;
    contentHash: string;
    ipfsCid: string | null;
    title: string;
    /** Legacy five-star value, kept until ADR-0028 D6 drop. */
    rating: number;
    /** Per ADR-0028 D4: required at submit time post-M4.3. */
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    status: string;
    createdAt: string;
  };
};

export const submitReview = (
  input: SubmitReviewInput,
  options: FetchOptions,
): Promise<SubmitReviewResponse> => apiPost<SubmitReviewResponse>('/v1/reviews', input, options);

// ---------------------------------------------------------------------------
// Complaints — per ADR-0029. Complaints share the Review pipeline with a
// `kind = COMPLAINT` discriminator and a required evidence IPFS CID. The
// server zod schema lives in `apps/api/src/domains/complaints/presentation/
// routes.ts` (see M7.5a for the title-optional / body-2000 cap that this
// shape mirrors). Submission requires the L2 reviewer SBT — non-L2 users
// must complete `/verify` first.
// ---------------------------------------------------------------------------

export type ComplaintSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type SubmitComplaintInput = {
  brokerId: string;
  /** Optional short headline (≤ 80 chars). Empty / undefined is allowed. */
  title?: string;
  body: string;
  /** IPFS CID of the evidence file pinned via {@link uploadVerifyEvidence}. */
  evidenceIpfsCid: string;
  /**
   * Per ADR-0028 + ADR-0029: complaints carry the same three-way axis as
   * reviews. Server defaults to `NEGATIVE` when omitted (the act of
   * complaining IS a negative-toned signal) but the surfaced web form
   * always sends an explicit value.
   */
  sentiment: ComplaintSentiment;
  /** Per ADR-0027 D2: the author's current next-intl locale. */
  sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en';
};

export type SubmitComplaintResponse = {
  complaint: {
    id: string;
    brokerId: string;
    contentHash: string;
    ipfsCid: string | null;
    evidenceIpfsCid: string;
    title: string;
    sentiment: ComplaintSentiment | null;
    sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' | null;
    verifiedAt: string | null;
    adminNote: string | null;
    createdAt: string;
  };
};

export const submitComplaint = (
  input: SubmitComplaintInput,
  options: FetchOptions,
): Promise<SubmitComplaintResponse> =>
  apiPost<SubmitComplaintResponse>('/v1/complaints', input, options);

/**
 * Per ADR-0029 D4: the public complaint card surfaces a derived
 * verification status. The server doesn't ship the discriminator as a
 * column — it's derived from the `(verifiedAt, adminNote)` pair so the
 * web computes it from the two timestamps once at render time.
 *
 *   - OPEN:     verifiedAt = null AND adminNote = null
 *   - VERIFIED: verifiedAt != null  (adminNote may be stale; ignored)
 *   - REJECTED: verifiedAt = null AND adminNote != null
 *
 * Per rule 00 «reject != delete» the body / title / evidence stay
 * visible in all three statuses; the badge + adminNote control the
 * verdict text only.
 */
export type ComplaintStatus = 'OPEN' | 'VERIFIED' | 'REJECTED';

export type BrokerResponseDisplay = {
  id: string;
  body: string;
  contentHash: string;
  ipfsCid: string | null;
  sourceLocale: string | null;
  createdAt: string;
};

export type ComplaintItem = {
  id: string;
  brokerId: string;
  contentHash: string;
  ipfsCid: string | null;
  /** Per ADR-0029 D3: every complaint carries an evidence CID. */
  evidenceIpfsCid: string;
  title: string;
  body: string;
  sentiment: ComplaintSentiment | null;
  sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' | null;
  /** ISO-8601 string when an admin has verified the complaint; null otherwise. */
  verifiedAt: string | null;
  /**
   * Per ADR-0029 D4: populated when an admin rejected the complaint
   * (verdict text shown next to the "not verified by platform" pill).
   * Always null for OPEN / VERIFIED rows.
   */
  adminNote: string | null;
  /** Per ADR-0037: broker response nested object, null if not yet responded. */
  brokerResponse: BrokerResponseDisplay | null;
  createdAt: string;
};

export type BrokerComplaintsResponse = {
  complaints: ComplaintItem[];
  nextCursor: string | null;
  broker: {
    id: string;
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string | null;
    logoUrl: string | null;
  };
};

/**
 * Derives the public status badge from the two timestamps + adminNote
 * (per ADR-0029 D4). Co-located with the type so consumers don't
 * reinvent the logic — the M7.6b ComplaintCard and any future surface
 * (M10 商戶後台 inbox per STAGING.md S4) share this single helper.
 */
export const deriveComplaintStatus = (complaint: ComplaintItem): ComplaintStatus => {
  if (complaint.verifiedAt) return 'VERIFIED';
  if (complaint.adminNote) return 'REJECTED';
  return 'OPEN';
};

export const fetchBrokerComplaints = (
  slug: string,
  options?: FetchOptions,
): Promise<BrokerComplaintsResponse> =>
  apiGet<BrokerComplaintsResponse>(`/v1/complaints/broker/${slug}`, options);

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
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN). Pending / rejected cards display the broker name
  // in the user's locale via `localizedBrokerName()`.
  brokerDisplayName: string;
  brokerDisplayNameZhHans: string | null;
  brokerLegalName: string | null;
  commitment: string;
  status: VerificationStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type VerifiedBrokerEntry = {
  brokerSlug: string;
  // Per cursor rule 51 + ADR-0026: ship all three name columns
  // (TC + SC + EN). Settings + /verify cards iterate this list.
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string | null;
  approvedAt: string;
};

export type VerificationStatusResponse = {
  verifications: VerificationStatusItem[];
  verifiedBrokers: VerifiedBrokerEntry[];
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

// ---------------------------------------------------------------------------
// KOL — public directory + profile + follow (per ADR-0036)
// ---------------------------------------------------------------------------

export type KolStatus = 'UNCLAIMED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

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

export type KolListItem = {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: KolStatus;
  socialLinks: KolSocialLinks | null;
  credentials: KolCredential[] | null;
  iamSmartVerified: boolean;
  createdAt: string;
};

export type KolsResponse = {
  kols: KolListItem[];
  total: number;
};

export const fetchKols = (
  params?: { limit?: number; offset?: number },
  options?: FetchOptions,
): Promise<KolsResponse> => {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiGet<KolsResponse>(`/v1/kols${qs ? `?${qs}` : ''}`, options);
};

export type KolProfileResponse = {
  kol: KolListItem;
  signalCount: number;
  followerCount: number;
};

export const fetchKolProfile = (
  slug: string,
  options?: FetchOptions,
): Promise<KolProfileResponse> =>
  apiGet<KolProfileResponse>(`/v1/kols/${slug}`, options);

export const followKol = (
  slug: string,
  options: FetchOptions,
): Promise<{ followed: boolean }> =>
  apiPost<{ followed: boolean }>(`/v1/kols/${slug}/follow`, {}, options);

export const unfollowKol = (
  slug: string,
  options: FetchOptions,
): Promise<{ followed: boolean }> => {
  const url = `${env.NEXT_PUBLIC_API_URL}/v1/kols/${slug}/follow`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }
  return fetch(url, { method: 'DELETE', headers }).then(async (res) => {
    if (!res.ok) {
      throw new ApiClientError(res.status, 'INTERNAL_ERROR', `DELETE /v1/kols/${slug}/follow returned ${res.status}`);
    }
    return (await res.json()) as { followed: boolean };
  });
};

// ---------------------------------------------------------------------------
// Signals — public list + detail (per ADR-0036)
// ---------------------------------------------------------------------------

export type SignalOutcome = 'ACTIVE' | 'HIT_TARGET' | 'HIT_DIRECTION' | 'STOPPED' | 'EXPIRED' | 'UNRESOLVED';
export type SignalDirection = 'BUY' | 'SELL' | 'HOLD';
export type AssetClass = 'EQUITY_HK' | 'EQUITY_US' | 'FUTURES' | 'SPOT' | 'FOREX' | 'CRYPTO';

export type SignalItem = {
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

export type SignalsResponse = {
  signals: SignalItem[];
  total: number;
};

export const fetchSignals = (
  params?: { kolId?: string; symbol?: string; outcome?: SignalOutcome; limit?: number; offset?: number },
  options?: FetchOptions,
): Promise<SignalsResponse> => {
  const query = new URLSearchParams();
  if (params?.kolId) query.set('kolId', params.kolId);
  if (params?.symbol) query.set('symbol', params.symbol);
  if (params?.outcome) query.set('outcome', params.outcome);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiGet<SignalsResponse>(`/v1/signals${qs ? `?${qs}` : ''}`, options);
};

export const fetchSignal = (
  id: string,
  options?: FetchOptions,
): Promise<{ signal: SignalItem }> =>
  apiGet<{ signal: SignalItem }>(`/v1/signals/${id}`, options);

export const fetchKolSignals = (
  slug: string,
  params?: { outcome?: SignalOutcome; limit?: number; offset?: number },
  options?: FetchOptions,
): Promise<SignalsResponse> => {
  const query = new URLSearchParams();
  if (params?.outcome) query.set('outcome', params.outcome);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiGet<SignalsResponse>(`/v1/kols/${slug}/signals${qs ? `?${qs}` : ''}`, options);
};

