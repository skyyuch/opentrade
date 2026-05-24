/**
 * Hono router for the identity domain.
 *
 * Composition root: wires Privy verifier, Prisma user repo, and jose JWT
 * service into the ExchangeTokenUseCase. Mounted under `/v1/auth` by
 * `http/server.ts`.
 *
 * Endpoints:
 *   POST /exchange    — Privy access token → OpenTrade JWT
 *   POST /login       — Username/password → OpenTrade JWT (per ADR-0023)
 *   GET  /me          — Current user profile (auth required)
 *   PATCH /me         — Update display name / locale (auth required)
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { PinataIpfsService } from '../../reviews/infrastructure/PinataIpfsService.js';
import { ExchangeTokenUseCase } from '../application/ExchangeTokenUseCase.js';
import { LoginWithCredentialsUseCase } from '../application/LoginWithCredentialsUseCase.js';
import { BcryptPasswordHasher } from '../infrastructure/BcryptPasswordHasher.js';
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
const passwordHasher = new BcryptPasswordHasher();
const exchangeToken = new ExchangeTokenUseCase(privyVerifier, userRepo, jwtService);
const loginWithCredentials = new LoginWithCredentialsUseCase(userRepo, jwtService, passwordHasher);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);

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

// ---------------------------------------------------------------------------
// Username/password login (per ADR-0023)
// ---------------------------------------------------------------------------

const loginBodySchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

identityRouter.post('/login', async (c) => {
  const body: unknown = await c.req.json();
  const parsed = loginBodySchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid request body', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const result = await loginWithCredentials.execute({
    username: parsed.data.username,
    password: parsed.data.password,
  });

  return c.json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    userId: result.userId,
  });
});

identityRouter.get('/me', authMiddleware('user'), async (c) => {
  const { userId, tenantId } = c.get('user');
  const user = await userRepo.findById(userId);

  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
  }

  const claimedBroker = await prisma.broker.findFirst({
    where: { claimedByUserId: userId, tenantId, deletedAt: null },
    select: { slug: true, displayName: true },
  });

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
    claimedBroker: claimedBroker
      ? { slug: claimedBroker.slug, displayName: claimedBroker.displayName }
      : null,
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
  evidenceMimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']).optional(),
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

  const pending = await prisma.sbtVerificationRequest.findFirst({
    where: { userId, tenantId, status: 'PENDING' },
  });
  if (pending) {
    throw new AppError(ErrorCode.CONFLICT, 'You already have a pending verification request', 409);
  }

  // Per ADR-0025 D2: a (userId, brokerSlug) pair can only have one APPROVED
  // request. Resubmitting against an already-verified broker is a no-op.
  // REJECTED rows are intentionally not blocked — users may retry after
  // adjusting their evidence.
  const alreadyVerified = await prisma.sbtVerificationRequest.findFirst({
    where: { userId, tenantId, brokerSlug: parsed.data.brokerSlug, status: 'APPROVED' },
    select: { id: true },
  });
  if (alreadyVerified) {
    throw new AppError(ErrorCode.CONFLICT, 'You have already been verified for this broker', 409);
  }

  const request = await prisma.sbtVerificationRequest.create({
    data: {
      tenantId,
      userId,
      brokerSlug: parsed.data.brokerSlug,
      commitment: parsed.data.commitment,
      evidenceIpfsCid: parsed.data.evidenceIpfsCid,
      evidenceMimeType: parsed.data.evidenceMimeType ?? null,
    },
  });

  return c.json({ verification: { id: request.id, status: request.status } }, 201);
});

// ---------------------------------------------------------------------------
// Verification evidence file upload (file → IPFS via Pinata)
// ---------------------------------------------------------------------------

const VERIFY_EVIDENCE_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
const VERIFY_EVIDENCE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

identityRouter.post('/verify-broker/upload', authMiddleware('user'), async (c) => {
  const { userId } = c.get('user');

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'No file provided', 400);
  }

  if (
    !VERIFY_EVIDENCE_ALLOWED_MIME.includes(
      file.type as (typeof VERIFY_EVIDENCE_ALLOWED_MIME)[number],
    )
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid file type: ${file.type}. Accepted: PDF, JPEG, PNG, WebP`,
      400,
    );
  }

  if (file.size > VERIFY_EVIDENCE_MAX_SIZE) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB. Max 10 MB.`,
      400,
    );
  }

  const safeName = `verify-${userId}-${Date.now()}`;
  const { cid } = await ipfsService.pinFile(file, safeName);

  return c.json({ cid, size: file.size, mimeType: file.type }, 201);
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
      commitment: r.commitment,
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
      evidenceMimeType: r.evidenceMimeType,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

const approveActionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

const rejectActionSchema = z.object({
  adminNote: z
    .string()
    .min(5, 'Rejection reason must be at least 5 characters')
    .max(500, 'Rejection reason must be at most 500 characters'),
});

identityRouter.post('/admin/verifications/:id/approve', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = approveActionSchema.safeParse(body);

  const request = await prisma.sbtVerificationRequest.findUnique({ where: { id } });
  if (request?.status !== 'PENDING') {
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

    // Per ADR-0025 D5 hash chain: capture the previous broker commitment
    // BEFORE inserting the new row so we don't have to exclude ourselves
    // from the lookup. `null` means this is the user's first verified
    // broker.
    const prev = await tx.userVerifiedBroker.findFirst({
      where: { userId: request.userId },
      orderBy: { approvedAt: 'desc' },
      select: { commitment: true },
    });

    // Per ADR-0025 D4: append the broker to the user's verified-brokers
    // ledger. The (userId, brokerSlug) unique constraint protects against
    // double-approve races at the database level.
    await tx.userVerifiedBroker.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        brokerSlug: request.brokerSlug,
        verificationId: request.id,
        commitment: request.commitment,
      },
    });

    await tx.outboxEvent.create({
      data: {
        tenantId: request.tenantId,
        aggregateType: 'user_verified_broker',
        aggregateId: request.id,
        eventType: 'verification.broker_added',
        payload: {
          userId: request.userId,
          brokerSlug: request.brokerSlug,
          commitment: request.commitment,
          prevCommitment: prev?.commitment ?? null,
        },
      },
    });

    // Per ADR-0025 D3: tier promotion + on-chain mint only fires on the
    // user's first ever approved broker. Subsequent approves stay on chain
    // as the existing SBT (which is one-mint-per-address per ADR-0021 D2)
    // and live in DB/outbox until Phase 2.
    const user = await tx.user.findUnique({
      where: { id: request.userId },
      select: { sbtTier: true },
    });

    if (user?.sbtTier === 'L1') {
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
    }
  });

  return c.json({ status: 'approved', verificationId: id });
});

identityRouter.post('/admin/verifications/:id/reject', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = rejectActionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Rejection reason is required', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const request = await prisma.sbtVerificationRequest.findUnique({ where: { id } });
  if (request?.status !== 'PENDING') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Pending verification not found', 404);
  }

  await prisma.sbtVerificationRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      adminNote: parsed.data.adminNote,
      reviewedAt: new Date(),
    },
  });

  return c.json({ status: 'rejected', verificationId: id });
});
