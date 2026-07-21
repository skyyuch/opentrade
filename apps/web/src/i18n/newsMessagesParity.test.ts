/**
 * Trilingual i18n parity guard for the news vertical (ADR-0057).
 *
 * The `/news` page + `NewsList` component read the `news` namespace (plus the
 * `nav.news` / `footer.news` entries). next-intl resolves keys at runtime, so
 * a key present in `en` but missing from `zh-Hant` / `zh-Hans` would ship a
 * silent `MISSING_MESSAGE` fallback to production rather than failing the
 * build. This test fails loudly the moment the three locale files drift.
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

const NAMESPACES = ['news'] as const;

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as MessageTree).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function namespaceKeySet(locale: LocaleId, namespace: string): Set<string> {
  const ns = LOCALES[locale][namespace];
  return new Set(flattenKeys(ns));
}

describe('news vertical i18n parity (ADR-0057)', () => {
  for (const namespace of NAMESPACES) {
    describe(`namespace "${namespace}"`, () => {
      it('is present in all three locale catalogues', () => {
        for (const locale of Object.keys(LOCALES) as LocaleId[]) {
          expect(
            Object.prototype.hasOwnProperty.call(LOCALES[locale], namespace),
            `${locale} is missing the "${namespace}" namespace`,
          ).toBe(true);
        }
      });

      it('exposes the same key set across zh-Hant / zh-Hans / en', () => {
        const reference = namespaceKeySet('en', namespace);

        for (const locale of ['zh-Hant', 'zh-Hans'] as const) {
          const localeKeys = namespaceKeySet(locale, namespace);
          const missing = [...reference].filter((k) => !localeKeys.has(k)).sort();
          const extra = [...localeKeys].filter((k) => !reference.has(k)).sort();

          expect(missing, `${locale}.${namespace} is missing keys present in en`).toEqual([]);
          expect(extra, `${locale}.${namespace} has keys absent from en`).toEqual([]);
        }
      });

      it('has no empty string values in any locale', () => {
        for (const locale of Object.keys(LOCALES) as LocaleId[]) {
          const ns = LOCALES[locale][namespace] as MessageTree;
          for (const [key, val] of Object.entries(ns)) {
            if (typeof val === 'string') {
              expect(val.trim().length, `${locale}.${namespace}.${key} is empty`).toBeGreaterThan(
                0,
              );
            }
          }
        }
      });
    });
  }

  it('covers the nav + footer news entry and the keys the page renders', () => {
    // Load-bearing assertion: Header NAV_LINKS + Footer read `nav.news` /
    // `footer.news`; the /news page + NewsList read these `news` keys.
    const requiredNewsKeys = [
      'eyebrow',
      'title',
      'subtitle',
      'showingCount',
      'loadMore',
      'empty',
      'error',
      'disclaimer',
    ];

    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const nav = namespaceKeySet(locale, 'nav');
      const footer = namespaceKeySet(locale, 'footer');
      const news = namespaceKeySet(locale, 'news');

      expect(nav.has('news'), `${locale}.nav.news missing`).toBe(true);
      expect(footer.has('news'), `${locale}.footer.news missing`).toBe(true);
      for (const key of requiredNewsKeys) {
        expect(news.has(key), `${locale}.news.${key} missing`).toBe(true);
      }
    }
  });
});
