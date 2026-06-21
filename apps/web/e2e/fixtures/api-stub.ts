/**
 * Tiny zero-dependency HTTP stub for the `@opentrade/api` surface
 * `apps/web` reads from on its server-rendered broker detail page.
 *
 * Lives entirely outside the production code path — Playwright spawns
 * this from `playwright.config.ts` and points `NEXT_PUBLIC_API_URL` at
 * its port, so the Next.js server-render fetches land here instead of
 * the real API. This is what lets us run M6.3b's e2e fully air-gapped:
 * no real API, no real DB, no Pinata, no Privy, no chain.
 *
 * Per cursor rule 50 the stub is test-only — it never ships, never
 * runs in dev/staging/prod, and lives under `apps/web/e2e/` which is
 * excluded from `tsconfig.json`'s build include set.
 *
 * The fixtures intentionally cover ADR-0028 D7's two read-path branches:
 *   1. Rows with a non-null `sentiment` → SentimentBadge renders
 *      (one POSITIVE, one NEUTRAL, one NEGATIVE so all three
 *      neon-theme variants appear on the page).
 *   2. A row with `sentiment === null` → ReviewCard falls back to the
 *      legacy `legacyRatingCaption` JSX. This is the load-bearing
 *      assertion for the deprecation-window UX promise: pre-backfill
 *      reviews never re-render the star widget.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { AddressInfo } from 'node:net';

const BROKER_SLUG = 'sentiment-test-securities';
const BROKER_ID = 'broker-uuid-e2e-1';

const broker = {
  id: BROKER_ID,
  slug: BROKER_SLUG,
  displayName: 'Sentiment Test Securities',
  displayNameZhHans: '情感測試證券',
  legalName: 'Sentiment Test Securities Ltd.',
  ceNumber: 'BTE111',
  description: 'A fixture broker used only by `apps/web` e2e tests.',
  websiteUrl: 'https://example.com',
  logoUrl: null,
  addressEn: null,
  addressZh: null,
  sfcDetailJson: null,
  isClaimed: false,
  activeYears: 5,
  reviewCount: 4,
  positiveRate: 0.5,
  verifiedUserCount: 2,
  // M7.7: bumped to 1 to match the single VERIFIED complaint in the
  // `complaints` fixture below. The third-tab red pill renders against
  // this number — `> 0` means the pill is red, `= 0` grey.
  verifiedComplaintCount: 1,
  ratingDistribution: [
    { rating: 1, count: 1 },
    { rating: 2, count: 0 },
    { rating: 3, count: 1 },
    { rating: 4, count: 0 },
    { rating: 5, count: 2 },
  ],
  sentimentAggregate: {
    positive: 2,
    neutral: 1,
    negative: 1,
  },
  licenses: [
    {
      regulator: 'HK_SFC',
      licenseNumber: 'BTE111',
      licenseType: 'HK_SFC_TYPE_1',
      status: 'ACTIVE',
    },
  ],
  similarBrokers: [],
};

const brokerHeader = {
  id: BROKER_ID,
  slug: BROKER_SLUG,
  displayName: broker.displayName,
  displayNameZhHans: broker.displayNameZhHans,
  legalName: broker.legalName,
  logoUrl: broker.logoUrl,
};

// List-endpoint projection of the securities broker (the `GET /v1/brokers`
// shape differs from the detail shape). Only used as the non-bullion
// fallback for the list handler below.
const securitiesListItem = {
  id: BROKER_ID,
  slug: BROKER_SLUG,
  category: 'SECURITIES' as const,
  displayName: broker.displayName,
  displayNameZhHans: broker.displayNameZhHans,
  legalName: broker.legalName,
  logoUrl: broker.logoUrl,
  isClaimed: broker.isClaimed,
  reviewCount: broker.reviewCount,
  positiveRate: 50,
  verifiedUserCount: broker.verifiedUserCount,
  licenseTypes: ['HK_SFC_TYPE_1'],
  licenses: [{ regulator: 'HK_SFC', licenseNumber: 'BTE111', status: 'ACTIVE' }],
  hasDisciplinary: false,
};

const reviews = [
  {
    id: 'review-e2e-positive',
    brokerId: BROKER_ID,
    contentHash: '0xpositive',
    ipfsCid: 'bafy-positive',
    chainReviewId: 1001,
    txHash: '0xtxpositive',
    title: 'Outstanding execution speed',
    body: 'Order fills were consistently sub-second across HK and US sessions over six months of use.',
    rating: 5,
    sentiment: 'POSITIVE' as const,
    status: 'CONFIRMED',
    sourceLocale: 'en' as const,
    createdAt: '2026-04-01T08:00:00.000Z',
    author: {
      displayName: 'Alice E2E',
      sbtTier: 'L2',
      verifiedBrokers: [],
    },
  },
  {
    id: 'review-e2e-neutral',
    brokerId: BROKER_ID,
    contentHash: '0xneutral',
    ipfsCid: 'bafy-neutral',
    chainReviewId: 1002,
    txHash: '0xtxneutral',
    title: 'Mixed experience overall',
    body: 'Good execution speed but the mobile app crashes once a week on average — neither great nor terrible.',
    rating: 3,
    sentiment: 'NEUTRAL' as const,
    status: 'CONFIRMED',
    sourceLocale: 'en' as const,
    createdAt: '2026-03-15T08:00:00.000Z',
    author: {
      displayName: 'Bob E2E',
      sbtTier: 'L1',
      verifiedBrokers: [],
    },
  },
  {
    id: 'review-e2e-negative',
    brokerId: BROKER_ID,
    contentHash: '0xnegative',
    ipfsCid: 'bafy-negative',
    chainReviewId: 1003,
    txHash: '0xtxnegative',
    title: 'Withdrawal delayed for two weeks',
    body: 'Submitted a withdrawal request that was not honoured for 14 business days despite repeated escalation.',
    rating: 1,
    sentiment: 'NEGATIVE' as const,
    status: 'CONFIRMED',
    sourceLocale: 'en' as const,
    createdAt: '2026-03-01T08:00:00.000Z',
    author: {
      displayName: 'Carol E2E',
      sbtTier: 'L1',
      verifiedBrokers: [],
    },
  },
  {
    id: 'review-e2e-legacy-null',
    brokerId: BROKER_ID,
    contentHash: '0xlegacy',
    ipfsCid: null,
    chainReviewId: null,
    txHash: null,
    title: 'Legacy pre-backfill review',
    body: 'This review was submitted before the M3.2 sentiment backfill could classify it, so its sentiment column is null.',
    rating: 4,
    sentiment: null,
    status: 'CONFIRMED',
    sourceLocale: null,
    createdAt: '2025-09-10T08:00:00.000Z',
    author: {
      displayName: 'David E2E',
      sbtTier: 'L1',
      verifiedBrokers: [],
    },
  },
];

// M7.7: complaints fixtures exercise the full three-status matrix of
// ADR-0029 D4 against the M7.6b broker-detail third tab.
// - OPEN: verifiedAt = null AND adminNote = null (under review)
// - VERIFIED: verifiedAt != null (platform substantiated the claim)
// - REJECTED: verifiedAt = null AND adminNote != null (per rule 00
//   «reject != delete» the body stays visible and the adminNote text
//   is rendered inline)
const complaints = [
  {
    id: 'complaint-e2e-verified',
    brokerId: BROKER_ID,
    contentHash: '0xverifiedcomplainthash',
    ipfsCid: 'bafy-complaint-verified',
    evidenceIpfsCid: 'bafy-evidence-verified',
    title: 'Phantom trades on July statement',
    body: 'My July statement shows two USD/HKD trades I never placed; broker support has not responded after 14 days.',
    sentiment: 'NEGATIVE' as const,
    sourceLocale: 'en' as const,
    verifiedAt: '2026-05-10T00:00:00.000Z',
    adminNote: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    brokerResponse: {
      id: 'rsp-e2e-verified',
      body: 'We have investigated and found a system error that caused two erroneous trades. Both have been reversed and credited back to your account.',
      contentHash: '0xbrokerresponsehash01',
      ipfsCid: 'bafy-broker-response-verified',
      sourceLocale: 'en',
      createdAt: '2026-04-25T00:00:00.000Z',
    },
  },
  {
    id: 'complaint-e2e-rejected',
    brokerId: BROKER_ID,
    contentHash: '0xrejectedcomplainthash',
    ipfsCid: 'bafy-complaint-rejected',
    evidenceIpfsCid: 'bafy-evidence-rejected',
    title: 'Withdrawal fees too high',
    body: 'Broker charged 2% withdrawal fee on a transfer above the disclosed limit.',
    sentiment: 'NEGATIVE' as const,
    sourceLocale: 'en' as const,
    verifiedAt: null,
    adminNote:
      'Reviewed the evidence file (PDF statement). The 2% fee is disclosed in the broker tariff schedule and applies above the disclosed threshold; this is a contractual term, not a breach.',
    createdAt: '2026-04-15T00:00:00.000Z',
    brokerResponse: null,
  },
  {
    id: 'complaint-e2e-open',
    brokerId: BROKER_ID,
    contentHash: '0xopencomplainthash',
    ipfsCid: 'bafy-complaint-open',
    evidenceIpfsCid: 'bafy-evidence-open',
    title: 'Order rejected without reason',
    body: 'Limit order on HSBC stock was rejected by the platform without any rejection reason in the order book.',
    sentiment: 'NEGATIVE' as const,
    sourceLocale: 'en' as const,
    verifiedAt: null,
    adminNote: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    brokerResponse: null,
  },
];

// ADR-0045 §6: a single HKGX bullion dealer drives the bullion list →
// detail → tab-switch e2e. It is a Broker row with category = BULLION whose
// slug is namespaced `hkgx-{memberCode}` (never collides with an SFC slug),
// carrying a single HK_HKGX membership license (the 行員 number) instead of
// SFC regulated-activity types. The list endpoint filters on `?category=`.
const BULLION_SLUG = 'hkgx-009';
const BULLION_ID = 'broker-uuid-e2e-bullion-1';

const bullionListItem = {
  id: BULLION_ID,
  slug: BULLION_SLUG,
  category: 'BULLION' as const,
  displayName: '恆豐金號',
  displayNameZhHans: '恒丰金号',
  legalName: 'Heng Fung Bullion E2E Ltd.',
  logoUrl: null,
  isClaimed: false,
  reviewCount: 1,
  positiveRate: 100,
  verifiedUserCount: 0,
  licenseTypes: [],
  licenses: [{ regulator: 'HK_HKGX', licenseNumber: '009', status: 'ACTIVE' }],
  hasDisciplinary: false,
};

const bullionBroker = {
  id: BULLION_ID,
  slug: BULLION_SLUG,
  category: 'BULLION' as const,
  displayName: '恆豐金號',
  displayNameZhHans: '恒丰金号',
  legalName: 'Heng Fung Bullion E2E Ltd.',
  ceNumber: null,
  description: 'An HKGX member bullion dealer fixture used only by e2e tests.',
  websiteUrl: 'https://example.com',
  logoUrl: null,
  addressEn: null,
  addressZh: null,
  sfcDetailJson: null,
  isClaimed: false,
  activeYears: 14,
  reviewCount: 1,
  positiveRate: 100,
  verifiedUserCount: 0,
  verifiedComplaintCount: 0,
  ratingDistribution: [],
  sentimentAggregate: { positive: 1, neutral: 0, negative: 0 },
  licenses: [
    {
      regulator: 'HK_HKGX',
      licenseNumber: '009',
      licenseType: 'HK_HKGX_MEMBER',
      status: 'ACTIVE',
      issuedAt: '2010-01-01T00:00:00.000Z',
    },
  ],
  similarBrokers: [],
};

const bullionBrokerHeader = {
  id: BULLION_ID,
  slug: BULLION_SLUG,
  displayName: bullionBroker.displayName,
  displayNameZhHans: bullionBroker.displayNameZhHans,
  legalName: bullionBroker.legalName,
  logoUrl: bullionBroker.logoUrl,
};

const bullionReviews = [
  {
    id: 'review-e2e-bullion-positive',
    brokerId: BULLION_ID,
    contentHash: '0xbullionpositive',
    ipfsCid: 'bafy-bullion-positive',
    chainReviewId: 2001,
    txHash: '0xtxbullionpositive',
    title: 'Fair spreads on physical gold',
    body: 'Bought and sold physical taels several times; quoted spreads matched the board and settlement was same-day.',
    rating: 5,
    sentiment: 'POSITIVE' as const,
    status: 'CONFIRMED',
    sourceLocale: 'en' as const,
    createdAt: '2026-04-05T08:00:00.000Z',
    author: {
      displayName: 'Gloria E2E',
      sbtTier: 'L2',
      verifiedBrokers: [],
    },
  },
];

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('content-length', Buffer.byteLength(payload).toString());
  res.end(payload);
};

const sendError = (res: ServerResponse, status: number, code: string, message: string): void => {
  sendJson(res, status, { error: { code, message } });
};

const handle = (req: IncomingMessage, res: ServerResponse): void => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';
  const path = url.split('?')[0] ?? '/';
  const query = new URLSearchParams(url.split('?')[1] ?? '');

  // ADR-0045 D2/D7: the broker list endpoint filters on `?category=`. The
  // bullion directory page + grid pin `category=BULLION`; anything else (or
  // no category) falls back to the securities list item so the existing
  // securities surfaces keep working.
  if (method === 'GET' && path === '/v1/brokers') {
    const category = query.get('category');
    const brokers = category === 'BULLION' ? [bullionListItem] : [securitiesListItem];
    sendJson(res, 200, { brokers, nextCursor: null });
    return;
  }

  // Bullion detail / reviews / complaints (hkgx-009). Checked before the
  // securities slug branches because the slugs are disjoint namespaces.
  if (method === 'GET' && path === `/v1/brokers/${BULLION_SLUG}`) {
    sendJson(res, 200, { broker: bullionBroker });
    return;
  }
  if (method === 'GET' && path.startsWith(`/v1/reviews/broker/${BULLION_SLUG}`)) {
    sendJson(res, 200, { reviews: bullionReviews, nextCursor: null, broker: bullionBrokerHeader });
    return;
  }
  if (method === 'GET' && path.startsWith(`/v1/complaints/broker/${BULLION_SLUG}`)) {
    sendJson(res, 200, { complaints: [], nextCursor: null, broker: bullionBrokerHeader });
    return;
  }

  if (method === 'GET' && url.startsWith(`/v1/brokers/${BROKER_SLUG}`)) {
    sendJson(res, 200, { broker });
    return;
  }
  if (method === 'GET' && url.startsWith(`/v1/reviews/broker/${BROKER_SLUG}`)) {
    sendJson(res, 200, { reviews, nextCursor: null, broker: brokerHeader });
    return;
  }
  // M7.7: complaints endpoint mirrors the /reviews/broker/:slug shape
  // (per ADR-0029 D1 the wire surfaces stay distinct even though they
  // share the underlying table).
  if (method === 'GET' && url.startsWith(`/v1/complaints/broker/${BROKER_SLUG}`)) {
    sendJson(res, 200, { complaints, nextCursor: null, broker: brokerHeader });
    return;
  }
  if (method === 'GET' && url === '/v1/health') {
    sendJson(res, 200, { ok: true });
    return;
  }
  sendError(res, 404, 'NOT_FOUND', `Unstubbed ${method} ${url}`);
};

export const startApiStub = (port = 0): Promise<{ url: string; server: Server }> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => handle(req, res));
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${address.port}`, server });
    });
  });

export const SEED = {
  brokerSlug: BROKER_SLUG,
  brokerId: BROKER_ID,
  reviewCount: reviews.length,
  complaintCount: complaints.length,
  verifiedComplaintCount: complaints.filter((c) => c.verifiedAt !== null).length,
  // ADR-0045 §6: bullion (HKGX) fixture for the bullion list → detail e2e.
  bullionSlug: BULLION_SLUG,
  bullionId: BULLION_ID,
  bullionLegalName: bullionBroker.legalName,
  bullionMemberNumber: '009',
};

// Entrypoint when spawned as a standalone process (Playwright webServer)
const isMain = (): boolean => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
};

if (isMain()) {
  const port = Number(process.env['API_STUB_PORT'] ?? 4010);
  void startApiStub(port).then(({ url }) => {
    process.stdout.write(`[api-stub] listening on ${url}\n`);
  });
}
