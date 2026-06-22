/**
 * Unit tests for `buildKolListWhere` — the pure filter helper for KOL
 * list/count queries.
 *
 * The load-bearing assertion for ADR-0053 is the "no type/focus" case: when
 * neither category dimension is supplied the produced clause must be identical
 * to the pre-ADR-0053 filter (tenant + soft-delete + optional status), proving
 * the KOL category vertical adds zero behavioural change to existing KOL
 * queries and, transitively, to the signal pipeline that reads KOLs.
 */

import { describe, expect, it } from 'vitest';

import { buildKolListWhere } from './kolListFilter.js';

const TENANT = '00000000-0000-0000-0000-000000000001';

describe('buildKolListWhere', () => {
  it('returns only the tenant + soft-delete predicate when nothing else is supplied', () => {
    expect(buildKolListWhere({ tenantId: TENANT })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
    });
  });

  it('omits type/focus keys entirely when undefined (ADR-0053 zero-change)', () => {
    const where = buildKolListWhere({ tenantId: TENANT });
    expect(Object.prototype.hasOwnProperty.call(where, 'type')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(where, 'focus')).toBe(false);
  });

  it('adds a status predicate', () => {
    expect(buildKolListWhere({ tenantId: TENANT, status: 'APPROVED' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      status: 'APPROVED',
    });
  });

  it('adds a type predicate (financial KOL)', () => {
    expect(buildKolListWhere({ tenantId: TENANT, type: 'FINANCIAL_KOL' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      type: 'FINANCIAL_KOL',
    });
  });

  it('adds a focus predicate (crypto)', () => {
    expect(buildKolListWhere({ tenantId: TENANT, focus: 'CRYPTO' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      focus: 'CRYPTO',
    });
  });

  it('combines status, type and focus predicates independently', () => {
    expect(
      buildKolListWhere({
        tenantId: TENANT,
        status: 'UNCLAIMED',
        type: 'INDICATOR_VENDOR',
        focus: 'FOREX',
      }),
    ).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      status: 'UNCLAIMED',
      type: 'INDICATOR_VENDOR',
      focus: 'FOREX',
    });
  });

  it('omits both category predicates when passed as explicit undefined', () => {
    // `KolListFilterInput` types the optionals as `T | undefined`, so the
    // repository can spread parsed options carrying explicit `undefined`.
    // This guards the `exactOptionalPropertyTypes` path: an explicit undefined
    // must behave identically to an absent key (ADR-0053 zero-change).
    const where = buildKolListWhere({
      tenantId: TENANT,
      type: undefined,
      focus: undefined,
    });
    expect(where).toEqual({ tenantId: TENANT, deletedAt: null });
    expect(Object.prototype.hasOwnProperty.call(where, 'type')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(where, 'focus')).toBe(false);
  });
});
