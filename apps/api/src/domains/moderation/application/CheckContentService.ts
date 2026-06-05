/**
 * Application service: check free text against a tenant's moderation blocklist
 * (per ADR-0034, layer 1).
 *
 * This is the authoritative server-side gate. It loads the tenant's terms
 * (cached) and runs the shared, content-neutral matching engine. The shape of
 * `check` deliberately matches the `IContentModerator` port the reviews domain
 * depends on, so it can be injected at the reviews composition root without a
 * cross-domain source import (rule 30).
 */

import { moderateContent } from '@opentrade/shared';

import type { CachedTermProvider } from '../infrastructure/CachedTermProvider.js';
import type { ModerationResult } from '@opentrade/shared';

export class CheckContentService {
  constructor(private readonly provider: CachedTermProvider) {}

  /**
   * @param text     Free text to moderate (e.g. review title + body).
   * @param tenantId Tenant whose blocklist applies.
   * @returns A {@link ModerationResult}; `ok` is true when nothing matched.
   */
  async check(text: string, tenantId: string): Promise<ModerationResult> {
    const terms = await this.provider.getTerms(tenantId);
    return moderateContent(text, terms);
  }
}
