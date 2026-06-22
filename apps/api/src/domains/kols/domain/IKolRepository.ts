/**
 * Port interface for KOL persistence.
 *
 * Per DDD rule 10: the domain layer defines this interface; the
 * infrastructure layer provides the Prisma implementation.
 */

import type {
  KolRecord,
  KolStatusValue,
  KolTypeValue,
  KolFocusValue,
  ApplyKolInput,
  UpdateKolCategoryInput,
} from './KolEntity.js';

export type KolListOptions = {
  tenantId: string;
  status?: KolStatusValue;
  /** Optional category filter per ADR-0053; omitting returns every type. */
  type?: KolTypeValue;
  /** Optional asset-focus filter per ADR-0053; omitting returns every focus. */
  focus?: KolFocusValue;
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

  /**
   * Transition a KOL row to a new lifecycle status.
   *
   * Per ADR-0036 D1.1: when transitioning to REJECTED, `adminNote` SHOULD
   * be supplied (zod min 5 max 500 chars enforced at the presentation
   * layer). For APPROVED / SUSPENDED transitions, `adminNote` is ignored
   * and the existing value is left untouched (idempotent re-write
   * semantics — admin notes from a prior REJECTED stage persist if the
   * row later cycles back through the moderation queue).
   */
  updateStatus(
    id: string,
    status: KolStatusValue,
    options?: { adminUserId?: string; adminNote?: string },
  ): Promise<KolRecord>;

  claimProfile(
    kolId: string,
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      socialLinks?: Record<string, string>;
    },
  ): Promise<KolRecord>;

  /**
   * Per ADR-0053 §3: set or clear the KOL's category dimensions (`type` /
   * `focus`). Pure off-chain discovery metadata — no outbox event, no on-chain
   * effect (ADR-0053 Consequences §Neutral). Only the keys present in
   * `updates` are written; a present `null` clears that dimension.
   */
  updateCategory(id: string, updates: UpdateKolCategoryInput): Promise<KolRecord>;
};
