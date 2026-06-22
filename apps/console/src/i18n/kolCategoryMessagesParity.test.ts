/**
 * Trilingual i18n parity guard for the console KOL category UI (ADR-0053 §5).
 *
 * The KOL management screen renders type/focus filter selects, list-row label
 * chips, and an in-modal category editor — all reading keys from the
 * `adminKols` namespace. next-intl resolves keys at runtime, so a key present
 * in `en` but missing from `zh-Hant` / `zh-Hans` ships a silent
 * `MISSING_MESSAGE` fallback to production instead of failing the build. This
 * test fails loudly the moment the three locale files drift.
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

// The exact ADR-0053 §5 keys the console KOL management UI renders.
const REQUIRED_KEYS = [
  'detailType',
  'detailFocus',
  'typeFinancialKol',
  'typeIndicatorVendor',
  'focusEquity',
  'focusCrypto',
  'focusForex',
  'categoryUnassigned',
  'filterAllTypes',
  'filterAllFocus',
  'categoryHeading',
  'saveCategory',
  'savingCategory',
  'categorySaved',
] as const;

function adminKolsNamespace(locale: LocaleId): MessageTree {
  return LOCALES[locale]['adminKols'] as MessageTree;
}

describe('Console KOL category i18n parity (ADR-0053 §5)', () => {
  it('exposes every required category key in all three locales', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = adminKolsNamespace(locale);
      for (const key of REQUIRED_KEYS) {
        expect(
          Object.prototype.hasOwnProperty.call(ns, key),
          `${locale}.adminKols.${key} is missing`,
        ).toBe(true);
      }
    }
  });

  it('has no empty string values for the required keys', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = adminKolsNamespace(locale);
      for (const key of REQUIRED_KEYS) {
        const val = ns[key];
        expect(typeof val, `${locale}.adminKols.${key} should be a string`).toBe('string');
        expect(
          (val as string).trim().length,
          `${locale}.adminKols.${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
