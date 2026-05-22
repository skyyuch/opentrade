/**
 * Hono router for the brokers domain (Phase 1 read-only surface).
 *
 * Phase 1 only exposes read endpoints — broker creation is handled by the
 * seed script (Block 7) and the merchant claim flow (Block 6). A full
 * brokers domain with DDD four-layer lands when write operations arrive.
 *
 * Endpoints:
 *   GET /           — List brokers (public, paginated)
 *   GET /:slug      — Get a single broker by slug (public)
 *
 * Mounted under `/v1/brokers` by `http/server.ts`.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

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
