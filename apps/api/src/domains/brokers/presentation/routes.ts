/**
 * Hono router for the brokers domain.
 *
 * Endpoints:
 *   GET    /                  — List brokers (public, paginated)
 *   GET    /:slug             — Get a single broker by slug (public)
 *   POST   /:slug/claim       — Submit a claim request (auth: user+)
 *   PATCH  /:slug             — Update claimed broker profile (auth: owner)
 *   GET    /admin/claims      — List claim requests (auth: admin)
 *   POST   /admin/claims/:id/approve — Approve claim (auth: admin)
 *   POST   /admin/claims/:id/reject  — Reject claim (auth: admin)
 *
 * Mounted under `/v1/brokers` by `http/server.ts`.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { aggregateSentiment } from '../domain/sentimentAggregate.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
});

export const brokersRouter = new Hono<AppHonoEnv>();

brokersRouter.get('/', async (c) => {
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const limit = Math.min(query.data.limit ?? 20, 100);

  const where: Parameters<typeof prisma.broker.findMany>[0] = {
    where: {
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
      ...(query.data.search
        ? {
            OR: [
              { displayName: { contains: query.data.search, mode: 'insensitive' as const } },
              { legalName: { contains: query.data.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ displayName: 'asc' as const }],
    take: limit + 1,
    include: {
      licenses: { where: { deletedAt: null }, orderBy: { licenseType: 'asc' as const } },
      reviews: { select: { rating: true } },
      _count: { select: { reviews: true } },
    },
  };

  if (query.data.cursor) {
    where.cursor = { id: query.data.cursor };
    where.skip = 1;
  }

  const rows = await prisma.broker.findMany(where);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  // Per ADR-0025: surface "how many users have been verified for this
  // broker" as a list-level credibility signal, alongside review count.
  // Single groupBy across the page keeps cost flat (~1 indexed scan)
  // even when the page has 50+ brokers.
  const slugs = items.map((b) => b.slug);
  const verifiedCounts =
    slugs.length === 0
      ? []
      : await prisma.userVerifiedBroker.groupBy({
          by: ['brokerSlug'],
          where: { tenantId: DEFAULT_TENANT_ID, brokerSlug: { in: slugs } },
          _count: { brokerSlug: true },
        });
  const verifiedCountBySlug = new Map(
    verifiedCounts.map((row) => [row.brokerSlug, row._count.brokerSlug]),
  );

  return c.json({
    brokers: items.map((b) => {
      const reviews = (b as unknown as { reviews: { rating: number }[] }).reviews;
      const reviewCount = (b as unknown as { _count: { reviews: number } })._count.reviews;
      const positiveCount = reviews.filter((r) => r.rating >= 4).length;
      const positiveRate = reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : null;

      return {
        id: b.id,
        slug: b.slug,
        // Per ADR-0026: ship three name columns (TC + SC + EN) so the
        // consumer can render in the reader's locale via
        // localizedBrokerName() from @opentrade/shared.
        displayName: b.displayName,
        displayNameZhHans: b.displayNameZhHans,
        legalName: b.legalName,
        logoUrl: b.logoUrl,
        isClaimed: b.isClaimed,
        reviewCount,
        positiveRate,
        verifiedUserCount: verifiedCountBySlug.get(b.slug) ?? 0,
        licenseTypes: (b as unknown as { licenses: { licenseType: string }[] }).licenses.map(
          (l) => l.licenseType,
        ),
      };
    }),
    nextCursor,
  });
});

brokersRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const broker = await prisma.broker.findFirst({
    where: {
      slug,
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
    },
    include: {
      licenses: {
        where: { deletedAt: null },
        orderBy: { licenseType: 'asc' },
      },
      reviews: { select: { rating: true, sentiment: true } },
      _count: { select: { reviews: true } },
    },
  });

  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const reviews = (broker as unknown as { reviews: { rating: number; sentiment: string | null }[] })
    .reviews;
  const reviewCount = (broker as unknown as { _count: { reviews: number } })._count.reviews;
  const positiveCount = reviews.filter((r) => r.rating >= 4).length;
  const positiveRate = reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : null;

  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return {
      stars: star,
      count,
      percentage: reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0,
    };
  });

  // Per ADR-0028 D7 the canonical broker-level verdict is the sentiment
  // distribution — see `aggregateSentiment` in the brokers domain for
  // the bucket / null-row contract.
  const sentimentAggregate = aggregateSentiment(reviews);

  const earliestLicense = broker.licenses.reduce<Date | null>((earliest, l) => {
    if (!earliest || l.issuedAt < earliest) return l.issuedAt;
    return earliest;
  }, null);
  const activeYears = earliestLicense
    ? Math.floor((Date.now() - earliestLicense.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  // Per ADR-0025: how many distinct users have been verified for this
  // broker. Acts as a credibility signal independent of reviewCount —
  // an unclaimed broker can still rack up trustworthy reviewers.
  const verifiedUserCount = await prisma.userVerifiedBroker.count({
    where: { tenantId: DEFAULT_TENANT_ID, brokerSlug: broker.slug },
  });

  const similarBrokers = await prisma.broker.findMany({
    where: {
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
      id: { not: broker.id },
      licenses: {
        some: {
          licenseType: { in: broker.licenses.map((l) => l.licenseType) },
          deletedAt: null,
        },
      },
    },
    include: {
      licenses: { where: { deletedAt: null }, select: { licenseType: true } },
      _count: { select: { reviews: true } },
    },
    take: 5,
    orderBy: { displayName: 'asc' },
  });

  return c.json({
    broker: {
      id: broker.id,
      slug: broker.slug,
      // Per ADR-0026: ship three name columns (TC + SC + EN).
      displayName: broker.displayName,
      displayNameZhHans: broker.displayNameZhHans,
      legalName: broker.legalName,
      ceNumber: broker.ceNumber,
      description: broker.description,
      websiteUrl: broker.websiteUrl,
      logoUrl: broker.logoUrl,
      addressEn: broker.addressEn,
      addressZh: broker.addressZh,
      sfcDetailJson: broker.sfcDetailJson,
      isClaimed: broker.isClaimed,
      activeYears,
      reviewCount,
      positiveRate,
      verifiedUserCount,
      ratingDistribution,
      sentimentAggregate,
      licenses: broker.licenses.map((l) => ({
        regulator: l.regulator,
        licenseType: l.licenseType,
        licenseNumber: l.licenseNumber,
        status: l.status,
        issuedAt: l.issuedAt.toISOString(),
      })),
      similarBrokers: similarBrokers.map((sb) => ({
        id: sb.id,
        slug: sb.slug,
        // Per cursor rule 51 + ADR-0026: every broker reference ships
        // three name columns (TC + SC + EN) so the consumer can render
        // in the reader's locale. The previous shape (displayName-only)
        // made the right-rail "similar brokers" list show Traditional
        // Chinese names in `en` and `zh-Hans` modes.
        displayName: sb.displayName,
        displayNameZhHans: sb.displayNameZhHans,
        legalName: sb.legalName,
        logoUrl: sb.logoUrl,
        licenseTypes: sb.licenses.map((l) => l.licenseType),
        reviewCount: (sb as unknown as { _count: { reviews: number } })._count.reviews,
      })),
    },
  });
});

// ---------------------------------------------------------------------------
// Broker owner stats (for merchant dashboard)
// ---------------------------------------------------------------------------

brokersRouter.get('/:slug/owner-stats', authMiddleware('user'), async (c) => {
  const slug = c.req.param('slug');
  const { userId, tenantId } = c.get('user');

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId, deletedAt: null },
  });
  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }
  if (broker.claimedByUserId !== userId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Only the broker owner can view stats', 403);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalReviews, monthReviews, allRatings] = await Promise.all([
    prisma.review.count({
      where: { brokerId: broker.id, tenantId, deletedAt: null },
    }),
    prisma.review.count({
      where: { brokerId: broker.id, tenantId, deletedAt: null, createdAt: { gte: startOfMonth } },
    }),
    prisma.review.findMany({
      where: { brokerId: broker.id, tenantId, deletedAt: null },
      select: { rating: true },
    }),
  ]);

  const avgRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length) * 10) / 10
      : null;
  const positiveCount = allRatings.filter((r) => r.rating >= 4).length;
  const positiveRate =
    allRatings.length > 0 ? Math.round((positiveCount / allRatings.length) * 100) : null;

  return c.json({
    stats: {
      totalReviews,
      monthReviews,
      avgRating,
      positiveRate,
    },
  });
});

// ---------------------------------------------------------------------------
// Merchant Claim Flow
// ---------------------------------------------------------------------------

const claimBodySchema = z.object({
  ceRefNumber: z.string().min(1, 'CE reference number is required'),
  companyLetterIpfsCid: z.string().min(1, 'Company letter IPFS CID is required'),
});

brokersRouter.post('/:slug/claim', authMiddleware('user'), async (c) => {
  const slug = c.req.param('slug');
  const { userId, tenantId } = c.get('user');

  const body: unknown = await c.req.json();
  const parsed = claimBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid claim request', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId, deletedAt: null },
  });
  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }
  if (broker.isClaimed) {
    throw new AppError(ErrorCode.CONFLICT, 'Broker is already claimed', 409);
  }

  const existing = await prisma.brokerClaimRequest.findFirst({
    where: { brokerId: broker.id, tenantId, status: 'PENDING' },
  });
  if (existing) {
    throw new AppError(ErrorCode.CONFLICT, 'A pending claim already exists for this broker', 409);
  }

  const claim = await prisma.brokerClaimRequest.create({
    data: {
      tenantId,
      brokerId: broker.id,
      userId,
      ceRefNumber: parsed.data.ceRefNumber,
      companyLetterIpfsCid: parsed.data.companyLetterIpfsCid,
    },
  });

  return c.json({ claim: { id: claim.id, status: claim.status } }, 201);
});

const updateBrokerSchema = z.object({
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
});

brokersRouter.patch('/:slug', authMiddleware('user'), async (c) => {
  const slug = c.req.param('slug');
  const { userId, tenantId } = c.get('user');

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId, deletedAt: null },
  });
  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }
  if (broker.claimedByUserId !== userId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Only the broker owner can update the profile', 403);
  }

  const body: unknown = await c.req.json();
  const parsed = updateBrokerSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid update', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const updated = await prisma.broker.update({
    where: { id: broker.id },
    data: {
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
    },
  });

  return c.json({
    broker: {
      id: updated.id,
      slug: updated.slug,
      displayName: updated.displayName,
      description: updated.description,
      logoUrl: updated.logoUrl,
      isClaimed: updated.isClaimed,
    },
  });
});

// ---------------------------------------------------------------------------
// Admin: update broker logo (admin can update any broker's logo)
// ---------------------------------------------------------------------------

const adminUpdateLogoSchema = z.object({
  logoUrl: z.string().url().or(z.literal('')),
});

brokersRouter.patch('/admin/:slug/logo', authMiddleware('admin'), async (c) => {
  const slug = c.req.param('slug');

  const body: unknown = await c.req.json();
  const parsed = adminUpdateLogoSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid logo URL', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
  });
  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const updated = await prisma.broker.update({
    where: { id: broker.id },
    data: { logoUrl: parsed.data.logoUrl || null },
  });

  return c.json({
    broker: {
      id: updated.id,
      slug: updated.slug,
      displayName: updated.displayName,
      logoUrl: updated.logoUrl,
    },
  });
});

// ---------------------------------------------------------------------------
// Admin: upload broker logo file (max 5 MB, images only)
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

brokersRouter.post('/admin/:slug/logo/upload', authMiddleware('admin'), async (c) => {
  if (!env.ASSETS_BUCKET_NAME || !env.ASSETS_CDN_URL) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'S3 assets storage is not configured', 500);
  }

  const slug = c.req.param('slug');

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
  });
  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'No file provided', 400);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid file type: ${file.type}. Accepted: PNG, JPEG, WebP, SVG`,
      400,
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum: 5MB`,
      400,
    );
  }

  const ext = file.name.split('.').pop() ?? 'png';
  const key = `logos/${slug}/${Date.now()}.${ext}`;

  const s3 = new S3Client({ region: env.AWS_REGION });
  const buffer = Buffer.from(await file.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: env.ASSETS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const cdnUrl = `${env.ASSETS_CDN_URL}/${key}`;

  await prisma.broker.update({
    where: { id: broker.id },
    data: { logoUrl: cdnUrl },
  });

  return c.json({ logoUrl: cdnUrl }, 201);
});

// ---------------------------------------------------------------------------
// Admin claim management
// ---------------------------------------------------------------------------

brokersRouter.get('/admin/claims', authMiddleware('admin'), async (c) => {
  const status = c.req.query('status') ?? 'PENDING';

  const claims = await prisma.brokerClaimRequest.findMany({
    where: {
      tenantId: DEFAULT_TENANT_ID,
      status: status as 'PENDING' | 'APPROVED' | 'REJECTED',
    },
    include: {
      // Per cursor rule 51 + ADR-0026: ship all three broker name
      // columns (TC + SC + EN) so the admin claims table can render
      // in the operator's locale.
      broker: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          displayNameZhHans: true,
          legalName: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return c.json({
    claims: claims.map((cl) => ({
      id: cl.id,
      brokerId: cl.brokerId,
      broker: cl.broker,
      userId: cl.userId,
      ceRefNumber: cl.ceRefNumber,
      companyLetterIpfsCid: cl.companyLetterIpfsCid,
      status: cl.status,
      adminNote: cl.adminNote,
      createdAt: cl.createdAt.toISOString(),
    })),
  });
});

const adminClaimActionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

brokersRouter.post('/admin/claims/:id/approve', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = adminClaimActionSchema.safeParse(body);

  const claim = await prisma.brokerClaimRequest.findUnique({ where: { id } });
  if (claim?.status !== 'PENDING') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Pending claim not found', 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.brokerClaimRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNote: parsed.success ? (parsed.data.adminNote ?? null) : null,
        reviewedAt: new Date(),
      },
    });

    await tx.broker.update({
      where: { id: claim.brokerId },
      data: {
        isClaimed: true,
        claimedAt: new Date(),
        claimedByUserId: claim.userId,
      },
    });

    await tx.user.update({
      where: { id: claim.userId },
      data: { sbtTier: 'L4' },
    });
  });

  return c.json({ status: 'approved', claimId: id });
});

brokersRouter.post('/admin/claims/:id/reject', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = adminClaimActionSchema.safeParse(body);

  const claim = await prisma.brokerClaimRequest.findUnique({ where: { id } });
  if (claim?.status !== 'PENDING') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Pending claim not found', 404);
  }

  await prisma.brokerClaimRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      adminNote: parsed.success ? (parsed.data.adminNote ?? null) : null,
      reviewedAt: new Date(),
    },
  });

  return c.json({ status: 'rejected', claimId: id });
});
