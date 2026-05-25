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
import { GetReviewIpfsContentUseCase } from '../application/GetReviewIpfsContentUseCase.js';
import { SubmitReviewUseCase } from '../application/SubmitReviewUseCase.js';
import { PinataIpfsService } from '../infrastructure/PinataIpfsService.js';
import { PrismaReviewRepository } from '../infrastructure/PrismaReviewRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { ReviewSourceLocale } from '../domain/ReviewEntity.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const reviewRepo = new PrismaReviewRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);
// Per ADR-0027 (supersedes ADR-0023): DeepLTranslationService is no longer
// wired into the submit path. The class file is kept @deprecated for a
// future on-demand-translation ADR (D7). SubmitReviewUseCase ctor accepts
// only repo + IPFS now.
const submitReview = new SubmitReviewUseCase(reviewRepo, ipfsService);
const getBrokerReviews = new GetBrokerReviewsUseCase(reviewRepo);
const getReviewIpfsContent = new GetReviewIpfsContentUseCase(reviewRepo, env.PINATA_GATEWAY_URL);

const SOURCE_LOCALE_VALUES = ['zh-Hant', 'zh-Hans', 'en'] as const;

/**
 * Resolve the author's submit-time locale per ADR-0027 D2.
 *
 * Priority:
 *   1. Explicit `sourceLocale` on the request body (frontend next-intl
 *      locale, the trustworthy signal)
 *   2. First entry of `Accept-Language` if it exactly matches one of the
 *      three supported locales
 *   3. Fallback to `zh-Hant` (ADR-0003 default locale)
 *
 * No best-match negotiation: we want exact, predictable behaviour rather
 * than letting an `en-US;q=0.9, zh-TW;q=0.8` header surprise us.
 */
function resolveSourceLocale(
  explicit: ReviewSourceLocale | undefined,
  acceptLanguageHeader: string | undefined,
): ReviewSourceLocale {
  if (explicit) return explicit;
  const first = acceptLanguageHeader?.split(',')[0]?.trim();
  if (first === 'zh-Hant' || first === 'zh-Hans' || first === 'en') return first;
  return 'zh-Hant';
}

const submitReviewBodySchema = z.object({
  brokerId: z.string().uuid('brokerId must be a valid UUID'),
  title: z.string().min(1, 'title is required').max(200, 'title must be 200 chars or less'),
  body: z.string().min(10, 'body must be at least 10 characters').max(5000),
  rating: z.number().int().min(1).max(5),
  sourceLocale: z.enum(SOURCE_LOCALE_VALUES).optional(),
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

  const sourceLocale = resolveSourceLocale(
    parsed.data.sourceLocale,
    c.req.header('Accept-Language'),
  );

  const result = await submitReview.execute({
    tenantId: DEFAULT_TENANT_ID,
    userId: user.userId,
    brokerId: parsed.data.brokerId,
    title: parsed.data.title,
    body: parsed.data.body,
    rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5,
    sourceLocale,
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

  // Per ADR-0027 D5: GET /broker/:slug always returns author-original
  // title/body and never joins review_translations. The `sourceLocale`
  // field is shipped so the ReviewCard can render the language badge
  // (D6). `isTranslated` and `originalTitle/originalBody` are removed
  // from the response shape; clients that consumed them treat all
  // reviews as untranslated (the dominant behaviour they already saw).
  const users = await prisma.user.findMany({
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
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Hydrate broker names for every slug surfaced via author.verifiedBrokers
  // on this page. Single batched query — each user's slug list is small,
  // but the same broker often repeats across users.
  const verifiedSlugs = users.flatMap((u) => u.verifiedBrokers.map((b) => b.brokerSlug));
  const verifiedNameMap = await hydrateBrokerNames(verifiedSlugs, DEFAULT_TENANT_ID);

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
        sourceLocale: r.sourceLocale,
        createdAt: r.createdAt.toISOString(),
        author: {
          displayName: author?.displayName ?? null,
          sbtTier: author?.sbtTier ?? 'L1',
          verifiedBrokers:
            author?.verifiedBrokers.map((b) => {
              const meta = verifiedNameMap.get(b.brokerSlug);
              return {
                brokerSlug: b.brokerSlug,
                // Per ADR-0026: ship all three name columns (TC + SC + EN).
                displayName: meta?.displayName ?? b.brokerSlug,
                displayNameZhHans: meta?.displayNameZhHans ?? null,
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
      // Per cursor rule 51 + ADR-0026: ship all three name columns
      // (TC + SC + EN); the broker detail page already does, but the
      // reviews-by-broker payload was missing legalName until the
      // i18n hardening session, and is now extended to zh-Hans.
      displayName: broker.displayName,
      displayNameZhHans: broker.displayNameZhHans,
      legalName: broker.legalName,
      logoUrl: broker.logoUrl,
    },
  });
});

// Charset proxy for IPFS content. Registered before the `/:id` catch-all
// so Hono's trie picks the more specific path first. The Pinata public
// gateway returns UTF-8 bytes but omits the charset header (cosmetic bug
// observed 2026-05-24); this endpoint re-emits them with the canonical
// `application/json; charset=utf-8` so browsers render CJK correctly.
reviewsRouter.get('/:id/ipfs-content', async (c) => {
  const id = c.req.param('id');
  const result = await getReviewIpfsContent.execute({ reviewId: id });
  if (result === null) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Review or IPFS content not found', 404);
  }
  return new Response(result.content, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      // IPFS content is content-addressed and therefore immutable; safe
      // to cache aggressively. One hour at the browser is conservative;
      // a CDN in front of this could push much higher.
      'Cache-Control': 'public, max-age=3600, immutable',
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
      sourceLocale: review.sourceLocale,
      createdAt: review.createdAt.toISOString(),
    },
  });
});
