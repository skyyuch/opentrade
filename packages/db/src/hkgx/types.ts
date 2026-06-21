/**
 * Shared types for HKGX (Hong Kong Gold Exchange / 香港黃金交易所) bullion-dealer
 * member data, consumed by both the offline fetcher
 * (`scripts/fetch-hkgx-members.ts`) and the DB sync logic (`sync-members.ts`).
 *
 * HKGX is the corporatised successor to the Chinese Gold & Silver Exchange
 * Society (金銀業貿易場 / CGSE) since 2025-01-01 (per ADR-0050). Per ADR-0045 D5:
 * bullion dealers are `Broker` rows with `category = BULLION`, sourced from the
 * exchange's public member-list page. The exchange exposes no API, so the data
 * is produced by an offline scrape committed to `seed-data/hkgx-members.json`
 * and the runtime never calls HKGX (cursor rule 31 §外部參考資料同步).
 */

/**
 * Membership lifecycle status, mapped onto `BrokerLicense.status` by the sync.
 *
 * Current member-list entries are always ACTIVE. HKGX has no structured
 * watch/suspended list page — suspensions appear in unstructured announcements
 * — so SUSPENDED / REVOKED are applied by curating the committed JSON (an
 * auditable git diff, the human-in-the-loop intent of ADR-0045 D5). The fetcher
 * preserves any such manual override across re-scrapes.
 */
export type HkgxMemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

/**
 * Canonical shape produced by the HKGX scraper and consumed by
 * {@link syncHkgxMembers}. `legalNameZhHans` is intentionally absent — it is
 * derived from `legalNameZh` via OpenCC inside the upsert (mirroring the
 * instrument-catalog pattern in ADR-0038 D4), so this shape never carries it.
 */
export type HkgxMemberData = {
  /**
   * HKGX 行員編號 (e.g. "001", "009"). The stable membership identity; written
   * to `BrokerLicense.licenseNumber` per ADR-0045 D3.
   */
  memberCode: string;
  /**
   * Broker slug, namespaced `hkgx-{memberCode}` (e.g. `hkgx-009`). The prefix
   * guarantees it never collides with the name-based SFC broker slugs in the
   * same `(tenantId, slug)` unique key, and the member code keeps the slug
   * stable across company renames (slugs are referenced by verification links).
   */
  slug: string;
  /** English legal name (from the English member-list edition). */
  legalNameEn: string;
  /**
   * Traditional Chinese legal name, joined from the zh-Hant edition by member
   * code. Null when the zh-Hant edition lags behind the English one.
   */
  legalNameZh: string | null;
  /** Membership status (see {@link HkgxMemberStatus}). */
  status: HkgxMemberStatus;
  /** Provenance — always `'hkgx'`. Drives per-source reconciliation in the sync. */
  source: 'hkgx';
};
