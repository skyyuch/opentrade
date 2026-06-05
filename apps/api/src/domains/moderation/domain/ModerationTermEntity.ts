/**
 * Domain types for the moderation bounded context (per ADR-0034).
 *
 * Pure value-object shapes, decoupled from Prisma. The matching engine and the
 * category union live in `@opentrade/shared` (framework-free) and are re-used
 * here rather than redefined.
 */

import type { ModerationCategory } from '@opentrade/shared';

/** A stored blocklist entry as the application layer sees it. */
export type ModerationTermRecord = {
  id: string;
  tenantId: string;
  category: ModerationCategory;
  term: string;
  isRegex: boolean;
  enabled: boolean;
  note: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Audit action verbs recorded in `moderation_term_audits` (ADR-0034 D3). */
export type ModerationTermAuditAction = 'CREATE' | 'UPDATE' | 'ENABLE' | 'DISABLE' | 'DELETE';
