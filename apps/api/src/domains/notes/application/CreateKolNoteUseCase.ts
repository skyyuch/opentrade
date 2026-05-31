/**
 * Use case: create a KOL analyst note (ADR-0039 D4).
 *
 * Only APPROVED KOLs may create notes. The full note payload is pinned to IPFS
 * BEFORE persistence, mirroring `SubmitReviewUseCase` / `EmitSignalUseCase`: the
 * returned CID is stored on the row so the outbox worker (`note.submitted`
 * handler) has a non-empty `ipfsCid` to anchor on `KolNoteRegistry`. The hashed
 * object IS the pinned object, so `contentHash = sha256(payload)` always matches
 * the IPFS content addressed by the CID.
 *
 * Pinning failure (AppError 503) propagates and aborts creation: a note that
 * cannot be anchored should not be silently created off-chain — the immutability
 * promise (ADR-0039) only holds if the content is content-addressed.
 *
 * Notes are immutable once created — there is no update/delete use case (rule 00
 * red line + ADR-0039 D2).
 */

import { createHash } from 'node:crypto';

import { KOL_NOTE_MAX_IMAGES } from '@opentrade/shared';

import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { INoteRepository } from '../domain/INoteRepository.js';
import type { CreateNoteInput, NoteRecord } from '../domain/NoteEntity.js';

export class CreateKolNoteUseCase {
  constructor(
    private readonly noteRepo: INoteRepository,
    private readonly kolRepo: IKolRepository,
    private readonly ipfsService: IIpfsService,
  ) {}

  async execute(input: CreateNoteInput): Promise<NoteRecord> {
    const kol = await this.kolRepo.findById(input.kolId);
    if (!kol) {
      throw new Error('KOL not found');
    }
    if (kol.status !== 'APPROVED') {
      throw new Error('Only APPROVED KOLs can create notes');
    }
    if (kol.tenantId !== input.tenantId) {
      throw new Error('Tenant mismatch');
    }

    if (input.imageCids.length > KOL_NOTE_MAX_IMAGES) {
      throw new Error(`A note may embed at most ${KOL_NOTE_MAX_IMAGES} images`);
    }

    // The hashed object IS the pinned object so `contentHash` always matches the
    // IPFS content addressed by the returned CID (ADR-0039 D4).
    const ipfsPayload = {
      version: 1,
      kolId: input.kolId,
      title: input.title.trim(),
      body: input.body,
      imageCids: input.imageCids,
      linkedSignalId: input.linkedSignalId ?? null,
      createdAt: new Date().toISOString(),
    };

    const contentHash =
      '0x' + createHash('sha256').update(JSON.stringify(ipfsPayload)).digest('hex');

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `note-${Date.now()}`);

    return this.noteRepo.create(input, contentHash, pinResult.cid);
  }
}
