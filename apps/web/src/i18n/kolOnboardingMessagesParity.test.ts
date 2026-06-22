/**
 * Trilingual i18n parity guard for the KOL onboarding category step (ADR-0053
 * §3).
 *
 * The onboarding form lets an applicant self-declare type/focus in the profile
 * step and echoes them in the confirmation summary — reading keys from the
 * `kolConsole` namespace (distinct from the public directory `kols` namespace
 * guarded by kolCategoryMessagesParity.test.ts). A key present in `en` but
 * missing from `zh-Hant` / `zh-Hans` ships a silent `MISSING_MESSAGE` fallback,
 * so this test fails loudly the moment the three locale files drift.
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

// The exact ADR-0053 §3 keys the onboarding category step + summary render.
const REQUIRED_KEYS = [
  'onboardingType',
  'onboardingTypeSelect',
  'onboardingTypeFinancialKol',
  'onboardingTypeIndicatorVendor',
  'onboardingFocus',
  'onboardingFocusSelect',
  'onboardingFocusEquity',
  'onboardingFocusCrypto',
  'onboardingFocusForex',
  'onboardingSummaryType',
  'onboardingSummaryFocus',
] as const;

function kolConsoleNamespace(locale: LocaleId): MessageTree {
  return LOCALES[locale]['kolConsole'] as MessageTree;
}

describe('KOL onboarding category i18n parity (ADR-0053 §3)', () => {
  it('exposes every required onboarding category key in all three locales', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = kolConsoleNamespace(locale);
      for (const key of REQUIRED_KEYS) {
        expect(
          Object.prototype.hasOwnProperty.call(ns, key),
          `${locale}.kolConsole.${key} is missing`,
        ).toBe(true);
      }
    }
  });

  it('has no empty string values for the required keys', () => {
    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const ns = kolConsoleNamespace(locale);
      for (const key of REQUIRED_KEYS) {
        const val = ns[key];
        expect(typeof val, `${locale}.kolConsole.${key} should be a string`).toBe('string');
        expect(
          (val as string).trim().length,
          `${locale}.kolConsole.${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
