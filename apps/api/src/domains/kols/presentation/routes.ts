/**
 * Hono router for the KOL domain.
 *
 * Mounted under `/v1/kols` by `http/server.ts`.
 *
 * Endpoints:
 *   POST   /apply           — Apply to become a KOL (auth: user+)
 *   GET    /                — List KOLs (public; shows APPROVED + UNCLAIMED)
 *   GET    /me              — Get current user's KOL profile (auth: user+)
 *   GET    /:slug           — Get KOL profile by slug (public)
 *   POST   /:slug/follow    — Follow a KOL (auth: user+)
 *   DELETE /:slug/follow    — Unfollow a KOL (auth: user+)
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { ApplyKolUseCase } from '../application/ApplyKolUseCase.js';
import { ListKolsUseCase } from '../application/ListKolsUseCase.js';
import { PrismaKolRepository } from '../infrastructure/PrismaKolRepository.js';

import type { SocialLinks } from '../domain/KolEntity.js';
import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

export const kolsRouter = new Hono<AppHonoEnv>();

const kolRepo = new PrismaKolRepository(prisma);
const applyKolUseCase = new ApplyKolUseCase(kolRepo);
const listKolsUseCase = new ListKolsUseCase(kolRepo);

const applyBodySchema = z.object({
  displayName: z.string().min(2).max(100),
  bio: z.string().max(500).optional(),
  socialLinks: z
    .object({
      youtube: z.string().url().optional(),
      instagram: z.string().url().optional(),
      twitter: z.string().url().optional(),
    })
    .optional(),
  credentials: z
    .array(
      z.object({
        type: z.string().min(1).max(50),
        verified: z.literal(false),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /apply — Apply to become a KOL
// ---------------------------------------------------------------------------

kolsRouter.post('/apply', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const body = applyBodySchema.parse(await c.req.json());

  const input: Parameters<typeof applyKolUseCase.execute>[0] = {
    userId: user.userId,
    tenantId: DEFAULT_TENANT_ID,
    displayName: body.displayName,
  };
  if (body.bio !== undefined) input.bio = body.bio;
  if (body.socialLinks !== undefined) {
    const sl: SocialLinks = {};
    if (body.socialLinks.youtube) sl.youtube = body.socialLinks.youtube;
    if (body.socialLinks.instagram) sl.instagram = body.socialLinks.instagram;
    if (body.socialLinks.twitter) sl.twitter = body.socialLinks.twitter;
    input.socialLinks = sl;
  }
  if (body.credentials !== undefined) input.credentials = body.credentials;

  try {
    const kol = await applyKolUseCase.execute(input);

    return c.json({ kol }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already has a KOL profile')) {
      throw new AppError(ErrorCode.CONFLICT, 'User already has a KOL profile', 409);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// GET / — List KOLs (public; shows APPROVED + UNCLAIMED)
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

kolsRouter.get('/', async (c) => {
  const query = listQuerySchema.parse(c.req.query());

  const approved = await listKolsUseCase.execute({
    tenantId: DEFAULT_TENANT_ID,
    status: 'APPROVED',
    limit: query.limit,
    offset: query.offset,
  });

  const unclaimed = await listKolsUseCase.execute({
    tenantId: DEFAULT_TENANT_ID,
    status: 'UNCLAIMED',
    limit: query.limit,
    offset: query.offset,
  });

  const kols = [...approved.kols, ...unclaimed.kols]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, query.limit);

  return c.json({
    kols,
    total: approved.total + unclaimed.total,
  });
});

// ---------------------------------------------------------------------------
// GET /me — Get current user's KOL profile
// ---------------------------------------------------------------------------

kolsRouter.get('/me', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const kol = await kolRepo.findByUserId(DEFAULT_TENANT_ID, user.userId);

  if (!kol) {
    throw AppError.notFound('No KOL profile found for current user');
  }

  return c.json({ kol });
});

// ---------------------------------------------------------------------------
// GET /:slug — Get KOL profile by slug (public)
// ---------------------------------------------------------------------------

kolsRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const kol = await kolRepo.findBySlug(slug);

  if (!kol) {
    throw AppError.notFound(`KOL "${slug}" not found`);
  }

  const signalCount = await prisma.signal.count({
    where: { kolId: kol.id },
  });

  const followerCount = await prisma.kolFollow.count({
    where: { kolId: kol.id },
  });

  return c.json({ kol, signalCount, followerCount });
});

// ---------------------------------------------------------------------------
// POST /:slug/follow — Follow a KOL
// ---------------------------------------------------------------------------

kolsRouter.post('/:slug/follow', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const kol = await kolRepo.findBySlug(slug);

  if (!kol) {
    throw AppError.notFound(`KOL "${slug}" not found`);
  }

  try {
    await prisma.kolFollow.create({
      data: { userId: user.userId, kolId: kol.id },
    });
  } catch {
    throw new AppError(ErrorCode.CONFLICT, 'Already following this KOL', 409);
  }

  return c.json({ followed: true }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /:slug/follow — Unfollow a KOL
// ---------------------------------------------------------------------------

kolsRouter.delete('/:slug/follow', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const kol = await kolRepo.findBySlug(slug);

  if (!kol) {
    throw AppError.notFound(`KOL "${slug}" not found`);
  }

  await prisma.kolFollow.deleteMany({
    where: { userId: user.userId, kolId: kol.id },
  });

  return c.json({ followed: false });
});

// ---------------------------------------------------------------------------
// GET /:slug/signals — List signals for a specific KOL (public)
// ---------------------------------------------------------------------------

const kolSignalListSchema = z.object({
  outcome: z
    .enum(['ACTIVE', 'HIT_TARGET', 'HIT_DIRECTION', 'STOPPED', 'EXPIRED', 'UNRESOLVED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

kolsRouter.get('/:slug/signals', async (c) => {
  const slug = c.req.param('slug');
  const kol = await kolRepo.findBySlug(slug);

  if (!kol) {
    throw AppError.notFound(`KOL "${slug}" not found`);
  }

  const query = kolSignalListSchema.parse(c.req.query());

  const where: Record<string, unknown> = {
    kolId: kol.id,
    tenantId: DEFAULT_TENANT_ID,
  };
  if (query.outcome !== undefined) {
    where['outcome'] = query.outcome;
  }

  const [signals, total] = await Promise.all([
    prisma.signal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.signal.count({ where }),
  ]);

  return c.json({
    signals: signals.map((s) => ({
      ...s,
      entryPrice: s.entryPrice.toString(),
      targetPrice: s.targetPrice.toString(),
      stoplossPrice: s.stoplossPrice?.toString() ?? null,
      settlePrice: s.settlePrice?.toString() ?? null,
      periodHigh: s.periodHigh?.toString() ?? null,
      periodLow: s.periodLow?.toString() ?? null,
    })),
    total,
  });
});
