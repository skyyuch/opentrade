/**
 * Hono router for the identity domain.
 *
 * Composition root: wires Privy verifier, Prisma user repo, and jose JWT
 * service into the ExchangeTokenUseCase. Mounted under `/v1/auth` by
 * `http/server.ts`.
 *
 * Endpoints:
 *   POST /exchange    — Privy access token → OpenTrade JWT
 *   GET  /me          — Current user profile (auth required)
 *   PATCH /me         — Update display name / locale (auth required)
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
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

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  preferredLocale: z.enum(['zh-Hant', 'zh-Hans', 'en']).optional(),
});

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 3)}***@${domain}`;
}

function shortenWallet(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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

identityRouter.get('/me', authMiddleware('user'), async (c) => {
  const { userId } = c.get('user');
  const user = await userRepo.findById(userId);

  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
  }

  return c.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email ? maskEmail(user.email) : null,
      walletAddress: user.walletAddress ? shortenWallet(user.walletAddress) : null,
      walletAddressFull: user.walletAddress,
      preferredLocale: user.preferredLocale,
      role: user.role,
      sbtTier: user.sbtTier,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

identityRouter.patch('/me', authMiddleware('user'), async (c) => {
  const { userId } = c.get('user');

  const body: unknown = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid request body', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  if (!parsed.data.displayName && !parsed.data.preferredLocale) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'At least one field must be provided', 400);
  }

  const updated = await userRepo.updateProfile(userId, {
    displayName: parsed.data.displayName,
    preferredLocale: parsed.data.preferredLocale,
  });

  return c.json({
    user: {
      id: updated.id,
      displayName: updated.displayName,
      email: updated.email ? maskEmail(updated.email) : null,
      walletAddress: updated.walletAddress ? shortenWallet(updated.walletAddress) : null,
      walletAddressFull: updated.walletAddress,
      preferredLocale: updated.preferredLocale,
      role: updated.role,
      sbtTier: updated.sbtTier,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// ---------------------------------------------------------------------------
// L2 SBT Verification (per ADR-0022)
// ---------------------------------------------------------------------------

const verifyBrokerSchema = z.object({
  brokerSlug: z.string().min(1),
  commitment: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'commitment must be a keccak256 hash'),
  evidenceIpfsCid: z.string().min(1),
});

identityRouter.post('/verify-broker', authMiddleware('user'), async (c) => {
  const { userId, tenantId } = c.get('user');

  const body: unknown = await c.req.json();
  const parsed = verifyBrokerSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid verification request', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const existing = await prisma.sbtVerificationRequest.findFirst({
    where: { userId, tenantId, status: 'PENDING' },
  });
  if (existing) {
    throw new AppError(ErrorCode.CONFLICT, 'You already have a pending verification request', 409);
  }

  const request = await prisma.sbtVerificationRequest.create({
    data: {
      tenantId,
      userId,
      brokerSlug: parsed.data.brokerSlug,
      commitment: parsed.data.commitment,
      evidenceIpfsCid: parsed.data.evidenceIpfsCid,
    },
  });

  return c.json({ verification: { id: request.id, status: request.status } }, 201);
});

identityRouter.get('/verification-status', authMiddleware('user'), async (c) => {
  const { userId, tenantId } = c.get('user');

  const requests = await prisma.sbtVerificationRequest.findMany({
    where: { userId, tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return c.json({
    verifications: requests.map((r) => ({
      id: r.id,
      brokerSlug: r.brokerSlug,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Admin verification endpoints
// ---------------------------------------------------------------------------

identityRouter.get('/admin/verifications', authMiddleware('admin'), async (c) => {
  const status = c.req.query('status') ?? 'PENDING';

  const requests = await prisma.sbtVerificationRequest.findMany({
    where: {
      tenantId: DEFAULT_TENANT_ID,
      status: status as 'PENDING' | 'APPROVED' | 'REJECTED',
    },
    include: {
      user: { select: { id: true, displayName: true, walletAddress: true, sbtTier: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return c.json({
    verifications: requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      brokerSlug: r.brokerSlug,
      commitment: r.commitment,
      evidenceIpfsCid: r.evidenceIpfsCid,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

const adminVerifyActionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

identityRouter.post('/admin/verifications/:id/approve', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = adminVerifyActionSchema.safeParse(body);

  const request = await prisma.sbtVerificationRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'PENDING') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Pending verification not found', 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.sbtVerificationRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNote: parsed.success ? (parsed.data.adminNote ?? null) : null,
        reviewedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: request.userId },
      data: { sbtTier: 'L2', role: 'REVIEWER' },
    });

    await tx.outboxEvent.create({
      data: {
        tenantId: request.tenantId,
        aggregateType: 'sbt_verification',
        aggregateId: id,
        eventType: 'sbt.mint_requested',
        payload: { userId: request.userId, verificationId: id },
      },
    });
  });

  return c.json({ status: 'approved', verificationId: id });
});

identityRouter.post('/admin/verifications/:id/reject', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = adminVerifyActionSchema.safeParse(body);

  const request = await prisma.sbtVerificationRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'PENDING') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Pending verification not found', 404);
  }

  await prisma.sbtVerificationRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      adminNote: parsed.success ? (parsed.data.adminNote ?? null) : null,
      reviewedAt: new Date(),
    },
  });

  return c.json({ status: 'rejected', verificationId: id });
});
