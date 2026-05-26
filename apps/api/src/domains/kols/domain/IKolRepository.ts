/**
 * Port interface for KOL persistence.
 *
 * Per DDD rule 10: the domain layer defines this interface; the
 * infrastructure layer provides the Prisma implementation.
 */

import type { KolRecord, KolStatusValue, ApplyKolInput } from './KolEntity.js';

export type KolListOptions = {
  tenantId: string;
  status?: KolStatusValue;
  limit?: number;
  offset?: number;
};

export type IKolRepository = {
  create(input: ApplyKolInput): Promise<KolRecord>;
  findById(id: string): Promise<KolRecord | null>;
  findBySlug(slug: string): Promise<KolRecord | null>;
  findByUserId(tenantId: string, userId: string): Promise<KolRecord | null>;
  list(options: KolListOptions): Promise<KolRecord[]>;
  count(options: Omit<KolListOptions, 'limit' | 'offset'>): Promise<number>;

  updateStatus(id: string, status: KolStatusValue, adminUserId?: string): Promise<KolRecord>;

  claimProfile(
    kolId: string,
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      socialLinks?: Record<string, string>;
    },
  ): Promise<KolRecord>;
};
