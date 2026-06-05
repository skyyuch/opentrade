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

  it('adds a BULLION category predicate (CGSE vertical)', () => {
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
});
