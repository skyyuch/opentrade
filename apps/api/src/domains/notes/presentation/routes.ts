/**
 * Hono router for the notes domain (KOL analyst notes, ADR-0039).
 *
 * Mounted under `/v1/notes` by `http/server.ts`.
 *
 * Endpoints:
 *   POST  /          — Create a note (auth: user owning an APPROVED KOL profile)
 *   POST  /images    — Upload one image → IPFS, returns { cid, url } (auth: user)
 *   GET   /          — List notes (public, filter by kolId / linkedSignalId)
 *   GET   /:id       — Get one note with full body (public)
 *
 * Per rule 50: the web app never talks to Pinata directly — image upload goes
 * through this API (ADR-0039 D5). Notes are immutable: there is intentionally no
 * PATCH/PUT/DELETE route (rule 00 + ADR-0039 D2).
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';
import { KOL_NOTE_MAX_IMAGES, KOL_NOTE_TITLE_MAX, KOL_NOTE_TITLE_MIN } from '@opentrade/shared';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { PrismaKolRepository } from '../../kols/infrastructure/PrismaKolRepository.js';
import { PinataIpfsService } from '../../reviews/infrastructure/PinataIpfsService.js';
import { CreateKolNoteUseCase } from '../application/CreateKolNoteUseCase.js';
import { ListNotesUseCase } from '../application/ListNotesUseCase.js';
import { PrismaNoteRepository } from '../infrastructure/PrismaNoteRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { NoteListOptions } from '../domain/INoteRepository.js';
import type { CreateNoteInput, NoteRecord, RichTextDocument } from '../domain/NoteEntity.js';
import type { KolNoteDto, KolNoteListItemDto } from '@opentrade/shared';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

export const notesRouter = new Hono<AppHonoEnv>();

const noteRepo = new PrismaNoteRepository(prisma);
const kolRepo = new PrismaKolRepository(prisma);
const ipfsService = new PinataIpfsService(env.PINATA_JWT);

const createNoteUseCase = new CreateKolNoteUseCase(noteRepo, kolRepo, ipfsService);
const listNotesUseCase = new ListNotesUseCase(noteRepo);

function toDetailDto(record: NoteRecord): KolNoteDto {
  return {
    id: record.id,
    kolId: record.kolId,
    title: record.title,
    body: record.body,
    imageCids: record.imageCids,
    linkedSignalId: record.linkedSignalId,
    contentHash: record.contentHash,
    ipfsCid: record.ipfsCid,
    chainNoteId: record.chainNoteId,
    chainTxHash: record.chainTxHash,
    createdAt: record.createdAt.toISOString(),
  };
}

function toListDto(record: NoteRecord): KolNoteListItemDto {
  return {
    id: record.id,
    kolId: record.kolId,
    title: record.title,
    linkedSignalId: record.linkedSignalId,
    chainTxHash: record.chainTxHash,
    createdAt: record.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST / — Create a note
// ---------------------------------------------------------------------------

const richTextSchema = z
  .object({ type: z.literal('doc'), content: z.array(z.unknown()).optional() })
  .passthrough();

const createBodySchema = z.object({
  title: z.string().trim().min(KOL_NOTE_TITLE_MIN).max(KOL_NOTE_TITLE_MAX),
  body: richTextSchema,
  imageCids: z.array(z.string().min(1)).max(KOL_NOTE_MAX_IMAGES).optional(),
  linkedSignalId: z.string().uuid().optional(),
});

notesRouter.post('/', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const parsed = createBodySchema.parse(await c.req.json());

  // The KOL is derived from the authenticated user, never trusted from the
  // client (rule 50). The use case re-checks the APPROVED status.
  const kol = await kolRepo.findByUserId(DEFAULT_TENANT_ID, user.userId);
  if (!kol) {
    throw AppError.notFound('KOL profile not found for the current user');
  }

  const input: CreateNoteInput = {
    tenantId: DEFAULT_TENANT_ID,
    kolId: kol.id,
    title: parsed.title,
    body: parsed.body as RichTextDocument,
    imageCids: parsed.imageCids ? [...parsed.imageCids] : [],
  };
  if (parsed.linkedSignalId !== undefined) input.linkedSignalId = parsed.linkedSignalId;

  try {
    const note = await createNoteUseCase.execute(input);
    return c.json({ note: toDetailDto(note) }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Only APPROVED')) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only APPROVED KOLs can create notes', 403);
    }
    if (err instanceof Error && err.message === 'Linked signal not found') {
      throw AppError.notFound('Linked signal not found for this KOL');
    }
    if (err instanceof Error && err.message.includes('at most')) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, err.message, 400);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /images — Upload a single embedded image → IPFS
// ---------------------------------------------------------------------------

const NOTE_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const NOTE_IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

notesRouter.post('/images', authMiddleware('user'), async (c) => {
  const { userId } = c.get('user');

  const kol = await kolRepo.findByUserId(DEFAULT_TENANT_ID, userId);
  if (!kol) {
    throw AppError.notFound('KOL profile not found for the current user');
  }

  const formBody = await c.req.parseBody();
  const file = formBody['file'];

  if (!file || !(file instanceof File)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'No file provided', 400, {
      details: { reason: 'no_file' },
    });
  }

  if (!NOTE_IMAGE_ALLOWED_MIME.includes(file.type as (typeof NOTE_IMAGE_ALLOWED_MIME)[number])) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid image type: ${file.type}. Accepted: JPEG, PNG, WebP, GIF`,
      400,
      { details: { reason: 'invalid_file_type', mimeType: file.type } },
    );
  }

  if (file.size > NOTE_IMAGE_MAX_SIZE) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Image too large: ${(file.size / 1024 / 1024).toFixed(2)} MB. Max 5 MB.`,
      400,
      { details: { reason: 'file_too_large', sizeBytes: file.size } },
    );
  }

  const safeName = `note-image-${kol.id}-${Date.now()}`;
  const { cid } = await ipfsService.pinFile(file, safeName);

  return c.json({ cid, url: `${env.PINATA_GATEWAY_URL}${cid}`, size: file.size }, 201);
});

// ---------------------------------------------------------------------------
// GET / — List notes (public)
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  kolId: z.string().uuid().optional(),
  linkedSignalId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

notesRouter.get('/', async (c) => {
  const query = listQuerySchema.parse(c.req.query());

  const opts: NoteListOptions = {
    tenantId: DEFAULT_TENANT_ID,
    limit: query.limit,
    offset: query.offset,
  };
  if (query.kolId !== undefined) opts.kolId = query.kolId;
  if (query.linkedSignalId !== undefined) opts.linkedSignalId = query.linkedSignalId;

  const { notes, total } = await listNotesUseCase.execute(opts);
  return c.json({ notes: notes.map(toListDto), total });
});

// ---------------------------------------------------------------------------
// GET /:id — Get single note with full body (public)
// ---------------------------------------------------------------------------

notesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const note = await noteRepo.findById(id);

  if (note?.tenantId !== DEFAULT_TENANT_ID) {
    throw AppError.notFound(`Note ${id} not found`);
  }

  return c.json({ note: toDetailDto(note) });
});
