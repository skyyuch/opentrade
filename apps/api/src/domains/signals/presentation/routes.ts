/**
 * Hono router for the signals domain.
 *
 * Mounted under `/v1/signals` by `http/server.ts`.
 *
 * Endpoints:
 *   POST  /          — Emit a new signal (auth: user+ with APPROVED KOL)
 *   GET   /          — List signals (public, filterable)
 *   GET   /:id       — Get signal by id (public)
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError } from '../../../shared/errors/index.js';
import { EmitSignalUseCase } from '../application/EmitSignalUseCase.js';
import { ListSignalsUseCase } from '../application/ListSignalsUseCase.js';
import { PrismaSignalRepository } from '../infrastructure/PrismaSignalRepository.js';
import { PrismaKolRepository } from '../../kols/infrastructure/PrismaKolRepository.js';
import {
  ASSET_CLASS_VALUES,
  SIGNAL_DIRECTION_VALUES,
  VALID_HORIZONS,
} from '../domain/SignalEntity.js';

import type { SignalListOptions } from '../domain/ISignalRepository.js';
import type { EmitSignalInput } from '../domain/SignalEntity.js';
import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

export const signalsRouter = new Hono<AppHonoEnv>();

const signalRepo = new PrismaSignalRepository(prisma);
const kolRepo = new PrismaKolRepository(prisma);
const emitSignalUseCase = new EmitSignalUseCase(signalRepo, kolRepo);
const listSignalsUseCase = new ListSignalsUseCase(signalRepo);

// ---------------------------------------------------------------------------
// POST / — Emit a new signal
// ---------------------------------------------------------------------------

const emitBodySchema = z.object({
  kolId: z.string().min(1),
  assetClass: z.enum(ASSET_CLASS_VALUES as unknown as [string, ...string[]]),
  symbol: z.string().min(1).max(30),
  direction: z.enum(SIGNAL_DIRECTION_VALUES as unknown as [string, ...string[]]),
  entryPrice: z.string().regex(/^\d+(\.\d+)?$/),
  targetPrice: z.string().regex(/^\d+(\.\d+)?$/),
  stoplossPrice: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  horizon: z
    .number()
    .int()
    .refine((v) => (VALID_HORIZONS as readonly number[]).includes(v), {
      message: `Horizon must be one of: ${VALID_HORIZONS.join(', ')}`,
    }),
  note: z.string().max(500).optional(),
});

signalsRouter.post('/', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const body = emitBodySchema.parse(await c.req.json());

  const kol = await kolRepo.findByUserId(DEFAULT_TENANT_ID, user.userId);
  if (!kol || kol.id !== body.kolId) {
    throw AppError.notFound('KOL profile not found or does not belong to current user');
  }

  const input: EmitSignalInput = {
    tenantId: DEFAULT_TENANT_ID,
    kolId: body.kolId,
    assetClass: body.assetClass as EmitSignalInput['assetClass'],
    symbol: body.symbol,
    direction: body.direction as EmitSignalInput['direction'],
    entryPrice: body.entryPrice,
    targetPrice: body.targetPrice,
    horizon: body.horizon as EmitSignalInput['horizon'],
  };
  if (body.stoplossPrice !== undefined) input.stoplossPrice = body.stoplossPrice;
  if (body.note !== undefined) input.note = body.note;

  try {
    const signal = await emitSignalUseCase.execute(input);
    return c.json({ signal }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Only APPROVED')) {
      throw AppError.notFound('Only APPROVED KOLs can emit signals');
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// GET / — List signals (public)
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  kolId: z.string().optional(),
  symbol: z.string().optional(),
  outcome: z
    .enum(['ACTIVE', 'HIT_TARGET', 'HIT_DIRECTION', 'STOPPED', 'EXPIRED', 'UNRESOLVED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

signalsRouter.get('/', async (c) => {
  const query = listQuerySchema.parse(c.req.query());

  const opts: SignalListOptions = {
    tenantId: DEFAULT_TENANT_ID,
    limit: query.limit,
    offset: query.offset,
  };
  if (query.kolId !== undefined) opts.kolId = query.kolId;
  if (query.symbol !== undefined) opts.symbol = query.symbol;
  if (query.outcome !== undefined) opts.outcome = query.outcome;

  const { signals, total } = await listSignalsUseCase.execute(opts);
  return c.json({ signals, total });
});

// ---------------------------------------------------------------------------
// GET /:id — Get single signal (public)
// ---------------------------------------------------------------------------

signalsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const signal = await signalRepo.findById(id);

  if (!signal) {
    throw AppError.notFound(`Signal ${id} not found`);
  }

  return c.json({ signal });
});
