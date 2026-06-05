/**
 * Hono router for the complaints domain.
 *
 * Composition root: wires Prisma complaint repo, Pinata IPFS service,
 * and the submit / list use cases. Mounted under `/v1/complaints` by
 * `http/server.ts`. Admin verify / reject endpoints live in the admin
 * domain (mounted under `/v1/admin/complaints/...`) and ship in M7.3c.
 *
 * Endpoints:
 *   POST   /              — Submit a new complaint (auth: reviewer+, per
 *                           ADR-0029 D3; reviewer is the L2-equivalent
 *                           role in the current hierarchy)
 *   GET    /broker/:slug  — List complaints for a broker (public)
 *   GET    /:id           — Get a single complaint (public)
 *
 * Per ADR-0029 D3 every complaint requires evidence — the frontend
 * uploads the file to Pinata first and passes the CID through.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { createCheckContentService } from '../../../domains/moderation/index.js';
import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { PinataIpfsService } from '../../reviews/infrastructure/PinataIpfsService.js';
import { ListComplaintsUseCase } from '../application/ListComplaintsUseCase.js';
import { SubmitBrokerResponseUseCase } from '../application/SubmitBrokerResponseUseCase.js';
import { SubmitComplaintUseCase } from '../application/SubmitComplaintUseCase.js';
import { PrismaBrokerResponseRepository } from '../infrastructure/PrismaBrokerResponseRepository.js';
import { PrismaComplaintRepository } from '../infrastructure/PrismaComplaintRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const complaintRepo = new PrismaComplaintRepository(prisma);
const responseRepo = new PrismaBrokerResponseRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);
// ADR-0034: the same content-neutral pre-publication gate that guards
// reviews also guards complaints + broker responses. The moderation domain
// provides the checker; it is injected here (rule 30 — complaints does not
// import a moderation use case directly, only the structural port the
// reviews domain owns and which CheckContentService satisfies).
const contentModerator = createCheckContentService(prisma);
const submitComplaint = new SubmitComplaintUseCase(complaintRepo, ipfsService, contentModerator);
const submitBrokerResponse = new SubmitBrokerResponseUseCase(
  complaintRepo,
  responseRepo,
  ipfsService,
  contentModerator,
);
const listComplaints = new ListComplaintsUseCase(complaintRepo);

const SOURCE_LOCALE_VALUES = ['zh-Hant', 'zh-Hans', 'en'] as const;
const SENTIMENT_VALUES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
const COMPLAINT_STATUS_VALUES = ['OPEN', 'VERIFIED', 'REJECTED'] as const;

// IPFS CID validation: matches both v0 (Qm...) and v1 (b...) shapes
// at length granularity rather than full multibase decoding — tighter
// than `z.string().min(1)` but doesn't require pulling in a CID parser.
const IPFS_CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z0-9]{50,})$/;

// Body / title bounds match the M7.5 ComplaintForm UX: optional short
// summary headline (≤ 80 chars) + factual narrative (10–2000 chars).
// The DB column is `VarChar(200)` / `Text` so the tighter API caps are
// purely UX-facing — undefined title maps to empty string before the
// repo writes the row (the legacy review path keeps its own required
// title with a different cap; the two endpoints intentionally differ).
const submitComplaintBodySchema = z.object({
  brokerId: z.string().uuid('brokerId must be a valid UUID'),
  title: z.string().max(80, 'title must be 80 chars or less').optional(),
  body: z
    .string()
    .min(10, 'body must be at least 10 characters')
    .max(2000, 'body must be 2000 chars or less'),
  evidenceIpfsCid: z
    .string()
    .regex(IPFS_CID_PATTERN, 'evidenceIpfsCid must be a valid IPFS CID')
    .max(200),
  sentiment: z.enum(SENTIMENT_VALUES).optional(),
  sourceLocale: z.enum(SOURCE_LOCALE_VALUES).optional(),
});

const listComplaintsQuerySchema = z.object({
  brokerSlug: z.string().min(1).max(200).optional(),
  status: z.enum(COMPLAINT_STATUS_VALUES).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const complaintsRouter = new Hono<AppHonoEnv>();

complaintsRouter.post('/', authMiddleware('reviewer'), async (c) => {
  const rawBody: unknown = await c.req.json();
  const parsed = submitComplaintBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid complaint submission', 400, {
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

  // Resolve source locale from explicit body field → Accept-Language
  // exact match → zh-Hant default (mirrors reviews/presentation/routes
  // resolveSourceLocale per ADR-0027 D2). Inlined here rather than
  // lifted to shared/ because it's a 4-liner used in two places only.
  const explicitLocale = parsed.data.sourceLocale;
  const acceptFirst = c.req.header('Accept-Language')?.split(',')[0]?.trim();
  const sourceLocale =
    explicitLocale ??
    (acceptFirst === 'zh-Hant' || acceptFirst === 'zh-Hans' || acceptFirst === 'en'
      ? acceptFirst
      : 'zh-Hant');

  const result = await submitComplaint.execute({
    tenantId: DEFAULT_TENANT_ID,
    userId: user.userId,
    brokerId: parsed.data.brokerId,
    // Title is optional at the API layer (per M7.5 spec) — coerce
    // undefined to empty string so the NOT-NULL DB column is satisfied
    // without leaking the optional shape into the domain layer.
    title: parsed.data.title ?? '',
    body: parsed.data.body,
    evidenceIpfsCid: parsed.data.evidenceIpfsCid,
    // Default `NEGATIVE` for complaints (per ADR-0029 the act of
    // complaining is a negative-toned signal) but allow override so
    // an admin tool can in theory log a NEUTRAL "informational"
    // complaint without re-deploying.
    sentiment: parsed.data.sentiment ?? 'NEGATIVE',
    sourceLocale,
  });

  const logger = c.get('logger');
  logger.info(
    { complaintId: result.complaint.id, brokerId: parsed.data.brokerId },
    'Complaint submitted',
  );

  return c.json(
    {
      complaint: {
        id: result.complaint.id,
        brokerId: result.complaint.brokerId,
        contentHash: result.complaint.contentHash,
        ipfsCid: result.complaint.ipfsCid,
        evidenceIpfsCid: result.complaint.evidenceIpfsCid,
        title: result.complaint.title,
        sentiment: result.complaint.sentiment,
        sourceLocale: result.complaint.sourceLocale,
        verifiedAt: result.complaint.verifiedAt?.toISOString() ?? null,
        adminNote: result.complaint.adminNote,
        createdAt: result.complaint.createdAt.toISOString(),
      },
    },
    201,
  );
});

complaintsRouter.get('/broker/:slug', async (c) => {
  const slug = c.req.param('slug');

  const broker = await prisma.broker.findFirst({
    where: { slug, tenantId: DEFAULT_TENANT_ID, deletedAt: null },
  });

  if (!broker) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Broker not found', 404);
  }

  const query = listComplaintsQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const result = await listComplaints.execute({
    tenantId: DEFAULT_TENANT_ID,
    brokerId: broker.id,
    status: query.data.status,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });

  const responseMap = await responseRepo.findByComplaintIds(result.items.map((item) => item.id));

  return c.json({
    complaints: result.items.map((item) => {
      const resp = responseMap.get(item.id);
      return {
        id: item.id,
        brokerId: item.brokerId,
        contentHash: item.contentHash,
        ipfsCid: item.ipfsCid,
        evidenceIpfsCid: item.evidenceIpfsCid,
        title: item.title,
        body: item.body,
        sentiment: item.sentiment,
        sourceLocale: item.sourceLocale,
        verifiedAt: item.verifiedAt?.toISOString() ?? null,
        adminNote: item.adminNote,
        createdAt: item.createdAt.toISOString(),
        brokerResponse: resp
          ? {
              id: resp.id,
              body: resp.body,
              contentHash: resp.contentHash,
              ipfsCid: resp.ipfsCid,
              sourceLocale: resp.sourceLocale,
              createdAt: resp.createdAt.toISOString(),
            }
          : null,
      };
    }),
    nextCursor: result.nextCursor,
    broker: {
      id: broker.id,
      slug: broker.slug,
      displayName: broker.displayName,
      displayNameZhHans: broker.displayNameZhHans,
      legalName: broker.legalName,
      logoUrl: broker.logoUrl,
    },
  });
});

complaintsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const complaint = await complaintRepo.findById(id);
  if (!complaint) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Complaint not found', 404);
  }

  const brokerResponse = await responseRepo.findByComplaintId(id);

  return c.json({
    complaint: {
      id: complaint.id,
      brokerId: complaint.brokerId,
      contentHash: complaint.contentHash,
      ipfsCid: complaint.ipfsCid,
      evidenceIpfsCid: complaint.evidenceIpfsCid,
      title: complaint.title,
      body: complaint.body,
      sentiment: complaint.sentiment,
      sourceLocale: complaint.sourceLocale,
      verifiedAt: complaint.verifiedAt?.toISOString() ?? null,
      adminNote: complaint.adminNote,
      createdAt: complaint.createdAt.toISOString(),
      brokerResponse: brokerResponse
        ? {
            id: brokerResponse.id,
            body: brokerResponse.body,
            contentHash: brokerResponse.contentHash,
            ipfsCid: brokerResponse.ipfsCid,
            sourceLocale: brokerResponse.sourceLocale,
            createdAt: brokerResponse.createdAt.toISOString(),
          }
        : null,
    },
  });
});

// ---------------------------------------------------------------------------
// Broker public response per ADR-0037
// ---------------------------------------------------------------------------

const brokerResponseBodySchema = z.object({
  body: z
    .string()
    .min(10, 'body must be at least 10 characters')
    .max(2000, 'body must be 2000 chars or less'),
  sourceLocale: z.enum(SOURCE_LOCALE_VALUES).optional(),
});

complaintsRouter.post('/:id/broker-response', authMiddleware('user'), async (c) => {
  const complaintId = c.req.param('id');
  const rawBody: unknown = await c.req.json();
  const parsed = brokerResponseBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid broker response', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const { userId, tenantId } = c.get('user');

  const complaint = await complaintRepo.findById(complaintId);
  if (!complaint) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Complaint not found', 404);
  }

  const broker = await prisma.broker.findFirst({
    where: { id: complaint.brokerId, tenantId, deletedAt: null },
  });
  if (broker?.claimedByUserId !== userId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Only the broker owner can respond to complaints', 403);
  }

  const acceptFirst = c.req.header('Accept-Language')?.split(',')[0]?.trim();
  const sourceLocale =
    parsed.data.sourceLocale ??
    (acceptFirst === 'zh-Hant' || acceptFirst === 'zh-Hans' || acceptFirst === 'en'
      ? acceptFirst
      : 'zh-Hant');

  try {
    const result = await submitBrokerResponse.execute(
      {
        tenantId,
        userId,
        complaintId,
        body: parsed.data.body,
        sourceLocale,
      },
      broker.id,
    );

    const logger = c.get('logger');
    logger.info(
      { responseId: result.response.id, complaintId, brokerId: broker.id },
      'Broker response submitted',
    );

    return c.json(
      {
        response: {
          id: result.response.id,
          complaintId: result.response.respondsToReviewId,
          body: result.response.body,
          contentHash: result.response.contentHash,
          ipfsCid: result.response.ipfsCid,
          sourceLocale: result.response.sourceLocale,
          createdAt: result.response.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      throw new AppError(ErrorCode.CONFLICT, 'A response already exists for this complaint', 409);
    }
    throw err;
  }
});
