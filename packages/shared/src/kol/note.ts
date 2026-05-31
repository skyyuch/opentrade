/**
 * Cross-cutting KOL analyst-note types shared between `apps/api` (which serves
 * the notes domain) and the front-ends (editor + display). Per ADR-0039.
 *
 * Framework-free: no Prisma, no Next, no Hono, no editor library imports.
 */

/** Max length of a note title (mirrors `KolNote.title @db.VarChar(200)`). */
export const KOL_NOTE_TITLE_MAX = 200;

/** Min length of a note title (presentation-layer guard). */
export const KOL_NOTE_TITLE_MIN = 1;

/** Max number of images embeddable in a single note (write-abuse guard). */
export const KOL_NOTE_MAX_IMAGES = 20;

/**
 * Portable rich-text document (ProseMirror / TipTap shape) stored in
 * `KolNote.bodyJson` (ADR-0039 D3). Kept intentionally loose: the editor
 * library owns the concrete node schema; the backend validates structure +
 * size, not every node type. The `type: 'doc'` root is the one invariant.
 */
export type RichTextDocument = {
  readonly type: 'doc';
  readonly content?: readonly unknown[];
};

/**
 * Input accepted by `POST /v1/notes`. `linkedSignalId` is the DB UUID of a
 * Signal when the note is attached to one; null/omitted = standalone.
 * `imageCids` lists the IPFS CIDs referenced inside `body` (ADR-0039 D3).
 */
export type CreateKolNoteInput = {
  readonly title: string;
  readonly body: RichTextDocument;
  readonly imageCids?: readonly string[];
  readonly linkedSignalId?: string | null;
};

/**
 * The note shape returned by `GET /v1/notes/:id`. Full body included.
 * `chainNoteId` / `chainTxHash` are null until the outbox worker anchors the
 * note on `KolNoteRegistry` (ADR-0039 D4).
 */
export type KolNoteDto = {
  readonly id: string;
  readonly kolId: string;
  readonly title: string;
  readonly body: RichTextDocument;
  readonly imageCids: readonly string[];
  readonly linkedSignalId: string | null;
  readonly contentHash: string;
  readonly ipfsCid: string | null;
  readonly chainNoteId: number | null;
  readonly chainTxHash: string | null;
  readonly createdAt: string;
};

/**
 * Lightweight note shape for list endpoints (`GET /v1/notes`). Omits the full
 * `body` to keep list payloads small; callers fetch the detail endpoint for
 * the document.
 */
export type KolNoteListItemDto = {
  readonly id: string;
  readonly kolId: string;
  readonly title: string;
  readonly linkedSignalId: string | null;
  readonly chainTxHash: string | null;
  readonly createdAt: string;
};
