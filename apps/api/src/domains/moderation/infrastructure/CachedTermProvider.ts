/**
 * In-memory, per-tenant TTL cache over the moderation term repository
 * (per ADR-0034 D3).
 *
 * The submit hot path must not hit the DB on every review. Terms change rarely
 * (admin edits), so a short TTL is plenty; Phase B admin writes additionally
 * call {@link invalidate} for immediate effect.
 *
 * Fallback: when a tenant has no enabled terms in the DB (e.g. a fresh table
 * before Phase B seeding), the provider returns {@link BASELINE_MODERATION_TERMS}
 * so the gate is NEVER silently open (ADR-0034 D3). Phase B must seed BASELINE
 * into the table so that, once admins start managing terms, the floor is not
 * lost.
 */

import { BASELINE_MODERATION_TERMS } from '@opentrade/shared';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type { ModerationTermInput } from '@opentrade/shared';

const DEFAULT_TTL_MS = 60_000;

type CacheEntry = {
  terms: readonly ModerationTermInput[];
  expiresAt: number;
};

export class CachedTermProvider {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly repo: IModerationTermRepository,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async getTerms(tenantId: string): Promise<readonly ModerationTermInput[]> {
    const cached = this.cache.get(tenantId);
    if (cached !== undefined && cached.expiresAt > this.now()) {
      return cached.terms;
    }

    const records = await this.repo.findEnabledTerms(tenantId);
    const terms: readonly ModerationTermInput[] =
      records.length > 0
        ? records.map((r) => ({ category: r.category, term: r.term, isRegex: r.isRegex }))
        : BASELINE_MODERATION_TERMS;

    this.cache.set(tenantId, { terms, expiresAt: this.now() + this.ttlMs });
    return terms;
  }

  /** Drop cached terms (all tenants, or one) so the next read reloads from DB. */
  invalidate(tenantId?: string): void {
    if (tenantId === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(tenantId);
  }
}
