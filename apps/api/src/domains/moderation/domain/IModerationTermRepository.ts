/**
 * Repository port for moderation terms (per ADR-0034).
 *
 * The read path ({@link findEnabledTerms}) feeds the pre-publication gate
 * (behind {@link CachedTermProvider}). The Phase B admin write path is
 * AUDIT-MANDATORY: every mutation persists a `ModerationTermAudit` row inside
 * the SAME transaction as the change (ADR-0034 D3 / rule 52). Implementations
 * MUST NOT expose a way to mutate a term without writing its audit row, nor a
 * way to hard-delete a term (soft-delete via `deletedAt` only).
 */

import type {
  CreateModerationTermInput,
  ModerationAuditMeta,
  ModerationTermAuditRecord,
  ModerationTermListFilter,
  ModerationTermRecord,
  UpdateModerationTermPatch,
} from './ModerationTermEntity.js';

export type IModerationTermRepository = {
  /**
   * All enabled, non-deleted terms for a tenant. Used on the submit hot path
   * (behind a cache); ordering is not significant.
   */
  findEnabledTerms(tenantId: string): Promise<ModerationTermRecord[]>;

  /**
   * All non-deleted terms for a tenant (enabled AND disabled), newest first.
   * Admin management view. Optional category narrowing.
   */
  listTerms(tenantId: string, filter?: ModerationTermListFilter): Promise<ModerationTermRecord[]>;

  /** A single non-deleted term by id, scoped to the tenant; null if absent. */
  findTermById(tenantId: string, id: string): Promise<ModerationTermRecord | null>;

  /**
   * Create a term and its CREATE audit row in one transaction.
   */
  createTerm(
    input: CreateModerationTermInput,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord>;

  /**
   * Patch editable fields of a non-deleted term + write an UPDATE audit row in
   * the same transaction. Returns null if the term is missing / already
   * soft-deleted.
   */
  updateTerm(
    tenantId: string,
    id: string,
    patch: UpdateModerationTermPatch,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null>;

  /**
   * Toggle `enabled` + write an ENABLE / DISABLE audit row in the same
   * transaction. Returns null if the term is missing / already soft-deleted.
   */
  setEnabled(
    tenantId: string,
    id: string,
    enabled: boolean,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null>;

  /**
   * Soft-delete (`deletedAt = now`) + write a DELETE audit row in the same
   * transaction. NEVER hard-deletes. Returns null if missing / already deleted.
   */
  softDeleteTerm(
    tenantId: string,
    id: string,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null>;

  /**
   * Append-only audit trail for a term, newest first. Read-only — there is no
   * method to mutate or clear audits (rule 52).
   */
  listAudits(tenantId: string, termId: string): Promise<ModerationTermAuditRecord[]>;
};
