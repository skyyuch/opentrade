/**
 * Trilingual i18n parity guard for the KOL category vertical (ADR-0053).
 *
 * The KOL directory filter pills + the type/focus label chips (directory card
 * and profile) read a set of keys from the shared `kols` namespace. next-intl
 * resolves keys at runtime, so a key present in `en` but missing from
 * `zh-Hant` / `zh-Hans` ships a silent `MISSING_MESSAGE` fallback to
 * production rather than failing the build. This test fails loudly the moment
 * the three locale files drift, and pins the exact ADR-0053 keys the UI reads.
 *
 * Why a unit test (not e2e): key-set parity is a pure data property of the
 * message catalogues, independent of any rendered DOM (cursor rule 60).
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import zhHans from '../../messages/zh-Hans.json';
import zhHant from '../../messages/zh-Hant.json';

type MessageTree = Record<string, unknown>;

const LOCALES = {
  'zh-Hant': zhHant as MessageTree,
  'zh-Hans': zhHans as MessageTree,
  en: en as MessageTree,
} as const;

type LocaleId = keyof typeof LOCALES;

// The exact ADR-0053 keys the KOL category UI renders (KolDirectoryClient +
// KolProfileClient). If a rename drops one, every locale must still resolve it.
const REQUIRED_KOL_KEYS = [
  'filterTypeLabel',
  'filterFocusLabel',
  'filterTypeAll',
  'filterFocusAll',
  'typeFinancialKol',
  'typeIndicatorVendor',
  'focusEquity',
  'focusCrypto',
  'focusForex',
  'categoryUncategorised',
  'showingCount',
  'clearFilters',
] as const;

function kolsNamespace(locale: LocaleId): MessageTree {
  return LOCALES[locale]['kols'] as MessageTree;
}

describe('KOL category i18n parity (ADR-0053)', () => {
  it('exposes every required ADR-0053 key in all three locales', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = kolsNamespace(locale);
      for (const key of REQUIRED_KOL_KEYS) {
        expect(
          Object.prototype.hasOwnProperty.call(ns, key),
          `${locale}.kols.${key} is missing`,
        ).toBe(true);
      }
    }
  });

  it('has no empty string values for the required keys', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = kolsNamespace(locale);
      for (const key of REQUIRED_KOL_KEYS) {
        const val = ns[key];
        expect(typeof val, `${locale}.kols.${key} should be a string`).toBe('string');
        expect((val as string).trim().length, `${locale}.kols.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the ICU placeholders of showingCount consistent across locales', () => {
    // Load-bearing: the directory passes both `count` and `total` to this key.
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const value = kolsNamespace(locale)['showingCount'] as string;
      expect(value.includes('{count}'), `${locale}.kols.showingCount missing {count}`).toBe(true);
      expect(value.includes('{total}'), `${locale}.kols.showingCount missing {total}`).toBe(true);
    }
  });
});
