/**
 * Sanity tests for `localizedBrokerName`. Doubles as the canary for the
 * shared workspace's Vitest stack (M6.0): if this file fails to compile or
 * run, the workspace's test infrastructure is broken before any consumer
 * relies on the helper.
 *
 * Coverage targets the three locale branches (`en`, `zh-Hans`, anything-else)
 * and every fallback rung documented in the helper's JSDoc. The helper
 * promises a non-empty string return, so the slug-only path is exercised
 * too — it can only happen with malformed payloads, but it's the documented
 * contract.
 */

import { describe, expect, it } from 'vitest';

import { localizedBrokerName } from './brokerName.js';

describe('localizedBrokerName', () => {
  const full = {
    slug: 'hsbc-broker',
    displayName: '匯豐',
    displayNameZhHans: '汇丰',
    legalName: 'HSBC',
  } as const;

  describe('locale = en', () => {
    it('prefers legalName when present', () => {
      expect(localizedBrokerName(full, 'en')).toBe('HSBC');
    });
    it('falls back to displayName when legalName is null', () => {
      expect(localizedBrokerName({ ...full, legalName: null }, 'en')).toBe('匯豐');
    });
    it('falls back to slug when both names are missing', () => {
      expect(
        localizedBrokerName({ slug: 'orphan', displayName: null, legalName: null }, 'en'),
      ).toBe('orphan');
    });
  });

  describe('locale = zh-Hans', () => {
    it('prefers displayNameZhHans when present', () => {
      expect(localizedBrokerName(full, 'zh-Hans')).toBe('汇丰');
    });
    it('falls back to displayName (Traditional) when zh-Hans variant is null', () => {
      expect(localizedBrokerName({ ...full, displayNameZhHans: null }, 'zh-Hans')).toBe('匯豐');
    });
    it('falls further back to legalName when both Chinese variants are missing', () => {
      expect(
        localizedBrokerName(
          { slug: 'foo', displayName: null, displayNameZhHans: null, legalName: 'FooCorp' },
          'zh-Hans',
        ),
      ).toBe('FooCorp');
    });
  });

  describe('locale = zh-Hant (and unknown locales)', () => {
    it('prefers displayName for zh-Hant', () => {
      expect(localizedBrokerName(full, 'zh-Hant')).toBe('匯豐');
    });
    it('uses the same branch for unknown locales (defensive fallback)', () => {
      expect(localizedBrokerName(full, 'fr')).toBe('匯豐');
    });
    it('falls back to legalName when displayName is null', () => {
      expect(localizedBrokerName({ ...full, displayName: null }, 'zh-Hant')).toBe('HSBC');
    });
  });

  it('never returns an empty string — slug guards the last position', () => {
    const result = localizedBrokerName(
      { slug: 'last-resort', displayName: null, legalName: null },
      'zh-Hant',
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result).toBe('last-resort');
  });
});
