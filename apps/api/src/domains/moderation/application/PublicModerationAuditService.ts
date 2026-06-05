/**
 * Application service: the public, **redacted** moderation audit view
 * (per ADR-0043).
 *
 * It reads the tenant-wide append-only audit trail and maps each raw record to
 * a {@link PublicModerationAuditEntry} that proves *that* a moderation change
 * happened, *what category*, *when*, *by an admin role*, and *why* — WITHOUT
 * ever exposing the term text, `isRegex`, `note`, the raw before/after
 * snapshots, or the actor's user id. Publishing the blocklist itself would let
 * solicitors/spammers rephrase around it (ADR-0034 D6 / rule 50).
 *
 * The redaction lives here (not in the route) so the "no term leakage"
 * guarantee is centralised and unit-testable without HTTP (ADR-0043 D3).
 */

import { isModerationCategory } from '@opentrade/shared';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type {
  ModerationTermAuditRecord,
  PublicModerationAuditEntry,
} from '../domain/ModerationTermEntity.js';
import type { ModerationCategory } from '@opentrade/shared';

/** Hard cap on the public page size regardless of the requested limit. */
export const PUBLIC_AUDIT_MAX_LIMIT = 50;
const PUBLIC_AUDIT_DEFAULT_LIMIT = 20;

export type PublicModerationAuditPage = {
  entries: PublicModerationAuditEntry[];
  nextCursor: string | null;
};

export class PublicModerationAuditService {
  constructor(private readonly repo: IModerationTermRepository) {}

  /**
   * @param tenantId Tenant whose moderation history to expose.
   * @param opts     `limit` is clamped to [1, {@link PUBLIC_AUDIT_MAX_LIMIT}];
   *                 `cursor` is an audit id to page after (exclusive).
   */
  async listRecentAudits(
    tenantId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<PublicModerationAuditPage> {
    const limit = clampLimit(opts.limit);

    // Fetch one extra row to determine whether another page exists without a
    // separate count query.
    const rows = await this.repo.listRecentAudits(tenantId, {
      limit: limit + 1,
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      entries: pageRows.map((row) => redact(row)),
      nextCursor,
    };
  }
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested)) return PUBLIC_AUDIT_DEFAULT_LIMIT;
  return Math.max(1, Math.min(PUBLIC_AUDIT_MAX_LIMIT, Math.trunc(requested)));
}

/**
 * Map a raw audit record to the redacted public entry. Only the fields ADR-0043
 * D1 allows are copied across; the term text and snapshots are dropped here and
 * never reach the wire.
 */
function redact(row: ModerationTermAuditRecord): PublicModerationAuditEntry {
  return {
    id: row.id,
    termId: row.termId,
    action: row.action,
    category: extractCategory(row.afterJson) ?? extractCategory(row.beforeJson),
    actor: row.actorUserId ? 'admin' : 'system',
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

/**
 * Pull only the `category` out of an opaque audit snapshot, validating it
 * against the shared union. Everything else in the snapshot (notably `term`)
 * is intentionally ignored so it can never leak.
 */
function extractCategory(snapshot: unknown): ModerationCategory | null {
  if (snapshot && typeof snapshot === 'object' && 'category' in snapshot) {
    const value = (snapshot as Record<string, unknown>)['category'];
    if (typeof value === 'string' && isModerationCategory(value)) {
      return value;
    }
  }
  return null;
}
