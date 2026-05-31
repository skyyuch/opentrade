/**
 * Prisma implementation of INoteRepository (ADR-0039 D2/D4).
 *
 * Per DDD rule 10: adapts the domain port to Prisma. The `note.submitted`
 * outbox event is written in the same transaction as the `KolNote` row so the
 * write and the event are atomic (ADR-0006). There is no update/delete method —
 * notes are immutable (rule 00 + ADR-0039 D2).
 */

import type { INoteRepository, NoteListOptions } from '../domain/INoteRepository.js';
import type { CreateNoteInput, NoteRecord, RichTextDocument } from '../domain/NoteEntity.js';
import type { KolNote, Prisma, PrismaClient } from '@prisma/client';

function toRecord(row: KolNote): NoteRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kolId: row.kolId,
    title: row.title,
    body: row.bodyJson as unknown as RichTextDocument,
    imageCids: row.imageCids,
    linkedSignalId: row.linkedSignalId,
    contentHash: row.contentHash,
    ipfsCid: row.ipfsCid,
    chainNoteId: row.chainNoteId,
    chainTxHash: row.chainTxHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaNoteRepository implements INoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateNoteInput, contentHash: string, ipfsCid: string): Promise<NoteRecord> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Referential integrity for an attached note: the linked signal must
      // exist and belong to the same tenant + KOL. Kept inside the transaction
      // so a note can never be persisted pointing at a foreign/absent signal.
      if (input.linkedSignalId) {
        const signal = await tx.signal.findUnique({
          where: { id: input.linkedSignalId },
          select: { tenantId: true, kolId: true },
        });
        if (!signal) {
          throw new Error('Linked signal not found');
        }
        if (signal.tenantId !== input.tenantId || signal.kolId !== input.kolId) {
          throw new Error('Linked signal not found');
        }
      }

      const note = await tx.kolNote.create({
        data: {
          tenantId: input.tenantId,
          kolId: input.kolId,
          title: input.title.trim(),
          bodyJson: input.body as unknown as Prisma.InputJsonValue,
          imageCids: input.imageCids,
          linkedSignalId: input.linkedSignalId ?? null,
          contentHash,
          ipfsCid,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          aggregateType: 'note',
          aggregateId: note.id,
          eventType: 'note.submitted',
          payload: {
            kolId: input.kolId,
            contentHash,
            linkedSignalId: input.linkedSignalId ?? null,
          },
        },
      });

      return note;
    });

    return toRecord(result);
  }

  async findById(id: string): Promise<NoteRecord | null> {
    const row = await this.prisma.kolNote.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async list(options: NoteListOptions): Promise<NoteRecord[]> {
    const rows = await this.prisma.kolNote.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.kolId ? { kolId: options.kolId } : {}),
        ...(options.linkedSignalId ? { linkedSignalId: options.linkedSignalId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return rows.map(toRecord);
  }

  async count(options: Omit<NoteListOptions, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.kolNote.count({
      where: {
        tenantId: options.tenantId,
        ...(options.kolId ? { kolId: options.kolId } : {}),
        ...(options.linkedSignalId ? { linkedSignalId: options.linkedSignalId } : {}),
      },
    });
  }
}
