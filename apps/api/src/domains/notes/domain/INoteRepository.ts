/**
 * Port interface for KOL analyst-note persistence.
 *
 * Per DDD rule 10: the domain layer defines this interface; the infrastructure
 * layer provides the Prisma implementation. There is intentionally NO update or
 * delete method — notes are append-only (rule 00 + ADR-0039 D2).
 */

import type { CreateNoteInput, NoteRecord } from './NoteEntity.js';

export type NoteListOptions = {
  tenantId: string;
  kolId?: string;
  linkedSignalId?: string;
  limit?: number;
  offset?: number;
};

export type INoteRepository = {
  /**
   * Persist a note and emit the `note.submitted` outbox event in the same
   * transaction (ADR-0006 outbox pattern). When `input.linkedSignalId` is set,
   * the implementation MUST verify the signal exists and belongs to the same
   * tenant + KOL, throwing otherwise (referential integrity, kept atomic).
   */
  create(input: CreateNoteInput, contentHash: string, ipfsCid: string): Promise<NoteRecord>;

  findById(id: string): Promise<NoteRecord | null>;

  list(options: NoteListOptions): Promise<NoteRecord[]>;

  count(options: Omit<NoteListOptions, 'limit' | 'offset'>): Promise<number>;
};
