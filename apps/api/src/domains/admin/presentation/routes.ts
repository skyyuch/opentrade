/**
 * Hono router for the admin domain.
 *
 * Cross-cutting admin endpoints that span multiple business domains.
 * All endpoints require `authMiddleware('admin')`.
 *
 * Endpoints:
 *   GET /stats          — Platform KPI stats
 *   GET /users          — User list (paginated + search + filter)
 *   GET /users/:id      — User detail (with reviews + requests history)
 *   PATCH /users/:id/role — Update user role
 *   GET /reviews        — All reviews (paginated + search + filter)
 *   GET /activity       — Recent activity feed
 *
 * Mounted under `/v1/admin` by `http/server.ts`.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { hydrateBrokerNames } from '../../../shared/brokerHydration.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { ListComplaintsUseCase } from '../../complaints/application/ListComplaintsUseCase.js';
import { VerifyComplaintUseCase } from '../../complaints/application/VerifyComplaintUseCase.js';
import { PrismaComplaintRepository } from '../../complaints/infrastructure/PrismaComplaintRepository.js';
import { ListKolsUseCase } from '../../kols/application/ListKolsUseCase.js';
import { UpdateKolCategoryUseCase } from '../../kols/application/UpdateKolCategoryUseCase.js';
import { PrismaKolRepository } from '../../kols/infrastructure/PrismaKolRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

export const adminRouter = new Hono<AppHonoEnv>();

// ---------------------------------------------------------------------------
// GET /stats — Platform KPI
// ---------------------------------------------------------------------------

adminRouter.get('/stats', authMiddleware('admin'), async (c) => {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    usersLastWeek,
    totalReviews,
    reviewsLastWeek,
    pendingClaims,
    pendingVerifications,
    claimedBrokers,
    totalBrokers,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null } }),
    prisma.user.count({
      where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.review.count({ where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null } }),
    prisma.review.count({
      where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.brokerClaimRequest.count({
      where: { tenantId: DEFAULT_TENANT_ID, status: 'PENDING' },
    }),
    prisma.sbtVerificationRequest.count({
      where: { tenantId: DEFAULT_TENANT_ID, status: 'PENDING' },
    }),
    prisma.broker.count({
      where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null, isClaimed: true },
    }),
    prisma.broker.count({ where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null } }),
  ]);

  return c.json({
    stats: {
      totalUsers,
      usersGrowth: usersLastWeek,
      totalReviews,
      reviewsGrowth: reviewsLastWeek,
      pendingApprovals: pendingClaims + pendingVerifications,
      pendingClaims,
      pendingVerifications,
      claimedBrokers,
      totalBrokers,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /users — User list
// ---------------------------------------------------------------------------

const listUsersSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  search: z.string().max(100).optional(),
  role: z.enum(['USER', 'REVIEWER', 'JURY', 'ADMIN']).optional(),
  sbtTier: z.enum(['L1', 'L2', 'L3', 'L4']).optional(),
});

adminRouter.get('/users', authMiddleware('admin'), async (c) => {
  const query = listUsersSchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const limit = Math.min(query.data.limit ?? 20, 50);

  const rows = await prisma.user.findMany({
    where: {
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
      ...(query.data.role ? { role: query.data.role } : {}),
      ...(query.data.sbtTier ? { sbtTier: query.data.sbtTier } : {}),
      ...(query.data.search
        ? {
            OR: [
              { displayName: { contains: query.data.search, mode: 'insensitive' as const } },
              { email: { contains: query.data.search, mode: 'insensitive' as const } },
              { walletAddress: { contains: query.data.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    // Per ADR-0025: surface each user's verified-broker list directly on
    // the admin user table so operations can spot multi-broker users
    // without opening every detail page. Only the slug is exposed (no
    // commitments) since the table only renders pills.
    include: {
      verifiedBrokers: {
        select: { brokerSlug: true, approvedAt: true },
        orderBy: { approvedAt: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' as const }],
    take: limit + 1,
    ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  // Per cursor rule 51: ship localised name columns for every broker
  // referenced in the response so the admin pill list and detail panel
  // render in the operator's locale instead of bare slugs.
  const allSlugs = items.flatMap((u) => u.verifiedBrokers.map((b) => b.brokerSlug));
  const nameMap = await hydrateBrokerNames(allSlugs, DEFAULT_TENANT_ID);

  return c.json({
    users: items.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email ? `${u.email.slice(0, 3)}***` : null,
      walletAddress: u.walletAddress
        ? `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}`
        : null,
      role: u.role,
      sbtTier: u.sbtTier,
      createdAt: u.createdAt.toISOString(),
      verifiedBrokers: u.verifiedBrokers.map((b) => {
        const meta = nameMap.get(b.brokerSlug);
        return {
          brokerSlug: b.brokerSlug,
          // Per ADR-0026: ship all three name columns (TC + SC + EN).
          displayName: meta?.displayName ?? b.brokerSlug,
          displayNameZhHans: meta?.displayNameZhHans ?? null,
          legalName: meta?.legalName ?? null,
          approvedAt: b.approvedAt.toISOString(),
        };
      }),
    })),
    nextCursor,
  });
});

// ---------------------------------------------------------------------------
// GET /users/:id — User detail
// ---------------------------------------------------------------------------

adminRouter.get('/users/:id', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const user = await prisma.user.findFirst({
    where: { id, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
  });

  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
  }

  // Per cursor rule 51 + ADR-0026: every broker reference shipped here
  // MUST carry all three name columns — `displayName` (Traditional),
  // `displayNameZhHans` (Simplified), and `legalName` (English). Reviews
  // + claims already join the broker row, so we just widen their
  // `select`; the verifications + verifiedBrokers lists hold raw slugs
  // and need a `hydrateBrokerNames` round-trip.
  const [reviews, verifications, claims, verifiedBrokers] = await Promise.all([
    prisma.review.findMany({
      where: { userId: id, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        broker: {
          select: {
            slug: true,
            displayName: true,
            displayNameZhHans: true,
            legalName: true,
          },
        },
      },
    }),
    prisma.sbtVerificationRequest.findMany({
      where: { userId: id, tenantId: DEFAULT_TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.brokerClaimRequest.findMany({
      where: { userId: id, tenantId: DEFAULT_TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        broker: {
          select: {
            slug: true,
            displayName: true,
            displayNameZhHans: true,
            legalName: true,
          },
        },
      },
    }),
    // Per ADR-0025: complement the verifications history (which mixes
    // PENDING/REJECTED rows) with the canonical APPROVED ledger so the
    // admin detail page can render a clean "currently verified" panel.
    prisma.userVerifiedBroker.findMany({
      where: { userId: id, tenantId: DEFAULT_TENANT_ID },
      orderBy: { approvedAt: 'asc' },
      select: { brokerSlug: true, approvedAt: true },
    }),
  ]);

  const slugSlugs = [
    ...verifications.map((v) => v.brokerSlug),
    ...verifiedBrokers.map((b) => b.brokerSlug),
  ];
  const nameMap = await hydrateBrokerNames(slugSlugs, DEFAULT_TENANT_ID);

  return c.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email ? `${user.email.slice(0, 3)}***` : null,
      walletAddress: user.walletAddress,
      role: user.role,
      sbtTier: user.sbtTier,
      sbtTokenId: user.sbtTokenId,
      sbtMintTxHash: user.sbtMintTxHash,
      createdAt: user.createdAt.toISOString(),
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      title: r.title,
      rating: r.rating,
      status: r.status,
      broker: r.broker,
      createdAt: r.createdAt.toISOString(),
    })),
    verifications: verifications.map((v) => {
      const meta = nameMap.get(v.brokerSlug);
      return {
        id: v.id,
        brokerSlug: v.brokerSlug,
        // Per ADR-0026: ship all three name columns (TC + SC + EN).
        brokerDisplayName: meta?.displayName ?? v.brokerSlug,
        brokerDisplayNameZhHans: meta?.displayNameZhHans ?? null,
        brokerLegalName: meta?.legalName ?? null,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
      };
    }),
    claims: claims.map((cl) => ({
      id: cl.id,
      broker: cl.broker,
      status: cl.status,
      createdAt: cl.createdAt.toISOString(),
    })),
    verifiedBrokers: verifiedBrokers.map((b) => {
      const meta = nameMap.get(b.brokerSlug);
      return {
        brokerSlug: b.brokerSlug,
        // Per ADR-0026: ship all three name columns (TC + SC + EN).
        displayName: meta?.displayName ?? b.brokerSlug,
        displayNameZhHans: meta?.displayNameZhHans ?? null,
        legalName: meta?.legalName ?? null,
        approvedAt: b.approvedAt.toISOString(),
      };
    }),
  });
});

// ---------------------------------------------------------------------------
// POST /users — Manually create user (for operational staff)
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  role: z.enum(['USER', 'REVIEWER', 'JURY', 'ADMIN']),
});

adminRouter.post('/users', authMiddleware('admin'), async (c) => {
  const body: unknown = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid user data', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const { displayName, email, walletAddress, role } = parsed.data;

  if (walletAddress) {
    const existing = await prisma.user.findFirst({
      where: { walletAddress, deletedAt: null },
    });
    if (existing) {
      throw new AppError(ErrorCode.CONFLICT, 'Wallet address already in use', 409);
    }
  }

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
    });
    if (existing) {
      throw new AppError(ErrorCode.CONFLICT, 'Email already in use', 409);
    }
  }

  const placeholderPrivyId = `manual:${crypto.randomUUID()}`;

  const user = await prisma.user.create({
    data: {
      tenantId: DEFAULT_TENANT_ID,
      privyId: placeholderPrivyId,
      displayName,
      email: email ?? null,
      walletAddress: walletAddress ?? null,
      role,
    },
  });

  return c.json(
    {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        walletAddress: user.walletAddress,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// PATCH /users/:id/role — Update user role
// ---------------------------------------------------------------------------

const updateRoleSchema = z.object({
  role: z.enum(['USER', 'REVIEWER', 'JURY', 'ADMIN']),
});

adminRouter.patch('/users/:id/role', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json();
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid role', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const user = await prisma.user.findFirst({
    where: { id, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
  });
  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
  });

  return c.json({
    user: {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role,
      sbtTier: updated.sbtTier,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /reviews — All reviews (admin view)
// ---------------------------------------------------------------------------

const listReviewsSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  search: z.string().max(100).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED']).optional(),
  brokerSlug: z.string().max(100).optional(),
  // Per ADR-0028 D7: console operators filter by the canonical sentiment
  // axis. The composite index [tenantId, brokerId, sentiment] (M3.1) is
  // not directly useful here (no brokerId narrowing in the global view)
  // but the sentiment column on its own is highly selective at three
  // distinct values, so Postgres will pick a partial range scan.
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
});

adminRouter.get('/reviews', authMiddleware('admin'), async (c) => {
  const query = listReviewsSchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const limit = Math.min(query.data.limit ?? 20, 50);

  let brokerFilter: { brokerId?: string } = {};
  if (query.data.brokerSlug) {
    const broker = await prisma.broker.findFirst({
      where: { slug: query.data.brokerSlug, tenantId: DEFAULT_TENANT_ID },
      select: { id: true },
    });
    if (broker) {
      brokerFilter = { brokerId: broker.id };
    }
  }

  const where: Parameters<typeof prisma.review.findMany>[0] = {
    where: {
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
      ...brokerFilter,
      ...(query.data.status ? { status: query.data.status } : {}),
      ...(query.data.sentiment ? { sentiment: query.data.sentiment } : {}),
      ...(query.data.search
        ? {
            OR: [
              { title: { contains: query.data.search, mode: 'insensitive' as const } },
              { body: { contains: query.data.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' as const }],
    take: limit + 1,
    include: {
      broker: {
        select: { slug: true, displayName: true, displayNameZhHans: true, legalName: true },
      },
      user: { select: { id: true, displayName: true } },
    },
  };

  if (query.data.cursor) {
    where.cursor = { id: query.data.cursor };
    where.skip = 1;
  }

  const rows = await prisma.review.findMany(where);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return c.json({
    reviews: items.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body.length > 100 ? `${r.body.slice(0, 100)}...` : r.body,
      rating: r.rating,
      // Per ADR-0028 D4 + D7: ship sentiment alongside the deprecated
      // rating so the console table can swap its column without an extra
      // round trip. Nullable for legacy rows pre-M3.2 backfill.
      sentiment: (r as unknown as { sentiment: string | null }).sentiment,
      status: r.status,
      txHash: r.txHash,
      ipfsCid: r.ipfsCid,
      contentHash: r.contentHash,
      chainReviewId: r.chainReviewId,
      // Per cursor rule 51 + ADR-0026: broker reference ships all three
      // name columns (TC + SC + EN) so the console can render in the
      // admin's locale.
      broker: (
        r as unknown as {
          broker: {
            slug: string;
            displayName: string;
            displayNameZhHans: string | null;
            legalName: string | null;
          };
        }
      ).broker,
      author: (r as unknown as { user: { id: string; displayName: string | null } }).user,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  });
});

// ---------------------------------------------------------------------------
// Complaint admin moderation per ADR-0029 D4 (M7.3c)
//
// The admin domain owns the cross-domain `/v1/admin/...` URL space (the
// existing `/admin/users`, `/admin/reviews`, `/admin/stats` lineage). The
// complaint Phase-1 moderation endpoints land here rather than in
// `complaints/presentation/routes.ts` so the URL spec from ADR-0029 D4
// (`/v1/admin/complaints/:id/{verify,reject}`) holds without re-mounting
// complaintsRouter under two prefixes. The actual write happens through
// `VerifyComplaintUseCase` so the rule 00 «reject != delete» invariant
// is encoded in one testable place.
// ---------------------------------------------------------------------------

const adminComplaintRepo = new PrismaComplaintRepository(prisma);
const adminListComplaints = new ListComplaintsUseCase(adminComplaintRepo);
const adminVerifyComplaint = new VerifyComplaintUseCase(adminComplaintRepo);

const listAdminComplaintsSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  brokerSlug: z.string().max(100).optional(),
  status: z.enum(['OPEN', 'VERIFIED', 'REJECTED']).optional(),
});

adminRouter.get('/complaints', authMiddleware('admin'), async (c) => {
  const query = listAdminComplaintsSchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  let brokerId: string | undefined;
  if (query.data.brokerSlug) {
    const broker = await prisma.broker.findFirst({
      where: { slug: query.data.brokerSlug, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
      select: { id: true },
    });
    if (!broker) {
      return c.json({ complaints: [], nextCursor: null });
    }
    brokerId = broker.id;
  }

  const result = await adminListComplaints.execute({
    tenantId: DEFAULT_TENANT_ID,
    brokerId,
    status: query.data.status,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });

  // Hydrate broker + author display names for the console table —
  // mirror /admin/reviews shape so the console list cell components
  // can be reused (per cursor rule 51 + ADR-0026 ship all three name
  // columns so the admin sees TC + SC + EN).
  const brokerIds = [...new Set(result.items.map((it) => it.brokerId))];
  const userIds = [...new Set(result.items.map((it) => it.userId))];

  const [brokers, users] = await Promise.all([
    prisma.broker.findMany({
      where: { id: { in: brokerIds }, tenantId: DEFAULT_TENANT_ID },
      select: {
        id: true,
        slug: true,
        displayName: true,
        displayNameZhHans: true,
        legalName: true,
      },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    }),
  ]);

  const brokerMap = new Map(brokers.map((b) => [b.id, b]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return c.json({
    complaints: result.items.map((cplt) => {
      const broker = brokerMap.get(cplt.brokerId);
      const author = userMap.get(cplt.userId);
      const status: 'OPEN' | 'VERIFIED' | 'REJECTED' =
        cplt.verifiedAt !== null ? 'VERIFIED' : cplt.adminNote !== null ? 'REJECTED' : 'OPEN';
      return {
        id: cplt.id,
        title: cplt.title,
        body: cplt.body.length > 200 ? `${cplt.body.slice(0, 200)}...` : cplt.body,
        sentiment: cplt.sentiment,
        status,
        evidenceIpfsCid: cplt.evidenceIpfsCid,
        ipfsCid: cplt.ipfsCid,
        contentHash: cplt.contentHash,
        verifiedAt: cplt.verifiedAt?.toISOString() ?? null,
        verifiedByUserId: cplt.verifiedByUserId,
        adminNote: cplt.adminNote,
        broker: broker
          ? {
              slug: broker.slug,
              displayName: broker.displayName,
              displayNameZhHans: broker.displayNameZhHans,
              legalName: broker.legalName,
            }
          : null,
        author: author ? { id: author.id, displayName: author.displayName } : null,
        createdAt: cplt.createdAt.toISOString(),
      };
    }),
    nextCursor: result.nextCursor,
  });
});

adminRouter.patch('/complaints/:id/verify', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const adminUser = c.get('user');

  const result = await adminVerifyComplaint.execute({
    kind: 'verify',
    complaintId: id,
    adminUserId: adminUser.userId,
  });

  return c.json({
    complaint: {
      id: result.complaint.id,
      verifiedAt: result.complaint.verifiedAt?.toISOString() ?? null,
      verifiedByUserId: result.complaint.verifiedByUserId,
      adminNote: result.complaint.adminNote,
    },
  });
});

const rejectComplaintBodySchema = z.object({
  // Per ADR-0029 D4 — the reject reason is mandatory and stored in
  // `Review.adminNote` so the public page can render the platform's
  // rationale alongside the "not verified by platform" label. Mirrors
  // the SbtVerificationRequest reject pattern (`/admin/verifications/:id/reject`).
  adminNote: z
    .string()
    .min(5, 'adminNote must be at least 5 characters')
    .max(500, 'adminNote must be 500 characters or less'),
});

adminRouter.patch('/complaints/:id/reject', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const adminUser = c.get('user');

  const rawBody: unknown = await c.req.json();
  const parsed = rejectComplaintBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid reject reason', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const result = await adminVerifyComplaint.execute({
    kind: 'reject',
    complaintId: id,
    adminUserId: adminUser.userId,
    adminNote: parsed.data.adminNote,
  });

  return c.json({
    complaint: {
      id: result.complaint.id,
      verifiedAt: result.complaint.verifiedAt?.toISOString() ?? null,
      verifiedByUserId: result.complaint.verifiedByUserId,
      adminNote: result.complaint.adminNote,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /activity — Recent activity feed
// ---------------------------------------------------------------------------

adminRouter.get('/activity', authMiddleware('admin'), async (c) => {
  const [recentUsers, recentReviews, recentClaims, recentVerifications] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, displayName: true, createdAt: true },
    }),
    prisma.review.findMany({
      where: { tenantId: DEFAULT_TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        broker: { select: { slug: true, displayName: true } },
        user: { select: { displayName: true } },
      },
    }),
    prisma.brokerClaimRequest.findMany({
      where: { tenantId: DEFAULT_TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { broker: { select: { displayName: true } } },
    }),
    prisma.sbtVerificationRequest.findMany({
      where: { tenantId: DEFAULT_TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { displayName: true } } },
    }),
  ]);

  type ActivityItem = { type: string; description: string; timestamp: string };
  const activities: ActivityItem[] = [];

  for (const u of recentUsers) {
    activities.push({
      type: 'user_registered',
      description: u.displayName ?? 'Anonymous',
      timestamp: u.createdAt.toISOString(),
    });
  }

  for (const r of recentReviews) {
    const broker = (r as unknown as { broker: { displayName: string } }).broker;
    const user = (r as unknown as { user: { displayName: string | null } }).user;
    activities.push({
      type: 'review_submitted',
      description: `${user.displayName ?? 'Anonymous'} → ${broker.displayName}`,
      timestamp: r.createdAt.toISOString(),
    });
  }

  for (const cl of recentClaims) {
    activities.push({
      type: 'claim_submitted',
      description: (cl as unknown as { broker: { displayName: string } }).broker.displayName,
      timestamp: cl.createdAt.toISOString(),
    });
  }

  for (const v of recentVerifications) {
    activities.push({
      type: 'verification_submitted',
      description:
        (v as unknown as { user: { displayName: string | null } }).user.displayName ?? 'Anonymous',
      timestamp: v.createdAt.toISOString(),
    });
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return c.json({ activities: activities.slice(0, 15) });
});

// ---------------------------------------------------------------------------
// KOL Admin endpoints (per ADR-0036 D1)
// ---------------------------------------------------------------------------

const kolRepo = new PrismaKolRepository(prisma);
const listKolsUseCase = new ListKolsUseCase(kolRepo);
const updateKolCategoryUseCase = new UpdateKolCategoryUseCase(kolRepo);

const listKolsSchema = z.object({
  status: z.enum(['UNCLAIMED', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  // Per ADR-0053 §5: optional server-side category filters for the console
  // KOL management screen. Omitting a dimension returns every value for that
  // axis (mirrors the public GET /v1/kols filter).
  type: z.enum(['FINANCIAL_KOL', 'INDICATOR_VENDOR']).optional(),
  focus: z.enum(['EQUITY', 'CRYPTO', 'FOREX']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

adminRouter.get('/kols', authMiddleware('admin'), async (c) => {
  const query = listKolsSchema.parse(c.req.query());

  const opts: Parameters<typeof listKolsUseCase.execute>[0] = {
    tenantId: DEFAULT_TENANT_ID,
    limit: query.limit,
    offset: query.offset,
  };
  if (query.status !== undefined) {
    opts.status = query.status;
  }
  if (query.type !== undefined) {
    opts.type = query.type;
  }
  if (query.focus !== undefined) {
    opts.focus = query.focus;
  }

  const { kols, total } = await listKolsUseCase.execute(opts);

  return c.json({ kols, total });
});

adminRouter.get('/kols/:id', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const kol = await kolRepo.findById(id);

  if (!kol) {
    throw AppError.notFound(`KOL ${id} not found`);
  }

  const signalCount = await prisma.signal.count({
    where: { kolId: kol.id },
  });

  const followerCount = await prisma.kolFollow.count({
    where: { kolId: kol.id },
  });

  return c.json({ kol, signalCount, followerCount });
});

adminRouter.patch('/kols/:id/approve', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const kol = await kolRepo.findById(id);

  if (!kol) {
    throw AppError.notFound(`KOL ${id} not found`);
  }

  if (kol.status !== 'PENDING') {
    throw new AppError(ErrorCode.CONFLICT, `Cannot approve KOL in ${kol.status} status`, 409);
  }

  const updated = await kolRepo.updateStatus(id, 'APPROVED', { adminUserId: user.userId });
  return c.json({ kol: updated });
});

const rejectKolSchema = z.object({
  adminNote: z.string().min(5).max(500),
});

adminRouter.patch('/kols/:id/reject', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const kol = await kolRepo.findById(id);

  if (!kol) {
    throw AppError.notFound(`KOL ${id} not found`);
  }

  if (kol.status !== 'PENDING') {
    throw new AppError(ErrorCode.CONFLICT, `Cannot reject KOL in ${kol.status} status`, 409);
  }

  const body = rejectKolSchema.parse(await c.req.json());

  // Per ADR-0036 D1.1: persist adminNote so the applicant sees the
  // rejection reason on /become-a-kol + /kol/onboarding and can resubmit
  // an informed application.
  const updated = await kolRepo.updateStatus(id, 'REJECTED', {
    adminUserId: user.userId,
    adminNote: body.adminNote,
  });
  return c.json({ kol: updated });
});

adminRouter.patch('/kols/:id/suspend', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const kol = await kolRepo.findById(id);

  if (!kol) {
    throw AppError.notFound(`KOL ${id} not found`);
  }

  if (kol.status !== 'APPROVED') {
    throw new AppError(ErrorCode.CONFLICT, `Cannot suspend KOL in ${kol.status} status`, 409);
  }

  const updated = await kolRepo.updateStatus(id, 'SUSPENDED', { adminUserId: user.userId });
  return c.json({ kol: updated });
});

// Per ADR-0053 §3: admin sets or overrides the two independent, nullable
// category dimensions. Both keys are optional and nullable — a present `null`
// clears that dimension back to "未分類", an absent key leaves it untouched.
// At least one key must be present so the PATCH is never a silent no-op.
const updateKolCategorySchema = z
  .object({
    type: z.enum(['FINANCIAL_KOL', 'INDICATOR_VENDOR']).nullable().optional(),
    focus: z.enum(['EQUITY', 'CRYPTO', 'FOREX']).nullable().optional(),
  })
  .refine((v) => 'type' in v || 'focus' in v, {
    message: 'At least one of type or focus must be supplied',
  });

adminRouter.patch('/kols/:id/category', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const body = updateKolCategorySchema.parse(await c.req.json());

  // exactOptionalPropertyTypes: forward only the keys the admin actually
  // sent so the repository can distinguish "clear" (null) from "untouched"
  // (absent), mirroring the nullable-no-default column semantics (ADR-0053 D3).
  const command: Parameters<typeof updateKolCategoryUseCase.execute>[0] = { id };
  if ('type' in body) command.type = body.type ?? null;
  if ('focus' in body) command.focus = body.focus ?? null;

  try {
    const updated = await updateKolCategoryUseCase.execute(command);
    return c.json({ kol: updated });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw AppError.notFound(`KOL ${id} not found`);
    }
    throw err;
  }
});
