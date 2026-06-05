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

/**
 * One append-only audit row as the application layer sees it
 * (`moderation_term_audits`, ADR-0034 D3). `beforeJson` / `afterJson` are
 * opaque snapshots of the term fields at mutation time; the read view renders
 * them but never parses business logic out of them.
 */
export type ModerationTermAuditRecord = {
  id: string;
  termId: string;
  action: ModerationTermAuditAction;
  beforeJson: unknown;
  afterJson: unknown;
  actorUserId: string | null;
  reason: string | null;
  createdAt: Date;
};

/**
 * Coarse actor label for the public audit view (ADR-0043 D1). We never expose
 * the actor's user id publicly — only whether the change came from an admin or
 * from a non-attributed `system` path.
 */
export type PublicModerationActor = 'admin' | 'system';

/**
 * One **redacted** audit entry for the public transparency view (ADR-0043).
 *
 * Deliberately omits the term text, `isRegex`, `note`, the raw before/after
 * snapshots, and the actor's user id — publishing the blocklist itself would
 * let bad actors rephrase around it (ADR-0034 D6 / rule 50). It proves *that*
 * moderation happened, *what category*, *when*, *by an admin*, and *why*.
 */
export type PublicModerationAuditEntry = {
  id: string;
  termId: string;
  action: ModerationTermAuditAction;
  /** Derived from the audit snapshot; null only if the snapshot is malformed. */
  category: ModerationCategory | null;
  actor: PublicModerationActor;
  reason: string | null;
  createdAt: Date;
};

/**
 * Actor metadata attached to every mutating admin write. The repository writes
 * it into the audit row inside the SAME transaction as the term change
 * (ADR-0034 D3 / rule 52) — there is no code path that mutates a term without
 * an accompanying audit row.
 */
export type ModerationAuditMeta = {
  actorUserId: string | null;
  reason: string | null;
};

/** Filter for the admin term list (admin sees enabled + disabled, never soft-deleted). */
export type ModerationTermListFilter = {
  category?: ModerationCategory;
};

/** Fields required to create a new blocklist term. */
export type CreateModerationTermInput = {
  tenantId: string;
  category: ModerationCategory;
  term: string;
  isRegex: boolean;
  note: string | null;
  createdByUserId: string | null;
};

/**
 * Editable fields of an existing term. `enabled` is intentionally NOT here:
 * enable/disable goes through {@link IModerationTermRepository.setEnabled} so
 * it records the dedicated ENABLE / DISABLE audit verb rather than a generic
 * UPDATE.
 */
export type UpdateModerationTermPatch = {
  category?: ModerationCategory;
  term?: string;
  isRegex?: boolean;
  note?: string | null;
};
