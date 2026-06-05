/**
 * Shared types for CGSE (Chinese Gold & Silver Exchange Society / 香港金銀業貿易場)
 * bullion-dealer member data, consumed by both the offline fetcher
 * (`scripts/fetch-cgse-members.ts`) and the DB sync logic (`sync-members.ts`).
 *
 * Per ADR-0045 D5: bullion dealers are `Broker` rows with `category = BULLION`,
 * sourced from CGSE's public member-list page. CGSE exposes no API, so the data
 * is produced by an offline scrape committed to `seed-data/cgse-members.json`
 * and the runtime never calls CGSE (cursor rule 31 §外部參考資料同步).
 */

/**
 * Membership lifecycle status, mapped onto `BrokerLicense.status` by the sync.
 *
 * Current member-list entries are always ACTIVE. CGSE has no structured
 * watch/suspended list page — suspensions appear in unstructured announcements
 * — so SUSPENDED / REVOKED are applied by curating the committed JSON (an
 * auditable git diff, the human-in-the-loop intent of ADR-0045 D5). The fetcher
 * preserves any such manual override across re-scrapes.
 */
export type CgseMemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

/**
 * Canonical shape produced by the CGSE scraper and consumed by
 * {@link syncCgseMembers}. `legalNameZhHans` is intentionally absent — it is
 * derived from `legalNameZh` via OpenCC inside the upsert (mirroring the
 * instrument-catalog pattern in ADR-0038 D4), so this shape never carries it.
 */
export type CgseMemberData = {
  /**
   * CGSE 行員編號 (e.g. "001", "009"). The stable membership identity; written
   * to `BrokerLicense.licenseNumber` per ADR-0045 D3.
   */
  memberCode: string;
  /**
   * Broker slug, namespaced `cgse-{memberCode}` (e.g. `cgse-009`). The prefix
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
  /** Membership status (see {@link CgseMemberStatus}). */
  status: CgseMemberStatus;
  /** Provenance — always `'cgse'`. Drives per-source reconciliation in the sync. */
  source: 'cgse';
};
