/**
 * Trilingual i18n parity guard for the bullion-dealer vertical (ADR-0045 D6).
 *
 * The bullion pages reuse the broker grid + detail layout but pull copy from
 * the dedicated `bullionDealers` namespace plus a set of CGSE-specific keys
 * added to the shared `brokerDetail` namespace (membership tab, status
 * labels, registry link, disclaimer). next-intl resolves keys at runtime, so
 * a key that exists in `en` but is missing from `zh-Hant` / `zh-Hans` ships a
 * silent `MISSING_MESSAGE` fallback to production rather than failing the
 * build. This test fails loudly the moment the three locale files drift.
 *
 * Scope is intentionally pinned to the two namespaces the bullion vertical
 * touches (per the §6 test brief). The flattening + set-diff helpers below
 * are namespace-agnostic, so widening the guard later is a one-line change to
 * `NAMESPACES`.
 *
 * Why a unit test (not e2e): key-set parity is a pure data property of the
 * message catalogues, independent of any rendered DOM — per cursor rule 60 it
 * belongs in the fast unit tier and is unaffected by the Google UI swap.
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

// The namespaces the bullion vertical reads from. `bullionDealers` is
// bullion-only; `brokerDetail` is shared with securities but carries the
// CGSE membership keys the bullion detail page depends on.
const NAMESPACES = ['bullionDealers', 'brokerDetail'] as const;

/**
 * Recursively flattens a nested message object into dot-joined key paths so
 * nested ICU groups (if any are added later) are compared structurally, not
 * just at the top level.
 */
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

describe('bullion vertical i18n parity (ADR-0045 D6)', () => {
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

  it('covers the CGSE membership keys the bullion detail page renders', () => {
    // Load-bearing assertion: the MembershipTab + bullion detail header read
    // these exact keys (BrokerDetailTabs.tsx / bullion-dealers/[slug]/page.tsx).
    // If a rename drops one, every locale must still resolve it.
    const requiredBrokerDetailKeys = [
      'tabMembership',
      'cgseMembershipRecord',
      'cgseMembershipPill',
      'memberNumber',
      'membershipStatus',
      'statusActive',
      'statusSuspended',
      'statusRevoked',
      'membershipSince',
      'cgseRegistryLink',
      'cgseRegistryLinkDesc',
      'cgseDataNoteTitle',
      'cgseDataNote',
      'backToDealers',
    ];
    const requiredBullionKeys = ['cgseMember', 'statusSuspended', 'statusRevoked', 'disclaimer'];

    for (const locale of Object.keys(LOCALES) as LocaleId[]) {
      const brokerDetail = namespaceKeySet(locale, 'brokerDetail');
      const bullion = namespaceKeySet(locale, 'bullionDealers');
      for (const key of requiredBrokerDetailKeys) {
        expect(brokerDetail.has(key), `${locale}.brokerDetail.${key} missing`).toBe(true);
      }
      for (const key of requiredBullionKeys) {
        expect(bullion.has(key), `${locale}.bullionDealers.${key} missing`).toBe(true);
      }
    }
  });
});
