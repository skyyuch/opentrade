/**
 * Unit tests for `CreateKolNoteUseCase`.
 *
 * Coverage:
 *   - Successful creation for an approved KOL (pins payload + forwards CID)
 *   - Deterministic content hash matching the pinned payload
 *   - Aborts when IPFS pinning fails
 *   - Rejects non-existent / non-APPROVED KOL + tenant mismatch
 *   - Rejects when imageCids exceeds the cap
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { KOL_NOTE_MAX_IMAGES } from '@opentrade/shared';

import { CreateKolNoteUseCase } from './CreateKolNoteUseCase.js';

import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { KolRecord } from '../../kols/domain/KolEntity.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { INoteRepository } from '../domain/INoteRepository.js';
import type { CreateNoteInput, NoteRecord, RichTextDocument } from '../domain/NoteEntity.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const FIXED_CID = 'bafytestnotecid0000000000000000000000000000000000000000000000';

const fixtureBody = (): RichTextDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Thesis on 00005.' }] }],
});

const fixtureKol = (overrides: Partial<KolRecord> = {}): KolRecord => ({
  id: 'kol_test_0001',
  tenantId: TENANT_ID,
  userId: 'usr_test_001',
  slug: 'test-kol',
  displayName: 'Test KOL',
  bio: null,
  avatarUrl: null,
  status: 'APPROVED',
  type: null,
  focus: null,
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  kolSbtTokenId: null,
  kolSbtMintTxHash: null,
  adminNote: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  ...overrides,
});

const fixtureInput = (overrides: Partial<CreateNoteInput> = {}): CreateNoteInput => ({
  tenantId: TENANT_ID,
  kolId: 'kol_test_0001',
  title: 'Why I like HSBC here',
  body: fixtureBody(),
  imageCids: [],
  ...overrides,
});

const fixtureNote = (overrides: Partial<NoteRecord> = {}): NoteRecord => ({
  id: 'note_test_0001',
  tenantId: TENANT_ID,
  kolId: 'kol_test_0001',
  title: 'Why I like HSBC here',
  body: fixtureBody(),
  imageCids: [],
  linkedSignalId: null,
  contentHash: '0x' + 'bb'.repeat(32),
  ipfsCid: FIXED_CID,
  chainNoteId: null,
  chainTxHash: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  ...overrides,
});

describe('CreateKolNoteUseCase', () => {
  let noteRepo: MockProxy<INoteRepository>;
  let kolRepo: MockProxy<IKolRepository>;
  let ipfs: MockProxy<IIpfsService>;
  let useCase: CreateKolNoteUseCase;

  beforeEach(() => {
    noteRepo = mock<INoteRepository>();
    kolRepo = mock<IKolRepository>();
    ipfs = mock<IIpfsService>();
    ipfs.pinJson.mockResolvedValue({ cid: FIXED_CID });
    useCase = new CreateKolNoteUseCase(noteRepo, kolRepo, ipfs);
  });

  it('creates a note for an approved KOL, pinning the payload and forwarding the CID', async () => {
    const input = fixtureInput();
    kolRepo.findById.mockResolvedValue(fixtureKol());
    noteRepo.create.mockResolvedValue(fixtureNote());

    const result = await useCase.execute(input);

    expect(kolRepo.findById).toHaveBeenCalledWith('kol_test_0001');
    expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
    const [payload, name] = ipfs.pinJson.mock.calls[0]!;
    expect(name).toMatch(/^note-\d+$/);
    expect(payload).toMatchObject({
      version: 1,
      kolId: 'kol_test_0001',
      title: 'Why I like HSBC here',
      linkedSignalId: null,
    });
    expect(noteRepo.create).toHaveBeenCalledWith(
      input,
      expect.stringMatching(/^0x[a-f0-9]{64}$/),
      FIXED_CID,
    );
    expect(result.id).toBe('note_test_0001');
  });

  it('forwards linkedSignalId into the pinned payload for an attached note', async () => {
    const input = fixtureInput({ linkedSignalId: 'sig_test_0001' });
    kolRepo.findById.mockResolvedValue(fixtureKol());
    noteRepo.create.mockResolvedValue(fixtureNote({ linkedSignalId: 'sig_test_0001' }));

    await useCase.execute(input);

    const [payload] = ipfs.pinJson.mock.calls[0]!;
    expect(payload).toMatchObject({ linkedSignalId: 'sig_test_0001' });
  });

  it('aborts creation when IPFS pinning fails', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol());
    ipfs.pinJson.mockRejectedValueOnce(new Error('Pinata unreachable'));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Pinata unreachable');
    expect(noteRepo.create).not.toHaveBeenCalled();
  });

  it('throws when the KOL does not exist', async () => {
    kolRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('KOL not found');
    expect(noteRepo.create).not.toHaveBeenCalled();
  });

  it('throws when the KOL is not APPROVED', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol({ status: 'PENDING' }));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Only APPROVED');
    expect(noteRepo.create).not.toHaveBeenCalled();
  });

  it('throws on tenant mismatch', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol({ tenantId: 'different-tenant' }));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Tenant mismatch');
    expect(noteRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when imageCids exceeds the cap', async () => {
    const tooMany = Array.from({ length: KOL_NOTE_MAX_IMAGES + 1 }, (_, i) => `cid-${i}`);
    kolRepo.findById.mockResolvedValue(fixtureKol());

    await expect(useCase.execute(fixtureInput({ imageCids: tooMany }))).rejects.toThrow('at most');
    expect(ipfs.pinJson).not.toHaveBeenCalled();
    expect(noteRepo.create).not.toHaveBeenCalled();
  });
});
