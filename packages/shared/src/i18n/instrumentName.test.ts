/**
 * Tests for `localizedInstrumentName`. Mirrors `brokerName.test.ts`, covering
 * the three locale branches and every fallback rung documented in the helper's
 * JSDoc, including the `symbol` last-resort guarantee.
 */

import { describe, expect, it } from 'vitest';

import { localizedInstrumentName } from './instrumentName.js';

describe('localizedInstrumentName', () => {
  const hsbc = {
    symbol: '00005',
    nameEn: 'HSBC Holdings',
    nameZh: '匯豐控股',
    nameZhHans: '汇丰控股',
  } as const;

  describe('locale = en', () => {
    it('prefers nameEn when present', () => {
      expect(localizedInstrumentName(hsbc, 'en')).toBe('HSBC Holdings');
    });
    it('falls back to nameZh when nameEn is null', () => {
      expect(localizedInstrumentName({ ...hsbc, nameEn: null }, 'en')).toBe('匯豐控股');
    });
    it('falls back to symbol when both names are missing', () => {
      expect(localizedInstrumentName({ symbol: 'BTC', nameEn: null, nameZh: null }, 'en')).toBe(
        'BTC',
      );
    });
  });

  describe('locale = zh-Hans', () => {
    it('prefers nameZhHans when present', () => {
      expect(localizedInstrumentName(hsbc, 'zh-Hans')).toBe('汇丰控股');
    });
    it('falls back to nameZh (Traditional) when zh-Hans variant is null', () => {
      expect(localizedInstrumentName({ ...hsbc, nameZhHans: null }, 'zh-Hans')).toBe('匯豐控股');
    });
    it('falls further back to nameEn when both Chinese variants are missing', () => {
      expect(
        localizedInstrumentName(
          { symbol: 'AAPL', nameEn: 'Apple Inc.', nameZh: null, nameZhHans: null },
          'zh-Hans',
        ),
      ).toBe('Apple Inc.');
    });
  });

  describe('locale = zh-Hant (and unknown locales)', () => {
    it('prefers nameZh for zh-Hant', () => {
      expect(localizedInstrumentName(hsbc, 'zh-Hant')).toBe('匯豐控股');
    });
    it('falls back to English for US equities with no Chinese name', () => {
      expect(
        localizedInstrumentName({ symbol: 'AAPL', nameEn: 'Apple Inc.', nameZh: null }, 'zh-Hant'),
      ).toBe('Apple Inc.');
    });
    it('uses the same branch for unknown locales (defensive fallback)', () => {
      expect(localizedInstrumentName(hsbc, 'fr')).toBe('匯豐控股');
    });
  });

  it('never returns an empty string — symbol guards the last position', () => {
    const result = localizedInstrumentName({ symbol: 'XAU', nameEn: null, nameZh: null }, 'en');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toBe('XAU');
  });
});
