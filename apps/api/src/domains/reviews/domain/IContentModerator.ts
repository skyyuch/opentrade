/**
 * Port: pre-publication content moderation for reviews (per ADR-0034).
 *
 * The reviews domain owns this interface; the moderation domain provides an
 * implementation that is injected at the composition root (rule 30 — reviews
 * does not import a moderation use case directly). The result type is the
 * framework-free shape from `@opentrade/shared`, importable by any layer.
 */

import type { ModerationResult } from '@opentrade/shared';

export type IContentModerator = {
  /**
   * Check submitted text against the tenant's blocklist.
   *
   * @param text     Combined review text to moderate (title + body).
   * @param tenantId Tenant whose blocklist applies.
   * @returns `ok: true` when nothing prohibited matched.
   */
  check(text: string, tenantId: string): Promise<ModerationResult>;
};
