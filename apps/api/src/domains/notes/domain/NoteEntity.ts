/**
 * Domain types for the notes bounded context (KOL analyst notes, per ADR-0039).
 *
 * Notes are immutable once created — there is no update/delete path anywhere in
 * this domain (rule 00 red line + ADR-0039 D2). The content hash is computed
 * server-side from the pinned IPFS payload so the outbox worker can anchor the
 * note on `KolNoteRegistry` (ADR-0039 D4).
 *
 * The domain layer keeps zero infrastructure imports (rule 10). The portable
 * rich-text shape is sourced from `@opentrade/shared`, the canonical
 * cross-layer definition (mirrors how the instruments domain sources
 * `InstrumentCategory`).
 */

import type { RichTextDocument } from '@opentrade/shared';

export type { RichTextDocument };

/**
 * Server-side input for creating a note. `tenantId` and `kolId` are resolved by
 * the presentation layer from the authenticated user (never trusted from the
 * client, per rule 50). `linkedSignalId` is the DB UUID of a Signal when the
 * note is attached; null/omitted = standalone (ADR-0039 D2).
 */
export type CreateNoteInput = {
  tenantId: string;
  kolId: string;
  title: string;
  body: RichTextDocument;
  imageCids: string[];
  linkedSignalId?: string | null;
};

export type NoteRecord = {
  id: string;
  tenantId: string;
  kolId: string;
  title: string;
  body: RichTextDocument;
  imageCids: string[];
  linkedSignalId: string | null;
  contentHash: string;
  ipfsCid: string | null;
  chainNoteId: number | null;
  chainTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};
