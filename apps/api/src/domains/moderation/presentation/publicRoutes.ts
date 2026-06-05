/**
 * Public (no-auth) Hono router for the redacted moderation transparency view
 * (per ADR-0043).
 *
 * Mounted under `/v1/moderation` by `http/server.ts`. Unlike the admin router,
 * there is NO `authMiddleware` here — this is the externally-verifiable proof
 * that the moderation lever is content-category-bounded, attributable, and
 * immutable. The response is redacted in the application layer
 * (`PublicModerationAuditService`): it never carries the term text, regex flag,
 * note, raw snapshots, or actor user id (ADR-0034 D6 / rule 50 / rule 52).
 *
 * Endpoints:
 *   GET /audit?limit=&cursor=  — tenant-wide moderation-change history,
 *                                newest first, cursor-paginated, redacted.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { env } from '../../../shared/env.js';
import { AppError, ErrorCode } from '../../../shared/errors/index.js';
import { PUBLIC_AUDIT_MAX_LIMIT } from '../application/PublicModerationAuditService.js';
import { moderationPublicAuditService } from '../runtime.js';

import type { AppHonoEnv } from '../../../http/types.js';
import type { PublicModerationAuditEntry } from '../domain/ModerationTermEntity.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PUBLIC_AUDIT_MAX_LIMIT).optional(),
  cursor: z.string().uuid().optional(),
});

const toPublicAuditResponse = (e: PublicModerationAuditEntry) => ({
  id: e.id,
  termId: e.termId,
  action: e.action,
  category: e.category,
  actor: e.actor,
  reason: e.reason,
  createdAt: e.createdAt.toISOString(),
});

export const moderationPublicRouter = new Hono<AppHonoEnv>();

moderationPublicRouter.get('/audit', async (c) => {
  const query = auditQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400, {
      details: { issues: query.error.issues },
    });
  }

  const page = await moderationPublicAuditService.listRecentAudits(DEFAULT_TENANT_ID, {
    ...(query.data.limit !== undefined ? { limit: query.data.limit } : {}),
    ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
  });

  return c.json({
    audits: page.entries.map(toPublicAuditResponse),
    nextCursor: page.nextCursor,
  });
});
