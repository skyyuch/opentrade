/**
 * Unit tests for ModerationTermAdminService (ADR-0034 Phase B).
 *
 * Focus: every successful mutation (a) forwards the actor + reason as audit
 * metadata to the repository — which is what guarantees the audit row records
 * WHO changed WHAT and WHY (rule 52) — and (b) invalidates the shared provider
 * so the gate reflects the edit immediately. A not-found mutation must NOT
 * invalidate the cache.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ModerationTermAdminService } from './ModerationTermAdminService.js';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type { ModerationTermRecord } from '../domain/ModerationTermEntity.js';
import type { CachedTermProvider } from '../infrastructure/CachedTermProvider.js';

const TENANT = 'tnt_test';
const ACTOR = 'usr_admin';

const record = (overrides: Partial<ModerationTermRecord> = {}): ModerationTermRecord => ({
  id: 'mt_1',
  tenantId: TENANT,
  category: 'CONTACT',
  term: 'join my telegram',
  isRegex: false,
  enabled: true,
  note: null,
  createdByUserId: ACTOR,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ModerationTermAdminService', () => {
  let repo: MockProxy<IModerationTermRepository>;
  let provider: MockProxy<CachedTermProvider>;
  let service: ModerationTermAdminService;

  beforeEach(() => {
    repo = mock<IModerationTermRepository>();
    provider = mock<CachedTermProvider>();
    service = new ModerationTermAdminService(repo, provider);
  });

  it('create forwards audit meta + createdBy and invalidates the cache', async () => {
    repo.createTerm.mockResolvedValue(record());

    await service.createTerm({
      tenantId: TENANT,
      category: 'CONTACT',
      term: 'join my telegram',
      isRegex: false,
      note: 'solicitation phrasing',
      actorUserId: ACTOR,
      reason: 'reported by ops',
    });

    expect(repo.createTerm).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, createdByUserId: ACTOR }),
      { actorUserId: ACTOR, reason: 'reported by ops' },
    );
    expect(provider.invalidate).toHaveBeenCalledWith(TENANT);
  });

  it('update forwards audit meta and invalidates when the term exists', async () => {
    repo.updateTerm.mockResolvedValue(record({ term: 'updated' }));

    const result = await service.updateTerm({
      tenantId: TENANT,
      id: 'mt_1',
      patch: { term: 'updated' },
      actorUserId: ACTOR,
      reason: 'typo fix',
    });

    expect(result).not.toBeNull();
    expect(repo.updateTerm).toHaveBeenCalledWith(
      TENANT,
      'mt_1',
      { term: 'updated' },
      {
        actorUserId: ACTOR,
        reason: 'typo fix',
      },
    );
    expect(provider.invalidate).toHaveBeenCalledWith(TENANT);
  });

  it('update does NOT invalidate when the term is missing', async () => {
    repo.updateTerm.mockResolvedValue(null);

    const result = await service.updateTerm({
      tenantId: TENANT,
      id: 'missing',
      patch: { term: 'x' },
      actorUserId: ACTOR,
      reason: null,
    });

    expect(result).toBeNull();
    expect(provider.invalidate).not.toHaveBeenCalled();
  });

  it('setEnabled forwards the enabled flag + meta and invalidates', async () => {
    repo.setEnabled.mockResolvedValue(record({ enabled: false }));

    await service.setEnabled({
      tenantId: TENANT,
      id: 'mt_1',
      enabled: false,
      actorUserId: ACTOR,
      reason: 'false positives',
    });

    expect(repo.setEnabled).toHaveBeenCalledWith(TENANT, 'mt_1', false, {
      actorUserId: ACTOR,
      reason: 'false positives',
    });
    expect(provider.invalidate).toHaveBeenCalledWith(TENANT);
  });

  it('delete soft-deletes via the repo and invalidates', async () => {
    repo.softDeleteTerm.mockResolvedValue(record());

    await service.deleteTerm({
      tenantId: TENANT,
      id: 'mt_1',
      actorUserId: ACTOR,
      reason: 'no longer relevant',
    });

    expect(repo.softDeleteTerm).toHaveBeenCalledWith(TENANT, 'mt_1', {
      actorUserId: ACTOR,
      reason: 'no longer relevant',
    });
    expect(provider.invalidate).toHaveBeenCalledWith(TENANT);
  });

  it('delete does NOT invalidate when the term is missing', async () => {
    repo.softDeleteTerm.mockResolvedValue(null);

    await service.deleteTerm({ tenantId: TENANT, id: 'missing', actorUserId: ACTOR, reason: null });

    expect(provider.invalidate).not.toHaveBeenCalled();
  });

  it('read methods (list / audits) pass through without touching the cache', async () => {
    repo.listTerms.mockResolvedValue([record()]);
    repo.listAudits.mockResolvedValue([]);

    await service.listTerms(TENANT, { category: 'CONTACT' });
    await service.listAudits(TENANT, 'mt_1');

    expect(repo.listTerms).toHaveBeenCalledWith(TENANT, { category: 'CONTACT' });
    expect(repo.listAudits).toHaveBeenCalledWith(TENANT, 'mt_1');
    expect(provider.invalidate).not.toHaveBeenCalled();
  });
});
