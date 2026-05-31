/**
 * Use case: list KOL analyst notes with filtering (ADR-0039 D4).
 *
 * Notes are public once created. Filterable by KOL and by linked signal so the
 * front-end can render "all notes by this KOL" and "notes attached to this
 * signal" (Session 5 UI).
 */

import type { INoteRepository, NoteListOptions } from '../domain/INoteRepository.js';
import type { NoteRecord } from '../domain/NoteEntity.js';

export class ListNotesUseCase {
  constructor(private readonly noteRepo: INoteRepository) {}

  async execute(options: NoteListOptions): Promise<{ notes: NoteRecord[]; total: number }> {
    const countFilter: Omit<NoteListOptions, 'limit' | 'offset'> = {
      tenantId: options.tenantId,
    };
    if (options.kolId !== undefined) countFilter.kolId = options.kolId;
    if (options.linkedSignalId !== undefined) countFilter.linkedSignalId = options.linkedSignalId;

    const [notes, total] = await Promise.all([
      this.noteRepo.list(options),
      this.noteRepo.count(countFilter),
    ]);

    return { notes, total };
  }
}
