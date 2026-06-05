/**
 * Unit tests for CheckContentService (ADR-0034). Verifies it loads the
 * tenant's terms via the provider and delegates to the shared engine, blocking
 * prohibited content while letting clean (and negative) text through.
 */

import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { CheckContentService } from './CheckContentService.js';

import type { CachedTermProvider } from '../infrastructure/CachedTermProvider.js';
import type { ModerationTermInput } from '@opentrade/shared';

const TENANT = 'tnt_test';
const terms: readonly ModerationTermInput[] = [{ category: 'PROFANITY', term: 'fuck' }];

const serviceWith = (provided: readonly ModerationTermInput[]): CheckContentService => {
  const provider = mock<CachedTermProvider>();
  provider.getTerms.mockResolvedValue(provided);
  return new CheckContentService(provider);
};

describe('CheckContentService', () => {
  it('blocks prohibited content and reports the category', async () => {
    const service = serviceWith(terms);

    const result = await service.check('what the fuck', TENANT);

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(['PROFANITY']);
  });

  it('passes clean text, including negative opinion', async () => {
    const service = serviceWith(terms);

    const result = await service.check('terrible broker, total scam, lost money', TENANT);

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
