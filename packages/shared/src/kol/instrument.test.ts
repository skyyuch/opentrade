/**
 * Tests for the instrument-category guard + constant (ADR-0038 D2). Guards the
 * invariant that the picker surfaces exactly five categories and rejects the
 * legacy / non-surfaced AssetClass values.
 */

import { describe, expect, it } from 'vitest';

import { INSTRUMENT_CATEGORIES, isInstrumentCategory } from './instrument.js';

describe('INSTRUMENT_CATEGORIES', () => {
  it('surfaces exactly the five user-facing categories in display order', () => {
    expect(INSTRUMENT_CATEGORIES).toEqual([
      'EQUITY_HK',
      'EQUITY_US',
      'INDEX',
      'CRYPTO',
      'COMMODITY',
    ]);
  });
});

describe('isInstrumentCategory', () => {
  it('accepts every surfaced category', () => {
    for (const category of INSTRUMENT_CATEGORIES) {
      expect(isInstrumentCategory(category)).toBe(true);
    }
  });

  it('rejects legacy AssetClass values not surfaced by the picker', () => {
    expect(isInstrumentCategory('FUTURES')).toBe(false);
    expect(isInstrumentCategory('SPOT')).toBe(false);
    expect(isInstrumentCategory('FOREX')).toBe(false);
  });

  it('rejects non-string and unknown inputs', () => {
    expect(isInstrumentCategory(undefined)).toBe(false);
    expect(isInstrumentCategory(null)).toBe(false);
    expect(isInstrumentCategory(123)).toBe(false);
    expect(isInstrumentCategory('equity_hk')).toBe(false);
    expect(isInstrumentCategory('')).toBe(false);
  });
});
