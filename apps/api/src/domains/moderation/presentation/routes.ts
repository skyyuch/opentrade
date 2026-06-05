/**
 * Hono router for moderation term admin management (per ADR-0034 D3, Phase B).
 *
 * Mounted under `/v1/admin/moderation` by `http/server.ts`. Every endpoint
 * requires `authMiddleware('admin')`. All mutations go through
 * `moderationAdminService`, which writes an audit row in the same transaction
 * as the change and invalidates the shared term cache (rule 52).
 *
 * Endpoints:
 *   GET    /terms              — list non-deleted terms (optional ?category=)
 *   POST   /terms              — create a term (CREATE audit)
 *   PATCH  /terms/:id          — edit category/term/isRegex/note (UPDATE audit)
 *   PATCH  /terms/:id/enabled  — toggle enforcement (ENABLE / DISABLE audit)
 *   DELETE /terms/:id          — soft-delete (DELETE audit; never hard-deletes)
 *   GET    /terms/:id/audits   — read-only append-only audit trail
 *
 * Privacy (rule 50): a blocklist `term` is curated operator data, NOT user
 * content, so it is safe to return to the admin. We still avoid logging the
 * term text — only `termId / action / category` — since CONTACT entries can be
 * regexes resembling phone numbers.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { MODERATION_CATEGORIES } from '@opentrade/shared';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { moderationAdminService } from '../runtime.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type {
  ModerationTermAuditRecord,
  ModerationTermRecord,
} from '../domain/ModerationTermEntity.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const CATEGORY_VALUES = MODERATION_CATEGORIES;

const listTermsQuerySchema = z.object({
  category: z.enum(CATEGORY_VALUES).optional(),
});

const createTermSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  term: z.string().min(1, 'term is required').max(500, 'term must be 500 chars or less'),
  isRegex: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).optional(),
});

const updateTermSchema = z
  .object({
    category: z.enum(CATEGORY_VALUES).optional(),
    term: z.string().min(1).max(500).optional(),
    isRegex: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.category !== undefined ||
      v.term !== undefined ||
      v.isRegex !== undefined ||
      v.note !== undefined,
    { message: 'at least one editable field (category/term/isRegex/note) is required' },
  );

const setEnabledSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().max(500).optional(),
});

const deleteTermSchema = z.object({
  reason: z.string().max(500).optional(),
});

const toTermResponse = (t: ModerationTermRecord) => ({
  id: t.id,
  category: t.category,
  term: t.term,
  isRegex: t.isRegex,
  enabled: t.enabled,
  note: t.note,
  createdByUserId: t.createdByUserId,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const toAuditResponse = (a: ModerationTermAuditRecord) => ({
  id: a.id,
  termId: a.termId,
  action: a.action,
  beforeJson: a.beforeJson,
  afterJson: a.afterJson,
  actorUserId: a.actorUserId,
  reason: a.reason,
  createdAt: a.createdAt.toISOString(),
});

export const moderationAdminRouter = new Hono<AppHonoEnv>();

// ---------------------------------------------------------------------------
// GET /terms — list (admin sees enabled + disabled, never soft-deleted)
// ---------------------------------------------------------------------------

moderationAdminRouter.get('/terms', authMiddleware('admin'), async (c) => {
  const query = listTermsQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const terms = await moderationAdminService.listTerms(
    DEFAULT_TENANT_ID,
    query.data.category ? { category: query.data.category } : undefined,
  );

  return c.json({ terms: terms.map(toTermResponse) });
});

// ---------------------------------------------------------------------------
// POST /terms — create (CREATE audit)
// ---------------------------------------------------------------------------

moderationAdminRouter.post('/terms', authMiddleware('admin'), async (c) => {
  const rawBody: unknown = await c.req.json();
  const parsed = createTermSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid moderation term', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const admin = c.get('user');

  const term = await moderationAdminService.createTerm({
    tenantId: DEFAULT_TENANT_ID,
    category: parsed.data.category,
    term: parsed.data.term,
    isRegex: parsed.data.isRegex ?? false,
    note: parsed.data.note ?? null,
    actorUserId: admin.userId,
    reason: parsed.data.reason ?? null,
  });

  c.get('logger').info(
    { termId: term.id, action: 'CREATE', category: term.category },
    'Moderation term created',
  );

  return c.json({ term: toTermResponse(term) }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /terms/:id — edit editable fields (UPDATE audit)
// ---------------------------------------------------------------------------

moderationAdminRouter.patch('/terms/:id', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const rawBody: unknown = await c.req.json();
  const parsed = updateTermSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid moderation term update', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const admin = c.get('user');

  const term = await moderationAdminService.updateTerm({
    tenantId: DEFAULT_TENANT_ID,
    id,
    patch: {
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.term !== undefined ? { term: parsed.data.term } : {}),
      ...(parsed.data.isRegex !== undefined ? { isRegex: parsed.data.isRegex } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
    actorUserId: admin.userId,
    reason: parsed.data.reason ?? null,
  });

  if (!term) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Moderation term not found', 404);
  }

  c.get('logger').info(
    { termId: term.id, action: 'UPDATE', category: term.category },
    'Moderation term updated',
  );

  return c.json({ term: toTermResponse(term) });
});

// ---------------------------------------------------------------------------
// PATCH /terms/:id/enabled — toggle enforcement (ENABLE / DISABLE audit)
// ---------------------------------------------------------------------------

moderationAdminRouter.patch('/terms/:id/enabled', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');
  const rawBody: unknown = await c.req.json();
  const parsed = setEnabledSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid enabled flag', 400, {
      details: { issues: parsed.error.issues },
    });
  }

  const admin = c.get('user');

  const term = await moderationAdminService.setEnabled({
    tenantId: DEFAULT_TENANT_ID,
    id,
    enabled: parsed.data.enabled,
    actorUserId: admin.userId,
    reason: parsed.data.reason ?? null,
  });

  if (!term) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Moderation term not found', 404);
  }

  c.get('logger').info(
    {
      termId: term.id,
      action: parsed.data.enabled ? 'ENABLE' : 'DISABLE',
      category: term.category,
    },
    'Moderation term toggled',
  );

  return c.json({ term: toTermResponse(term) });
});

// ---------------------------------------------------------------------------
// DELETE /terms/:id — soft-delete (DELETE audit; never hard-deletes)
// ---------------------------------------------------------------------------

moderationAdminRouter.delete('/terms/:id', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  // DELETE may carry an optional reason body; tolerate an empty/absent body.
  let reason: string | null = null;
  const rawBody = await c.req.text();
  if (rawBody.trim().length > 0) {
    const parsed = deleteTermSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid delete reason', 400, {
        details: { issues: parsed.error.issues },
      });
    }
    reason = parsed.data.reason ?? null;
  }

  const admin = c.get('user');

  const term = await moderationAdminService.deleteTerm({
    tenantId: DEFAULT_TENANT_ID,
    id,
    actorUserId: admin.userId,
    reason,
  });

  if (!term) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Moderation term not found', 404);
  }

  c.get('logger').info(
    { termId: term.id, action: 'DELETE', category: term.category },
    'Moderation term soft-deleted',
  );

  return c.json({ term: toTermResponse(term) });
});

// ---------------------------------------------------------------------------
// GET /terms/:id/audits — read-only append-only audit trail
// ---------------------------------------------------------------------------

moderationAdminRouter.get('/terms/:id/audits', authMiddleware('admin'), async (c) => {
  const id = c.req.param('id');

  const audits = await moderationAdminService.listAudits(DEFAULT_TENANT_ID, id);

  return c.json({ audits: audits.map(toAuditResponse) });
});
