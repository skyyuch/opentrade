/**
 * Unit tests for `PublicModerationAuditService` — the redacted public audit
 * view (per ADR-0043).
 *
 * The non-negotiable coverage target (ADR-0043 D1 / D3, ADR-0034 D6, rule 50):
 * the public DTO must NEVER carry the term text, `isRegex`, `note`, the raw
 * before/after snapshots, or the actor's user id. A regression here would
 * publish the blocklist itself. The other tests pin category derivation, the
 * coarse actor label, limit clamping, and cursor pagination.
 *
 * The repository port is mocked with `vitest-mock-extended` per rule 60.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  PublicModerationAuditService,
  PUBLIC_AUDIT_MAX_LIMIT,
} from './PublicModerationAuditService.js';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type { ModerationTermAuditRecord } from '../domain/ModerationTermEntity.js';

const auditRow = (
  overrides: Partial<ModerationTermAuditRecord> = {},
): ModerationTermAuditRecord => ({
  id: '00000000-0000-4000-8000-00000000aa01',
  termId: '00000000-0000-4000-8000-00000000bb01',
  action: 'CREATE',
  beforeJson: null,
  // The snapshot legitimately contains the term text in the DB — the service
  // must drop it. We put an obvious sentinel here so a leak is unmistakable.
  afterJson: {
    category: 'CONTACT',
    term: 't\\.me/SECRET_BLOCKLIST_PATTERN',
    isRegex: true,
    enabled: true,
    note: 'internal note that must not leak',
  },
  actorUserId: '00000000-0000-4000-8000-00000000cc01',
  reason: 'spam wave',
  createdAt: new Date('2026-06-05T10:00:00.000Z'),
  ...overrides,
});

describe('PublicModerationAuditService', () => {
  let repo: MockProxy<IModerationTermRepository>;
  let service: PublicModerationAuditService;

  beforeEach(() => {
    repo = mock<IModerationTermRepository>();
    service = new PublicModerationAuditService(repo);
  });

  describe('redaction (ADR-0043 D1 — never leak the blocklist)', () => {
    it('drops term / isRegex / note / snapshots / actorUserId from the public entry', async () => {
      repo.listRecentAudits.mockResolvedValue([auditRow()]);

      const page = await service.listRecentAudits('tnt_x');
      const entry = page.entries[0]!;

      // Allowed public fields only.
      expect(Object.keys(entry).sort()).toEqual(
        ['action', 'actor', 'category', 'createdAt', 'id', 'reason', 'termId'].sort(),
      );

      // Belt-and-braces: the sentinel term/regex/note must appear nowhere in
      // the serialised entry.
      const serialised = JSON.stringify(entry);
      expect(serialised).not.toContain('SECRET_BLOCKLIST_PATTERN');
      expect(serialised).not.toContain('internal note');
      expect(serialised).not.toContain('isRegex');
      // The actor's user id must not leak; only the coarse role does.
      expect(serialised).not.toContain('00000000-0000-4000-8000-00000000cc01');
    });

    it('exposes the coarse actor role, not the user id', async () => {
      repo.listRecentAudits.mockResolvedValue([
        auditRow({ actorUserId: '00000000-0000-4000-8000-00000000cc01' }),
        auditRow({ id: '00000000-0000-4000-8000-00000000aa02', actorUserId: null }),
      ]);

      const page = await service.listRecentAudits('tnt_x');

      expect(page.entries[0]?.actor).toBe('admin');
      expect(page.entries[1]?.actor).toBe('system');
    });
  });

  describe('category derivation', () => {
    it('derives category from the after snapshot', async () => {
      repo.listRecentAudits.mockResolvedValue([auditRow()]);

      const page = await service.listRecentAudits('tnt_x');

      expect(page.entries[0]?.category).toBe('CONTACT');
    });

    it('falls back to the before snapshot when after has no category', async () => {
      repo.listRecentAudits.mockResolvedValue([
        auditRow({
          action: 'DELETE',
          beforeJson: {
            category: 'PROFANITY',
            term: 'x',
            isRegex: false,
            enabled: true,
            note: null,
          },
          afterJson: null,
        }),
      ]);

      const page = await service.listRecentAudits('tnt_x');

      expect(page.entries[0]?.category).toBe('PROFANITY');
    });

    it('returns null category when neither snapshot is usable', async () => {
      repo.listRecentAudits.mockResolvedValue([auditRow({ beforeJson: null, afterJson: null })]);

      const page = await service.listRecentAudits('tnt_x');

      expect(page.entries[0]?.category).toBeNull();
    });
  });

  describe('limit clamping', () => {
    it('uses the default limit (fetching limit+1) when none is given', async () => {
      repo.listRecentAudits.mockResolvedValue([]);

      await service.listRecentAudits('tnt_x');

      // default 20 → fetch 21 to detect a next page
      expect(repo.listRecentAudits).toHaveBeenCalledWith('tnt_x', { limit: 21 });
    });

    it('clamps a too-large requested limit to the max (fetching max+1)', async () => {
      repo.listRecentAudits.mockResolvedValue([]);

      await service.listRecentAudits('tnt_x', { limit: 9999 });

      expect(repo.listRecentAudits).toHaveBeenCalledWith('tnt_x', {
        limit: PUBLIC_AUDIT_MAX_LIMIT + 1,
      });
    });
  });

  describe('cursor pagination', () => {
    it('sets nextCursor to the last in-page row id when an extra row exists', async () => {
      // Request limit 2 → service fetches 3; the 3rd signals "has more".
      const rows = [auditRow({ id: 'id-1' }), auditRow({ id: 'id-2' }), auditRow({ id: 'id-3' })];
      repo.listRecentAudits.mockResolvedValue(rows);

      const page = await service.listRecentAudits('tnt_x', { limit: 2 });

      expect(page.entries).toHaveLength(2);
      expect(page.entries.map((e) => e.id)).toEqual(['id-1', 'id-2']);
      expect(page.nextCursor).toBe('id-2');
    });

    it('returns nextCursor null when no extra row exists', async () => {
      repo.listRecentAudits.mockResolvedValue([auditRow({ id: 'id-1' })]);

      const page = await service.listRecentAudits('tnt_x', { limit: 2 });

      expect(page.nextCursor).toBeNull();
    });

    it('forwards the cursor to the repository', async () => {
      repo.listRecentAudits.mockResolvedValue([]);

      await service.listRecentAudits('tnt_x', { limit: 10, cursor: 'cursor-id' });

      expect(repo.listRecentAudits).toHaveBeenCalledWith('tnt_x', {
        limit: 11,
        cursor: 'cursor-id',
      });
    });
  });
});
