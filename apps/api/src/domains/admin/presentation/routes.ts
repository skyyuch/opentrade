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
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';

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
      verifiedBrokers: u.verifiedBrokers.map((b) => ({
        brokerSlug: b.brokerSlug,
        approvedAt: b.approvedAt.toISOString(),
      })),
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

  const [reviews, verifications, claims, verifiedBrokers] = await Promise.all([
    prisma.review.findMany({
      where: { userId: id, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { broker: { select: { slug: true, displayName: true } } },
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
      include: { broker: { select: { slug: true, displayName: true } } },
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
    verifications: verifications.map((v) => ({
      id: v.id,
      brokerSlug: v.brokerSlug,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
    })),
    claims: claims.map((cl) => ({
      id: cl.id,
      broker: cl.broker,
      status: cl.status,
      createdAt: cl.createdAt.toISOString(),
    })),
    verifiedBrokers: verifiedBrokers.map((b) => ({
      brokerSlug: b.brokerSlug,
      approvedAt: b.approvedAt.toISOString(),
    })),
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
      broker: { select: { slug: true, displayName: true } },
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
      status: r.status,
      txHash: r.txHash,
      ipfsCid: r.ipfsCid,
      contentHash: r.contentHash,
      chainReviewId: r.chainReviewId,
      broker: (r as unknown as { broker: { slug: string; displayName: string } }).broker,
      author: (r as unknown as { user: { id: string; displayName: string | null } }).user,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
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
