/**
 * Trilingual i18n parity guard for the economic-calendar vertical (ADR-0058).
 *
 * The `/calendar` page + `CalendarList` component read the `calendar`
 * namespace (plus the `nav.calendar` / `footer.calendar` entries). next-intl
 * resolves keys at runtime, so a key present in `en` but missing from
 * `zh-Hant` / `zh-Hans` would ship a silent `MISSING_MESSAGE` fallback to
 * production rather than failing the build. This test fails loudly the moment
 * the three locale files drift (same guard as `newsMessagesParity.test.ts`).
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

const NAMESPACES = ['calendar'] as const;

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

describe('calendar vertical i18n parity (ADR-0058)', () => {
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

  it('covers the nav + footer calendar entry and the keys the page renders', () => {
    // Load-bearing assertion: Header NAV_LINKS + Footer read `nav.calendar` /
    // `footer.calendar`; the /calendar page + CalendarList read these keys.
    // Region / category labels are pinned per-enum-value so a new enum value
    // cannot ship without its trilingual label.
    const requiredCalendarKeys = [
      'eyebrow',
      'title',
      'subtitle',
      'timeframeWeek',
      'timeframeMonth',
      'filterAllRegions',
      'regionUS',
      'regionHK',
      'regionCN',
      'regionEU',
      'regionEA',
      'regionGB',
      'regionCA',
      'regionAU',
      'regionJP',
      'regionNZ',
      'regionKR',
      'filterAllCategories',
      'categoryINFLATION',
      'categoryGROWTH',
      'categoryEMPLOYMENT',
      'categoryRATE_DECISION',
      'categoryTRADE',
      'categoryOTHER',
      'statusUpcoming',
      'statusReleased',
      'period',
      'previousValue',
      'actualValue',
      'pendingValue',
      'showingCount',
      'loadMore',
      'empty',
      'error',
      'newsCta',
      'disclaimer',
    ];

    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const nav = namespaceKeySet(locale, 'nav');
      const footer = namespaceKeySet(locale, 'footer');
      const calendar = namespaceKeySet(locale, 'calendar');

      expect(nav.has('calendar'), `${locale}.nav.calendar missing`).toBe(true);
      expect(footer.has('calendar'), `${locale}.footer.calendar missing`).toBe(true);
      for (const key of requiredCalendarKeys) {
        expect(calendar.has(key), `${locale}.calendar.${key} missing`).toBe(true);
      }
    }
  });
});
