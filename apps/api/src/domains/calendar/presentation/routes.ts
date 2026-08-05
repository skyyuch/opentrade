/**
 * Hono router for the economic-calendar domain.
 *
 * Mounted under `/v1/calendar` by `http/server.ts`.
 *
 * Endpoints:
 *   GET / — Public, chronological economic-event calendar (ADR-0058 D5).
 *           Query: ?from=&to=&region=&category=&limit=&cursor=
 *           `from`/`to` bound the `scheduledAt` window; `region`/`category`
 *           are filters only — ordering is strictly chronological and never
 *           influenceable (ADR-0058 D1). `region` may be repeated
 *           (`?region=US&region=HK`) for an OR set; omitting it means all
 *           regions. `category` stays single-select.
 *
 * Public + read-only: aggregated official economic-release data is global
 * reference data with no PII and no tenant scoping, so no auth is required
 * (same posture as GET /v1/news and GET /instruments).
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { ListEventsUseCase, MAX_LIMIT } from '../application/ListEventsUseCase.js';
import { ECONOMIC_CATEGORY_VALUES, ECONOMIC_REGION_VALUES } from '../domain/EconomicEventEntity.js';
import { PrismaCalendarRepository } from '../infrastructure/PrismaCalendarRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { ListEventsInput } from '../application/ListEventsUseCase.js';

export const calendarRouter = new Hono<AppHonoEnv>();

const repo = new PrismaCalendarRepository(prisma);
const listEvents = new ListEventsUseCase(repo);

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // `region` is parsed separately (it may be repeated) — see below.
  category: z.enum(ECONOMIC_CATEGORY_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z.string().uuid().optional(),
});

// A repeatable `region` filter: `?region=US&region=HK` is an OR set. Each value
// must be a valid enum member; a single `?region=US` still works (one-element
// array). Empty/omitted means all regions (ADR-0058 D1: filter, never ranking).
const regionsSchema = z.array(z.enum(ECONOMIC_REGION_VALUES)).optional();

calendarRouter.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const rawRegions = c.req.queries('region');
  const parsedRegions = regionsSchema.safeParse(rawRegions);
  if (!parsedRegions.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: parsedRegions.error.issues },
    });
  }

  const input: ListEventsInput = {};
  if (parsed.data.from !== undefined) input.from = parsed.data.from;
  if (parsed.data.to !== undefined) input.to = parsed.data.to;
  if (parsedRegions.data !== undefined && parsedRegions.data.length > 0) {
    input.regions = parsedRegions.data;
  }
  if (parsed.data.category !== undefined) input.category = parsed.data.category;
  if (parsed.data.limit !== undefined) input.limit = parsed.data.limit;
  if (parsed.data.cursor !== undefined) input.cursor = parsed.data.cursor;

  const result = await listEvents.execute(input);
  return c.json({ items: result.items, nextCursor: result.nextCursor });
});
