/**
 * Repository port for moderation terms (per ADR-0034).
 *
 * Phase A needs only the read path used by the pre-publication gate. The admin
 * CRUD + audit write methods land in Phase B (they will extend this interface).
 */

import type { ModerationTermRecord } from './ModerationTermEntity.js';

export type IModerationTermRepository = {
  /**
   * All enabled, non-deleted terms for a tenant. Used on the submit hot path
   * (behind a cache); ordering is not significant.
   */
  findEnabledTerms(tenantId: string): Promise<ModerationTermRecord[]>;
};
