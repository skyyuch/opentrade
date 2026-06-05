/**
 * Application service for admin management of the moderation blocklist
 * (per ADR-0034 D3, Phase B).
 *
 * Thin orchestration over {@link IModerationTermRepository}: it forwards the
 * actor + reason as audit metadata (the repo writes the audit row in the same
 * transaction as the change) and, after any SUCCESSFUL mutation, invalidates
 * the shared {@link CachedTermProvider} so the pre-publication gate picks up
 * the new blocklist immediately rather than waiting for the TTL (rule 52:
 * "admin 寫入要 invalidate cache").
 *
 * Not-found is signalled by a `null` return (never an HTTP concern here) so the
 * presentation layer owns the 404 mapping. The cache is invalidated ONLY when a
 * row actually changed.
 */

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type {
  ModerationTermAuditRecord,
  ModerationTermListFilter,
  ModerationTermRecord,
  UpdateModerationTermPatch,
} from '../domain/ModerationTermEntity.js';
import type { CachedTermProvider } from '../infrastructure/CachedTermProvider.js';
import type { ModerationCategory } from '@opentrade/shared';

export type CreateTermCommand = {
  tenantId: string;
  category: ModerationCategory;
  term: string;
  isRegex: boolean;
  note: string | null;
  actorUserId: string | null;
  reason: string | null;
};

export type UpdateTermCommand = {
  tenantId: string;
  id: string;
  patch: UpdateModerationTermPatch;
  actorUserId: string | null;
  reason: string | null;
};

export type SetEnabledCommand = {
  tenantId: string;
  id: string;
  enabled: boolean;
  actorUserId: string | null;
  reason: string | null;
};

export type DeleteTermCommand = {
  tenantId: string;
  id: string;
  actorUserId: string | null;
  reason: string | null;
};

export class ModerationTermAdminService {
  constructor(
    private readonly repo: IModerationTermRepository,
    private readonly provider: CachedTermProvider,
  ) {}

  listTerms(tenantId: string, filter?: ModerationTermListFilter): Promise<ModerationTermRecord[]> {
    return this.repo.listTerms(tenantId, filter);
  }

  getTerm(tenantId: string, id: string): Promise<ModerationTermRecord | null> {
    return this.repo.findTermById(tenantId, id);
  }

  listAudits(tenantId: string, termId: string): Promise<ModerationTermAuditRecord[]> {
    return this.repo.listAudits(tenantId, termId);
  }

  async createTerm(cmd: CreateTermCommand): Promise<ModerationTermRecord> {
    const record = await this.repo.createTerm(
      {
        tenantId: cmd.tenantId,
        category: cmd.category,
        term: cmd.term,
        isRegex: cmd.isRegex,
        note: cmd.note,
        createdByUserId: cmd.actorUserId,
      },
      { actorUserId: cmd.actorUserId, reason: cmd.reason },
    );
    this.provider.invalidate(cmd.tenantId);
    return record;
  }

  async updateTerm(cmd: UpdateTermCommand): Promise<ModerationTermRecord | null> {
    const record = await this.repo.updateTerm(cmd.tenantId, cmd.id, cmd.patch, {
      actorUserId: cmd.actorUserId,
      reason: cmd.reason,
    });
    if (record) {
      this.provider.invalidate(cmd.tenantId);
    }
    return record;
  }

  async setEnabled(cmd: SetEnabledCommand): Promise<ModerationTermRecord | null> {
    const record = await this.repo.setEnabled(cmd.tenantId, cmd.id, cmd.enabled, {
      actorUserId: cmd.actorUserId,
      reason: cmd.reason,
    });
    if (record) {
      this.provider.invalidate(cmd.tenantId);
    }
    return record;
  }

  async deleteTerm(cmd: DeleteTermCommand): Promise<ModerationTermRecord | null> {
    const record = await this.repo.softDeleteTerm(cmd.tenantId, cmd.id, {
      actorUserId: cmd.actorUserId,
      reason: cmd.reason,
    });
    if (record) {
      this.provider.invalidate(cmd.tenantId);
    }
    return record;
  }
}
