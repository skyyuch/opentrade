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

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
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

  const limit = Math.min(query.data.limit ?? 20, 50);

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

  return c.json({
    brokers: items.map((b) => ({
      id: b.id,
      slug: b.slug,
      displayName: b.displayName,
      legalName: b.legalName,
      logoUrl: b.logoUrl,
      isClaimed: b.isClaimed,
      reviewCount: (b as unknown as { _count: { reviews: number } })._count.reviews,
    })),
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
      _count: { select: { reviews: true } },
    },
  });

  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  return c.json({
    broker: {
      id: broker.id,
      slug: broker.slug,
      displayName: broker.displayName,
      legalName: broker.legalName,
      description: broker.description,
      websiteUrl: broker.websiteUrl,
      logoUrl: broker.logoUrl,
      isClaimed: broker.isClaimed,
      reviewCount: (broker as unknown as { _count: { reviews: number } })._count.reviews,
      licenses: broker.licenses.map((l) => ({
        regulator: l.regulator,
        licenseType: l.licenseType,
        licenseNumber: l.licenseNumber,
        status: l.status,
      })),
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
      broker: { select: { id: true, slug: true, displayName: true } },
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
  if (!claim || claim.status !== 'PENDING') {
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
  if (!claim || claim.status !== 'PENDING') {
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
