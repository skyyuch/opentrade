/**
 * Hono router for the reviews domain.
 *
 * Composition root: wires Prisma review repo, Pinata IPFS service, and
 * use cases. Mounted under `/v1/reviews` by `http/server.ts`.
 *
 * Endpoints:
 *   POST   /              — Submit a new review (auth: user+)
 *   GET    /broker/:slug  — List reviews for a broker (public)
 *   GET    /:id           — Get a single review by ID (public)
 *
 * Per rule 50: POST requires auth. Per ADR-0019 D2: SBT gate is API-side
 * (the contract does not check SBT on-chain). Phase 1 relaxes this to
 * any authenticated user; L2 SBT gate lands when the SBT contract ships.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { GetBrokerReviewsUseCase } from '../application/GetBrokerReviewsUseCase.js';
import { SubmitReviewUseCase } from '../application/SubmitReviewUseCase.js';
import { PinataIpfsService } from '../infrastructure/PinataIpfsService.js';
import { PrismaReviewRepository } from '../infrastructure/PrismaReviewRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const reviewRepo = new PrismaReviewRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);
const submitReview = new SubmitReviewUseCase(reviewRepo, ipfsService);
const getBrokerReviews = new GetBrokerReviewsUseCase(reviewRepo);

const submitReviewBodySchema = z.object({
  brokerId: z.string().uuid('brokerId must be a valid UUID'),
  title: z.string().min(1, 'title is required').max(200, 'title must be 200 chars or less'),
  body: z.string().min(10, 'body must be at least 10 characters').max(5000),
  rating: z.number().int().min(1).max(5),
});

const listReviewsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const reviewsRouter = new Hono<AppHonoEnv>();

reviewsRouter.post('/', authMiddleware('user'), async (c) => {
  const rawBody: unknown = await c.req.json();
  const parsed = submitReviewBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid review submission', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const user = c.get('user');

  const broker = await prisma.broker.findFirst({
    where: {
      id: parsed.data.brokerId,
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
    },
  });

  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const result = await submitReview.execute({
    tenantId: DEFAULT_TENANT_ID,
    userId: user.userId,
    brokerId: parsed.data.brokerId,
    title: parsed.data.title,
    body: parsed.data.body,
    rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5,
  });

  const logger = c.get('logger');
  logger.info({ reviewId: result.review.id, brokerId: parsed.data.brokerId }, 'Review submitted');

  return c.json(
    {
      review: {
        id: result.review.id,
        brokerId: result.review.brokerId,
        contentHash: result.review.contentHash,
        ipfsCid: result.review.ipfsCid,
        title: result.review.title,
        rating: result.review.rating,
        status: result.review.status,
        createdAt: result.review.createdAt.toISOString(),
      },
    },
    201,
  );
});

reviewsRouter.get('/broker/:slug', async (c) => {
  const slug = c.req.param('slug');

  const broker = await prisma.broker.findFirst({
    where: {
      slug,
      tenantId: DEFAULT_TENANT_ID,
      deletedAt: null,
    },
  });

  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const query = listReviewsQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const result = await getBrokerReviews.execute({
    tenantId: DEFAULT_TENANT_ID,
    brokerId: broker.id,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });

  const userIds = [...new Set(result.items.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, sbtTier: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return c.json({
    reviews: result.items.map((r) => {
      const author = userMap.get(r.userId);
      return {
        id: r.id,
        brokerId: r.brokerId,
        contentHash: r.contentHash,
        ipfsCid: r.ipfsCid,
        chainReviewId: r.chainReviewId,
        txHash: r.txHash,
        title: r.title,
        body: r.body,
        rating: r.rating,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        author: {
          displayName: author?.displayName ?? null,
          sbtTier: author?.sbtTier ?? 'L1',
        },
      };
    }),
    nextCursor: result.nextCursor,
    broker: {
      id: broker.id,
      slug: broker.slug,
      displayName: broker.displayName,
      logoUrl: broker.logoUrl,
    },
  });
});

reviewsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const review = await reviewRepo.findById(id);
  if (!review) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Review not found', 404);
  }

  return c.json({
    review: {
      id: review.id,
      brokerId: review.brokerId,
      contentHash: review.contentHash,
      ipfsCid: review.ipfsCid,
      chainReviewId: review.chainReviewId,
      txHash: review.txHash,
      title: review.title,
      body: review.body,
      rating: review.rating,
      status: review.status,
      createdAt: review.createdAt.toISOString(),
    },
  });
});
