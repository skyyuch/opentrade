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
import { hydrateBrokerNames } from '../../../shared/brokerHydration.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { GetBrokerReviewsUseCase } from '../application/GetBrokerReviewsUseCase.js';
import { SubmitReviewUseCase } from '../application/SubmitReviewUseCase.js';
import { DeepLTranslationService } from '../infrastructure/DeepLTranslationService.js';
import { PinataIpfsService } from '../infrastructure/PinataIpfsService.js';
import { PrismaReviewRepository } from '../infrastructure/PrismaReviewRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const reviewRepo = new PrismaReviewRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);
const translationService = env.DEEPL_API_KEY
  ? new DeepLTranslationService(env.DEEPL_API_KEY, prisma)
  : null;
const submitReview = new SubmitReviewUseCase(reviewRepo, ipfsService, translationService);
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

reviewsRouter.post('/', authMiddleware('reviewer'), async (c) => {
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

  const acceptLang = c.req.header('Accept-Language')?.split(',')[0]?.trim() ?? null;
  const requestedLocale =
    acceptLang === 'zh-Hant' || acceptLang === 'zh-Hans' || acceptLang === 'en' ? acceptLang : null;

  const reviewIds = result.items.map((r) => r.id);
  const userIds = [...new Set(result.items.map((r) => r.userId))];

  const [users, translations] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        sbtTier: true,
        // Per ADR-0025: review cards surface the author's verified-broker
        // list as a public credibility signal. UserVerifiedBroker keys by
        // slug (not brokerId) so we can't `include` the broker row;
        // instead we collect every slug across the page and resolve their
        // names via `hydrateBrokerNames` in one query below. Per cursor
        // rule 51 we then ship both `displayName` + `legalName` so the
        // ReviewCard renders in the reader's locale.
        verifiedBrokers: { select: { brokerSlug: true } },
      },
    }),
    requestedLocale
      ? prisma.reviewTranslation.findMany({
          where: { reviewId: { in: reviewIds }, locale: requestedLocale },
        })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const translationMap = new Map(translations.map((t) => [t.reviewId, t]));

  // Hydrate broker names for every slug surfaced via author.verifiedBrokers
  // on this page. Single batched query — each user's slug list is small,
  // but the same broker often repeats across users.
  const verifiedSlugs = users.flatMap((u) => u.verifiedBrokers.map((b) => b.brokerSlug));
  const verifiedNameMap = await hydrateBrokerNames(verifiedSlugs, DEFAULT_TENANT_ID);

  return c.json({
    reviews: result.items.map((r) => {
      const author = userMap.get(r.userId);
      const translation = translationMap.get(r.id);
      const isTranslated = !!translation;

      return {
        id: r.id,
        brokerId: r.brokerId,
        contentHash: r.contentHash,
        ipfsCid: r.ipfsCid,
        chainReviewId: r.chainReviewId,
        txHash: r.txHash,
        title: isTranslated ? translation.title : r.title,
        body: isTranslated ? translation.body : r.body,
        originalTitle: isTranslated ? r.title : null,
        originalBody: isTranslated ? r.body : null,
        isTranslated,
        rating: r.rating,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        author: {
          displayName: author?.displayName ?? null,
          sbtTier: author?.sbtTier ?? 'L1',
          verifiedBrokers:
            author?.verifiedBrokers.map((b) => {
              const meta = verifiedNameMap.get(b.brokerSlug);
              return {
                brokerSlug: b.brokerSlug,
                displayName: meta?.displayName ?? b.brokerSlug,
                legalName: meta?.legalName ?? null,
              };
            }) ?? [],
        },
      };
    }),
    nextCursor: result.nextCursor,
    broker: {
      id: broker.id,
      slug: broker.slug,
      // Per cursor rule 51: ship both name columns; broker detail page
      // already does, but the reviews-by-broker payload was missing
      // legalName, leaving the SubmitReviewCta + similar surfaces
      // locale-blind.
      displayName: broker.displayName,
      legalName: broker.legalName,
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
