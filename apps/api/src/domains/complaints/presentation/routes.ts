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

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { PinataIpfsService } from '../../reviews/infrastructure/PinataIpfsService.js';
import { ListComplaintsUseCase } from '../application/ListComplaintsUseCase.js';
import { SubmitComplaintUseCase } from '../application/SubmitComplaintUseCase.js';
import { PrismaComplaintRepository } from '../infrastructure/PrismaComplaintRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const complaintRepo = new PrismaComplaintRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);
const submitComplaint = new SubmitComplaintUseCase(complaintRepo, ipfsService);
const listComplaints = new ListComplaintsUseCase(complaintRepo);

const SOURCE_LOCALE_VALUES = ['zh-Hant', 'zh-Hans', 'en'] as const;
const SENTIMENT_VALUES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
const COMPLAINT_STATUS_VALUES = ['OPEN', 'VERIFIED', 'REJECTED'] as const;

// IPFS CID validation: matches both v0 (Qm...) and v1 (b...) shapes
// at length granularity rather than full multibase decoding — tighter
// than `z.string().min(1)` but doesn't require pulling in a CID parser.
const IPFS_CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z0-9]{50,})$/;

const submitComplaintBodySchema = z.object({
  brokerId: z.string().uuid('brokerId must be a valid UUID'),
  title: z.string().min(1, 'title is required').max(200, 'title must be 200 chars or less'),
  body: z.string().min(10, 'body must be at least 10 characters').max(5000),
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
    title: parsed.data.title,
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

  return c.json({
    complaints: result.items.map((c) => ({
      id: c.id,
      brokerId: c.brokerId,
      contentHash: c.contentHash,
      ipfsCid: c.ipfsCid,
      evidenceIpfsCid: c.evidenceIpfsCid,
      title: c.title,
      body: c.body,
      sentiment: c.sentiment,
      sourceLocale: c.sourceLocale,
      verifiedAt: c.verifiedAt?.toISOString() ?? null,
      // Ship adminNote on REJECTED rows so the public page can render
      // the reject reason next to the "not verified by platform"
      // label per ADR-0029 D4. OPEN / VERIFIED rows have null here.
      adminNote: c.adminNote,
      createdAt: c.createdAt.toISOString(),
    })),
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
    },
  });
});
