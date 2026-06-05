/**
 * Unit tests for CachedTermProvider (ADR-0034). Covers the BASELINE fallback
 * (gate never silently open), DB-backed terms, TTL caching, and invalidation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BASELINE_MODERATION_TERMS } from '@opentrade/shared';

import { CachedTermProvider } from './CachedTermProvider.js';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type { ModerationTermRecord } from '../domain/ModerationTermEntity.js';

const TENANT = 'tnt_test';

const record = (overrides: Partial<ModerationTermRecord> = {}): ModerationTermRecord => ({
  id: 'mt_1',
  tenantId: TENANT,
  category: 'PROFANITY',
  term: 'customword',
  isRegex: false,
  enabled: true,
  note: null,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CachedTermProvider', () => {
  let repo: MockProxy<IModerationTermRepository>;

  beforeEach(() => {
    repo = mock<IModerationTermRepository>();
  });

  it('falls back to BASELINE when the tenant has no DB terms', async () => {
    repo.findEnabledTerms.mockResolvedValue([]);
    const provider = new CachedTermProvider(repo);

    const terms = await provider.getTerms(TENANT);

    expect(terms).toBe(BASELINE_MODERATION_TERMS);
  });

  it('returns DB terms (mapped) when present', async () => {
    repo.findEnabledTerms.mockResolvedValue([record({ term: 'customword', isRegex: false })]);
    const provider = new CachedTermProvider(repo);

    const terms = await provider.getTerms(TENANT);

    expect(terms).toEqual([{ category: 'PROFANITY', term: 'customword', isRegex: false }]);
  });

  it('caches within the TTL (single DB read) and reloads after expiry', async () => {
    repo.findEnabledTerms.mockResolvedValue([record()]);
    let clock = 1_000;
    const provider = new CachedTermProvider(repo, 60_000, () => clock);

    await provider.getTerms(TENANT);
    await provider.getTerms(TENANT);
    expect(repo.findEnabledTerms).toHaveBeenCalledTimes(1);

    clock += 60_001;
    await provider.getTerms(TENANT);
    expect(repo.findEnabledTerms).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces a reload on the next read', async () => {
    repo.findEnabledTerms.mockResolvedValue([record()]);
    const provider = new CachedTermProvider(repo);

    await provider.getTerms(TENANT);
    provider.invalidate(TENANT);
    await provider.getTerms(TENANT);

    expect(repo.findEnabledTerms).toHaveBeenCalledTimes(2);
  });

  it('invalidate() with no argument clears all tenants', async () => {
    repo.findEnabledTerms.mockResolvedValue([record()]);
    const provider = new CachedTermProvider(repo);

    await provider.getTerms('a');
    await provider.getTerms('b');
    provider.invalidate();
    await provider.getTerms('a');
    await provider.getTerms('b');

    expect(repo.findEnabledTerms).toHaveBeenCalledTimes(4);
  });
});

describe('CachedTermProvider — default clock', () => {
  it('uses Date.now by default without throwing', async () => {
    const repo = mock<IModerationTermRepository>();
    repo.findEnabledTerms.mockResolvedValue([]);
    const spy = vi.spyOn(Date, 'now');
    const provider = new CachedTermProvider(repo);

    await provider.getTerms(TENANT);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
