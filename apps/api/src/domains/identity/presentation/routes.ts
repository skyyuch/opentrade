/**
 * Hono router for the identity domain.
 *
 * Composition root: wires Privy verifier, Prisma user repo, and jose JWT
 * service into the ExchangeTokenUseCase. Mounted under `/v1/auth` by
 * `http/server.ts`.
 *
 * Endpoints:
 *   POST /exchange — Privy access token → OpenTrade JWT
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { ExchangeTokenUseCase } from '../application/ExchangeTokenUseCase.js';
import { JoseJwtService } from '../infrastructure/JoseJwtService.js';
import { PrismaUserRepository } from '../infrastructure/PrismaUserRepository.js';
import { PrivyVerifier } from '../infrastructure/PrivyVerifier.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const privyVerifier = new PrivyVerifier(
  env.PRIVY_APP_ID,
  env.PRIVY_APP_SECRET,
  env.PRIVY_VERIFICATION_KEY,
);
const userRepo = new PrismaUserRepository(prisma);
const jwtService = new JoseJwtService(env.JWT_PRIVATE_KEY_PEM, env.JWT_PUBLIC_KEY_PEM);
const exchangeToken = new ExchangeTokenUseCase(privyVerifier, userRepo, jwtService);

const exchangeBodySchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
});

export const identityRouter = new Hono<AppHonoEnv>();

identityRouter.post('/exchange', async (c) => {
  const body: unknown = await c.req.json();
  const parsed = exchangeBodySchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid request body', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const result = await exchangeToken.execute({
    privyAccessToken: parsed.data.accessToken,
    tenantId: DEFAULT_TENANT_ID,
  });

  return c.json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    userId: result.userId,
  });
});
