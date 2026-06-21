/**
 * Unit tests for `buildBrokerListWhere` — the pure filter helper for the
 * public broker list endpoint.
 *
 * The load-bearing assertion for ADR-0045 D2 is the "no category" case:
 * when no category is supplied the produced clause must be identical to the
 * pre-ADR-0045 filter (tenant + soft-delete + optional search), proving the
 * bullion vertical adds zero behavioural change to existing broker queries
 * and, transitively, to the reviews / complaints / verify / claim pipelines
 * that read brokers.
 */

import { describe, expect, it } from 'vitest';

import { buildBrokerListWhere } from './brokerListFilter.js';

const TENANT = '00000000-0000-0000-0000-000000000001';

describe('buildBrokerListWhere', () => {
  it('returns only the tenant + soft-delete predicate when nothing else is supplied', () => {
    expect(buildBrokerListWhere({ tenantId: TENANT })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
    });
  });

  it('omits the category key entirely when category is undefined (ADR-0045 D2 zero-change)', () => {
    const where = buildBrokerListWhere({ tenantId: TENANT });
    expect(Object.prototype.hasOwnProperty.call(where, 'category')).toBe(false);
  });

  it('adds a SECURITIES category predicate', () => {
    expect(buildBrokerListWhere({ tenantId: TENANT, category: 'SECURITIES' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      category: 'SECURITIES',
    });
  });

  it('adds a BULLION category predicate (HKGX vertical)', () => {
    expect(buildBrokerListWhere({ tenantId: TENANT, category: 'BULLION' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      category: 'BULLION',
    });
  });

  it('builds a case-insensitive OR search across displayName and legalName', () => {
    expect(buildBrokerListWhere({ tenantId: TENANT, search: 'gold' })).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      OR: [
        { displayName: { contains: 'gold', mode: 'insensitive' } },
        { legalName: { contains: 'gold', mode: 'insensitive' } },
      ],
    });
  });

  it('combines category and search predicates', () => {
    expect(buildBrokerListWhere({ tenantId: TENANT, category: 'BULLION', search: 'gold' })).toEqual(
      {
        tenantId: TENANT,
        deletedAt: null,
        category: 'BULLION',
        OR: [
          { displayName: { contains: 'gold', mode: 'insensitive' } },
          { legalName: { contains: 'gold', mode: 'insensitive' } },
        ],
      },
    );
  });

  it('treats an empty search string as no search predicate', () => {
    const where = buildBrokerListWhere({ tenantId: TENANT, search: '' });
    expect(Object.prototype.hasOwnProperty.call(where, 'OR')).toBe(false);
    expect(where).toEqual({ tenantId: TENANT, deletedAt: null });
  });

  it('does not trim a whitespace-only search — passes it through verbatim', () => {
    // Contract: the helper is the pure filter seam and never trims; the
    // route layer (`presentation/routes.ts`) forwards `query.data.search`
    // straight from the zod-parsed query string. A whitespace-only string
    // is therefore truthy and produces a real (if vacuous) OR predicate —
    // documenting that any trimming/normalisation is the caller's job, so
    // a future caller-side change can't silently alter this behaviour.
    const where = buildBrokerListWhere({ tenantId: TENANT, search: '   ' });
    expect(where).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      OR: [
        { displayName: { contains: '   ', mode: 'insensitive' } },
        { legalName: { contains: '   ', mode: 'insensitive' } },
      ],
    });
  });

  it('omits both optional predicates when category and search are passed as explicit undefined', () => {
    // `BrokerListFilterInput` types both optionals as `T | undefined`, so
    // the route can spread parsed query data that carries explicit
    // `undefined` values. This guards the `exactOptionalPropertyTypes`
    // path: an explicit undefined must behave identically to an absent key
    // (ADR-0045 D2 zero-change for the no-filter case).
    const where = buildBrokerListWhere({
      tenantId: TENANT,
      category: undefined,
      search: undefined,
    });
    expect(where).toEqual({ tenantId: TENANT, deletedAt: null });
    expect(Object.prototype.hasOwnProperty.call(where, 'category')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(where, 'OR')).toBe(false);
  });
});
