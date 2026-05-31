/**
 * Hono router for the instruments domain.
 *
 * Mounted under `/v1/instruments` by `http/server.ts`.
 *
 * Endpoints:
 *   GET / — Public catalog search for the signal target picker (ADR-0038 D5).
 *           Query: ?category=&q=&limit=
 *
 * Public + read-only: instruments are global market reference data with no PII
 * and no tenant scoping, so no auth is required (same posture as GET /brokers).
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';
import { INSTRUMENT_CATEGORIES } from '@opentrade/shared';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SearchInstrumentsUseCase,
} from '../application/SearchInstrumentsUseCase.js';
import { PrismaInstrumentRepository } from '../infrastructure/PrismaInstrumentRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { SearchInstrumentsOptions } from '../domain/InstrumentEntity.js';

export const instrumentsRouter = new Hono<AppHonoEnv>();

const repo = new PrismaInstrumentRepository(prisma);
const searchInstruments = new SearchInstrumentsUseCase(repo);

const querySchema = z.object({
  category: z.enum(INSTRUMENT_CATEGORIES).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

instrumentsRouter.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const opts: SearchInstrumentsOptions = { limit: parsed.data.limit };
  if (parsed.data.category !== undefined) opts.category = parsed.data.category;
  if (parsed.data.q !== undefined) opts.q = parsed.data.q;

  const instruments = await searchInstruments.execute(opts);
  return c.json({ instruments });
});
