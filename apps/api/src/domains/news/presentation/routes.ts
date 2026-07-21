/**
 * Hono router for the news domain.
 *
 * Mounted under `/v1/news` by `http/server.ts`.
 *
 * Endpoints:
 *   GET / — Public, chronological news feed (ADR-0057 D6).
 *           Query: ?limit=&cursor=&symbol=
 *           `symbol` is a forward-compatible per-instrument filter seam
 *           (ADR-0057 D4); the MVP UI does not use it.
 *
 * Public + read-only: aggregated headlines are global reference data with no
 * PII and no tenant scoping, so no auth is required (same posture as
 * GET /instruments and the public moderation audit).
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { ListNewsUseCase, MAX_LIMIT } from '../application/ListNewsUseCase.js';
import { PrismaNewsRepository } from '../infrastructure/PrismaNewsRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { ListNewsInput } from '../application/ListNewsUseCase.js';

export const newsRouter = new Hono<AppHonoEnv>();

const repo = new PrismaNewsRepository(prisma);
const listNews = new ListNewsUseCase(repo);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z.string().uuid().optional(),
  symbol: z.string().max(30).optional(),
});

newsRouter.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const input: ListNewsInput = {};
  if (parsed.data.limit !== undefined) input.limit = parsed.data.limit;
  if (parsed.data.cursor !== undefined) input.cursor = parsed.data.cursor;
  if (parsed.data.symbol !== undefined) input.symbol = parsed.data.symbol;

  const result = await listNews.execute(input);
  return c.json({ items: result.items, nextCursor: result.nextCursor });
});
